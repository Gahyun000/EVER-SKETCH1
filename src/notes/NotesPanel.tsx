import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Pin, PinOff, Trash2, Copy, Send, X, ChevronLeft, StickyNote } from 'lucide-react'
import { useProjects } from '../persistence/projects'
import { useBuilder, newBlock } from '../state/store'
import type { Block } from '../state/store'
import PlainEditor, { normalizePlain } from './PlainEditor'
import { listNotes, saveNote, deleteNoteApi } from './notesApi'
import type { Note } from './notesApi'
import './notes.css'

const SIZES = { S: 320, M: 430, L: 620 } as const
type Size = keyof typeof SIZES

// 블록 id를 새로 매겨 편집기·다른 노트와 충돌 방지(서버에서 온 id 재사용 금지).
function reid(bs: Block[]): Block[] {
  return (bs || []).map((b) => ({ ...b, id: newBlock().id, children: b.children ? reid(b.children) : b.children }))
}
function blocksText(bs: Block[]): string {
  return (bs || []).map((b) => (b.text || '') + (b.children ? ' ' + blocksText(b.children) : '')).join(' ')
}
function previewOf(bs: Block[]): string {
  for (const b of bs || []) { if ((b.text || '').trim()) return b.text.trim() }
  return ''
}
function todoStats(bs: Block[]): { done: number; total: number } {
  let done = 0, total = 0
  const walk = (a: Block[]) => (a || []).forEach((b) => { if (b.type === 'todo') { total++; if (b.done) done++ } if (b.children) walk(b.children) })
  walk(bs)
  return { done, total }
}
function genId(): string { return 'n' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

export default function NotesPanel() {
  const activeId = useProjects((s) => s.activeId)
  const addCard = useBuilder((s) => s.addCard)
  const setBlocks = useBuilder((s) => s.setBlocks)

  const [notes, setNotes] = useState<Note[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'editor'>('list')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'created'>('updated')
  const [open, setOpenState] = useState(false)
  const [size, setSize] = useState<Size>(() => {
    try { const v = localStorage.getItem('notepad-size'); if (v === 'S' || v === 'M' || v === 'L') return v } catch { /* noop */ }
    return 'M'
  })
  const width = SIZES[size]
  const timers = useRef<Record<string, number>>({})

  function setOpen(v: boolean) { setOpenState(v); if (activeId) { try { localStorage.setItem('notepad-open-' + activeId, v ? '1' : '0') } catch { /* noop */ } } }
  function pickSize(s: Size) { setSize(s); try { localStorage.setItem('notepad-size', s) } catch { /* noop */ } }

  // 프로젝트 전환 시: 그 이북 메모를 불러오고 **패널은 닫아 둔다.**
  //
  // 예전에는 '첫 방문은 열림'이었다. 그래서 배부받은 임원이 자료를 열면
  // 메모장이 자료 위를 덮은 채로 떴다 — 처음 보는 화면에서 가장 먼저 하는 일이
  // '이 창 뭐지, 어떻게 닫지' 가 됐다. 브라우저 테스트에서도 메모 패널이
  // 표 클릭을 가로채 실패했다(np-list intercepts pointer events).
  //
  // 챗봇과 같은 규칙으로 맞춘다 — 항상 닫힌 채로 시작하고, 필요한 사람이 연다.
  useEffect(() => {
    if (!activeId) { setNotes([]); setOpenState(false); return }
    let alive = true
    void (async () => {
      const list = await listNotes(activeId)
      if (!alive) return
      setNotes(list.map((n) => ({ ...n, blocks: normalizePlain(reid(n.blocks || [])) })))
    })()
    setOpenState(false)
    setView('list'); setCurrentId(null); setQ('')
    return () => { alive = false }
  }, [activeId])

  function queueSave(n: Note) {
    if (!activeId) return
    const pid = activeId
    if (timers.current[n.id]) window.clearTimeout(timers.current[n.id])
    timers.current[n.id] = window.setTimeout(() => { void saveNote(pid, n) }, 500)
  }
  function patchNote(id: string, patch: Partial<Note>) {
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() / 1000 } : n))
      const changed = next.find((n) => n.id === id)
      if (changed) queueSave(changed)
      return next
    })
  }
  function newNote() {
    const n: Note = { id: genId(), title: '', blocks: [newBlock('text', '')], pinned: false, sort: Date.now() }
    setNotes((prev) => [n, ...prev]); setCurrentId(n.id); setView('editor')
    if (activeId) void saveNote(activeId, n)
  }
  function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id)); void deleteNoteApi(id)
    if (currentId === id) { setCurrentId(null); setView('list') }
  }
  function duplicateNote(n: Note) {
    const copy: Note = { ...n, id: genId(), title: (n.title || '제목 없음') + ' 사본', blocks: reid(n.blocks), pinned: false, sort: Date.now() }
    setNotes((prev) => [copy, ...prev]); if (activeId) void saveNote(activeId, copy)
  }
  function sendToSlide(n: Note) {
    addCard('note')
    const pid = useBuilder.getState().selectedPageId
    const body = n.blocks && n.blocks.length ? reid(n.blocks) : []
    const blocks: Block[] = n.title ? [{ ...newBlock('h1', n.title), bold: true }, ...body] : (body.length ? body : [newBlock('text', '')])
    if (pid != null) setBlocks(pid, blocks)
  }

  const cur = notes.find((n) => n.id === currentId) || null
  const filtered = notes.filter((n) => {
    if (!q.trim()) return true
    return (n.title + ' ' + blocksText(n.blocks)).toLowerCase().includes(q.toLowerCase())
  })
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sortBy === 'title') return (a.title || '제목 없음').localeCompare(b.title || '제목 없음')
    if (sortBy === 'created') return (b.createdAt || 0) - (a.createdAt || 0)
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })

  if (!activeId) return null
  if (!open) return (<button className="np-fab" title="메모장 열기" onClick={() => setOpen(true)}><StickyNote size={16} /> 메모{notes.length ? <span className="np-fab-dot" /> : null}</button>)

  return (
    <div className="np-panel" style={{ width }}>
      <div className="np-head">
        <StickyNote size={16} /><b>메모장</b>
        <span className="np-sizes">{(['S', 'M', 'L'] as Size[]).map((s) => <button key={s} className={size === s ? 'on' : ''} onClick={() => pickSize(s)}>{s}</button>)}</span>
        <button className="np-x" title="닫기" onClick={() => setOpen(false)}><X size={16} /></button>
      </div>

      {view === 'list' ? (
        <div className="np-body">
          <div className="np-toolbar">
            <div className="np-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="메모 검색" /></div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'updated' | 'title' | 'created')} title="정렬">
              <option value="updated">수정순</option><option value="created">생성순</option><option value="title">제목순</option>
            </select>
          </div>
          <button className="np-new" onClick={newNote}><Plus size={15} /> 새 메모</button>
          <div className="np-list">
            {sorted.length === 0 ? <div className="np-empty">{q ? '검색 결과가 없어요.' : '메모가 아직 없어요. ‘새 메모’로 시작하세요.'}</div> : null}
            {sorted.map((n) => {
              const st = todoStats(n.blocks)
              return (
                <div key={n.id} className="np-item" onClick={() => { setCurrentId(n.id); setView('editor') }}>
                  <div className="np-item-main">
                    <div className="np-item-title">{n.pinned ? <Pin size={12} className="np-pin-ic" /> : null}{n.title || '제목 없음'}</div>
                    <div className="np-item-prev">{previewOf(n.blocks) || '내용 없음'}</div>
                  </div>
                  <div className="np-item-side">
                    {st.total ? <span className="np-badge" title="체크리스트">☑ {st.done}/{st.total}</span> : null}
                    <button className="np-iconbtn" title={n.pinned ? '고정 해제' : '고정'} onClick={(e) => { e.stopPropagation(); patchNote(n.id, { pinned: !n.pinned }) }}>{n.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
                    <button className="np-iconbtn danger" title="삭제" onClick={(e) => { e.stopPropagation(); removeNote(n.id) }}><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : cur ? (() => {
        const st = todoStats(cur.blocks)
        return (
          <div className="np-body">
            <div className="np-ed-top">
              <button className="np-back" title="목록" onClick={() => setView('list')}><ChevronLeft size={16} /></button>
              <input className="np-title-in" value={cur.title} placeholder="제목 없음" onChange={(e) => patchNote(cur.id, { title: e.target.value })} />
              <button className="np-iconbtn" title={cur.pinned ? '고정 해제' : '고정'} onClick={() => patchNote(cur.id, { pinned: !cur.pinned })}>{cur.pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
            </div>
            {st.total ? (<div className="np-progress"><div className="np-progress-bar"><span style={{ width: (st.total ? Math.round((st.done / st.total) * 100) : 0) + '%' }} /></div><span className="np-progress-txt">할 일 {st.done}/{st.total}</span></div>) : null}
            <div className="np-editor"><PlainEditor blocks={cur.blocks} onChange={(bs) => patchNote(cur.id, { blocks: bs })} /></div>
            <div className="np-ed-actions">
              <button className="np-act" title="이 메모를 슬라이드(노트 카드)로 보내기" onClick={() => sendToSlide(cur)}><Send size={14} /> 슬라이드로</button>
              <button className="np-act" title="복제" onClick={() => duplicateNote(cur)}><Copy size={14} /> 복제</button>
              <button className="np-act danger" title="삭제" onClick={() => removeNote(cur.id)}><Trash2 size={14} /> 삭제</button>
            </div>
          </div>
        )
      })() : (<div className="np-body"><div className="np-empty">메모를 선택하세요.</div></div>)}
    </div>
  )
}
