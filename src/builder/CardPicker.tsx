import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBuilder } from '../state/store'
import { CARD_REGISTRY } from '../cards/registry'

const GROUPS: { key: string; label: string }[] = [
  { key: 'frame', label: '틀 구조' },
  { key: 'extra', label: '경영 보고 보강' },
  { key: 'viz', label: '다이어그램 · 비주얼' },
]

// 카드별 미니 썸네일(viewBox 0 0 40 30, 인라인 스타일)
const S = 'stroke="#c3ccdd" stroke-width="2" fill="none"'
const B = 'fill="#dce6ff" stroke="#b9ccf5" stroke-width="1"'
const BX = 'fill="#eef2fb" stroke="#c9d6f5" stroke-width="1.4"'
const THUMBS: Record<string, string> = {
  cover: `<rect x="6" y="6" width="28" height="7" rx="2" ${B}/><line x1="10" y1="18" x2="30" y2="18" ${S}/>`,
  toc: `<line x1="8" y1="9" x2="32" y2="9" ${S}/><line x1="8" y1="15" x2="32" y2="15" ${S}/><line x1="8" y1="21" x2="26" y2="21" ${S}/>`,
  note: `<rect x="7" y="6" width="26" height="18" rx="2" ${S}/>`,
  closing: `<rect x="8" y="10" width="24" height="9" rx="2" ${B}/>`,
  summary: `<line x1="8" y1="11" x2="32" y2="11" ${S}/><rect x="8" y="16" width="24" height="7" rx="2" ${B}/>`,
  kpi: `<rect x="5" y="9" width="9" height="12" rx="2" ${BX}/><rect x="16" y="9" width="9" height="12" rx="2" ${BX}/><rect x="27" y="9" width="9" height="12" rx="2" ${BX}/>`,
  roadmap: `<rect x="4" y="12" width="8" height="6" rx="1" ${B}/><rect x="16" y="12" width="8" height="6" rx="1" ${B}/><rect x="28" y="12" width="8" height="6" rx="1" ${B}/><line x1="12" y1="15" x2="16" y2="15" ${S}/><line x1="24" y1="15" x2="28" y2="15" ${S}/>`,
  market: `<rect x="6" y="8" width="12" height="14" rx="2" ${S}/><rect x="22" y="8" width="12" height="14" rx="2" ${S}/>`,
  flow: `<rect x="12" y="3" width="16" height="6" rx="2" ${BX}/><rect x="12" y="12" width="16" height="6" rx="2" ${BX}/><rect x="12" y="21" width="16" height="6" rx="2" ${BX}/><line x1="20" y1="9" x2="20" y2="12" ${S}/><line x1="20" y1="18" x2="20" y2="21" ${S}/>`,
  mindmap: `<circle cx="20" cy="15" r="3" fill="#2462EB"/><line x1="20" y1="15" x2="7" y2="7" ${S}/><line x1="20" y1="15" x2="33" y2="7" ${S}/><line x1="20" y1="15" x2="7" y2="23" ${S}/><line x1="20" y1="15" x2="33" y2="23" ${S}/>`,
  sticky: `<rect x="7" y="8" width="11" height="11" rx="1" fill="#fdf3b6" stroke="#e6d688"/><rect x="22" y="10" width="11" height="11" rx="1" fill="#d7f0d0" stroke="#a9d39b"/>`,
  board: `<rect x="6" y="7" width="9" height="7" fill="#fdf3b6" stroke="#e6d688"/><rect x="18" y="12" width="9" height="7" fill="#d7e6ff" stroke="#b9ccf5"/><rect x="28" y="8" width="8" height="7" fill="#f6d7e6" stroke="#e6a9c8"/>`,
  dsection: `<rect x="7" y="7" width="26" height="5" rx="2" ${B}/><line x1="7" y1="17" x2="27" y2="17" ${S}/>`,
}
const DEF = `<rect x="7" y="6" width="26" height="18" rx="2" ${S}/>`
const thumb = (k: string) => `<svg viewBox="0 0 40 30" width="100%" height="100%">${THUMBS[k] || DEF}</svg>`

export default function CardPicker() {
  const addCard = useBuilder((s) => s.addCard)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    setOpen((o) => !o)
  }
  function pick(key: string) { addCard(key); setOpen(false); setQ('') }

  /* **이건 모달이 아니라 드롭다운이다** — 버튼에 붙어 뜨므로 ui/Modal 로 옮기지 않는다.
     그런데 나가는 길이 **바깥 누르기 하나뿐이었다.** 버튼도 없고 Esc 도 안 먹어서,
     그걸 모르는 사람은 갇힌다. 대화상자가 아니어도 나가는 길은 있어야 한다. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 캔버스가 window 에서 Escape 를 듣고 있다 — 그냥 두면 골라 둔 것까지 함께 풀린다.
      e.preventDefault(); e.stopPropagation()
      setOpen(false); setQ('')
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  const term = q.trim()
  const match = (label: string, key: string) => !term || label.includes(term) || key.includes(term)

  return (
    <div className="cardpick">
      <button ref={btnRef} className="add" onClick={toggle}>＋ 새 페이지 ▾</button>
      {open && pos && createPortal(
        <>
          <div className="cpk-scrim" onClick={() => setOpen(false)} />
          <div className="cpk-pop" style={{ top: pos.top, left: pos.left }}>
            <div className="cpk-quick">
              <button className="cpk-q" onClick={() => pick('slide')}>＋ 빈 슬라이드</button>
              <button className="cpk-q alt" onClick={() => pick('dsection')}>＋ 덱 섹션</button>
            </div>
            <input className="cpk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="카드 검색 (예: 플로우, KPI)" aria-label="카드 검색" autoFocus />
            {GROUPS.map((g) => {
              const items = CARD_REGISTRY.filter((c) => c.group === g.key && c.key !== 'dsection' && match(c.label, c.key))
              if (!items.length) return null
              return (
                <div key={g.key}>
                  <div className="cpk-grp">{g.label}</div>
                  <div className="cpk-grid">
                    {items.map((c) => (
                      <button key={c.key} className={'cpk-tile' + (g.key === 'viz' ? ' hot' : '')} onClick={() => pick(c.key)} title={c.label}>
                        <span className="cpk-thumb" dangerouslySetInnerHTML={{ __html: thumb(c.key) }} />
                        <span className="cpk-nm">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
