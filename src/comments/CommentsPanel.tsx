import { useEffect, useMemo, useRef, useState } from 'react'
import { apiListUsers, type Me } from '../auth/authApi'
import { useAuth } from '../auth/useAuth'
import { useBuilder } from '../state/store'
import { cellLabel, type Thread } from './commentsApi'
import { useComments } from './store'
import './comments.css'

/**
 * 검토 의견 목록.
 *
 * 화면 오른쪽에 붙는다. 캔버스의 핀과 **같은 데이터**를 본다 —
 * 따로 불러오면 한쪽에서 해결한 게 다른 쪽에 남아, 무엇이 참인지 알 수 없게 된다.
 */
export default function CommentsPanel() {
  const me = useAuth((s) => s.me)
  const pages = useBuilder((s) => s.pages)
  const selectedPageId = useBuilder((s) => s.selectedPageId)
  const { threads, open, setOpen, focusId, focus, showResolved, setShowResolved,
          add, resolve, remove, error, loading } = useComments()
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
  const shown = useMemo(
    () => threads.filter((t) => showResolved || !t.resolved_at),
    [threads, showResolved])

  const pageNo = (t: Thread) => {
    const i = pages.findIndex((p) => p.id === t.page_id)
    return i >= 0 ? i + 1 : t.page_id
  }
  const anchorText = (t: Thread) =>
    t.cell ? `표 · ${cellLabel(t.cell)}` : t.el_id != null ? '요소' : '이 장 전체'

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
    return (
      <button className={'cmt-tab' + (unresolved ? ' has' : '')} onClick={() => setOpen(true)}
        title="검토 의견 열기">
        의견{unresolved > 0 ? <span className="cmt-count">{unresolved}</span> : null}
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
              className={'cmt-item' + (t.resolved_at ? ' done' : '') + (focusId === t.id ? ' on' : '')}
              onClick={() => focus(t.id)}>
              <div className="cmt-meta">
                <b>{who(t.author_id)}</b>
                <span className="cmt-anchor">{pageNo(t)}쪽 · {anchorText(t)}</span>
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
                <button className="cmt-mini" disabled={busy}
                  onClick={(e) => { e.stopPropagation(); void act(() => resolve(t.id, !t.resolved_at)) }}>
                  {t.resolved_at ? '다시 열기' : '해결'}
                </button>
                {t.author_id === me?.id && (
                  <button className="cmt-mini danger" disabled={busy}
                    onClick={(e) => { e.stopPropagation(); void act(() => remove(t.id)) }}>삭제</button>
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="cmt-new">
        {replyTo && (
          <div className="cmt-replying">
            답글 작성 중
            <button className="cmt-mini" onClick={() => setReplyTo(null)}>취소</button>
          </div>
        )}
        <textarea value={draft} rows={3} disabled={busy}
          placeholder={replyTo ? '답글을 쓰세요' : '이 장에 대한 의견을 쓰세요. 특정 칸을 짚으려면 표에서 칸을 고른 뒤 툴바의 「의견 달기」를 누르세요.'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }} />
        <button className="cmt-send" disabled={busy || !draft.trim()} onClick={() => void submit()}>
          {busy ? '보내는 중…' : replyTo ? '답글 달기' : '의견 달기'}
        </button>
      </div>
    </aside>
  )
}
