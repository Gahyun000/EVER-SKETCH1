import { useEffect, useMemo, useState } from 'react'
import { Check, X, Undo2, MessageSquare } from 'lucide-react'
import SlideViewer from './SlideViewer'
import {
  ApprovalApiError, STATUS_LABEL, STATUS_ORDER,
  apiAddComment, apiDecide, apiDeleteComment, apiGetApproval, apiListApprovals, apiWithdraw,
  type Approval, type ApprovalStatus,
} from './approvalApi'
import { useAuth } from '../auth/useAuth'
import { isAdmin } from '../auth/authApi'

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
  const [confirm, setConfirm] = useState<'approve' | 'reject' | 'withdraw' | null>(null)

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
  const canDecide = admin && detail?.status === 'pending'
  const canWithdraw = mine && detail?.status === 'pending'

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

                {/* 제출 시점에 얼린 문서. 뒤에 고쳐도 여기는 안 바뀐다. */}
                <div className="ap-viewer">
                  <SlideViewer snap={detail.snapshot as never} idx={idx} onIdx={setIdx} badge={badge} />
                </div>

                {/* 슬라이드별 코멘트 */}
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

                {/* 결정 — 대기 중일 때만. 되돌리기는 P7 의 「수정 요청」이 한다. */}
                {(canDecide || canWithdraw) && (
                  <div className="ap-actions">
                    {canDecide && (
                      <>
                        <input value={msg} placeholder="의견 (선택)" disabled={busy}
                          onChange={(e) => setMsg(e.target.value)} />
                        <button className="es-mini primary" disabled={busy}
                          onClick={() => setConfirm('approve')}>
                          <Check className="h-4 w-4" /> 승인
                        </button>
                        <button className="es-mini danger" disabled={busy}
                          onClick={() => setConfirm('reject')}>
                          <X className="h-4 w-4" /> 반려
                        </button>
                      </>
                    )}
                    {canWithdraw && (
                      <button className="es-mini" disabled={busy} onClick={() => setConfirm('withdraw')}>
                        <Undo2 className="h-4 w-4" /> 거두기
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
          <div className="es-confirm" onClick={() => setConfirm(null)}>
            <div className="es-confirm-box" onClick={(e) => e.stopPropagation()}>
              <div className="es-confirm-title">
                {confirm === 'approve' ? '결재 승인' : confirm === 'reject' ? '결재 반려' : '요청 거두기'}
              </div>
              <div className="es-confirm-msg">
                <b>{detail.project_name}</b> {detail.round}회차
                {confirm === 'approve' ? (
                  <>
                    를 <b>승인</b>합니다.
                    <br /><br />
                    승인하면 <b>같은 팀에 바로 공유</b>됩니다. 되돌리려면 작성자가
                    수정 요청을 내야 합니다.
                  </>
                ) : confirm === 'reject' ? (
                  <>
                    를 <b>반려</b>합니다.
                    <br /><br />
                    작성자가 고쳐서 다시 낼 수 있습니다. 의견을 적어 두면 무엇을 고칠지 압니다.
                  </>
                ) : (
                  <>
                    를 <b>거둡니다</b>.
                    <br /><br />
                    고쳐서 다시 낼 수 있습니다. 다만 <b>결재 이력에는 남습니다</b> —
                    이력이 있는 자료는 지울 수 없습니다.
                  </>
                )}
              </div>
              <div className="es-confirm-actions">
                <button className="es-mini" onClick={() => setConfirm(null)}>취소</button>
                <button className={'es-mini ' + (confirm === 'approve' ? 'primary' : 'danger')}
                  disabled={busy}
                  onClick={() => {
                    const c = confirm
                    setConfirm(null)
                    void act(() => c === 'withdraw'
                      ? apiWithdraw(detail.id)
                      : apiDecide(detail.id, c, msg.trim()))
                  }}>
                  {confirm === 'approve' ? '승인' : confirm === 'reject' ? '반려' : '거두기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
