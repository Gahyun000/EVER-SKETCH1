import { useEffect, useRef, useState } from 'react'
import { newBlock } from '../state/store'
import type { Block, BlockType } from '../state/store'
import { useKey } from '../ui/keyLabel'

const TYPES: { t: BlockType; label: string; icon: string; child?: boolean }[] = [
  { t: 'text', label: '텍스트', icon: '¶', child: true },
  { t: 'h1', label: '제목1', icon: 'H1', child: true },
  { t: 'h2', label: '제목2', icon: 'H2', child: true },
  { t: 'h3', label: '제목3', icon: 'H3', child: true },
  { t: 'h4', label: '제목4', icon: 'H4', child: true },
  { t: 'todo', label: '할 일', icon: '☑', child: true },
  { t: 'bullet', label: '글머리 목록', icon: '•', child: true },
  { t: 'numbered', label: '번호 목록', icon: '1.', child: true },
  { t: 'toggle', label: '토글(접기)', icon: '▸', child: false },
  { t: 'callout', label: '콜아웃(강조)', icon: '💡', child: false },
  { t: 'divider', label: '구분선', icon: '—', child: false },
]
// HWP 글자모양(색) — 순환 선택
const TEXT_COLORS = ['#111318', '#2462EB', '#0f9d58', '#c5501f', '#4a3aa7', '#5B6270']
const nextColor = (c?: string) => TEXT_COLORS[(TEXT_COLORS.indexOf(c || '#111318') + 1) % TEXT_COLORS.length]

// 블록 편집 코어 — 페이지(BlockEditor)와 캔버스 노트 요소가 공유한다.
// blocks 를 받아 편집하고, 변경 시 onChange 로 통째로 돌려준다(상위가 저장 위치 결정).
// 주의: 행(row)은 컴포넌트(<Row/>)가 아니라 함수(renderRow)로 그린다 — 매 렌더마다
// 새 컴포넌트 타입이 만들어져 textarea 가 언마운트되며 타이핑 중 포커스가 빠지는 것을 막기 위함.
export default function NoteBlocks({ blocks, onChange, compact }: { blocks: Block[]; onChange: (next: Block[]) => void; compact?: boolean }) {
  const K = useKey()
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [menuQ, setMenuQ] = useState('')
  const [focusId, setFocusId] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)  // compact(노트) 모드: 포커스된 블록 = 상단 플로팅 바 대상
  const refs = useRef<Record<number, HTMLTextAreaElement | null>>({})

  useEffect(() => {
    if (focusId != null) {
      const el = refs.current[focusId]
      if (el) { el.focus(); const v = el.value; el.setSelectionRange(v.length, v.length) }
      setFocusId(null)
    }
  }, [focusId, blocks])

  // 내용이 바뀌면 모든 textarea 높이를 내용에 맞춰 조정(여러 줄 미리보기도 안 잘리게).
  useEffect(() => {
    for (const k in refs.current) { const el = refs.current[k]; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }
  }, [blocks])

  const commit = (next: Block[]) => onChange(next)

  // 시각 순서(펼쳐진 토글 자식 포함)로 평탄화 — 이전/다음 포커스 계산용
  const flat: { id: number; ti: number; ci: number | null }[] = []
  blocks.forEach((b, ti) => {
    flat.push({ id: b.id, ti, ci: null })
    if (b.type === 'toggle' && !b.collapsed) (b.children || []).forEach((c, ci) => flat.push({ id: c.id, ti, ci }))
  })
  const prevId = (id: number) => { const i = flat.findIndex((x) => x.id === id); return i > 0 ? flat[i - 1].id : null }

  function updateAt(ti: number, ci: number | null, patch: Partial<Block>) {
    commit(blocks.map((b, i) => {
      if (i !== ti) return b
      if (ci == null) return { ...b, ...patch }
      return { ...b, children: (b.children || []).map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
    }))
  }
  function insertAfter(ti: number, ci: number | null, nb: Block) {
    if (ci == null) { const next = [...blocks]; next.splice(ti + 1, 0, nb); commit(next) }
    else commit(blocks.map((b, i) => (i === ti ? { ...b, children: (() => { const ch = [...(b.children || [])]; ch.splice(ci + 1, 0, nb); return ch })() } : b)))
    setFocusId(nb.id)
  }
  function addChild(ti: number) {
    const nb = newBlock('text')
    commit(blocks.map((b, i) => (i === ti ? { ...b, collapsed: false, children: [...(b.children || []), nb] } : b)))
    setFocusId(nb.id)
  }
  function removeAt(ti: number, ci: number | null) {
    const back = prevId(ci == null ? blocks[ti].id : (blocks[ti].children || [])[ci].id)
    if (ci == null) { const next = blocks.filter((_, i) => i !== ti); commit(next) }
    else commit(blocks.map((b, i) => (i === ti ? { ...b, children: (b.children || []).filter((_, j) => j !== ci) } : b)))
    if (back != null) setFocusId(back)
  }

  function onChangeText(ti: number, ci: number | null, b: Block, val: string) {
    if (val === '/') { setMenuFor(b.id); setMenuQ(''); updateAt(ti, ci, { text: '' }); return }
    if (val === '> ' && ci == null && b.type !== 'toggle') { updateAt(ti, ci, { type: 'toggle', text: '' }); return }
    updateAt(ti, ci, { text: val })
  }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>, ti: number, ci: number | null, b: Block) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); updateAt(ti, ci, { bold: !b.bold }); return }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (b.type === 'toggle' && ci == null) addChild(ti)
      else insertAfter(ti, ci, newBlock(b.type === 'bullet' || b.type === 'todo' || b.type === 'numbered' ? b.type : 'text'))
      return
    }
    if (e.key === 'Backspace' && b.text === '') {
      if (b.type !== 'text') { e.preventDefault(); updateAt(ti, ci, { type: 'text' }); return }
      if (flat.length > 1) { e.preventDefault(); removeAt(ti, ci) }
    }
  }
  function pickType(ti: number, ci: number | null, b: Block, t: BlockType) {
    setMenuFor(null)
    if (t === 'divider') { updateAt(ti, ci, { type: 'divider', text: '' }); return }
    updateAt(ti, ci, { type: t })
    setFocusId(b.id)
  }

  // 행 하나를 그린다(컴포넌트 아님 — 함수 호출로 그려 포커스 유지).
  function renderRow(b: Block, ti: number, ci: number | null) {
    const isToggle = b.type === 'toggle' && ci == null
    let ord = 0
    if (b.type === 'numbered' && ci == null) { ord = 1; for (let i = ti - 1; i >= 0 && blocks[i].type === 'numbered'; i--) ord++ }
    const ph = (b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'h4') ? '제목' : isToggle ? '토글 제목' : b.type === 'bullet' ? '목록 항목' : b.type === 'numbered' ? '목록 항목' : b.type === 'callout' ? '강조할 내용' : b.type === 'todo' ? '할 일' : "본문 (‘/’ 블록 · ‘>’ 토글)"
    const taStyle: React.CSSProperties = {
      fontSize: b.type === 'h1' ? 20 : b.type === 'h2' ? 16 : b.type === 'h3' ? 15 : b.type === 'h4' ? 14 : isToggle ? 16 : 13.5,
      fontWeight: b.bold || b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'h4' || isToggle ? 800 : 500,
      textAlign: b.align || 'left',
      textDecoration: b.type === 'todo' && b.done ? 'line-through' : undefined,
      color: b.type === 'todo' && b.done ? '#9aa2b1' : undefined,
    }
    if (b.type === 'callout') { taStyle.background = '#eef4ff'; taStyle.borderLeft = '3px solid #2462EB'; taStyle.borderRadius = 6; taStyle.padding = '6px 10px' }
    if (b.type === 'divider') {
      return (<div key={b.id} className={'be-row' + (ci != null ? ' child' : '')}>
        <div className="be-divider" />
        <button className="be-tool danger" title="삭제" onClick={() => removeAt(ti, ci)}>✕</button>
      </div>)
    }
    return (
      <div key={b.id} className={'be-row' + (ci != null ? ' child' : '')}>
        {isToggle ? <button className="be-arrow" onClick={() => updateAt(ti, null, { collapsed: !b.collapsed })}>{b.collapsed ? '▸' : '▾'}</button>
          : b.type === 'todo' ? <button className="be-check" title="완료 표시" onPointerDown={(e) => e.stopPropagation()} onClick={() => updateAt(ti, ci, { done: !b.done })}>{b.done ? '☑' : '☐'}</button>
          : <button className="be-badge" title="블록 종류" onClick={() => { setMenuQ(''); setMenuFor(menuFor === b.id ? null : b.id) }}>{b.type === 'bullet' ? '•' : b.type === 'numbered' ? ord + '.' : b.type === 'callout' ? '💡' : b.type === 'h1' ? 'H1' : b.type === 'h2' ? 'H2' : b.type === 'h3' ? 'H3' : b.type === 'h4' ? 'H4' : '¶'}</button>}
        <textarea
          ref={(n) => { refs.current[b.id] = n }}
          className="be-ta" rows={1} style={taStyle} value={b.text} placeholder={ph}
          onChange={(e) => { onChangeText(ti, ci, b, e.target.value); const t = e.target; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
          onKeyDown={(e) => onKey(e, ti, ci, b)}
          onFocus={() => setActiveId(b.id)}
        />
        {!compact ? <div className="be-tools">
          <button className={'be-tool' + (b.bold ? ' on' : '')} title={`굵게 (${K('mod+B')})`} onClick={() => updateAt(ti, ci, { bold: !b.bold })}>B</button>
          <button className={'be-tool' + ((b.align || 'left') === 'left' ? ' on' : '')} title="왼쪽 정렬" onClick={() => updateAt(ti, ci, { align: 'left' })}>⇤</button>
          <button className={'be-tool' + (b.align === 'center' ? ' on' : '')} title="가운데 정렬" onClick={() => updateAt(ti, ci, { align: 'center' })}>⇔</button>
          <button className={'be-tool' + (b.align === 'right' ? ' on' : '')} title="오른쪽 정렬" onClick={() => updateAt(ti, ci, { align: 'right' })}>⇥</button>
          <button className="be-tool" title="글자 작게" onClick={() => updateAt(ti, ci, { fs: Math.max(0.6, Math.round(((b.fs || 1) - 0.1) * 10) / 10) })}>A−</button>
          <button className="be-tool" title="글자 크게" onClick={() => updateAt(ti, ci, { fs: Math.min(2, Math.round(((b.fs || 1) + 0.1) * 10) / 10) })}>A+</button>
          <button className="be-tool" title="글자 색" onClick={() => updateAt(ti, ci, { color: nextColor(b.color) })}><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: b.color || '#111318', border: '1px solid rgba(0,0,0,.15)' }} /></button>
          <button className="be-tool danger" title="삭제" onClick={() => removeAt(ti, ci)}>✕</button>
        </div> : null}
        {menuFor === b.id ? (
          <div className="be-menu">
            <input className="be-menu-q" autoFocus value={menuQ} placeholder="블록 검색" onChange={(e) => setMenuQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setMenuFor(null) }} />
            {TYPES.filter((tp) => (ci == null ? true : tp.child) && (!menuQ.trim() || tp.label.includes(menuQ.trim()))).map((tp) => (
              <button key={tp.t} onClick={() => pickType(ti, ci, b, tp.t)}><span className="mi">{tp.icon}</span>{tp.label}</button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  // compact 모드에서 포커스된 블록 찾기(상단 플로팅 서식 바 대상)
  let active: { ti: number; ci: number | null; b: Block } | null = null
  if (compact && activeId != null) {
    for (let ti = 0; ti < blocks.length && !active; ti++) {
      const bb = blocks[ti]
      if (bb.id === activeId) { active = { ti, ci: null, b: bb }; break }
      const ch = bb.children || []
      for (let ci = 0; ci < ch.length; ci++) if (ch[ci].id === activeId) { active = { ti, ci, b: ch[ci] }; break }
    }
  }

  return (
    <div className="be-list">
      {compact && active && menuFor == null ? (
        <div className="be-floatbar" onMouseDown={(e) => e.preventDefault()}>
          <button className={'be-tool' + (active.b.bold ? ' on' : '')} title="굵게" onClick={() => updateAt(active!.ti, active!.ci, { bold: !active!.b.bold })}>B</button>
          <button className={'be-tool' + ((active.b.align || 'left') === 'left' ? ' on' : '')} title="왼쪽 정렬" onClick={() => updateAt(active!.ti, active!.ci, { align: 'left' })}>⇤</button>
          <button className={'be-tool' + (active.b.align === 'center' ? ' on' : '')} title="가운데 정렬" onClick={() => updateAt(active!.ti, active!.ci, { align: 'center' })}>⇔</button>
          <button className={'be-tool' + (active.b.align === 'right' ? ' on' : '')} title="오른쪽 정렬" onClick={() => updateAt(active!.ti, active!.ci, { align: 'right' })}>⇥</button>
          <button className="be-tool" title="글자 작게" onClick={() => updateAt(active!.ti, active!.ci, { fs: Math.max(0.6, Math.round((((active!.b.fs) || 1) - 0.1) * 10) / 10) })}>A−</button>
          <button className="be-tool" title="글자 크게" onClick={() => updateAt(active!.ti, active!.ci, { fs: Math.min(2, Math.round((((active!.b.fs) || 1) + 0.1) * 10) / 10) })}>A+</button>
          <button className="be-tool" title="글자 색" onClick={() => updateAt(active!.ti, active!.ci, { color: nextColor(active!.b.color) })}><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: active.b.color || '#111318', border: '1px solid rgba(0,0,0,.15)' }} /></button>
          <button className="be-tool danger" title="삭제" onClick={() => removeAt(active!.ti, active!.ci)}>✕</button>
        </div>
      ) : null}
      {blocks.map((b, ti) => (
        <div key={b.id} className="be-block">
          {renderRow(b, ti, null)}
          {b.type === 'toggle' && !b.collapsed ? (
            <div className="be-children">
              {(b.children || []).map((c, ci) => renderRow(c, ti, ci))}
              <button className="be-addchild" onClick={() => addChild(ti)}>＋ 내용 추가</button>
            </div>
          ) : null}
        </div>
      ))}
      <button className="be-addblock" onClick={() => insertAfter(blocks.length - 1, null, newBlock('text'))}>＋ 블록 추가</button>
    </div>
  )
}
