import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBuilder } from '../state/store'
import { CARD_REGISTRY } from '../cards/registry'
import { BRANCH_MIN, BRANCH_MAX, BRANCH_DEFAULT } from '../cards/mindmapEls'
import { parseMermaid } from '../cards/mermaid'
import { treeCapacity, treeSlots } from '../cards/treeEls'
import { bandsNeeded } from '../cards/treeOps'
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
  // **방향이 그림으로 보여야 한다**(2026-09-17). 예전엔 「트리 · 머메이드」 하나뿐이라
  // 어느 쪽으로 뻗는지는 넣어 봐야 알았다. 뿌리를 진하게 칠하고 가지를 한쪽으로만 뻗어,
  // 두 그림이 **같은 그림을 돌려 놓은 것**으로 보이게 했다 — 그래야 짝이라는 게 읽힌다.
  mmTB: `<rect x="14" y="2" width="12" height="6" rx="1.5" fill="#16203a"/><rect x="4" y="12" width="12" height="6" rx="1.5" ${B}/><rect x="24" y="12" width="12" height="6" rx="1.5" ${B}/><rect x="24" y="22" width="12" height="6" rx="1.5" ${B}/><path d="M20 8 V10 M10 10 H30 M10 10 V12 M30 10 V12 M30 18 V25 H24" ${S}/>`,
  mmLR: `<rect x="2" y="12" width="12" height="6" rx="1.5" fill="#16203a"/><rect x="18" y="3" width="12" height="6" rx="1.5" ${B}/><rect x="18" y="21" width="12" height="6" rx="1.5" ${B}/><rect x="30" y="12" width="8" height="6" rx="1.5" ${B}/><path d="M14 15 H16 M16 6 V24 M16 6 H18 M16 24 H18 M30 24 H33 V18" ${S}/>`,
  mindmap: `<circle cx="20" cy="15" r="3" fill="#2462EB"/><line x1="20" y1="15" x2="7" y2="7" ${S}/><line x1="20" y1="15" x2="33" y2="7" ${S}/><line x1="20" y1="15" x2="7" y2="23" ${S}/><line x1="20" y1="15" x2="33" y2="23" ${S}/>`,
  sticky: `<rect x="7" y="8" width="11" height="11" rx="1" fill="#fdf3b6" stroke="#e6d688"/><rect x="22" y="10" width="11" height="11" rx="1" fill="#d7f0d0" stroke="#a9d39b"/>`,
  board: `<rect x="6" y="7" width="9" height="7" fill="#fdf3b6" stroke="#e6d688"/><rect x="18" y="12" width="9" height="7" fill="#d7e6ff" stroke="#b9ccf5"/><rect x="28" y="8" width="8" height="7" fill="#f6d7e6" stroke="#e6a9c8"/>`,
  dsection: `<rect x="7" y="7" width="26" height="5" rx="2" ${B}/><line x1="7" y1="17" x2="27" y2="17" ${S}/>`,
}
const DEF = `<rect x="7" y="6" width="26" height="18" rx="2" ${S}/>`
const thumb = (k: string) => `<svg viewBox="0 0 40 30" width="100%" height="100%">${THUMBS[k] || DEF}</svg>`

/** 처음 여는 사람이 **고쳐 쓰기 좋은** 표본. 빈 칸을 주면 무엇을 써야 할지 모른다. */
const BODY = `
  A[기획] --> B[설계]
  B --> C[개발]
  C --> D{검수}
  D -->|통과| E[배포]
  D -->|반려| B`

/**
 * **머메이드로 들어가는 문 둘.** 카드는 하나(`tree`)다 — registry.ts 에 왜 안 쪼갰는지 적어 뒀다.
 *
 * 방향은 카드가 아니라 **글 첫 줄**이 정한다(`parseMermaid`). 그래서 이 둘이 하는 일은
 * 표본 글의 첫 줄을 다르게 채워 주는 것뿐이고, 사람이 그 줄을 고치면 **고친 대로 간다.**
 * 그게 맞다: 이름은 어느 쪽으로 시작할지를 고르는 것이지, 글을 못 고치게 하는 것이 아니다.
 *
 * **`TB` 라고 쓴다.** 파서가 `TB`·`TD`·`BT` 를 다 위→아래로 읽고(mermaid.ts),
 * 안쪽 타입 이름만 `TreeDir='TD'` 인데 그건 화면에 안 나온다.
 *
 * 글을 **되돌려 쓰면** `TD` 로 바뀐다 — `toMermaid()` 가 `graph ${g.dir}` 로 적기 때문이다.
 * 지금은 그럴 일이 없다: 앱에서 `toMermaid` 를 부르는 곳이 없어 **번들에서 털려 나간다**
 * (rollup 소스맵으로 확인). 쪽에 적어 두는 `treeSrc` 도 다시 읽는 곳이 없다.
 * 하지만 **죽은 함수는 아니다** — `tree_mermaid.test.mjs` 가 「글 → 그림 → 글이 같은가」로
 * 파서를 자기검증하는 데 쓴다. 그러니 언젠가 「머메이드 글로 다시 뽑기」를 화면에 붙이면
 * 사람이 쓴 `TB` 가 `TD` 로 돌아온다. **그때 `toMermaid` 도 `TB` 로 적게 고쳐야 한다.**
 * (2026-09-17 · 처음엔 「아무 데서도 안 부른다」고 적었는데 틀렸다. src 의 ts/tsx 만 찾아본
 *  탓으로 루트의 .mjs 테스트를 통째로 빠뜨렸다. 사용자가 다시 보라고 해서 잡았다.)
 */
const MM_DOORS: { id: string; label: string; dir: 'TB' | 'LR'; src: string }[] = [
  { id: 'mmTB', label: '머메이드 TB', dir: 'TB', src: 'graph TB' + BODY },
  { id: 'mmLR', label: '머메이드 LR', dir: 'LR', src: 'graph LR' + BODY },
]

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
  /** 어느 문으로 들어왔나 — 제목에 쓴다. 판정에는 안 쓴다(방향은 아래 글이 정한다). */
  const [door, setDoor] = useState(MM_DOORS[0])
  const [mm, setMm] = useState(MM_DOORS[0].src)
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
    // **머메이드로 새는 길을 막는다.** 목록 타일은 pickMermaid 로 가지만, 다른 데서 'tree' 가
    // 이리로 들어오면 빈 글로 펼쳐져 **상자 하나 없는 쪽**이 생긴다. 여기서 문으로 돌린다.
    if (key === 'tree') { pickMermaid(MM_DOORS[0]); return }
    addCard(key); close()
  }
  /** 머메이드 문. **표본을 늘 새로 채운다** — 안 그러면 TB 를 눌렀는데 아까 LR 글이 남아 있다. */
  function pickMermaid(d: typeof MM_DOORS[number]) { setDoor(d); setMm(d.src); setAskTree(true) }

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
  const lc = term.toLowerCase()
  const match = (label: string, key: string) =>
    !term || label.toLowerCase().includes(lc) || key.toLowerCase().includes(lc)

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
              // 깊이는 띠로 받는다. 남는 문제는 **줄**뿐이다.
              const bands = bandsNeeded(Math.max(0, got.levels - 1), cap.levels)
              const over = got.rows > Math.max(1, Math.floor(cap.slots / bands))
              const narrow = orientation === 'portrait'
              return (<>
                <div className="cpk-grp">{door.label} — 글로 뼈대 잡기</div>
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
                {/* **한 띠에 안 들어가도 넘치는 게 아니다**(③ · 2026-09-15).
                    깊으면 같은 종이 아래 띠로 이어 그린다. 그러니 「넘칩니다」는
                    **줄이 모자랄 때만** 말한다 — 깊이는 접어 넣기가 받아 준다. */}
                <div className="cpk-mmcap">
                  {g.dir === 'LR' ? '왼 → 오른' : '위 → 아래'} · 상자 <b>{g.order.length}개</b> ·
                  {' '}한 띠에 <b>{cap.levels}레벨 × {cap.slots}{g.dir === 'LR' ? '줄' : '칸'}</b>
                  {bands > 1 && <span> · <b>{bands}개 띠로 접어</b> 그립니다</span>}
                  {over && <span className="warn"> · 지금 글은 {got.rows}{g.dir === 'LR' ? '줄' : '칸'} — <b>넘칩니다</b></span>}
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
              {/* **「＋ 덱 섹션」은 여기 있었다**(2026-09-17 제거). 없앤 자리를 비워 두지 않고
                  빈 슬라이드가 폭을 다 쓴다 — 단추가 하나인데 반만 차 있으면 빠진 것처럼 보인다. */}
              <button className="cpk-q" onClick={() => pick('slide')}>＋ 빈 슬라이드</button>
            </div>
            <input className="cpk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="카드 검색 (예: 머메이드, 메모)" aria-label="카드 검색" autoFocus />
            {GROUPS.map((g) => {
              /* **감춘 카드는 여기서 걸러진다.** 등록에는 남아 있다 — 지우면 그 카드로 만들어 둔
                 쪽이 조용히 비기 때문이다(registry.ts 의 `hidden` 에 적어 뒀다).
                 예전에는 덱 섹션만 `key !== 'dsection'` 으로 빼고 있었는데, 그 특례가 이 표시로 합쳐졌다. */
              const items = CARD_REGISTRY.filter((c) => c.group === g.key && !c.hidden)
              /* 머메이드 한 장이 **타일 둘**로 펼쳐진다. 여기서만 갈라지고 카드키는 하나다. */
              const tiles = items.flatMap((c) => c.key === 'tree'
                ? MM_DOORS.map((d) => ({ id: d.id, label: d.label, thumb: d.id, run: () => pickMermaid(d) }))
                : [{ id: c.key, label: c.label, thumb: c.key, run: () => pick(c.key) }])
                .filter((t) => match(t.label, t.id))
              if (!tiles.length) return null
              return (
                <div key={g.key}>
                  <div className="cpk-grp">{g.label}</div>
                  <div className="cpk-grid">
                    {tiles.map((t) => (
                      <button key={t.id} className={'cpk-tile' + (g.key === 'viz' ? ' hot' : '')} onClick={t.run} title={t.label}>
                        <span className="cpk-thumb" dangerouslySetInnerHTML={{ __html: thumb(t.thumb) }} />
                        <span className="cpk-nm">{t.label}</span>
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
