import { useEffect, useState } from 'react'
import { ApiError, type Me } from '../auth/authApi'
import Modal from '../ui/Modal'
import { apiRevoke, apiRevokePreview, fmtKst, SUBMIT_LABEL, type RevokePreview } from './cyclesApi'

/**
 * 배부 무르기 확인창.
 *
 * ── 왜 「회수」가 아니라 「무르기」인가 ──
 * 「회수」라고 부르면 *"보낸 것을 없던 일로 만든다"* 로 읽힌다. 그래서
 * "이미 봤으면 회수할 필요 없잖아" 라는 말이 나온다 — 그 이해가 맞다면
 * 정말 필요 없는 기능이다.
 *
 * 실제로 하는 일은 **담당에서 빼고 접근을 끊는 것**이다. 이미 열어본 내용은
 * 되돌릴 수 없지만, 명단이 틀린 채로 굴러가면 안 되고(총 5명 중 제출 3명이
 * 엉뚱한 사람을 포함한다), 남의 부서 실적을 계속 열 수 있게 두어도 안 된다.
 * 그래서 창 맨 위에서 그 사실을 먼저 말한다 — 오해가 사라지면
 * "이거 왜 있지?" 도 사라진다.
 *
 * 이 조작은 **되돌릴 수 없다.** 그래서 "정말 지울까요?" 로 끝내지 않는다 —
 * 그 문구만으로는 무엇이 사라지는지 알 수 없어서, 관리자는 결국 감으로 누른다.
 * 서버에서 실제로 세어 온 값(누가 몇 칸을 썼는지)을 그대로 보여주고,
 * 사라질 작성분이 있으면 체크박스를 하나 더 넘게 한다.
 *
 * 체크박스를 '읽었다는 증거'로 쓰는 이유: 타이핑 확인('회수'를 입력하세요)은
 * 20명 배부를 정리하는 관리자에게 매번 시키기엔 무겁고, 결국 습관적으로
 * 치게 된다. 사라지는 목록을 눈앞에 두고 한 번 더 누르는 정도가 적당하다.
 */
export default function RevokeDialog({
  cycleId, only, users, onClose, onDone,
}: {
  cycleId: string
  /** 이 배부본만 무른다. 비우면 회차 전체. */
  only?: { projectId: string; ownerId: string } | null
  users: Me[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [preview, setPreview] = useState<RevokePreview | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const p = await apiRevokePreview(cycleId)
        if (alive) setPreview(p)
      } catch (e) {
        if (alive) setErr(e instanceof ApiError ? e.message : '확인하지 못했어요.')
      }
    })()
    return () => { alive = false }
  }, [cycleId])

  const items = preview
    ? (only ? preview.items.filter((x) => x.project_id === only.projectId) : preview.items)
    : []
  const lost = items.reduce((n, x) => n + x.filled_cells, 0)
  // 무르면 그 자료에 달린 검토 의견도 함께 사라진다. 리뷰어가 쓴 지적이
  // 아무 말 없이 없어지면, 그 사람 화면에서는 이유 없이 사라진 것이 된다.
  const cmts = items.reduce((n, x) => n + (x.comments || 0), 0)
  const withContent = items.filter((x) => x.filled_cells > 0)
  const submitted = items.filter((x) => x.submit_status === 'submitted' || x.submit_status === 'approved')
  const needsAgree = lost > 0
  const who = (id: string) => {
    const u = users.find((x) => x.id === id)
    return u ? `${u.name}${u.dept ? ` · ${u.dept}` : ''}` : id
  }

  const run = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiRevoke(cycleId, only ? [only.projectId] : undefined)
      onDone(r.lost_cells > 0
        ? `배부 ${r.removed_count}건을 물렀습니다. 작성된 ${r.lost_cells}칸이 함께 삭제됐습니다.`
        : `배부 ${r.removed_count}건을 물렀습니다.`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '무르지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <Modal size="md" className="cy-modal" scrimClassName="cy-scrim" footClassName="cy-modal-btns" labelId="cy-rv-t"
      busy={busy} error={err} onClose={onClose}
      title={only ? '이 사람의 배부를 무릅니다' : '이 회차의 배부를 모두 무릅니다'}
      footer={<>
        <button className="cy-btn" disabled={busy} onClick={onClose}>그만두기</button>
        <button className="cy-btn danger-solid"
          disabled={busy || !preview || items.length === 0 || (needsAgree && !agreed)}
          onClick={() => void run()}>
          {busy ? '무르는 중…' : only ? '배부 무르기' : `${items.length}건 모두 무르기`}
        </button>
      </>}>

        {!preview ? (
          <p className="cy-dim">사라지는 내용을 확인하는 중…</p>
        ) : items.length === 0 ? (
          <p className="cy-dim">무를 배부본이 없습니다.</p>
        ) : (<>
          {/* **이 한 줄이 이 창의 핵심이다.**
              「회수」로 읽히면 '이미 봤는데 무슨 소용이냐' 가 되고, 그러면 이 기능
              자체가 쓸모없어 보인다. 무엇을 못 하고 무엇을 하는지 먼저 말한다. */}
          <p className="cy-rv-what">
            이미 열어본 내용을 <b>없던 일로 만들지는 못합니다.</b>
            {' '}담당에서 빼고, 더 이상 열지 못하게 합니다.
          </p>
          <p className="cy-rv-lead">
            <b>{items.length}건</b>이 삭제됩니다. <b className="cy-warn">되돌릴 수 없습니다.</b>
            {lost > 0
              ? <> 작성된 <b className="cy-warn">{lost}칸</b>이 함께 사라집니다.</>
              : <> 아직 아무도 작성하지 않았습니다.</>}
            {cmts > 0
              ? <> 달린 <b className="cy-warn">의견 {cmts}건</b>도 함께 사라집니다.</>
              : null}
          </p>

          <div className="cy-rv-list">
            <table className="cy-table">
              <thead>
                <tr>
                  <th>작성자</th>
                  <th style={{ width: 78 }}>상태</th>
                  <th style={{ width: 86 }}>작성한 칸</th>
                  <th style={{ width: 74 }} title="이 자료에 달린 검토 의견 — 함께 사라집니다">의견</th>
                  <th style={{ width: 128 }}>최종 수정</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.project_id} className={x.filled_cells > 0 ? 'cy-rv-risk' : ''}>
                    <td><b>{who(x.owner_id)}</b></td>
                    <td><span className={'cy-sub b-' + x.submit_status}>{SUBMIT_LABEL[x.submit_status]}</span></td>
                    <td className={x.filled_cells > 0 ? 'cy-warn' : 'cy-dim'}>
                      {x.filled_cells > 0 ? `${x.filled_cells}칸` : '비어 있음'}
                    </td>
                    <td className={x.comments ? 'cy-warn' : 'cy-dim'}>
                      {x.comments ? `${x.comments}건` : '—'}
                    </td>
                    <td className="cy-dim">{fmtKst(x.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {submitted.length > 0 && (
            <div className="cy-msg warn">
              <b>{submitted.length}명은 이미 제출했습니다.</b> 무르면 제출 기록도 함께 사라집니다.
            </div>
          )}

          {needsAgree && (
            <label className="cy-rv-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                {withContent.map((x) => who(x.owner_id)).join(', ')} 님이 쓴 {lost}칸
                {cmts > 0 ? `과 여기 달린 의견 ${cmts}건` : ''}이
                사라지는 것을 확인했습니다.
              </span>
            </label>
          )}
        </>)}
    </Modal>
  )
}
