import { useEffect, useState } from 'react'
import { ApiError } from '../auth/authApi'
import Modal from '../ui/Modal'
import { apiResetPreview, apiResetProject, type ResetPreview } from './cyclesApi'

/**
 * 「처음부터 다시」 확인창.
 *
 * 되돌릴 수 없는 조작이라 "정말 되돌릴까요?" 로 끝내지 않는다 — 그 문구만으로는
 * 무엇이 사라지는지 알 수 없고, 사람은 감으로 누른다. 서버에서 실제로 세어 온
 * 값(쓴 칸 수, 달린 의견 수)을 그대로 보여준다.
 *
 * ── 왜 지우지 않고 되돌리는가 ──
 * 배부본을 지우면 그 사람이 회차 목록에서 사라진다. 관리자 화면에는
 * "3명 중 2명" 으로 보이고, 누가 빠졌는지도 알 수 없다. 혼자 해결하려던 일이
 * 오히려 관리자를 거쳐야 하는 일이 된다.
 *
 * ── 의견을 어떻게 할지 고르게 하는 이유 ──
 * 검토 이력이 조용히 사라지는 것이 제일 나쁘다. 그래서 **기본은 남기는 쪽**이고,
 * 지우려면 한 번 더 고르게 한다.
 */
export default function ResetDialog({
  projectId, onClose, onDone,
}: {
  projectId: string
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [prev, setPrev] = useState<ResetPreview | null>(null)
  const [keep, setKeep] = useState(true)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const p = await apiResetPreview(projectId)
        if (alive) setPrev(p)
      } catch (e) {
        if (alive) setErr(e instanceof ApiError ? e.message : '확인하지 못했어요.')
      }
    })()
    return () => { alive = false }
  }, [projectId])

  const lost = prev?.filled_cells ?? 0
  const cmts = prev?.comments ?? 0
  const submitted = prev?.submit_status === 'submitted' || prev?.submit_status === 'approved'
  const blocked = !prev || !prev.can_reset || submitted
  // 쓴 것이 있을 때만 한 번 더 확인받는다. 빈 양식을 되돌리는 데까지
  // 체크를 시키면, 정작 중요한 순간의 체크도 습관적으로 누르게 된다.
  const needsAgree = lost > 0

  const run = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiResetProject(projectId, keep)
      onDone(keep
        ? '배부받은 상태로 되돌렸습니다.'
        : `배부받은 상태로 되돌렸습니다. 의견 ${r.removed_comments}건도 함께 지웠습니다.`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '되돌리지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <Modal size="md" className="cy-modal" scrimClassName="cy-scrim" footClassName="cy-modal-btns"
      labelId="cy-rs-t" busy={busy} error={err} onClose={onClose}
      title="이 자료를 배부받은 그대로 되돌립니다"
      footer={<>
        <button className="cy-btn" disabled={busy} onClick={onClose}>그만두기</button>
        <button className="cy-btn danger-solid" disabled={busy || blocked || (needsAgree && !agreed)}
          onClick={() => void run()}>
          {busy ? '되돌리는 중…' : '처음부터 다시'}
        </button>
      </>}>
      {!prev ? <p className="cy-dim">확인하는 중…</p> : submitted ? (
        <p className="cy-msg warn">
          이미 제출한 자료입니다. <b>제출을 취소한 뒤</b>에 되돌릴 수 있습니다.
        </p>
      ) : !prev.can_reset ? (
        <p className="cy-msg warn">배부받은 자료만 되돌릴 수 있습니다.</p>
      ) : (<>
        <p className="cy-rv-lead">
          지금까지 쓴 내용이 <b>모두 사라지고</b>, 배부받은 처음 상태로 돌아갑니다.
          <br />되돌린 뒤에는 <b>다시 되살릴 수 없습니다.</b>
        </p>
        <ul className="cy-rs-list">
          <li>쓴 칸 <b>{lost}</b>개</li>
          <li>달린 의견 <b>{cmts}</b>건</li>
        </ul>

        {cmts > 0 && (
          <div className="cy-rs-opt">
            <label className="insp-check">
              <input type="radio" checked={keep} onChange={() => setKeep(true)} />
              <span><b>의견은 남긴다</b> — 검토 이력이 사라지지 않습니다 (권장)</span>
            </label>
            <label className="insp-check">
              <input type="radio" checked={!keep} onChange={() => setKeep(false)} />
              <span>의견도 함께 지운다</span>
            </label>
          </div>
        )}

        {needsAgree && (
          <label className="cy-rv-agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>지금까지 쓴 {lost}칸이 사라지는 것을 확인했습니다.</span>
          </label>
        )}
      </>)}
    </Modal>
  )
}
