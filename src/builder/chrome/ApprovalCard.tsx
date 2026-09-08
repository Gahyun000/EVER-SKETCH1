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
import SlideViewer from '../../approvals/SlideViewer'
import {
  ApprovalApiError, DOC_STATE_LABEL, apiEndRevision, apiGetApproval, apiRequestApproval,
  apiRequestRevision, apiStatusMap, type Approval, type StatusChip,
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
  const [ask, setAsk] = useState<'submit' | 'revise' | 'end' | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // **상세는 따로 받아 온다.** `/status-map` 은 사유(`decision_message`)를 안 준다 —
  // 그건 결재 상세에만 있다. 서버를 안 고치는 대신 **반려일 때만** 한 번 더 묻는다(사용자 결정 ㄱ).
  const [detail, setDetail] = useState<Approval | undefined>(undefined)
  const [dBusy, setDBusy] = useState(false)
  const [view, setView] = useState(false)   // 「낸 것 보기」·「승인본 보기」 창
  const [vIdx, setVIdx] = useState(0)

  // **상태는 서버에서 받아 온다.** 목록 화면이 이미 쓰는 그 엔드포인트다 —
  // 편집 화면이 안 부르고 있었을 뿐이라 서버는 손대지 않는다.
  const load = async () => {
    if (!activeId) return
    try { setChip((await apiStatusMap())[activeId]) } catch { /* 부가 정보다 — 조용히 넘어간다 */ }
  }
  useEffect(() => { void load() }, [activeId])   // eslint-disable-line react-hooks/exhaustive-deps
  // 자료가 바뀌면 들고 있던 상세는 남의 것이 된다.
  useEffect(() => { setDetail(undefined); setView(false); setVIdx(0) }, [activeId])

  /** 결재 상세를 받아 온다. **문서 전체(`snapshot`)가 딸려 온다** —
   *  사유 한 줄 때문에 늘 끌고 다니면 안 된다. 그래서 부르는 자리를 둘로 좁혔다:
   *  카드를 **펼쳤을 때(반려)** 와 「낸 것 보기」를 **눌렀을 때.** */
  const loadDetail = async (): Promise<Approval | undefined> => {
    if (detail) return detail
    const aid = chip?.approval_id
    if (!aid) return undefined
    setDBusy(true)
    try { const d = await apiGetApproval(aid); setDetail(d); return d }
    catch { return undefined }
    finally { setDBusy(false) }
  }

  // **펼쳤을 때만** 부른다. 접힌 카드에 사유는 어차피 안 보인다 —
  // 접힌 채로도 부르면 반려된 자료를 열 때마다 문서 한 벌이 더 내려온다.
  useEffect(() => {
    if (open && chip?.state === 'rejected' && chip.approval_id) void loadDetail()
  }, [open, chip?.approval_id, chip?.state])   // eslint-disable-line react-hooks/exhaustive-deps

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

  const send = (kind: 'submit' | 'revise' | 'end') => {
    if (busy) return
    setBusy(true); setErr('')
    void (async () => {
      try {
        // **저장부터.** 결재본은 서버에 저장된 문서를 얼린다.
        if (kind === 'submit') await flushSave()
        if (kind === 'submit') await apiRequestApproval(activeId, msg.trim())
        else if (kind === 'revise') await apiRequestRevision(activeId, msg.trim())
        // **그만두기는 자료가 아니라 「그 요청」에 하는 일**이라 결재 건 id 로 부른다.
        else await apiEndRevision(chip?.approval_id || '')
        setAsk(null); setMsg('')
        // 상태가 바뀌었으니 들고 있던 상세는 옛것이다.
        setDetail(undefined)
        await load()
      } catch (e) {
        setErr(e instanceof ApprovalApiError ? e.message
          : kind === 'submit' ? '제출하지 못했습니다.'
            : kind === 'revise' ? '요청하지 못했습니다.' : '그만두지 못했습니다.')
      } finally { setBusy(false) }
    })()
  }

  /** 「낸 것 보기」·「승인본 보기」. **누를 때 받아 온다** — 문서 한 벌이 딸려 오므로.
   *
   *  없을 수도 있다. 수정 요청(`kind === 'revision'`)에는 **얼린 문서가 없다** —
   *  문서가 아니라 「고치게 해 달라」는 허락 요청이라 얼릴 것이 없다.
   *  그때 빈 뷰어를 띄우면 「고장 났다」로 읽히므로, 아예 버튼을 안 그린다. */
  const snapBtn = (label: string) => {
    if (!chip?.approval_id || chip.kind === 'revision') return null
    return (
      <button className="apc-btn mut" disabled={dBusy}
        onClick={() => { void (async () => { await loadDetail(); setVIdx(0); setView(true) })() }}>
        {dBusy ? '불러오는 중…' : label}
      </button>
    )
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
              // **사유를 그 자리에서 읽는다.** 없으면 그냥 「반려됐습니다」로 —
              // 아무 말 없이 반려하는 것도 되는 일이라, 빈 따옴표를 그리지 않는다.
              <div className="apc-quote">
                {dBusy && !detail ? '반려 사유를 불러옵니다…'
                  : detail?.decision_message
                    ? <>「{detail.decision_message}」
                      <span className="apc-by">— {detail.approver_name || '관리자'}
                        {detail.decided_at ? ' · ' + fmtDay(detail.decided_at) : ''}</span></>
                    : '반려됐습니다. 고쳐서 다시 낼 수 있습니다.'}
              </div>
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
            {shape === 'revising' && (
              // 고치기로 해 놓고 안 고칠 수도 있다. 이 길이 없으면 「수정 중」이 영원히 남고,
              // 팀은 몇 달째 「곧 바뀐다」는 글자가 붙은 승인본을 보게 된다.
              <button className="apc-btn mut" onClick={() => { setAsk('end'); setErr('') }}>
                수정 그만두기
              </button>
            )}
          </>) : shape === 'pending' ? (<>
            <div className="apc-ms"><b>관리자 결정을 기다립니다.</b><br />
              <span className="frz">낸 문서는 얼어 있습니다.</span> 여기서 고쳐도 결재본은 그대로입니다.</div>
            {snapBtn('낸 것 보기')}
          </>) : shape === 'approved' ? (<>
            <div className="apc-ms"><b>팀에 공유 중입니다.</b><br />
              고치려면 먼저 <b>허락을 받아야</b> 합니다. 허락이 나도 팀은 직전 승인본을 계속 봅니다.</div>
            <button className="apc-btn line" onClick={() => { setAsk('revise'); setErr('') }}>수정 요청</button>
            {snapBtn('승인본 보기')}
          </>) : (
            <div className="apc-ms">남의 자료입니다. 보기만 할 수 있습니다.</div>
          )}
        </div>
      )}
    </div>

    {view && (
      // **낸 것을 그 자리에서 본다.** 지금까지는 결재함까지 가야 볼 수 있었다.
      // 얼린 문서라 읽기만 한다 — 여기서 고칠 수 있으면 「작업본」과 「결재본」이 섞인다.
      <Modal title={shape === 'approved' ? '승인본' : '낸 것'} size="lg"
        onClose={() => setView(false)}
        cancel={{ label: '닫기', onClick: () => setView(false) }}>
        {detail?.snapshot ? (<>
          <div className="apc-vmeta">
            {chip && chip.round > 1 ? `${chip.round}회차 · ` : ''}
            {detail.created_at ? fmtDay(detail.created_at) + ' 제출' : '제출'}
            {' · '}<b>얼어 있는 문서입니다 — 여기서는 못 고칩니다.</b>
          </div>
          <SlideViewer snap={detail.snapshot} idx={vIdx} onIdx={setVIdx} />
        </>) : (
          <div className="apc-ms">낸 문서를 찾을 수 없습니다. 결재함에서 확인해 주세요.</div>
        )}
      </Modal>
    )}

    {ask && (
      <Modal title={ask === 'submit' ? '결재 제출' : ask === 'revise' ? '수정 요청' : '수정 그만두기'}
        size="sm" busy={busy}
        onClose={() => { if (!busy) { setAsk(null); setErr('') } }}
        cancel={{ label: '취소', onClick: () => { setAsk(null); setErr('') } }}
        footer={
          <button className="lib-btn dark" disabled={busy} onClick={() => send(ask)}>
            {busy ? (ask === 'submit' ? '제출 중…' : ask === 'revise' ? '요청 중…' : '그만두는 중…')
              : (ask === 'submit' ? '제출' : ask === 'revise' ? '요청' : '그만두기')}
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
        </>) : ask === 'revise' ? (<>
          {' '}을(를) 고칠 수 있게 해 달라고 요청합니다.
          <br /><br />
          <b>팀이 보는 화면은 지금 그대로입니다.</b> 허락이 나도 승인본은 안 바뀌고,
          고쳐서 <b>다시 승인을 받아야</b> 교체됩니다.
        </>) : (<>
          의 <b>수정을 그만둡니다</b>.
          <br /><br />
          자료는 <b>다시 잠기고</b> 팀은 승인본을 그대로 봅니다.
          <b>고친 내용은 지워지지 않습니다</b> — 승인본에 반영되지 않을 뿐이고,
          나중에 다시 수정 요청을 낼 수 있습니다.
        </>)}
        {err && <div style={{ color: '#b4232a', marginTop: 10 }}>{err}</div>}
        {ask !== 'end' && (
          // 그만두기에는 붙일 말이 없다 — 아무에게도 안 간다.
          <input className="lib-mkin" value={msg}
            placeholder={ask === 'submit' ? '전달할 말 (선택)' : '무엇을 고칠지 (선택)'}
            onChange={(e) => setMsg(e.target.value)} />
        )}
      </Modal>
    )}
  </>)
}

/** 「9월 2일」. 반려 사유 옆에 붙는 날짜라 시각까지는 필요 없다. */
function fmtDay(ms: number): string {
  // 서버는 **밀리초**로 준다(`time.time() * 1000`). 초로 잘못 읽으면 1970년이 찍힌다.
  const d = new Date(ms)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
