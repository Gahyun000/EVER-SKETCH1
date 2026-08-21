import { useEffect, useMemo, useRef, useState } from 'react'
import { apiListUsers, type Me } from '../auth/authApi'
import { useAuth } from '../auth/useAuth'
import { useProjects } from '../persistence/projects'
import { useBuilder } from '../state/store'
import { anchorText } from './anchorLabel'
import { type Thread } from './commentsApi'
import { countMyTurn, relationOf, sortThreads, turnOf, useComments } from './store'
import './comments.css'

/**
 * 검토 의견 목록.
 *
 * 화면 오른쪽에 붙는다. 캔버스의 핀과 **같은 데이터**를 본다 —
 * 따로 불러오면 한쪽에서 해결한 게 다른 쪽에 남아, 무엇이 참인지 알 수 없게 된다.
 */
export default function CommentsPanel() {
  const me = useAuth((s) => s.me)
  // 의견을 달 수 있는지는 서버가 정한다(GET /api/projects/{id} 의 access).
  const access = useProjects((s) => s.access)
  const canComment = !access || access.can_comment
  const pages = useBuilder((s) => s.pages)
  const selectedPageId = useBuilder((s) => s.selectedPageId)
  const { threads, open, setOpen, focusId, focus, showResolved, setShowResolved,
          add, resolve, setFixed, remove, error, loading } = useComments()
  const [users, setUsers] = useState<Me[]>([])
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // 이름을 보여주기 위한 명단. 실패해도 조용히 넘어간다 — id 로 표시된다.
  useEffect(() => {
    if (!open) return
    void (async () => {
      try { setUsers(await apiListUsers('active')) } catch { /* 부가 정보 */ }
    })()
  }, [open])

  // 고른 스레드로 스크롤 — 핀을 눌렀을 때 목록에서 찾아 헤매지 않게.
  useEffect(() => {
    if (!focusId || !listRef.current) return
    const node = listRef.current.querySelector(`[data-thread="${focusId}"]`)
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusId, threads])

  const who = (id: string) => users.find((u) => u.id === id)?.name || id.slice(0, 8)
  const unresolved = threads.filter((t) => !t.resolved_at).length
  // 내 자료인가 — '나에게 온 지적' 인지는 여기서 갈린다.
  const docIsMine = !access || access.mine
  const rel = (t: Thread) => relationOf(t, me?.id, docIsMine)
  const toMe = countMyTurn(threads, me?.id, docIsMine)

  // 순서 규칙은 relation.ts 에 있다(답해야 할 것이 맨 위 — 그 이유는 거기 주석).
  const shown = useMemo(
    () => sortThreads(threads.filter((t) => showResolved || !t.resolved_at), me?.id, docIsMine),
    [threads, showResolved, me?.id, docIsMine])

  const pageNo = (t: Thread) => {
    const i = pages.findIndex((p) => p.id === t.page_id)
    return i >= 0 ? i + 1 : t.page_id
  }
  // 짚은 자리를 사람 말로 — 「5행 3~6열」이 아니라 「B프로젝트 · 2월~5월」.
  // 그러려면 그 표를 찾아야 한다(이름은 표 안에 적혀 있다).
  const elOf = (t: Thread) => {
    if (t.el_id == null) return undefined
    const pg = pages.find((p) => p.id === t.page_id)
    return pg?.els?.find((e) => e.id === t.el_id)
  }
  const anchorOf = (t: Thread) => anchorText(elOf(t), t.cell, t.el_id != null)

  const submit = async () => {
    const body = draft.trim()
    if (!body) return
    setBusy(true); setErr('')
    try {
      if (replyTo) {
        await add({ body, page_id: selectedPageId ?? 1, reply_to: replyTo })
      } else {
        await add({ body, page_id: selectedPageId ?? 1 })
      }
      setDraft(''); setReplyTo(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '메모를 달지 못했어요.')
    } finally { setBusy(false) }
  }

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : '처리하지 못했어요.') }
    finally { setBusy(false) }
  }

  if (!open) {
    // 닫혀 있을 때 보이는 숫자는 **내가 답해야 할 것**이다.
    // 전체 건수를 보여주면, 남의 지적까지 섞인 숫자를 보고 '아직 할 게
    // 많구나' 로 읽는다 — 정작 내 몫이 몇 건인지는 열어봐야 안다.
    const n = toMe > 0 ? toMe : unresolved
    return (
      <button className={'cmt-tab' + (unresolved ? ' has' : '') + (toMe ? ' tome' : '')}
        onClick={() => setOpen(true)}
        title={toMe > 0 ? `나에게 온 미해결 ${toMe}건 · 전체 ${unresolved}건` : '검토 의견 열기'}>
        의견{n > 0 ? <span className="cmt-count">{n}</span> : null}
      </button>
    )
  }

  return (
    <aside className="cmt-panel" aria-label="검토 의견">
      <div className="cmt-head">
        <b>검토 의견</b>
        <span className="cmt-dim">{unresolved > 0 ? `미해결 ${unresolved}건` : '모두 해결됨'}</span>
        <label className="cmt-toggle">
          <input type="checkbox" checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)} />
          해결된 것도 보기
        </label>
        <button className="cmt-x" onClick={() => setOpen(false)} aria-label="닫기">✕</button>
      </div>

      {(err || error) && <div className="cmt-err">{err || error}</div>}

      <div className="cmt-list" ref={listRef}>
        {loading ? <p className="cmt-dim">불러오는 중…</p>
          : shown.length === 0 ? (
            <p className="cmt-empty">
              아직 의견이 없습니다.{'\n'}
              고칠 곳을 짚어 두면 받는 사람이 어디를 말하는지 찾지 않아도 됩니다.
            </p>
          ) : shown.map((t) => (
            <div key={t.id} data-thread={t.id}
              className={'cmt-item' + (t.resolved_at ? ' done' : '') + (focusId === t.id ? ' on' : '')
                + (turnOf(t, me?.id, docIsMine) === 'me' ? ' tome' : '')}
              onClick={() => focus(t.id)}>
              <div className="cmt-meta">
                <b>{who(t.author_id)}</b>
                {!t.resolved_at && turnOf(t, me?.id, docIsMine) === 'me'
                  ? <span className="cmt-tome"
                      title={rel(t) === 'mine' ? '고쳤다는 답이 왔습니다 — 확인하고 닫아 주세요'
                                               : '내 자료에 달린 지적입니다'}>
                      {rel(t) === 'mine' ? '확인 차례' : '나에게'}
                    </span>
                  : rel(t) === 'mine' ? <span className="cmt-byme">내가 씀</span> : null}
                {!t.resolved_at && t.fixed_at
                  ? <span className="cmt-fixed" title="담당자가 고쳤다고 알렸습니다">고침</span>
                  : null}
                <span className="cmt-anchor">
                  {t.lost_at
                    ? <span className="cmt-lost" title="표에서 그 행·열이 지워졌습니다">가리키던 칸이 없어짐</span>
                    : `${pageNo(t)}쪽 · ${anchorOf(t)}`}
                </span>
                {t.resolved_at ? <span className="cmt-done-tag">해결</span> : null}
              </div>
              <p className="cmt-body">{t.body}</p>
              {t.replies.map((r) => (
                <div key={r.id} className="cmt-reply">
                  <b>{who(r.author_id)}</b>
                  <p className="cmt-body">{r.body}</p>
                </div>
              ))}
              <div className="cmt-acts">
                <button className="cmt-mini" disabled={busy}
                  onClick={(e) => { e.stopPropagation(); setReplyTo(t.id); focus(t.id) }}>답글</button>
                {/* **닫는 것은 지적한 사람 몫이다.**
                    담당자가 스스로 닫으면 "고쳤다" 와 "정말 고쳤다" 가 구분되지 않고,
                    발행 직전의 '미해결 0건' 이 아무것도 보장하지 못하게 된다.
                    담당자에게는 대신 「고쳤습니다」가 있다(서버도 같게 판정한다). */}
                {t.resolved_at
                  ? <button className="cmt-mini" disabled={busy}
                      onClick={(e) => { e.stopPropagation(); void act(() => resolve(t.id, false)) }}>
                      다시 열기
                    </button>
                  : rel(t) === 'to-me'
                    ? (t.fixed_at
                      ? <button className="cmt-mini" disabled={busy}
                          title="아직 고치는 중이라고 되돌립니다"
                          onClick={(e) => { e.stopPropagation(); void act(() => setFixed(t.id, false)) }}>
                          고침 취소
                        </button>
                      : <button className="cmt-mini primary" disabled={busy}
                          title="고쳤다고 알립니다 — 닫는 것은 지적한 분이 합니다"
                          onClick={(e) => { e.stopPropagation(); void act(() => setFixed(t.id, true)) }}>
                          고쳤습니다
                        </button>)
                    : <button className="cmt-mini" disabled={busy}
                        title="확인했으면 닫습니다"
                        onClick={(e) => { e.stopPropagation(); void act(() => resolve(t.id, true)) }}>
                        해결
                      </button>}
                {t.author_id === me?.id && (
                  <button className="cmt-mini danger" disabled={busy}
                    onClick={(e) => { e.stopPropagation(); void act(() => remove(t.id)) }}>삭제</button>
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="cmt-new">
        {!canComment && (
          /* 남의 장에는 검토 단계부터 단다. 입력칸만 잠그고 이유를 말하지 않으면
             '왜 안 써지지' 로 끝난다. */
          <p className="cmt-locked">
            아직 <b>작성 중</b>인 회차입니다. 검토 단계로 넘어가면 의견을 달 수 있어요.
          </p>
        )}
        {replyTo && (
          <div className="cmt-replying">
            답글 작성 중
            <button className="cmt-mini" onClick={() => setReplyTo(null)}>취소</button>
          </div>
        )}
        <textarea value={draft} rows={3} disabled={busy || !canComment}
          placeholder={replyTo ? '답글을 쓰세요' : '이 장에 대한 의견을 쓰세요. 특정 칸을 짚으려면 표에서 칸을 고른 뒤 툴바의 「의견 달기」를 누르세요.'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }} />
        <button className="cmt-send" disabled={busy || !canComment || !draft.trim()} onClick={() => void submit()}>
          {busy ? '보내는 중…' : replyTo ? '답글 달기' : '의견 달기'}
        </button>
      </div>
    </aside>
  )
}
