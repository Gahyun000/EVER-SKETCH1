// 결재 카드 — **오른쪽 패널 맨 위에 고정**(사용자 결정 ㄱ, 2026-09-08).
//
// **왜 편집 화면 안인가.** 지금까지 결재는 라이브러리에서만 낼 수 있었다.
// 다 쓴 자리에서 낼 수가 없어서, 나가서 열두 건 가운데 제 자료를 찾아
// 글자 없는 종이비행기 아이콘을 눌러야 했다.
//
// **왜 맨 위 고정인가.** 셋을 견줬다(docs/화면시안_카드자리_ㄱㄴㄷ_v1.0.html).
// 「아무것도 안 골랐을 때만」은 자리를 안 뺏지만 **다 쓴 사람은 대개 뭔가를 고른 채로
// 끝낸다** — 가장 필요한 순간에 사라진다. 「맨 아래」는 표 탭이 길어 내용을 가린다.
// 접힌 줄이 32px 을 늘 먹는 대신, **표를 고치는 중에도 「저장 안 됨」이 눈에 든다.**
// 저장이 안 됐다는 걸 낸 뒤에 알면 늦다 — 결재본은 이미 얼었다.
//
// 지키는 것 셋:
//   1. **제출은 저장부터 하고 낸다.** 결재본은 서버에 저장된 문서를 얼린다.
//      목록에서 낼 때는 나가면서 `flushSave()` 가 도는 덕에 **우연히** 맞았다 —
//      여기서 바로 내면 그 우연이 없다. 안 저장한 채로 내면 방금 쓴 줄이 빠진 채 언다.
//   2. **상태는 서버가 말한 것만 그린다.** 대기·승인·수정 중을 화면이 다시 계산하면
//      규칙이 두 곳에 생기고, 어긋나는 날 사용자에게는 「승인이라 적혔는데 안 눌린다」로 보인다.
//   3. **빈 칸이 있어도 막지 않는다.** 알리고 그 자리로 데려다 줄 뿐이다.
import { useEffect, useState } from 'react'
import Modal from '../../ui/Modal'
import { useBuilder } from '../../state/store'
import { useProjects } from '../../persistence/projects'
import { useAutosave, flushSave } from '../../persistence/autosave'
import { useAuth } from '../../auth/useAuth'
import { useComments } from '../../comments/store'
import { useCanvasUI } from '../../state/canvasUI'
import { countMyTurn } from '../../comments/relation'
import { unfilled, unfilledText, type Unfilled } from '../../template/unfilled'
import {
  ApprovalApiError, DOC_STATE_LABEL, apiRequestApproval, apiRequestRevision, apiStatusMap,
  type StatusChip,
} from '../../approvals/approvalApi'

/** 카드가 그리는 다섯 모양. 서버가 준 파생 상태(`state`)를 그대로 따른다. */
type Shape = 'draft' | 'pending' | 'approved' | 'rejected' | 'revising' | 'readonly'

function shapeOf(chip: StatusChip | undefined, mine: boolean): Shape {
  if (!mine) return 'readonly'
  switch (chip?.state) {
    case 'pending': return 'pending'
    case 'approved': return 'approved'
    case 'rejected': return 'rejected'
    case 'revising': return 'revising'
    case 'revision_pending': return 'pending'
    default: return 'draft'
  }
}

export default function ApprovalCard() {
  const activeId = useProjects((s) => s.activeId)
  const access = useProjects((s) => s.access)
  const pages = useBuilder((s) => s.pages)
  const title = useBuilder((s) => s.title)
  const status = useAutosave((s) => s.status)
  const me = useAuth((s) => s.me)
  const threads = useComments((s) => s.threads)
  const setCmtOpen = useComments((s) => s.setOpen)
  const cmtFocus = useComments((s) => s.focus)
  const selectPage = useBuilder((s) => s.selectPage)
  const setSel = useCanvasUI((s) => s.setSel)
  const setTableSel = useCanvasUI((s) => s.setTableSel)

  const [chip, setChip] = useState<StatusChip | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState<'submit' | 'revise' | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // **상태는 서버에서 받아 온다.** 목록 화면이 이미 쓰는 그 엔드포인트다 —
  // 편집 화면이 안 부르고 있었을 뿐이라 서버는 손대지 않는다.
  const load = async () => {
    if (!activeId) return
    try { setChip((await apiStatusMap())[activeId]) } catch { /* 부가 정보다 — 조용히 넘어간다 */ }
  }
  useEffect(() => { void load() }, [activeId])   // eslint-disable-line react-hooks/exhaustive-deps

  // 열람자에게는 아예 안 나온다 — 눌러 보고 403 을 받는 버튼은 「고장 났다」로 읽힌다.
  const canSubmit = me?.role === 'writer' || me?.role === 'admin'
  if (!activeId || !canSubmit) return null

  const mine = !access || access.mine
  const shape = shapeOf(chip, mine)
  const gaps: Unfilled[] = unfilled(pages as never[])
  const toMe = countMyTurn(threads, me?.id, mine)
  const unsaved = status === 'dirty' || status === 'saving' || status === 'error'

  /** 그 칸으로 데려다 준다 — **장을 넘기고, 표를 고르고, 칸을 짚는다.**
   *  셋 다 해야 한다. 장만 넘기면 어느 표인지 모르고, 표만 고르면 어느 칸인지 모른다. */
  const goTo = (u: Unfilled) => {
    const pg = (pages as { id: number; els?: { id: number }[] }[])
      .find((p) => (p?.els || []).some((e) => e && e.id === u.elId))
    if (pg) selectPage(pg.id)
    setSel(u.elId)
    if (u.cell) setTableSel({ elId: u.elId, r0: u.cell.r, c0: u.cell.c, r1: u.cell.r, c1: u.cell.c })
  }

  const send = (kind: 'submit' | 'revise') => {
    if (busy) return
    setBusy(true); setErr('')
    void (async () => {
      try {
        // **저장부터.** 결재본은 서버에 저장된 문서를 얼린다.
        if (kind === 'submit') await flushSave()
        if (kind === 'submit') await apiRequestApproval(activeId, msg.trim())
        else await apiRequestRevision(activeId, msg.trim())
        setAsk(null); setMsg(''); await load()
      } catch (e) {
        setErr(e instanceof ApprovalApiError ? e.message
          : kind === 'submit' ? '제출하지 못했습니다.' : '요청하지 못했습니다.')
      } finally { setBusy(false) }
    })()
  }

  const stateLabel = shape === 'draft' ? '작성 중'
    : shape === 'readonly' ? '읽기 전용'
      : (chip && DOC_STATE_LABEL[chip.state]) || '승인됨'

  const warn = shape === 'draft' || shape === 'rejected' || shape === 'revising'
  const brief = !warn ? '' : [unsaved ? '저장 안 됨' : '', toMe ? `의견 ${toMe}` : '',
    gaps.length ? `빈 칸 ${gaps.length}` : ''].filter(Boolean).join(' · ')

  return (<>
    <div className={'apc apc-' + shape}>
      <button className="apc-hd" onClick={() => setOpen((o) => !o)}
        title={open ? '접기' : '펴기'} aria-expanded={open}>
        <span className="apc-st">{stateLabel}</span>
        {chip && chip.round > 1 ? <span className="apc-rd">{chip.round}회차</span> : null}
        <span className="apc-brief">{brief || (open ? '' : '눌러서 펴기')}</span>
        <span className="apc-ch">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="apc-body">
          {shape === 'draft' || shape === 'rejected' || shape === 'revising' ? (<>
            {shape === 'rejected' && (
              <div className="apc-quote">반려됐습니다. 고쳐서 다시 낼 수 있습니다.</div>
            )}
            {shape === 'revising' && (
              <div className="apc-ms">고쳐도 됩니다. <b>팀은 아직 직전 승인본을 봅니다</b> —
                다시 내서 승인이 나야 바뀝니다.</div>
            )}
            {shape === 'draft' && (
              <div className="apc-ms"><span className="frz">내면 지금 문서가 그대로 얼어붙습니다.</span>
                {' '}뒤에 고쳐도 결재본은 안 바뀝니다.</div>
            )}
            <div className="apc-chk">
              <div className={unsaved ? 'no' : 'ok'}>
                <span className="i">{unsaved ? '!' : '✓'}</span>
                {unsaved ? '저장 안 된 변경이 있습니다' : '저장됐습니다'}
                {unsaved ? <span className="go">낼 때 저장합니다</span> : null}
              </div>
              {toMe > 0 && (
                <div className="no"><span className="i">!</span>확인 안 한 의견 {toMe}건
                  <button className="go" onClick={() => {
                    setCmtOpen(true)
                    const f = threads.find((t) => !t.resolved_at && t.author_id !== me?.id)
                    if (f) cmtFocus(f.id)
                  }}>보기</button>
                </div>
              )}
              {gaps.map((u) => (
                <div className="no" key={u.slot}><span className="i">!</span>{unfilledText(u)}
                  <button className="go" onClick={() => goTo(u)}>그 칸으로</button>
                </div>
              ))}
            </div>
            <button className="apc-btn" onClick={() => { setAsk('submit'); setErr('') }}>
              {shape === 'rejected' ? '고쳐서 다시 제출' : shape === 'revising' ? '고친 것 제출' : '결재 제출'}
            </button>
          </>) : shape === 'pending' ? (
            <div className="apc-ms"><b>관리자 결정을 기다립니다.</b><br />
              <span className="frz">낸 문서는 얼어 있습니다.</span> 여기서 고쳐도 결재본은 그대로입니다.</div>
          ) : shape === 'approved' ? (<>
            <div className="apc-ms"><b>팀에 공유 중입니다.</b><br />
              고치려면 먼저 <b>허락을 받아야</b> 합니다. 허락이 나도 팀은 직전 승인본을 계속 봅니다.</div>
            <button className="apc-btn line" onClick={() => { setAsk('revise'); setErr('') }}>수정 요청</button>
          </>) : (
            <div className="apc-ms">남의 자료입니다. 보기만 할 수 있습니다.</div>
          )}
        </div>
      )}
    </div>

    {ask && (
      <Modal title={ask === 'submit' ? '결재 제출' : '수정 요청'} size="sm" busy={busy}
        onClose={() => { if (!busy) { setAsk(null); setErr('') } }}
        cancel={{ label: '취소', onClick: () => { setAsk(null); setErr('') } }}
        footer={
          <button className="lib-btn dark" disabled={busy} onClick={() => send(ask)}>
            {busy ? (ask === 'submit' ? '제출 중…' : '요청 중…') : (ask === 'submit' ? '제출' : '요청')}
          </button>
        }>
        <b>{title || '제목 없음'}</b>
        {ask === 'submit' ? (<>
          {' '}을(를) 관리자에게 제출합니다.
          <br /><br />
          <b>지금 이 문서가 그대로 얼어붙습니다.</b> 제출한 뒤에 고쳐도 결재본은 바뀌지 않습니다.
          <br />
          한 번이라도 제출하면 <b>이 자료는 지울 수 없습니다.</b>
          {unsaved && <div className="apc-note">저장 안 된 변경이 있습니다 — <b>저장한 뒤에 냅니다.</b></div>}
          {gaps.length > 0 && (
            <div className="apc-note">아직 안 쓴 자리가 {gaps.length}군데 있습니다.
              그대로 내셔도 됩니다.</div>
          )}
        </>) : (<>
          {' '}을(를) 고칠 수 있게 해 달라고 요청합니다.
          <br /><br />
          <b>팀이 보는 화면은 지금 그대로입니다.</b> 허락이 나도 승인본은 안 바뀌고,
          고쳐서 <b>다시 승인을 받아야</b> 교체됩니다.
        </>)}
        {err && <div style={{ color: '#b4232a', marginTop: 10 }}>{err}</div>}
        <input className="lib-mkin" value={msg}
          placeholder={ask === 'submit' ? '전달할 말 (선택)' : '무엇을 고칠지 (선택)'}
          onChange={(e) => setMsg(e.target.value)} />
      </Modal>
    )}
  </>)
}
