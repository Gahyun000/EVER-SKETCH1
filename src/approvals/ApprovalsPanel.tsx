import { useEffect, useMemo, useState } from 'react'
import { Check, X, Undo2, MessageSquare, PenLine } from 'lucide-react'
import SlideViewer from './SlideViewer'
import {
  ApprovalApiError, STATUS_LABEL, STATUS_ORDER,
  apiAddComment, apiDecide, apiDecideRevision, apiDeleteComment, apiEndRevision,
  apiGetApproval, apiListApprovals, apiWithdraw,
  type Approval, type ApprovalStatus,
} from './approvalApi'
import { useAuth } from '../auth/useAuth'
import { isAdmin } from '../auth/authApi'
import Modal from '../ui/Modal'

const fmt = (ts?: number | null) =>
  ts ? new Date(ts).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false,
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '-'

/**
 * 결재함 — 목록과 상세를 한 창에서.
 *
 * 누가 무엇을 보는가(서버가 정하고 화면은 그대로 그린다)
 *   · L1 관리자 : 전부. 결재자가 한 명이므로(D11) 결재함이 곧 전체 목록이다.
 *   · L2 작성자 : **본인이 낸 것만.** 같은 팀 남의 제출본도 못 본다 —
 *                 팀 공유는 「승인된 것」에만 열리고(D6), 그 화면은 P6 이다.
 *   · L3 열람자 : 이 창을 열 길이 없다(D13).
 *
 * **승인은 「그때 본 것」에 대한 승인이다.** 여기 보이는 슬라이드는 제출 시점에 얼린
 * 스냅샷이고, 작성자가 그 뒤 자료를 고쳐도 이 화면은 안 바뀐다.
 */
export default function ApprovalsPanel({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.me)
  const admin = isAdmin(me)

  const [tab, setTab] = useState<ApprovalStatus | ''>('pending')
  const [list, setList] = useState<Approval[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Approval | null>(null)
  const [idx, setIdx] = useState(0)
  const [msg, setMsg] = useState('')          // 결정 메시지
  const [cmt, setCmt] = useState('')          // 코멘트 입력
  const [confirm, setConfirm] =
    useState<'approve' | 'reject' | 'withdraw' | 'end' | null>(null)

  const load = async () => {
    setErr('')
    try {
      const d = await apiListApprovals(tab || undefined)
      setList(d.approvals); setPhase('ready')
      // 개수는 **전체 기준**으로 따로 받는다. 탭이 걸린 응답의 개수를 쓰면
      // 「대기」 탭에서 승인 개수가 0으로 보인다.
      if (tab) {
        const all = await apiListApprovals()
        setCounts(all.counts)
      } else {
        setCounts(d.counts)
      }
    } catch (e) {
      setErr(e instanceof ApprovalApiError ? e.message : '결재함을 불러오지 못했습니다.')
      setPhase('error')
    }
  }
  useEffect(() => { void load() }, [tab])     // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openId) { setDetail(null); return }
    let alive = true
    void (async () => {
      try {
        const a = await apiGetApproval(openId)
        if (alive) { setDetail(a); setIdx(0); setMsg(''); setCmt('') }
      } catch (e) {
        if (alive) setErr(e instanceof ApprovalApiError ? e.message : '결재 건을 불러오지 못했습니다.')
      }
    })()
    return () => { alive = false }
  }, [openId])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try {
      await fn()
      if (openId) setDetail(await apiGetApproval(openId))
      await load()
    } catch (e) {
      setErr(e instanceof ApprovalApiError ? e.message : '처리하지 못했습니다.')
    } finally { setBusy(false) }
  }

  const pages = detail?.snapshot?.pages || []
  const curPage = pages[Math.min(idx, Math.max(0, pages.length - 1))]
  /** 이 슬라이드에 붙은 코멘트. `page_id` 가 없는 것은 전체 의견이라 따로 모은다. */
  const byPage = useMemo(() => {
    const cs = detail?.comments || []
    return {
      here: cs.filter((c) => curPage && c.page_id === curPage.id),
      whole: cs.filter((c) => c.page_id === null || c.page_id === undefined),
    }
  }, [detail, curPage])
  const badge = (p: { id: number }) =>
    (detail?.comments || []).filter((c) => c.page_id === p.id).length

  const mine = !!detail && detail.requester === me?.id
  /**
   * **수정 요청은 문서가 아니라 「고치게 해 달라」는 청이다**(P7 · D8).
   * 그래서 스냅샷이 없고, 그릴 슬라이드도 없다. 같은 창을 쓰되 이 한 줄에서 갈린다 —
   * 갈래를 여기저기 흩어 두면 어느 한 곳이 반드시 「문서인 척」 그린다.
   */
  const isRevision = detail?.kind === 'revision'
  const canDecide = admin && detail?.status === 'pending' && !isRevision
  const canDecideRevision = admin && detail?.status === 'pending' && isRevision
  const canWithdraw = mine && detail?.status === 'pending'
  /** 「수정 중」을 그만둔다 — 이 길이 없으면 「수정 중」이 영원히 남는다. */
  const canEndRevision = mine && isRevision && detail?.status === 'approved'

  return (
    <div className="es-auth ap" onClick={onClose}>
      <div className="es-card wide ap-card" onClick={(e) => e.stopPropagation()}>
        <div className="ap-head">
          <div className="es-brand">
            <b>결재함</b>
            <span>{admin ? '전체 결재 건' : '내가 낸 결재'}</span>
          </div>
          <button className="es-mini" onClick={onClose}>닫기</button>
        </div>

        <div className="es-tabs">
          {(['pending', 'approved', 'rejected', 'withdrawn', ''] as const).map((t) => (
            <button key={t || 'all'} className={'es-tab' + (tab === t ? ' on' : '')}
              onClick={() => { setTab(t); setOpenId(null) }}>
              {t ? STATUS_LABEL[t] : '전체'}
              {t && counts[t] ? ` ${counts[t]}` : ''}
            </button>
          ))}
        </div>

        {err && <div className="es-msg err">{err}</div>}

        <div className="ap-body">
          {/* ── 왼쪽: 목록 ── */}
          <div className="ap-list">
            {phase === 'loading' ? (
              <div className="es-empty">불러오는 중…</div>
            ) : phase === 'error' ? (
              <div className="es-empty">
                불러오지 못했습니다.<br />
                <button className="es-mini" style={{ marginTop: 8 }}
                  onClick={() => { setPhase('loading'); void load() }}>다시 시도</button>
              </div>
            ) : list.length === 0 ? (
              <div className="es-empty">
                {tab === 'pending'
                  ? (admin ? '결재를 기다리는 건이 없습니다.' : '낸 결재가 없습니다.')
                  : '해당하는 결재 건이 없습니다.'}
              </div>
            ) : list.map((a) => (
              <button key={a.id} className={'ap-item' + (openId === a.id ? ' on' : '')}
                onClick={() => setOpenId(a.id)}>
                <div className="ap-item-top">
                  <span className="ap-item-name">{a.project_name}</span>
                  {/* **무엇에 대한 결재인지를 먼저 말한다.** 수정 요청과 제출본이 같은
                      모양으로 섞여 있으면 결재자가 슬라이드를 기대하고 열었다가 빈 화면을 본다. */}
                  {a.kind === 'revision' && <span className="ap-kind">수정 요청</span>}
                  <span className={'ap-st ' + a.status}>{STATUS_LABEL[a.status]}</span>
                </div>
                <div className="ap-item-sub">
                  {a.round}회차 · {a.requester_name || a.requester} · {fmt(a.created_at)}
                  {a.comment_count ? <> · <MessageSquare className="h-3 w-3" />{a.comment_count}</> : null}
                </div>
                {a.folder_path && <div className="ap-item-path">{a.folder_path}</div>}
              </button>
            ))}
          </div>

          {/* ── 오른쪽: 상세 ── */}
          <div className="ap-detail">
            {!detail ? (
              <div className="es-empty">왼쪽에서 결재 건을 골라 주세요.</div>
            ) : (
              <>
                <div className="ap-d-head">
                  <div>
                    <b>{detail.project_name}</b>
                    {isRevision && <span className="ap-kind">수정 요청</span>}
                    <span className={'ap-st ' + detail.status}>{STATUS_LABEL[detail.status]}</span>
                    <div className="ap-d-sub">
                      {detail.round}회차 · {detail.requester_name || detail.requester} 제출 · {fmt(detail.created_at)}
                      {detail.decided_at ? ` · ${detail.approver_name || ''} ${STATUS_LABEL[detail.status]} ${fmt(detail.decided_at)}` : ''}
                    </div>
                  </div>
                </div>
                {detail.request_message && (
                  <div className="ap-note">“{detail.request_message}”</div>
                )}
                {detail.decision_message && (
                  <div className={'ap-note ' + detail.status}>“{detail.decision_message}”</div>
                )}

                {/* 제출 시점에 얼린 문서. 뒤에 고쳐도 여기는 안 바뀐다.
                    **수정 요청에는 문서가 없다** — 얼릴 것이 없어서다.
                    빈 뷰어를 띄우는 대신 무엇을 정하는 자리인지 적는다. */}
                {isRevision ? (
                  <div className="ap-rev">
                    <PenLine className="h-5 w-5" />
                    <b>이 자료를 고칠 수 있게 해 달라는 요청입니다.</b>
                    <p>
                      허락해도 <b>승인본은 안 바뀝니다.</b> 팀은 직전 승인본을 계속 보고,
                      작성자가 고쳐서 <b>다시 승인을 받아야</b> 교체됩니다.<br />
                      거절하면 자료는 <b>승인된 채로</b> 그대로 남습니다.
                    </p>
                  </div>
                ) : (
                  <div className="ap-viewer">
                    <SlideViewer snap={detail.snapshot as never} idx={idx} onIdx={setIdx} badge={badge} />
                  </div>
                )}

                {/* 슬라이드별 코멘트. **수정 요청에는 슬라이드가 없다** —
                    「3번 슬라이드 의견」이라고 적힌 빈 칸을 띄우지 않는다.
                    허락·거절에 붙일 말은 아래 결정 메시지 칸에 쓴다. */}
                {!isRevision && (
                <div className="ap-cmts">
                  <div className="ap-cmts-h">
                    {curPage ? `${idx + 1}번 슬라이드 의견` : '의견'}
                    {byPage.here.length ? ` (${byPage.here.length})` : ''}
                  </div>
                  {byPage.here.map((c) => (
                    <div key={c.id} className="ap-cmt">
                      <b>{c.author_name || c.author}</b>
                      <span className="t">{fmt(c.created_at)}</span>
                      <p>{c.body}</p>
                      {c.author === me?.id && (
                        <button className="es-mini danger" disabled={busy}
                          onClick={() => void act(() => apiDeleteComment(c.id))}>지우기</button>
                      )}
                    </div>
                  ))}
                  {byPage.whole.length > 0 && (
                    <>
                      <div className="ap-cmts-h">전체 의견 ({byPage.whole.length})</div>
                      {byPage.whole.map((c) => (
                        <div key={c.id} className="ap-cmt">
                          <b>{c.author_name || c.author}</b>
                          <span className="t">{fmt(c.created_at)}</span>
                          <p>{c.body}</p>
                          {c.author === me?.id && (
                            <button className="es-mini danger" disabled={busy}
                              onClick={() => void act(() => apiDeleteComment(c.id))}>지우기</button>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {/* **양쪽이 주고받는다** — 관리자는 지적하고 낸 사람은 답한다.
                      한쪽만 열면 대화가 안 된다. */}
                  <div className="ap-cmt-new">
                    <textarea value={cmt} rows={2} disabled={busy}
                      placeholder={curPage ? `${idx + 1}번 슬라이드에 의견 쓰기` : '의견 쓰기'}
                      onChange={(e) => setCmt(e.target.value)} />
                    <button className="es-mini primary" disabled={busy || !cmt.trim()}
                      onClick={() => void act(async () => {
                        await apiAddComment(detail.id, cmt.trim(),
                          curPage ? curPage.id : null, curPage ? idx + 1 : null)
                        setCmt('')
                      })}>등록</button>
                  </div>
                </div>
                )}

                {/* 결정 — 대기 중일 때만. 승인 자체를 뒤집는 길은 없고,
                    되돌리는 일은 「수정 요청」이 한다. */}
                {(canDecide || canDecideRevision || canWithdraw || canEndRevision) && (
                  <div className="ap-actions">
                    {(canDecide || canDecideRevision) && (
                      <>
                        <input value={msg} placeholder="의견 (선택)" disabled={busy}
                          onChange={(e) => setMsg(e.target.value)} />
                        {/* **글자가 다르다.** 「승인」은 문서에, 「허락」은 요청에 하는 일이다 —
                            같은 말을 쓰면 결재자가 무엇에 도장을 찍는지 흐려진다. */}
                        <button className="es-mini primary" disabled={busy}
                          onClick={() => setConfirm('approve')}>
                          <Check className="h-4 w-4" /> {canDecideRevision ? '허락' : '승인'}
                        </button>
                        <button className="es-mini danger" disabled={busy}
                          onClick={() => setConfirm('reject')}>
                          <X className="h-4 w-4" /> {canDecideRevision ? '거절' : '반려'}
                        </button>
                      </>
                    )}
                    {canWithdraw && (
                      <button className="es-mini" disabled={busy} onClick={() => setConfirm('withdraw')}>
                        <Undo2 className="h-4 w-4" /> 회수
                      </button>
                    )}
                    {canEndRevision && (
                      <button className="es-mini" disabled={busy} onClick={() => setConfirm('end')}>
                        <Undo2 className="h-4 w-4" /> 수정 그만두기
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 되돌릴 수 없는 일은 자체 확인창으로 한 번 더 묻는다(표준: 브라우저 confirm 금지). */}
        {confirm && detail && (
          <Modal
            title={confirm === 'end' ? '수정 그만두기'
              : confirm === 'withdraw' ? '결재 회수'
                : isRevision ? (confirm === 'approve' ? '수정 허락' : '수정 거절')
                  : (confirm === 'approve' ? '결재 승인' : '결재 반려')}
            onClose={() => setConfirm(null)} size="sm" busy={busy}
            scrimClassName="es-confirm" className="es-confirm-box"
            footClassName="es-confirm-actions"
            cancel={{ label: '취소', onClick: () => setConfirm(null) }}
            footer={<>
              {/* **빨강은 「잃는다」는 뜻이어야 한다.**
                  여기 넷은 하나도 잃지 않는다 — 반려·거절은 자료가 그대로 남고,
                  회수는 이력에 남으며 다시 낼 수 있고, 그만두기는 고친 내용을 안 지운다.
                  그런데 「승인이 아닌 것」이 전부 빨강이었다. 그러면 빨강이
                  **「되돌릴 수 없다」가 아니라 「오른쪽 아닌 쪽」**이라는 뜻이 되고,
                  정작 이북 삭제·계정 중지에서 빨강이 아무 말도 안 하게 된다.
                  긍정은 채운 버튼, 그 밖은 테두리 버튼으로 가른다. */}
              <button className={'es-mini' + (confirm === 'approve' ? ' primary' : '')}
                disabled={busy}
                onClick={() => {
                  const c = confirm
                  setConfirm(null)
                  void act(() => c === 'end'
                    ? apiEndRevision(detail.id)
                    : c === 'withdraw'
                      ? apiWithdraw(detail.id)
                      : isRevision
                        ? apiDecideRevision(detail.id, c, msg.trim())
                        : apiDecide(detail.id, c, msg.trim()))
                }}>
                {confirm === 'end' ? '그만두기'
                  : confirm === 'withdraw' ? '회수'
                    : isRevision ? (confirm === 'approve' ? '허락' : '거절')
                      : (confirm === 'approve' ? '승인' : '반려')}
              </button>
            </>}>
            {/* **문구가 갈린다.** 같은 「승인」 버튼이라도 문서에 도장을 찍는 것과
                「고쳐도 된다」고 허락하는 것은 되는 일이 완전히 다르다 —
                한 문구를 돌려 쓰면 확인창이 거짓말을 한다. */}
            <b>{detail.project_name}</b>{isRevision ? '' : ` ${detail.round}회차`}
            {confirm === 'end' ? (
              <>
                의 <b>수정을 그만둡니다</b>.
                <br /><br />
                자료는 <b>다시 잠기고</b> 팀은 승인본을 그대로 봅니다.
                <b>고친 내용은 지워지지 않습니다</b> — 승인본에 반영되지 않을 뿐이고,
                나중에 다시 수정 요청을 낼 수 있습니다.
              </>
            ) : confirm === 'withdraw' ? (
              <>
                를 <b>회수합니다</b>.
                <br /><br />
                고쳐서 다시 낼 수 있습니다. 다만 <b>결재 이력에는 남습니다</b> —
                이력이 있는 자료는 지울 수 없습니다.
              </>
            ) : isRevision ? (
              confirm === 'approve' ? (
                <>
                  를 고쳐도 좋다고 <b>허락</b>합니다.
                  <br /><br />
                  <b>승인본은 안 바뀝니다.</b> 팀은 직전 승인본을 계속 보고,
                  작성자가 고쳐서 <b>다시 승인을 받아야</b> 교체됩니다.
                </>
              ) : (
                <>
                  의 수정 요청을 <b>거절</b>합니다.
                  <br /><br />
                  자료는 <b>승인된 채로 그대로</b> 남고 작성자는 고칠 수 없습니다.
                  이유를 적어 두면 무엇 때문인지 압니다.
                </>
              )
            ) : confirm === 'approve' ? (
              <>
                를 <b>승인</b>합니다.
                <br /><br />
                승인하면 <b>같은 팀에 바로 공유</b>됩니다. 되돌리려면 작성자가
                수정 요청을 내야 합니다.
              </>
            ) : (
              <>
                를 <b>반려</b>합니다.
                <br /><br />
                작성자가 고쳐서 다시 낼 수 있습니다. 의견을 적어 두면 무엇을 고칠지 압니다.
              </>
            )}
          </Modal>
        )}
      </div>
    </div>
  )
}
