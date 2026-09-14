import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBuilder } from '../state/store'
import { CARD_REGISTRY } from '../cards/registry'
import { BRANCH_MIN, BRANCH_MAX, BRANCH_DEFAULT } from '../cards/mindmapEls'
import { parseMermaid } from '../cards/mermaid'
import { treeCapacity, treeSlots } from '../cards/treeEls'
import { pageSize } from '../cards/sizing'

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
  tree: `<rect x="3" y="12" width="10" height="6" rx="1" fill="#16203a"/><rect x="18" y="4" width="10" height="6" rx="1" ${B}/><rect x="18" y="20" width="10" height="6" rx="1" ${B}/><rect x="30" y="20" width="8" height="6" rx="1" ${B}/><path d="M13 15 H16 V7 H18 M16 15 V23 H18 M28 23 H30" ${S}/>`,
  mindmap: `<circle cx="20" cy="15" r="3" fill="#2462EB"/><line x1="20" y1="15" x2="7" y2="7" ${S}/><line x1="20" y1="15" x2="33" y2="7" ${S}/><line x1="20" y1="15" x2="7" y2="23" ${S}/><line x1="20" y1="15" x2="33" y2="23" ${S}/>`,
  sticky: `<rect x="7" y="8" width="11" height="11" rx="1" fill="#fdf3b6" stroke="#e6d688"/><rect x="22" y="10" width="11" height="11" rx="1" fill="#d7f0d0" stroke="#a9d39b"/>`,
  board: `<rect x="6" y="7" width="9" height="7" fill="#fdf3b6" stroke="#e6d688"/><rect x="18" y="12" width="9" height="7" fill="#d7e6ff" stroke="#b9ccf5"/><rect x="28" y="8" width="8" height="7" fill="#f6d7e6" stroke="#e6a9c8"/>`,
  dsection: `<rect x="7" y="7" width="26" height="5" rx="2" ${B}/><line x1="7" y1="17" x2="27" y2="17" ${S}/>`,
}
const DEF = `<rect x="7" y="6" width="26" height="18" rx="2" ${S}/>`
const thumb = (k: string) => `<svg viewBox="0 0 40 30" width="100%" height="100%">${THUMBS[k] || DEF}</svg>`

/** 처음 여는 사람이 **고쳐 쓰기 좋은** 표본. 빈 칸을 주면 무엇을 써야 할지 모른다. */
const SAMPLE = `graph LR
  A[기획] --> B[설계]
  B --> C[개발]
  C --> D{검수}
  D -->|통과| E[배포]
  D -->|반려| B`

export default function CardPicker() {
  const addCard = useBuilder((s) => s.addCard)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  /** 마인드맵만 **넣기 전에 한 번 더 묻는다** — 가지 수(사용자 결정 ㄱ).
   *  그때가 개수를 정하기 가장 좋은 순간이다: 아직 아무것도 안 옮겨 놨으므로
   *  마음껏 다시 배치할 수 있다. 넣고 난 뒤에 바꾸려면 사람이 맞춰 둔 자리가 흐트러진다. */
  const [askBranches, setAskBranches] = useState(false)
  /** 트리는 **넣기 전에 머메이드를 받는다.** 빈 트리를 놓고 하나씩 그리게 하면
   *  마인드맵보다 손이 훨씬 많이 간다 — 글로 뼈대를 잡는 게 이 기능의 값이다. */
  const [askTree, setAskTree] = useState(false)
  const [mm, setMm] = useState(SAMPLE)
  const orientation = useBuilder((s) => s.orientation)
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    setOpen((o) => !o)
  }
  function close() { setOpen(false); setQ(''); setAskBranches(false); setAskTree(false) }
  function pick(key: string) {
    if (key === 'mindmap') { setAskBranches(true); return }
    if (key === 'tree') { setAskTree(true); return }
    addCard(key); close()
  }

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
          <div className="cpk-scrim" onClick={close} />
          <div className="cpk-pop" style={{ top: pos.top, left: pos.left }}>
            {askTree ? (() => {
              const g = parseMermaid(mm)
              const { W, H } = pageSize(orientation)
              const cap = treeCapacity(g.dir, W, H)
              const got = treeSlots(g)
              const over = got.levels > cap.levels || got.rows > cap.slots
              const narrow = orientation === 'portrait'
              return (<>
                <div className="cpk-grp">트리 · 머메이드로 뼈대 잡기</div>
                <textarea className="cpk-mm" value={mm} spellCheck={false}
                  onChange={(e) => setMm(e.target.value)} />
                {/* **못 읽은 줄은 버리지 않는다.** 조용히 무시하면 제 오타를 못 찾는다. */}
                {g.errors.length > 0 && (
                  <div className="cpk-mmerr">
                    <b>못 읽은 줄 {g.errors.length}개</b>
                    {g.errors.slice(0, 3).map((e) => (
                      <div key={e.line}>{e.line}행 · {e.text.trim().slice(0, 34)}</div>
                    ))}
                  </div>
                )}
                <div className="cpk-mmcap">
                  {g.dir === 'LR' ? '왼 → 오른' : '위 → 아래'} · 상자 <b>{g.order.length}개</b> ·
                  {' '}이 종이에 <b>{cap.levels}레벨 × {cap.slots}{g.dir === 'LR' ? '줄' : '칸'}</b>
                  {over && <span className="warn"> · 지금 글은 {got.levels}레벨 × {got.rows} — <b>넘칩니다</b></span>}
                </div>
                {/* 세로 종이는 재 보니 위→아래가 2칸뿐이다. 넣고 나서 알면 늦다. */}
                {narrow && <div className="cpk-mmwarn">세로 종이는 트리가 <b>거의 안 들어갑니다</b>
                  (위→아래 2칸). 오른쪽 패널에서 <b>가로</b>로 바꾸고 넣으시길 권합니다.</div>}
                <div className="cpk-mmrow">
                  <button className="cpk-mmgo" disabled={!g.order.length}
                    onClick={() => { addCard('tree', undefined, mm); close() }}>
                    펼치기{g.order.length ? ` (${g.order.length}개)` : ''}</button>
                  <button className="cpk-back" onClick={() => setAskTree(false)}>← 카드 고르기로</button>
                </div>
              </>)
            })() : askBranches ? (<>
              <div className="cpk-grp">마인드맵 · 가지 수</div>
              <div className="cpk-brs">
                {Array.from({ length: BRANCH_MAX - BRANCH_MIN + 1 }, (_, i) => BRANCH_MIN + i).map((n) => (
                  <button key={n} className={'cpk-br' + (n === BRANCH_DEFAULT ? ' def' : '')}
                    onClick={() => { addCard('mindmap', n); close() }}>{n}</button>
                ))}
              </div>
              <div className="cpk-hint">나중에 오른쪽 패널에서 <b>＋ 가지</b>로 더 붙일 수 있어요.</div>
              <button className="cpk-back" onClick={() => setAskBranches(false)}>← 카드 고르기로</button>
            </>) : (<>
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
            </>)}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
