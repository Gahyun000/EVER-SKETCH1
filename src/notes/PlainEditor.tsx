import { useEffect, useRef, useState } from 'react'
import { newBlock } from '../state/store'
import type { Block, BlockType } from '../state/store'

const COLORS = ['#1a1a1a', '#2a78d6', '#c5501f', '#0f9d58', '#7a5af8']
const ALLOWED = new Set<BlockType>(['h1', 'h2', 'text', 'bullet', 'numbered', 'todo'])

// 옛 데이터(토글·콜아웃·자식블록)를 평면 메모용 허용 타입으로 정리 + 최소 한 줄 보장.
export function normalizePlain(bs: Block[]): Block[] {
  const out: Block[] = []
  const walk = (arr: Block[]) => (arr || []).forEach((b) => {
    const type: BlockType = ALLOWED.has(b.type) ? b.type : (b.type === 'h3' || b.type === 'h4' ? 'h2' : 'text')
    out.push({ ...b, type, children: undefined, collapsed: undefined, tone: undefined })
    if (b.children && b.children.length) walk(b.children)
  })
  walk(bs)
  if (!out.length) out.push(newBlock('text', ''))
  return out
}

// 애플 메모식 평면 편집기 — 위→아래로 쭉 쓰는 한 장. 상단 고정 툴바가 현재 줄에 서식 적용.
export default function PlainEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const [activeId, setActiveId] = useState<number | null>(blocks[0]?.id ?? null)
  const refs = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const focusReq = useRef<{ id: number; caret?: number } | null>(null)

  useEffect(() => {
    const fr = focusReq.current
    if (fr && refs.current[fr.id]) {
      const ta = refs.current[fr.id] as HTMLTextAreaElement
      ta.focus()
      const pos = fr.caret == null ? ta.value.length : fr.caret
      try { ta.setSelectionRange(pos, pos) } catch { /* noop */ }
      focusReq.current = null
    }
  })

  const active = blocks.find((b) => b.id === activeId) || blocks[blocks.length - 1] || null

  const commit = (next: Block[]) => onChange(next)
  const setBlock = (id: number, patch: Partial<Block>) => commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const setType = (id: number, type: BlockType) => setBlock(id, { type })
  const toggleType = (type: BlockType) => { if (!active) return; setType(active.id, active.type === type ? 'text' : type) }
  const cycleColor = () => { if (!active) return; const i = COLORS.indexOf(active.color || '#1a1a1a'); setBlock(active.id, { color: COLORS[(i + 1) % COLORS.length] }) }
  const auto = (ta: HTMLTextAreaElement) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    const b = blocks[i]
    const ta = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const listy = b.type === 'todo' || b.type === 'bullet' || b.type === 'numbered'
      if (listy && !b.text.trim()) { setType(b.id, 'text'); return }
      const nt: BlockType = listy ? b.type : 'text'
      const nb = newBlock(nt, '')
      const next = [...blocks]; next.splice(i + 1, 0, nb); commit(next)
      focusReq.current = { id: nb.id, caret: 0 }; setActiveId(nb.id)
      return
    }
    if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
      if (b.type !== 'text' && b.text === '') { e.preventDefault(); setType(b.id, 'text'); return }
      if (i > 0) {
        e.preventDefault()
        const prev = blocks[i - 1]; const caret = prev.text.length
        const next = blocks.map((x, j) => (j === i - 1 ? { ...x, text: prev.text + b.text } : x)).filter((_, j) => j !== i)
        commit(next); focusReq.current = { id: prev.id, caret }; setActiveId(prev.id)
      }
    }
  }

  const tb = (on: boolean) => 'pn-tb' + (on ? ' on' : '')
  return (
    <div className="pn-root">
      <div className="pn-toolbar">
        <button className={tb(active?.type === 'h1')} title="제목" onClick={() => toggleType('h1')}>제목</button>
        <button className={tb(active?.type === 'h2')} title="큰 글씨" onClick={() => toggleType('h2')}>큰 글씨</button>
        <span className="pn-sep" />
        <button className={tb(active?.type === 'todo')} title="체크리스트" onClick={() => toggleType('todo')}>☑</button>
        <button className={tb(active?.type === 'bullet')} title="불릿 목록" onClick={() => toggleType('bullet')}>•</button>
        <button className={tb(active?.type === 'numbered')} title="번호 목록" onClick={() => toggleType('numbered')}>1.</button>
        <span className="pn-sep" />
        <button className={tb(!!active?.bold)} title="굵게" onClick={() => active && setBlock(active.id, { bold: !active.bold })}><b>B</b></button>
        <button className={tb(!!active?.italic)} title="기울임" onClick={() => active && setBlock(active.id, { italic: !active.italic })}><i>I</i></button>
        <button className="pn-tb" title="글자색" onClick={cycleColor}><span className="pn-colordot" style={{ background: active?.color || '#1a1a1a' }} /></button>
      </div>
      <div className="pn-lines">
        {blocks.map((b, i) => {
          let num = 0
          if (b.type === 'numbered') { num = 1; for (let j = i - 1; j >= 0 && blocks[j].type === 'numbered'; j--) num++ }
          const style: React.CSSProperties = { fontWeight: b.bold ? 800 : undefined, fontStyle: b.italic ? 'italic' : undefined, color: b.color || undefined }
          return (
            <div key={b.id} className={'pn-line t-' + b.type}>
              {b.type === 'todo' ? <button className={'pn-check' + (b.done ? ' on' : '')} title="완료" onClick={() => setBlock(b.id, { done: !b.done })}>{b.done ? '✓' : ''}</button> : null}
              {b.type === 'bullet' ? <span className="pn-mk">•</span> : null}
              {b.type === 'numbered' ? <span className="pn-mk">{num}.</span> : null}
              <textarea
                ref={(el) => { refs.current[b.id] = el; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                className={'pn-ta' + (b.type === 'todo' && b.done ? ' done' : '')}
                value={b.text} rows={1} style={style}
                placeholder={i === 0 && blocks.length === 1 ? '메모를 입력하세요…' : ''}
                onFocus={() => setActiveId(b.id)}
                onChange={(e) => { setBlock(b.id, { text: e.target.value }); auto(e.target) }}
                onKeyDown={(e) => onKey(e, i)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
