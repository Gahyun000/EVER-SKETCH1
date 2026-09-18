import { useEffect, useState } from 'react'
import { openSections, rememberOpenSections } from '../../persistence/prefs'
import { BRANCH_MAX, BRANCH_BOX, nextBranchSpot } from '../../cards/mindmapEls'
import { treeShape, descendantCount, knownOf, isTreePage } from '../../cards/treeOps'
import NumInput from './NumInput'
import ApprovalCard from './ApprovalCard'
import { useBuilder } from '../../state/store'
import type { PaperType } from '../../state/store'
import { useCanvasUI } from '../../state/canvasUI'
import { useKey } from '../../ui/keyLabel'
import { useSelEl } from '../useSelEl'
import Editor from '../Editor'
import ColorPicker from './ColorPicker'
import { pageSize } from '../../cards/sizing'
import { PAPER_OPTIONS } from '../../cards/paper'
import { FCOLORS } from '../../canvas/model'
import { pushSnap } from '../../canvas/model'
import type { FreeEl } from '../../state/store'
import { addRow, delRow, addCol, delCol, setAlignRange, setVAlignRange, setCellFsRange, setCellBgRange } from '../../canvas/tableOps'
import AnchorLossDialog from '../../comments/AnchorLossDialog'
import { anchorLostBy } from '../../comments/anchor'
import { useComments } from '../../comments/store'
import { CBG_LABEL, cbgPalette, cellBackground, cellColors, isSlotEl, lockedRowCount, slotAllows } from '../../template/slots'
import { ALIGN_LABEL, AlignIcon, VALIGN_LABEL, VAlignIcon } from '../../ui/alignIcons'
import { bottomLimit, dataCapacity, isFull } from '../../canvas/tableCapacity'
import { canSpillListBlock, isListSlot } from '../../canvas/listSpill'
import { slotLabels } from '../../template/unfilled'
import '../../template/template.css'

const TRANS: [string, string][] = [['', '없음'], ['fade', '페이드'], ['slide', '밀기'], ['zoom', '확대'], ['flip', '넘기기']]
const cap: React.CSSProperties = { fontSize: 11, color: '#98a1b2', display: 'block', marginTop: 6 }
const PRESETS: { name: string; color: string; tcolor: string }[] = [
  { name: '기본', color: '#ffffff', tcolor: '#1a1a1a' },
  { name: '주황', color: '#e0553c', tcolor: '#ffffff' },
  { name: '회색', color: '#8a93a5', tcolor: '#ffffff' },
  { name: '크림', color: '#f6ddc2', tcolor: '#5a4327' },
  { name: '파랑', color: '#2a78d6', tcolor: '#ffffff' },
  { name: '초록', color: '#2fa37a', tcolor: '#ffffff' },
]
/** 묶음 이름은 **할 일**로 짓는다(C-3).
 *
 *  예전에는 옛 탭 이름 그대로였다 — 표 · 스타일 · 텍스트 · 정렬.
 *  그러면 시안이 든 문제가 그대로 남는다: 「크기」를 바꾸려면 **정렬**을 열어야 하고,
 *  그건 「무엇을 하려는가」와 이름이 안 맞는다.
 *
 *  `text` 만 옛 이름을 그대로 쓴다 — 뜻이 안 바뀌었고, 이름을 바꾸면
 *  브라우저에 남아 있던 사람들의 「펴 둔 상태」가 조용히 버려진다. */
type Tab = 'cell' | 'row' | 'stage' | 'look' | 'text' | 'geom' | 'extra' | 'border'
/** 기억할 이름들. 여기 없는 이름은 `openSections` 가 버린다 —
 *  예전 판이 남긴 키(table·style·arrange)가 화면에 없는 묶음을 열어 둔 채로 남지 않게. */
const SECS: readonly Tab[] = ['cell', 'row', 'stage', 'look', 'text', 'geom', 'extra', 'border']

/**
 * **접이식 한 묶음.** 여덟 군데가 같은 모양이라 한 곳으로 모았다 —
 * 묶음이 넷에서 여덟으로 늘면서 베껴 쓴 자리가 그만큼 늘어난다.
 *
 * ── 왜 **파일 맨 바깥**에 있나 (2026-09-16) ──────────────────────
 *
 * 전에는 이게 `RightPanel` **안에** 선언돼 있었다. 그러면 화면을 다시 그릴 때마다
 * `Acc` 가 **새 부품**이 된다. 리액트는 「자리는 같은데 부품이 바뀌었다」고 보고
 * 고쳐 그리는 대신 **여덟 묶음을 통째로 버리고 새로 만든다.** 그래서
 *
 *   · 패널 스크롤이 **맨 위로 튀었다** (내용이 잠깐 비어 브라우저가 0 으로 깎는다)
 *   · 치던 숫자 칸이 **손에서 떨어졌다** — ▲를 두 번 연달아 못 눌렀다
 *
 * 사용자가 영상 둘로 신고한 그 증상이다. 재현해 보니 값을 한 번 올리는 것만으로
 * scrollTop 286 → 0, 묶음 머리와 입력 칸이 **전부 새 DOM 노드**로 갈렸다.
 *
 * **그래서 부품은 바깥에 두고, 안에서 오는 것은 값으로 받는다.** 값이 바뀌면
 * 고쳐 그릴 뿐 버리지 않는다. 이 자리에 부품을 다시 선언하면 같은 증상이 돌아온다.
 */
function Acc({ k, t, sub, sec, onToggle, children }: {
  k: Tab; t: string; sub?: string
  sec: Record<Tab, boolean>; onToggle: (k: Tab) => void
  children: React.ReactNode
}) {
  const open = sec[k]
  return (<>
    <button className={'insp-acc' + (open ? ' on' : '')}
      onClick={() => onToggle(k)} aria-expanded={open}>
      <span className="ch">{open ? '▾' : '▸'}</span>
      <span className="t">{t}</span>
      {sub ? <span className="sub">{sub}</span> : null}
    </button>
    {open ? <>{children}</> : null}
  </>)
}

/** 처음 여는 사람에게 **자주 쓰는 것만** 펴 준다(시안 그대로).
 *  표는 칸·행·진행 표시, 그 밖은 모양·글자. 나머지는 접힌 줄에 지금 값이 적혀 있어
 *  열지 않아도 읽힌다 — 그게 접이식으로 바꾼 이유다. */
const DEFAULT_OPEN: Record<Tab, boolean> = {
  cell: true, row: true, stage: true, look: true, text: true,
  geom: false, extra: false, border: false,
}

// 우측 인스펙터 — PPT/키노트식. 요소 선택 시 스타일/텍스트/정렬 3탭, 미선택 시 페이지 설정.
export default function RightPanel() {
  const K = useKey()
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const orientation = useBuilder((s) => s.orientation)
  const setOrientation = useBuilder((s) => s.setOrientation)
  const setPageBg = useBuilder((s) => s.setPageBg)
  const setPaper = useBuilder((s) => s.setPaper)
  const setPageTrans = useBuilder((s) => s.setPageTrans)
  const addCard = useBuilder((s) => s.addCard)
  const duplicatePage = useBuilder((s) => s.duplicatePage)
  const expandMindmap = useBuilder((s) => s.expandMindmap)
  const removePage = useBuilder((s) => s.removePage)
  const groupEls = useBuilder((s) => s.groupEls)
  const ungroupEls = useBuilder((s) => s.ungroupEls)
  const { el, patch } = useSelEl()
  const updateEl = useBuilder((s) => s.updateEl)
  const tableSel = useCanvasUI((s) => s.tableSel)
  const setTableSel = useCanvasUI((s) => s.setTableSel)
  const setSel = useCanvasUI((s) => s.setSel)
  const continueTable = useBuilder((s) => s.continueTable)
  const spillListBlock = useBuilder((s) => s.spillListBlock)
  const settleFoot = useBuilder((s) => s.settleFoot)
  const undoContinue = useBuilder((s) => s.undoContinue)
  /** 방금 이어 적어 만든 **조각의 id**. 되돌리기 줄은 그 조각을 보고 있을 때만 뜬다.
   *
   *  처음에는 참/거짓 하나로 뒀다가 실물에서 걸렸다 — 이어 적으면서 새 조각을
   *  고르게 되는데, 그 **선택 바뀜**이 「다른 것을 골랐다」로 읽혀 방금 켠 줄을
   *  그 자리에서 껐다. 켜는 일과 끄는 일이 한 동작 안에서 부딪힌 것이다.
   *  id 로 들고 있으면 그 다툼 자체가 없다 — 다른 것을 고르면 저절로 안 맞는다. */
  const [flowedEl, setFlowedEl] = useState<number | null>(null)
  /** 방금 한 것이 **통째로 넘기기**였나, 조각내 잇기였나. 안내 글자가 달라진다 —
   *  옮기고 나면 새 쪽에는 ① 이 없어 `canSpill` 이 거짓이 되므로 따로 기억해야 한다. */
  const [flowedSpill, setFlowedSpill] = useState(false)
  const selElId = useCanvasUI((s) => s.selEl)
  const selEls = useCanvasUI((s) => s.selEls)
  const setCanvas = useBuilder((s) => s.setCanvas)
  const selConn = useCanvasUI((s) => s.selConn)
  const setSelConn = useCanvasUI((s) => s.setSelConn)
  const patchConn = useBuilder((s) => s.patchConn)
  const removeConn = useBuilder((s) => s.removeConn)
  /** **탭이 아니라 접이식이다.**
   *
   *  탭은 「지금 어느 탭인지」를 사람이 기억해야 하고, 찾는 것이 다른 탭에 있으면
   *  네 번을 눌러 봐야 안다. 접이식은 **네 묶음이 늘 한 화면에** 있고,
   *  접힌 줄에 지금 값이 적혀 있어 열지 않아도 읽힌다(「12pt · 굵게」).
   *  여러 개를 함께 펴 둘 수 있다 — 표를 고치면서 글자도 만지는 일이 흔하다. */
  //  **접고 편 상태는 기억한다**(C-2). 안 그러면 고를 때마다 처음으로 돌아가고,
  //  그건 탭을 다시 누르는 것과 같은 손품이다 — 접이식으로 바꾼 이유가 반쯤 사라진다.
  const [openSec, setOpenSec] = useState<Record<Tab, boolean>>(
    () => openSections(SECS, DEFAULT_OPEN))
  const toggle = (k: Tab) => setOpenSec((o) => {
    const next = { ...o, [k]: !o[k] }
    rememberOpenSections(next)
    return next
  })
  const page = pages.find((p) => p.id === selId)
  const conn = (selConn != null && page) ? page.conns[selConn] : undefined
  function patchC(pt: Partial<import('../../state/store').Conn>) {
    if (!page || selConn == null) return
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
    patchConn(page.id, selConn, pt)
  }
  /** 펼쳐진 마인드맵에서 중심에 이어진 가지 수. */
  const branchCount = page && page.mindmapCenter != null
    ? page.conns.filter((c) => c.from === page.mindmapCenter || c.to === page.mindmapCenter).length
    : 0

  /** 트리(①②). **뿌리는 선에서 센다** — 저장된 값이 아니라.
   *  그래서 사람이 선을 하나 그어 뿌리를 자식으로 만들어도 단추가 바로 따라온다. */
  const tree = page && isTreePage(page)
    ? treeShape(page.els, page.conns, knownOf(page)) : null
  const elInTree = !!(tree && selElId != null && tree.members.includes(selElId))
  const elIsRoot = !!(tree && selElId != null && tree.roots.includes(selElId))
  const elKids = tree && selElId != null ? (tree.kids.get(selElId) || []).length : 0
  const elFolded = !!(el && el.folded)
  const hiddenN = tree && selElId != null ? descendantCount(tree, selElId) : 0
  const treeAdd = useBuilder((s) => s.treeAdd)
  const treeFold = useBuilder((s) => s.treeFold)
  /** 트리를 고치기 전에 되돌릴 자리를 찍는다 — ⌘Z 한 번에 통째로 돌아간다. */
  function treeSnap() {
    if (!page) return
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
  }

  /** 가장 넓게 벌어진 틈에 가지 하나를 얹는다. **있던 것은 안 건드린다.** */
  function addBranch() {
    if (!page || page.mindmapCenter == null) return
    const center = page.els.find((e) => e.id === page.mindmapCenter)
    if (!center || branchCount >= BRANCH_MAX) return
    const ids = new Set(page.conns
      .filter((c) => c.from === center.id || c.to === center.id)
      .map((c) => (c.from === center.id ? c.to : c.from)))
    const branches = page.els.filter((e) => ids.has(e.id))
    const { W, H } = pageSize(orientation)
    const spot = nextBranchSpot(center, branches, W, H)
    const nid = Math.max(0, ...page.els.map((e) => e.id)) + 1
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
    setCanvas(page.id, {
      els: [...page.els, {
        id: nid, type: 'round', x: spot.x, y: spot.y, w: BRANCH_BOX.w, h: BRANCH_BOX.h,
        text: `가지 ${branchCount + 1}`, color: '#eaf0ff', fs: 13, tcolor: '#1c2433',
      }],
      // 화살표가 아니라 **선**이다 — 마인드맵의 가지에 방향이 없다(mindmapEls 와 같은 규칙).
      conns: [...page.conns, { from: center.id, to: nid, kind: 'straight', arrow: 'none', color: '#c3cbdb', width: 1.5 }],
      strokes: page.strokes,
      detached: page.detached,
    })
    // **새 가지를 고르지 않는다.** 고르면 패널이 요소 쪽으로 넘어가면서
    // 「＋ 가지」가 화면에서 사라진다 — 둘째 가지를 붙이려면 빈 데를 한 번 눌러야 한다.
    // 가지는 대개 두셋을 이어 붙이므로, **단추가 그 자리에 남아 있는 편**이 낫다.
    // 새로 생긴 것은 「가지 N」이라 눈으로 찾기 어렵지 않다.
  }

  const dark = !!(page && page.bg)
  const curPaper: PaperType = (page && page.paper) || 'blank'
  const { W, H: PAGE_H } = pageSize(orientation)

  /**
   * 행이 늘어 표가 커질 때 **종이 밖으로 밀려나지 않게** 자른다.
   *
   * addRow 는 「행 높이는 그대로, 표 높이가 따라간다」만 안다 — 종이가 얼마나 큰지는
   * 모른다(순수 함수라 그래야 한다). 종이를 아는 것은 여기다.
   *
   * 자를 때 y 도 같이 올린다. 높이만 자르면 아래쪽에 있던 표가 종이 끝에 걸린 채
   * 위로 자라지 못해, 결국 행 높이가 다시 줄어든다 — 고치려던 그 증상이다.
   */
  function fitPage(cur: FreeEl, pt: Partial<FreeEl>): Partial<FreeEl> {
    if (pt.h == null || !isSlotEl(cur.slot)) return pt
    const h = Math.min(pt.h, PAGE_H)
    const y = Math.min(Math.max(0, cur.y), Math.max(0, PAGE_H - h))
    return { ...pt, h, y }
  }

  /** 이 표에 **한 줄 더 넣으면 넘치는가** (⑤ ㄷ · 2026-09-14).
   *
   *  옛 판정은 「표 높이 ≥ 종이 높이」였다. **네 줄 늦었다** — 본문 13줄에서 이미
   *  꼬리말을 덮고 14줄부터 표가 위로 기어 올라 제목을 파고드는데, 경고는 16줄에서야
   *  떴다. 그때는 표가 종이를 통째로 덮고 있다.
   *
   *  이제 꼬리말 글상자의 윗변까지를 한계로 본다. 그 값은 **문서가 들고 있는 것**이라
   *  서버 상수를 화면에 또 베껴 적지 않아도 된다 — 베껴 적은 상수는 언젠가 갈라진다.
   *  표준 양식에서는 12줄이 나오고, 서버 `_max_data_rows()` 와 같은 답이다. */
  const tableLimit = bottomLimit(PAGE_H)
  const isTableEl = !!el && el.type === 'table' && isSlotEl(el.slot)
  const tableFull = isTableEl && isFull(el, tableLimit)

  /** 선택이 바뀌면 종류에 맞는 묶음을 **펴 준다.**
   *
   *  **나머지는 안 건드린다**(C-2, 2026-09-08). 예전에는 넷을 다 닫고 하나만 열었는데,
   *  그러면 사람이 펴 둔 것이 **고를 때마다 도로 접혔다** — 「크기·자리」를 열어 두고
   *  표를 만지다 다른 칸을 고르면 다시 닫혀 있다. 그건 탭을 다시 누르는 것과 같은 손품이라,
   *  접이식으로 바꾼 이유가 반쯤 사라진다.
   *
   *  **이 자동 펴기는 기억에 안 적는다.** 사람이 고른 적 없는 값을 저장하면
   *  「내가 편 적도 없는데 늘 열려 있다」가 된다. 저장은 **사람이 누를 때만**(`toggle`). */
  useEffect(() => {
    if (!el) return
    const shapeLike = ['box', 'round', 'ellipse', 'diamond', 'triangle', 'sticky', 'image', 'icon', 'table', 'wordart']
    const k: Tab = el.type === 'table' ? 'cell' : shapeLike.includes(el.type) ? 'look' : 'text'
    setOpenSec((o) => (o[k] ? o : { ...o, [k]: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selElId])


  function setBg(d: boolean) { if (page) setPageBg(page.id, d ? '#0e1c30' : '') }
  const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))

  // 툴바/메뉴/단축키에서 오는 커스텀 이벤트를 선택 요소/현재 페이지 기준으로 처리(호환 유지).
  useEffect(() => {
    const TC = ['#1a1a1a', '#2a78d6', '#0f9d58', '#c5501f', '#4a3aa7']
    const AL: ('left' | 'center' | 'right')[] = ['left', 'center', 'right']
    const handlers: Record<string, () => void> = {
      'ebook:bg-toggle': () => setBg(!dark),
      'ebook:fmt-bold': () => { if (el) patch({ bold: !el.bold }) },
      'ebook:fmt-italic': () => { if (el) patch({ italic: !el.italic }) },
      'ebook:fmt-underline': () => { if (el) patch({ underline: !el.underline }) },
      'ebook:fmt-color': () => { if (!el) return; const i = TC.indexOf(el.tcolor || '#1a1a1a'); patch({ tcolor: TC[(i + 1) % TC.length] }) },
      'ebook:fmt-clear': () => { if (el) patch({ bold: false, italic: false, underline: false, tcolor: undefined, align: undefined }) },
      'ebook:align-left': () => { if (el) patch({ align: 'left' }) },
      'ebook:align-center': () => { if (el) patch({ align: 'center' }) },
      'ebook:align-right': () => { if (el) patch({ align: 'right' }) },
      'ebook:align-cycle': () => { if (!el) return; const i = AL.indexOf(el.align || 'left'); patch({ align: AL[(i + 1) % 3] }) },
      'ebook:bullet': () => { if (el) patch({ text: /^[•\-]\s/.test(el.text) ? el.text : '• ' + el.text }) },
      'ebook:el-rotate': () => { if (el) patch({ rot: ((el.rot || 0) + 15) % 360 }) },
      'ebook:el-center': () => { if (el) patch({ x: Math.round((W - el.w) / 2) }) },
      'ebook:trans-cycle': () => { if (!page) return; const ks = TRANS.map((t) => t[0]); const i = ks.indexOf(page.trans || ''); setPageTrans(page.id, ks[(i + 1) % ks.length]) },
    }
    const bound = Object.entries(handlers).map(([k, fn]) => { const g = () => fn(); window.addEventListener(k, g); return [k, g] as const })
    return () => bound.forEach(([k, g]) => window.removeEventListener(k, g))
  })

  // 숫자 칸은 전부 NumInput 을 쓴다 — 치는 도중에 값을 깎지 않는다.
  // 예전에는 한 글자마다 깎아서, 60 을 50 으로 고치려 하면 5 가 6 으로 박히고
  // 칸을 비울 수조차 없었다(NumInput.tsx 의 설명 참고).
  const numRow = (label: string, val: number, on: (n: number) => void, min = -9999): React.ReactNode => (
    <label className="insp-num"><span>{label}</span>
      <NumInput value={val} onCommit={on} min={min} ariaLabel={label} /></label>
  )

  // ── 표가 바뀌면 지적이 가리키는 칸도 따라 움직여야 한다 ──
  // 안 그러면 지적은 그대로인데 **엉뚱한 칸**을 가리키게 되고, 아무도 모른다.
  const cmtThreads = useComments((s) => s.threads)
  const cmtShift = useComments((s) => s.shift)
  const [loss, setLoss] = useState<{ axis: 'row' | 'col'; at: number; run: () => void } | null>(null)

  const shiftAnchors = async (axis: 'row' | 'col', at: number, delta: number,
                              onLost: 'keep' | 'delete' = 'keep') => {
    if (!el) return
    try { await cmtShift({ el_id: el.id, axis, at, delta, on_lost: onLost }) }
    catch { /* 지적이 없거나 권한이 없으면 조용히 넘어간다 — 표 편집을 막을 일은 아니다 */ }
  }

  /** 지울 때만 묻는다. 가리킬 곳을 잃는 지적이 없으면 그냥 지운다. */
  function askThenDo(axis: 'row' | 'col', at: number, run: () => void) {
    if (!el) return
    const hit = cmtThreads.filter((t) => t.el_id === el.id && !t.lost_at
      && anchorLostBy(t.cell, axis, at))
    if (hit.length === 0) { run(); void shiftAnchors(axis, at, -1); return }
    setLoss({ axis, at, run })
  }

  const lostThreads = loss && el
    ? cmtThreads.filter((t) => t.el_id === el.id && !t.lost_at
        && anchorLostBy(t.cell, loss.axis, loss.at))
    : []

  // 선택한 사진의 실제 비율을 읽어 상자를 다시 잡는다. 자동으로 하지 않고 사용자가 누를 때만 —
  // 일부러 잘라 쓰던 구도를 멋대로 바꾸면 안 되기 때문.
  function fitImageBox() {
    if (!page || !el || el.type !== 'image' || !el.src) return
    const img = new Image()
    img.onload = () => {
      const iw = img.naturalWidth, ih = img.naturalHeight
      if (!iw || !ih) return
      const base = Math.max(el.w, el.h)          // 지금 크기감을 유지한 채 비율만 교정
      const k = base / Math.max(iw, ih)
      pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
      updateEl(page.id, el.id, { w: Math.max(24, Math.round(iw * k)), h: Math.max(24, Math.round(ih * k)) })
    }
    img.src = el.src
  }

  function patchTable(pt: Partial<FreeEl>) {
    if (!page || !el) return
    // 이 조각을 고치기 시작했으면 되돌리기 줄을 접는다. 계속 띄워 두면 한참 뒤에
    // 눌러 **그동안 쓴 것까지** 날아간다 — 되돌리기는 방금 한 일에만 붙어야 한다.
    setFlowedEl(null)
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
    updateEl(page.id, el.id, fitPage(el, pt))
    // 행/열이 줄었으면 활성 셀을 새 범위 안으로 당겨 준다.
    // 안 그러면 마지막 행을 두 번 지울 때 두 번째 삭제가 범위 밖을 가리켜 표가 어긋난다.
    const nr = pt.rows, ncl = pt.cols
    if ((nr != null || ncl != null) && tableSel && tableSel.elId === el.id) {
      const maxR = (nr != null ? nr : Infinity) - 1
      const maxC = (ncl != null ? ncl : Infinity) - 1
      const cl = (v: number, m: number) => Math.max(0, Math.min(m, v))
      setTableSel({
        elId: el.id,
        r0: cl(tableSel.r0, maxR), c0: cl(tableSel.c0, maxC),
        r1: cl(tableSel.r1, maxR), c1: cl(tableSel.c1, maxC),
      })
    }
  }
  const ts = (tableSel && el && tableSel.elId === el.id) ? tableSel : null
  const ar = ts ? ts.r1 : 0, ac = ts ? ts.c1 : 0
  // 템플릿 슬롯이면 편집 범위가 제한된다(사양 §5). 서버도 같은 정책으로 거부한다 —
  // 여기서 버튼을 숨기는 것은 '왜 안 되는지' 알려주기 위한 UX다.
  const slot = el?.slot
  const inTemplate = isSlotEl(slot)
  const canRow = !inTemplate || slotAllows(slot, 'row')
  const canCol = !inTemplate || slotAllows(slot, 'col')
  const canMerge = !inTemplate || slotAllows(slot, 'merge')
  const canCbg = !inTemplate || slotAllows(slot, 'cbg')
  const palette = cbgPalette(slot)
  const headLocked = lockedRowCount(slot)
  /** 이 장에 들어가는 **본문** 줄 수. 화면에 그대로 적는다. */
  const tableCap = isTableEl && el ? dataCapacity(el, headLocked, tableLimit) : 0
  /**
   * **끝에 줄을 더하는데 이 장이 찼다** — 다음 장에 이어 적는다.
   *
   * 새 쪽과 이은 조각(`contFrom`)은 창고가 만든다. 조각에는 머리글을 다시 붙인다 —
   * 2쪽만 펼친 사람에게 열 이름이 없으면 18칸짜리 표는 숫자 덩어리다.
   *
   * **저절로 되는 일이라 되돌릴 길을 같이 준다.** ⌘Z 는 쪽 안의 요소만 되돌리므로
   * (이력이 쪽별이다) 쪽이 생긴 것은 못 지운다.
   */
  /** ①과 **같은 쪽에 있는** ②③ 인가. 그러면 조각내지 않고 통째로 넘긴다(사용자 판단 ㄴ). */
  const canSpill = !!page && !!el && isListSlot(el.slot) && canSpillListBlock(page.els)

  /**
   * **②③ 를 통째로 다음 쪽으로 보내고, 거기서 줄을 마저 더한다.**
   *
   * 처음 만들 때는 한 쪽에 ①②③ 가 다 들어간다(template_seed). 쓰다가 ②③ 가 넘치면
   * 그때 둘이 **함께** 다음 쪽으로 내려간다 — 줄을 쪼개 잇지 않는다. 같은 표를 두 쪽에서
   * 찾게 만들지 않으려는 것이고, 처음 만들 때의 규칙과도 같다.
   *
   * 옮기고 나면 표가 위로 올라가 자리가 생기므로 대개 바로 한 줄이 들어간다.
   * 그래도 모자라면(아주 긴 목록) 그때는 예전처럼 조각내 잇는다.
   */
  function spillThenAddRow() {
    if (!page || !el) return
    const made = spillListBlock(page.id)
    if (!made) { flowToNext(); return }
    setSel(el.id)
    setFlowedEl(el.id); setFlowedSpill(true)
    setOpenSec((o) => (o.row ? o : { ...o, row: true }))
    // 옮겨 간 쪽에서 같은 요소를 다시 찾아 줄을 더한다. **여기서 page 를 다시 읽는다** —
    // 위에서 잡아 둔 `page` 는 옮기기 전의 것이라 그대로 쓰면 빈 쪽에 줄을 더한다.
    const now = useBuilder.getState().pages.find((p) => p.id === made.pageId)
    const moved = now?.els.find((e) => e.id === el.id)
    if (!moved) return
    if (isFull(moved, tableLimit)) { continueTable(made.pageId, moved.id, headLocked); return }
    updateEl(made.pageId, moved.id, addRow(moved, (moved.rows || 1)))
    // **줄을 더하면 표가 그만큼 자란다.** 꼬리말을 그대로 두면 표 속에 파묻힌다 —
    // 옮긴 쪽을 사진으로 보고서야 알았다(2026-09-16).
    settleFoot(made.pageId, made.gap)
  }

  function flowToNext() {
    if (!page || !el) return
    const made = continueTable(page.id, el.id, headLocked)
    if (!made) return
    setSel(made.elId)
    setFlowedEl(made.elId); setFlowedSpill(false)
    // **「행」 묶음을 펴 준다.** 되돌리기 줄이 그 안에 있다 — 접혀 있으면
    // 저절로 벌어진 일을 알리는 줄이 접힌 묶음 뒤에 숨는다. 기억에는 안 적는다
    // (사람이 고른 적 없는 값을 저장하면 「내가 편 적도 없는데 늘 열려 있다」가 된다).
    setOpenSec((o) => (o.row ? o : { ...o, row: true }))
  }
  // 헤더 행이 선택돼 있으면 행 삭제를 막는다 — 표준 양식이 깨진다.
  const headRowSelected = inTemplate && ts != null && Math.min(ts.r0, ts.r1) < headLocked
  const curBg = (el?.cbg && ts) ? el.cbg[Math.min(ts.r0, ts.r1) + '_' + Math.min(ts.c0, ts.c1)] : undefined
  // 선택 범위(없으면 활성 셀 한 칸). 정렬·크기 버튼이 전부 이 네 값을 쓴다.
  const rng = (): [number, number, number, number] => (ts ? [ts.r0, ts.c0, ts.r1, ts.c1] : [ar, ac, ar, ac])
  const cellFs = (el && ts && el.cfs && el.cfs[Math.min(ts.r0, ts.r1) + '_' + Math.min(ts.c0, ts.c1)]) || (el ? el.fs : 12)
  const selCount = ts ? (Math.abs(ts.r1 - ts.r0) + 1) * (Math.abs(ts.c1 - ts.c0) + 1) : 0

  /** 접힌 줄에 적을 **지금 값**.
   *
   *  이게 접이식의 값어치다 — 열어 보지 않아도 읽힌다.
   *  「스타일」처럼 열어야만 알 수 있으면 탭과 다를 게 없다. */
  /** 접힌 줄에 **지금 값**을 적는다 — 열지 않아도 읽히게. 묶음이 늘어난 만큼 여기도 늘었다. */
  const secSub: Record<Tab, string> = {
    cell: el && el.type === 'table'
      ? [ts ? `${Math.min(ts.r0, ts.r1) + 1}행 ${Math.min(ts.c0, ts.c1) + 1}열` : '칸 안 고름',
         cellFs ? `${Math.round(cellFs)}pt` : ''].filter(Boolean).join(' · ') : '',
    row: el && el.type === 'table' ? `${el.rows ?? 0}행 ${el.cols ?? 0}열` : '',
    stage: curBg ? (CBG_LABEL[curBg] || '칠함') : '없음',
    look: el ? [el.color && el.color !== 'transparent' ? '채움' : '',
                el.borderWidth ? `테두리 ${el.borderWidth}` : ''].filter(Boolean).join(' · ') || '기본' : '',
    text: el ? [`${Math.round(el.fs || 0)}pt`, el.bold ? '굵게' : '', el.italic ? '기울임' : '',
                el.underline ? '밑줄' : ''].filter(Boolean).join(' · ') : '',
    geom: el ? [`${Math.round(el.w)}×${Math.round(el.h)}`,
                `(${Math.round(el.x)}, ${Math.round(el.y)})`,
                el.rot ? `${Math.round(el.rot)}°` : '',
                el.locked ? '잠김' : ''].filter(Boolean).join(' · ') : '',
    extra: el ? [el.shadow ? '그림자' : '', el.reflect ? '반사' : ''].filter(Boolean).join(' · ') || '없음' : '',
    border: el && el.type === 'table'
      ? [el.borderWidth === 0.5 ? '얇게' : el.borderWidth === 2 ? '굵게' : '보통',
         el.headRow !== false ? '머리행' : ''].filter(Boolean).join(' · ') : '',
  }

  // 고른 것의 이름 — 표준 양식이면 문서 안의 이름표, 아니면 생김새 이름.
  const EL_NAME: Record<string, string> = {
    table: '표', text: '글상자', icon: '아이콘', wordart: '꾸민 글자', note: '메모',
    image: '그림', sticky: '쪽지', connect: '연결선', pen: '펜 자국',
  }
  const slotName = el && isSlotEl(el.slot) ? (slotLabels(pages)[el.slot as string] || el.slot) : ''
  const whoLabel = slotName || (el ? (EL_NAME[el.type] || '도형') : '')
  const whoSub = el && slotName ? (EL_NAME[el.type] || '도형') : (selCount > 1 ? `${selCount}개` : '')
  const whoTitle = slotName ? `${slotName} — 표준 양식 칸입니다` : whoLabel

  return (
    <div className="ax-inspector">
      {/* **맨 위 고정**(사용자 결정 ㄱ). 탭보다 위라 무엇을 골랐든 늘 보인다 —
          표를 고치는 중에도 「저장 안 됨」이 눈에 든다. 접힌 줄은 32px 이다. */}
      <ApprovalCard />
      {el ? (
        <>
          {/* **무엇을 골랐는지 먼저 말한다.**
              여기는 「글자 크기」·「테두리」 같은 도구가 늘어선 자리라, 정작
              **어느 것을 고치고 있는지**는 화면 가운데를 봐야 알 수 있었다.
              표준 양식이면 문서 안의 이름표를 그대로 읽는다 — 「① 로드맵 / 마일스톤」.
              코드에 이름을 또 적어 두면 양식이 바뀌는 날 둘이 어긋난다. */}
          <div className="insp-who" title={whoTitle}>
            <span className="insp-who-t">{whoLabel}</span>
            {whoSub ? <span className="insp-who-s">{whoSub}</span> : null}
          </div>
          <div className="insp-body">
            {/* **트리 칸은 맨 위**(①②). 「＋ 자식」은 **어느 상자에** 붙이느냐가 곧 구조라
                고른 것이 있어야 뜬다 — 마인드맵의 「＋ 가지」가 쪽 칸에 있는 것과 다른 이유다.
                **뿌리를 골랐을 때는 「＋ 형제」가 「＋ 새 뿌리」로 바뀐다.** 뿌리는 부모가 없어서
                「형제」라는 말이 틀리는데, 하는 일은 같다 — 부모 없는 줄기를 하나 더 만든다. */}
            {elInTree && !el.echoOf ? (<>
              <div className="insp-sec">트리</div>
              <div className="insp-row">
                <button className="insp-pill" title="고른 상자 오른쪽 한 칸에 붙입니다"
                  onClick={() => { if (!page) return; treeSnap(); treeAdd(page.id, selElId, 'child') }}>＋ 자식</button>
                <button className="insp-pill"
                  title={elIsRoot ? '뿌리는 부모가 없어서, 부모 없는 줄기를 하나 더 만듭니다'
                                  : '고른 상자 바로 아래, 같은 부모 밑에 붙입니다'}
                  onClick={() => { if (!page) return; treeSnap(); treeAdd(page.id, selElId, elIsRoot ? 'root' : 'sibling') }}>
                  {elIsRoot ? '＋ 새 뿌리' : '＋ 형제'}</button>
                {elKids > 0 ? (
                  <button className="insp-pill" title={elFolded ? '아래를 다시 폅니다' : `아래 ${hiddenN}개를 숨깁니다`}
                    onClick={() => { if (!page) return; treeSnap(); treeFold(page.id, selElId!) }}>
                    {elFolded ? '▸ 펴기' : '▾ 접기'}</button>
                ) : null}
              </div>
              <span style={cap}>붙이면 트리가 <b>다시 앉습니다</b> — 자리가 곧 구조라서요. {K('mod+Z')} 로 한 번에 돌아갑니다.
                {elKids > 0 ? <> 접은 것은 <b>편집 화면에서만</b> 숨고, 결재·내보내기에는 다 펴져 나갑니다.</> : null}</span>
            </>) : null}
            {el.echoOf != null ? (<>
              <div className="insp-sec">트리</div>
              <div className="insp-note">이 상자는 <b>아래 띠 머리에 다시 놓은 부모</b>입니다.
                고치려면 위 띠의 원본을 고치세요 — 여기 것은 앉힐 때마다 새로 그려집니다.</div>
            </>) : null}
            {/* **묶음을 일 단위로 다시 나눴다**(C-3, 시안 그대로 · 사용자 결정 ㄴ).
                예전 이름은 옛 탭 이름 그대로(표·스타일·텍스트·정렬)였고, 시안이 든 문제가
                거기 그대로 있었다 — 「크기」가 **정렬** 안에 있고, 표 칸 글자를 키우려면
                「셀 글자 크기」(표)인지 「글자 크기」(텍스트)인지 **먼저 정해야** 했다.
                이제 묶음 이름이 **할 일**을 말한다. 「크기·자리」는 무엇을 골랐든 같은 자리에 있고,
                표에서는 칸 글자가 「칸」 안에, 표 전체 글자가 「표 전체 글자」에 있어 이름이 답을 준다.
                **조각은 한 글자도 안 고쳤다** — 자리만 옮겼다. */}
            {el.type === 'table' ? (<>
              <Acc k="cell" t="칸" sub={secSub.cell} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">활성 셀 {ts ? `(${Math.min(ts.r0, ts.r1) + 1}행, ${Math.min(ts.c0, ts.c1) + 1}열)` : '— 표에서 셀 클릭'}</div>
              {inTemplate && (
                <div className="insp-note">
                  표준 양식 표입니다. 칸 내용·행 추가·셀 색만 바꿀 수 있어요.
                  <br />열 구성과 머리글은 취합을 위해 고정됩니다.
                </div>
              )}
              <div className="insp-sec">셀 정렬{selCount > 1 ? ` (${selCount}칸)` : ''}</div>
              {/* **그림도 말도 파워포인트·한글을 따른다**(2026-09-16). 전에는
                  유니코드 글자(⇤ ⇔ ⇥ ⤒ ⇕ ⤓)였다 — 글꼴마다 모양이 달라지고, 두
                  제품에서 보던 그림이 아니라 매번 눌러 봐야 알았다. */}
              <div className="insp-row seg">
                {(['left', 'center', 'right'] as const).map((d) => (
                  <button key={d} title={ALIGN_LABEL[d]}
                    onClick={() => patchTable(setAlignRange(el, ...rng(), d))}><AlignIcon dir={d} /></button>
                ))}
              </div>
              <div className="insp-row seg">
                {(['top', 'middle', 'bottom'] as const).map((d) => (
                  <button key={d} title={VALIGN_LABEL[d]}
                    onClick={() => patchTable(setVAlignRange(el, ...rng(), d))}><VAlignIcon dir={d} /></button>
                ))}
              </div>
              <div className="insp-sec">셀 글자 크기</div>
              <div className="insp-row">
                <label className="insp-num sm"><span>크기</span>
                  <NumInput value={cellFs} min={6} max={200} ariaLabel="셀 글자 크기"
                    onCommit={(n) => patchTable(setCellFsRange(el, ...rng(), n))} /></label>
                <button className="insp-pill" onClick={() => patchTable(setCellFsRange(el, ...rng(), null))}>표 기본으로</button>
              </div>
              {canMerge ? (<>
                {/* **병합은 위 툴바에 있다.** 여기에도 있어서 두 곳이었다.
                    툴바 쪽이 본체다 — 예전에 「패널을 닫아 둔 사람은 병합이 없는 줄 안다」는
                    이유로 일부러 툴바에 넣었고(table_merge_smoke.mjs 가 그걸 지킨다),
                    거기에는 왜 못 누르는지 알려 주는 말과 로드맵을 처음 그리는 사람에게
                    보여 주는 안내까지 붙어 있다. 여기 있던 것은 그런 것이 없는 맨 버튼 둘이었고,
                    「병합 해제」는 병합 안 된 칸에서도 눌렸다. */}
              </>) : null}
              </Acc>
              <Acc k="row" t="행" sub={secSub.row} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">행</div>
              <div className="insp-row">
                <button className="insp-pill" disabled={!canRow} onClick={() => { patchTable(addRow(el, Math.max(ar, headLocked))); void shiftAnchors('row', Math.max(ar, headLocked), 1) }}>↑ 위에 추가</button>
                <button className="insp-pill" disabled={!canRow} onClick={() => {
                  // **끝에 더하는데 이 장이 찼으면 다음 장에 이어 적는다**(⑤ ㄷ).
                  // 가운데에 끼우는 것은 그대로 둔다 — 그건 되흐름이고, 뒤 줄을
                  // 다음 장으로 밀어내는 일이라 훨씬 큰 공사다(tableFlow.ts 참조).
                  if (tableFull && ar + 1 >= (el.rows || 0)) {
                    if (canSpill) { spillThenAddRow(); return }
                    flowToNext(); return
                  }
                  patchTable(addRow(el, ar + 1)); void shiftAnchors('row', ar + 1, 1)
                }}>↓ 아래 추가</button>
                <button className="insp-pill danger" disabled={!canRow || headRowSelected}
                  title={headRowSelected ? '머리글 행은 삭제할 수 없어요' : undefined}
                  onClick={() => askThenDo('row', ar, () => patchTable(delRow(el, ar)))}>🗑 행 삭제</button>
              </div>
              {/* **숫자를 말해 준다.** 「찼다」만 알면 다 쓰고 나서야 알고,
                  12를 알면 미리 나눠 쓸 수 있다. 이어 적은 직후에는 되돌릴 길을 함께 준다. */}
              {flowedEl != null && flowedEl === selElId ? (
                <div className="insp-hint warn">{flowedSpill
                  ? '②③ 를 통째로 다음 장으로 옮겼어요 — 표는 나누지 않았습니다.'
                  : '다음 장에 이어 적고 있어요 — 머리글은 다시 붙였습니다.'}
                  {' '}<button className="insp-undo" onClick={() => { undoContinue(); setFlowedEl(null) }}>되돌리기</button></div>
              ) : tableFull ? (
                <div className="insp-hint warn">이 장은 <b>{tableCap}줄</b>까지예요. 여기서
                  <b> ↓ 아래 추가</b>를 누르면 {canSpill
                    ? <><b>②③ 가 통째로 다음 장으로 갑니다.</b></>
                    : <><b>다음 장에 이어 적습니다.</b></>}</div>
              ) : isTableEl ? (
                <div className="insp-hint">이 장은 <b>{tableCap}줄</b>까지 들어가요 (지금 {Math.max(0, (el.rows || 0) - headLocked)}줄).
                  {' '}행을 넣으면 <b>줄 높이는 그대로</b> 두고 표가 그만큼 커져요.</div>
              ) : (
                <div className="insp-hint">행을 넣으면 <b>줄 높이는 그대로</b> 두고 표가 그만큼 커져요.</div>
              )}
              {canCol ? (<>
                <div className="insp-sec">열</div>
                <div className="insp-row">
                  <button className="insp-pill" onClick={() => { patchTable(addCol(el, ac)); void shiftAnchors('col', ac, 1) }}>← 왼쪽 추가</button>
                  <button className="insp-pill" onClick={() => { patchTable(addCol(el, ac + 1)); void shiftAnchors('col', ac + 1, 1) }}>→ 오른쪽 추가</button>
                  <button className="insp-pill danger"
                    onClick={() => askThenDo('col', ac, () => patchTable(delCol(el, ac)))}>🗑 열 삭제</button>
                </div>
              </>) : null}
              </Acc>
              {/* **보통 표에도 칸 색이 있다**(2026-09-16). 전에는 색 목록을 양식에서만
                  내주다 보니, 양식 없는 표에서는 이 묶음이 **통째로 안 떴다** —
                  자료에는 칸 색이 있고 화면도 그리는데 바꿀 길만 없었다. 요소 옆
                  막대에도 표는 채우기 대상이 아니라(칸마다 색이 따로라 그게 맞다)
                  **어디에도 길이 없었다.**

                  묶음 이름이 표에 따라 다르다: 양식 표에서 앞의 몇 색은 **상태를 가리키는
                  약속**이라 「진행 표시」로 읽혀야 하고, 보통 표에서는 그냥 색이다.

                  **이름은 도구줄과 같은 「채우기」다**(2026-09-16). 여기만 「칸 색」으로 두면
                  같은 일에 이름이 둘이 되고, 그게 바로 사용자가 짚은 문제였다 —
                  「표는 채우기가 아니라 칸 색으로 따로 뺀 거냐」. */}
              {canCbg ? (
                <Acc k="stage" t={palette ? '진행 표시 · 채우기' : '채우기'} sub={secSub.stage} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">{palette ? '진행 표시' : '채우기'}</div>
              <div className="insp-row es-cbg-row">
                {cellColors(slot).map((color) => (
                  <button key={color} type="button"
                    className={'es-cbg' + (curBg === color ? ' on' : '')}
                    style={{ background: cellBackground(color) }}
                    title={CBG_LABEL[color] || color}
                    disabled={!ts}
                    onClick={() => { if (ts) patchTable(setCellBgRange(el, ts.r0, ts.c0, ts.r1, ts.c1, color)) }} />
                ))}
                <button type="button" className="es-cbg clear" title="색 지우기" disabled={!ts}
                  onClick={() => { if (ts) patchTable(setCellBgRange(el, ts.r0, ts.c0, ts.r1, ts.c1, null)) }}>✕</button>
                {/* 목록에 없는 색도 쓴다 — 여기만 막아 두면 「그 색은 왜 안 되나」가 된다. */}
                <span className="es-cbg-more" title="다른 색">
                  <ColorPicker value={curBg}
                    onChange={(c) => { if (ts) patchTable(setCellBgRange(el, ts.r0, ts.c0, ts.r1, ts.c1, c)) }} />
                </span>
              </div>
              <div className="insp-hint">셀을 드래그해 여러 칸을 한 번에 칠할 수 있어요. 병합도 같은 방식이에요 — 위 툴바의 <b>표 ⤢ 병합</b>.</div>
                </Acc>
              ) : null}
              <Acc k="text" t="표 전체 글자" sub={secSub.text} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">글자</div>
              <div className="insp-row">
                <button className={'insp-b' + (el.bold ? ' on' : '')} onClick={() => patch({ bold: !el.bold })}><b>B</b></button>
                <button className={'insp-b' + (el.italic ? ' on' : '')} onClick={() => patch({ italic: !el.italic })}><i>I</i></button>
                <button className={'insp-b' + (el.underline ? ' on' : '')} onClick={() => patch({ underline: !el.underline })}><u>U</u></button>
                <label className="insp-num sm"><span>크기</span>
                  <NumInput value={el.fs} min={6} max={200} ariaLabel="글자 크기"
                    onCommit={(n) => patch({ fs: n })} /></label>
                <ColorPicker value={el.tcolor || '#1a1a1a'} onChange={(c) => patch({ tcolor: c })} />
              </div>
              <div className="insp-sec">정렬</div>
              <div className="insp-row seg">
                <button className={(el.align || 'left') === 'left' ? 'on' : ''} onClick={() => patch({ align: 'left' })}>⇤</button>
                <button className={el.align === 'center' ? 'on' : ''} onClick={() => patch({ align: 'center' })}>⇔</button>
                <button className={el.align === 'right' ? 'on' : ''} onClick={() => patch({ align: 'right' })}>⇥</button>
              </div>
              <div className="insp-row">
                <button className="insp-pill" onClick={() => emit('ebook:bullet')}>글머리표</button>
                <button className="insp-pill" onClick={() => emit('ebook:fmt-clear')}>서식 지우기</button>
              </div>
              </Acc>
              <Acc k="geom" t="크기 · 자리" sub={secSub.geom} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">크기</div>
              <div className="insp-row">{numRow('너비', el.w, (n) => patch({ w: Math.max(10, n) }), 10)}{numRow('높이', el.h, (n) => patch({ h: Math.max(10, n) }), 10)}</div>
              <div className="insp-sec">위치</div>
              <div className="insp-row">{numRow('X', el.x, (n) => patch({ x: n }))}{numRow('Y', el.y, (n) => patch({ y: n }))}</div>
              <div className="insp-sec">회전</div>
              <div className="insp-row">{numRow('각도', el.rot || 0, (n) => patch({ rot: ((n % 360) + 360) % 360 }))}<button className="insp-pill" onClick={() => emit('ebook:el-center')}>가로 중앙</button></div>
              <div className="insp-sec">뒤집기</div>
              <div className="insp-row">
                <button className={'insp-pill' + (el.flipH ? ' on' : '')} onClick={() => patch({ flipH: !el.flipH })}>↔ 좌우</button>
                <button className={'insp-pill' + (el.flipV ? ' on' : '')} onClick={() => patch({ flipV: !el.flipV })}>↕ 상하</button>
              </div>
              <div className="insp-sec">잠금</div>
              <div className="insp-row">
                <button className={'insp-pill' + (el.locked ? ' on' : '')} onClick={() => patch({ locked: !el.locked })}>{el.locked ? '🔒 잠금 해제' : '🔓 잠금'}</button>
              </div>
              <div className="insp-row" style={{ marginTop: 10 }}>
                <button className="insp-pill" onClick={() => emit('ebook:dup')}>⧉ 복제</button>
                <button className="insp-pill danger" onClick={() => emit('ebook:del')}>🗑 삭제</button>
              </div>
              <div className="insp-sec">그룹</div>
              <div className="insp-row">
                <button className="insp-pill" disabled={selEls.length < 2} onClick={() => { if (page && selEls.length >= 2) groupEls(page.id, selEls) }}>⧉ 그룹화</button>
                <button className="insp-pill" disabled={el.groupId == null} onClick={() => { if (page && el.groupId != null) ungroupEls(page.id, page.els.filter((x) => x.groupId === el.groupId).map((x) => x.id)) }}>그룹 해제</button>
              </div>
              <span style={cap}>여러 요소를 Shift+클릭하거나 빈 곳을 드래그해 함께 고른 뒤 그룹화하세요.</span>
              </Acc>
              <Acc k="border" t="테두리 · 머리글" sub={secSub.border} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">테두리 · 헤더</div>
              <div className="insp-row">
                <ColorPicker value={el.borderColor || '#cfd5e2'} onChange={(c) => patchTable({ borderColor: c })} />
                <select className="insp-sel" style={{ width: 'auto' }} value={el.borderWidth ?? 1} onChange={(e) => patchTable({ borderWidth: Number(e.target.value) })}>
                  {/* **「없음」을 넣는다**(2026-09-16). 도형은 테두리를 없앨 수 있는데 표만
                      얇게/보통/굵게뿐이라, 선 없는 표를 만들 길이 아예 없었다.
                      0 이면 그리는 쪽에서 `0px solid` 가 되어 선이 사라진다. */}
                  <option value={0}>없음</option>
                  <option value={0.5}>얇게</option><option value={1}>보통</option><option value={2}>굵게</option>
                </select>
                {/* 선 모양 — 도구줄의 도형 테두리와 **같은 값**(`borderDash`)을 쓴다. */}
                <select className="insp-sel" style={{ width: 'auto' }} title="선 모양"
                  value={el.borderDash || 'solid'}
                  onChange={(e) => patchTable({ borderDash: e.target.value as 'solid' | 'dashed' | 'dotted' })}>
                  <option value="solid">실선</option>
                  <option value="dashed">파선</option>
                  <option value="dotted">점선</option>
                </select>
                <label className="insp-check"><input type="checkbox" checked={el.headRow !== false} onChange={(e) => patchTable({ headRow: e.target.checked })} /> 헤더행</label>
              </div>
              <span style={cap}>셀을 드래그하면 범위가 잡힙니다(Shift+클릭도 범위). 글자 수정은 표를 더블클릭. 표 자체를 옮길 땐 표 가장자리를 끌거나 방향키를 쓰세요.</span>
              </Acc>
            </>) : (<>
              <Acc k="look" t="모양 · 색" sub={secSub.look} sec={openSec} onToggle={toggle}>
              {el.type === 'image' && el.src ? (<>
                <div className="insp-sec">사진</div>
                <div className="insp-row">
                  <button className="insp-pill" onClick={() => fitImageBox()}>⤢ 사진 비율 맞추기</button>
                </div>
                <div className="insp-hint">상자를 사진 원래 비율로 맞춰 위아래 여백을 없앱니다.</div>
              </>) : null}
              <div className="insp-sec">프리셋 스타일</div>
              <div className="insp-sw">{PRESETS.map((ps) => (<span key={ps.name} className="insp-preset" title={ps.name} style={{ background: ps.color, color: ps.tcolor }} onClick={() => patch({ color: ps.color, tcolor: ps.tcolor })}>가</span>))}</div>
              <div className="insp-sec">채우기</div>
              <div className="insp-row"><ColorPicker value={el.color} onChange={(c) => patch({ color: c })} allowTransparent /><span style={{ fontSize: 12, color: '#5b6270' }}>도형 색</span></div>
              <div className="insp-sw">{FCOLORS.map((c) => (<span key={c} className={'insp-chip' + (el.color === c ? ' on' : '')} style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 50%/8px 8px' : c }} onClick={() => patch({ color: c })} />))}</div>
              <div className="insp-sec">테두리</div>
              <div className="insp-row"><ColorPicker value={el.borderColor || '#cfd5e2'} onChange={(c) => patch({ borderColor: c })} allowTransparent /><select className="insp-sel" style={{ width: 'auto' }} value={el.borderWidth ?? 1.5} onChange={(e) => patch({ borderWidth: Number(e.target.value) })}><option value={0}>없음</option><option value={1}>얇게</option><option value={1.5}>보통</option><option value={3}>굵게</option></select><select className="insp-sel" style={{ width: 'auto' }} title="선 모양" value={el.borderDash || 'solid'} onChange={(e) => patch({ borderDash: e.target.value as 'solid' | 'dashed' | 'dotted' })}><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option></select></div>

              <div className="insp-sec">불투명도</div>
              <div className="insp-row"><input className="insp-range" type="range" min={0} max={100} value={Math.round((el.opacity ?? 1) * 100)} onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })} /><span style={{ fontSize: 12, color: '#5b6270', width: 42, textAlign: 'right' }}>{Math.round((el.opacity ?? 1) * 100)}%</span></div>
              </Acc>
              <Acc k="text" t="글자" sub={secSub.text} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">글자</div>
              <div className="insp-row">
                <button className={'insp-b' + (el.bold ? ' on' : '')} onClick={() => patch({ bold: !el.bold })}><b>B</b></button>
                <button className={'insp-b' + (el.italic ? ' on' : '')} onClick={() => patch({ italic: !el.italic })}><i>I</i></button>
                <button className={'insp-b' + (el.underline ? ' on' : '')} onClick={() => patch({ underline: !el.underline })}><u>U</u></button>
                <label className="insp-num sm"><span>크기</span>
                  <NumInput value={el.fs} min={6} max={200} ariaLabel="글자 크기"
                    onCommit={(n) => patch({ fs: n })} /></label>
                <ColorPicker value={el.tcolor || '#1a1a1a'} onChange={(c) => patch({ tcolor: c })} />
              </div>
              <div className="insp-sec">정렬</div>
              <div className="insp-row seg">
                <button className={(el.align || 'left') === 'left' ? 'on' : ''} onClick={() => patch({ align: 'left' })}>⇤</button>
                <button className={el.align === 'center' ? 'on' : ''} onClick={() => patch({ align: 'center' })}>⇔</button>
                <button className={el.align === 'right' ? 'on' : ''} onClick={() => patch({ align: 'right' })}>⇥</button>
              </div>
              <div className="insp-row">
                <button className="insp-pill" onClick={() => emit('ebook:bullet')}>글머리표</button>
                <button className="insp-pill" onClick={() => emit('ebook:fmt-clear')}>서식 지우기</button>
              </div>
              </Acc>
              <Acc k="geom" t="크기 · 자리" sub={secSub.geom} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">크기</div>
              <div className="insp-row">{numRow('너비', el.w, (n) => patch({ w: Math.max(10, n) }), 10)}{numRow('높이', el.h, (n) => patch({ h: Math.max(10, n) }), 10)}</div>
              <div className="insp-sec">위치</div>
              <div className="insp-row">{numRow('X', el.x, (n) => patch({ x: n }))}{numRow('Y', el.y, (n) => patch({ y: n }))}</div>
              <div className="insp-sec">회전</div>
              <div className="insp-row">{numRow('각도', el.rot || 0, (n) => patch({ rot: ((n % 360) + 360) % 360 }))}<button className="insp-pill" onClick={() => emit('ebook:el-center')}>가로 중앙</button></div>
              <div className="insp-sec">뒤집기</div>
              <div className="insp-row">
                <button className={'insp-pill' + (el.flipH ? ' on' : '')} onClick={() => patch({ flipH: !el.flipH })}>↔ 좌우</button>
                <button className={'insp-pill' + (el.flipV ? ' on' : '')} onClick={() => patch({ flipV: !el.flipV })}>↕ 상하</button>
              </div>
              </Acc>
              <Acc k="extra" t="효과 · 순서" sub={secSub.extra} sec={openSec} onToggle={toggle}>
              <div className="insp-sec">효과</div>
              <div className="insp-row">
                <label className="insp-check"><input type="checkbox" checked={!!el.shadow} onChange={(e) => patch({ shadow: e.target.checked })} /> 그림자</label>
                <label className="insp-check"><input type="checkbox" checked={!!el.reflect} onChange={(e) => patch({ reflect: e.target.checked })} /> 반사</label>
              </div>
              <div className="insp-sec">순서</div>
              <div className="insp-row">
                <button className="insp-pill" onClick={() => emit('ebook:z-front')}>맨 앞으로</button>
                <button className="insp-pill" onClick={() => emit('ebook:z-back')}>맨 뒤로</button>
              </div>
              <div className="insp-sec">잠금</div>
              <div className="insp-row">
                <button className={'insp-pill' + (el.locked ? ' on' : '')} onClick={() => patch({ locked: !el.locked })}>{el.locked ? '🔒 잠금 해제' : '🔓 잠금'}</button>
              </div>
              <div className="insp-row" style={{ marginTop: 10 }}>
                <button className="insp-pill" onClick={() => emit('ebook:dup')}>⧉ 복제</button>
                <button className="insp-pill danger" onClick={() => emit('ebook:del')}>🗑 삭제</button>
              </div>
              <div className="insp-sec">그룹</div>
              <div className="insp-row">
                <button className="insp-pill" disabled={selEls.length < 2} onClick={() => { if (page && selEls.length >= 2) groupEls(page.id, selEls) }}>⧉ 그룹화</button>
                <button className="insp-pill" disabled={el.groupId == null} onClick={() => { if (page && el.groupId != null) ungroupEls(page.id, page.els.filter((x) => x.groupId === el.groupId).map((x) => x.id)) }}>그룹 해제</button>
              </div>
              <span style={cap}>여러 요소를 Shift+클릭하거나 빈 곳을 드래그해 함께 고른 뒤 그룹화하세요.</span>
              </Acc>
            </>)}
          </div>
        </>
      ) : conn ? (
        <div className="insp-body">
          <div className="insp-h">연결선</div>
          <div className="insp-sec">종류</div>
          <div className="insp-row seg">
            <button className={(conn.kind || 'ortho') === 'straight' ? 'on' : ''} onClick={() => patchC({ kind: 'straight' })}>직선</button>
            <button className={(conn.kind || 'ortho') === 'ortho' ? 'on' : ''} onClick={() => patchC({ kind: 'ortho' })}>직각</button>
            <button className={(conn.kind || 'ortho') === 'curve' ? 'on' : ''} onClick={() => patchC({ kind: 'curve' })}>곡선</button>
          </div>
          <div className="insp-sec">화살촉</div>
          <div className="insp-row seg">
            <button className={(conn.arrow || 'end') === 'none' ? 'on' : ''} onClick={() => patchC({ arrow: 'none' })}>없음</button>
            <button className={(conn.arrow || 'end') === 'end' ? 'on' : ''} onClick={() => patchC({ arrow: 'end' })}>한쪽</button>
            <button className={(conn.arrow || 'end') === 'both' ? 'on' : ''} onClick={() => patchC({ arrow: 'both' })}>양쪽</button>
          </div>
          <div className="insp-sec">두께 · 점선</div>
          <div className="insp-row">
            <select className="insp-sel" style={{ width: 'auto' }} value={conn.width || 2} onChange={(e) => patchC({ width: Number(e.target.value) })}>
              <option value={1}>얇게</option><option value={2}>보통</option><option value={3.5}>굵게</option><option value={5}>매우 굵게</option>
            </select>
            <label className="insp-check"><input type="checkbox" checked={!!conn.dash} onChange={(e) => patchC({ dash: e.target.checked })} /> 점선</label>
          </div>
          <div className="insp-sec">색</div>
          <div className="insp-row"><ColorPicker value={conn.color || '#8b93a5'} onChange={(c) => patchC({ color: c })} /></div>
          <div className="insp-sw">{['#8b93a5', '#1a1a1a', '#2a78d6', '#e0553c', '#2fa37a', '#7a5af8'].map((c) => (<span key={c} className={'insp-chip' + ((conn.color || '#8b93a5') === c ? ' on' : '')} style={{ background: c }} onClick={() => patchC({ color: c })} />))}</div>
          <div className="insp-row" style={{ marginTop: 10 }}>
            <button className="insp-pill danger" onClick={() => { if (page && selConn != null) { pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })); removeConn(page.id, selConn); setSelConn(null) } }}>🗑 연결선 삭제</button>
          </div>
          <span style={cap}>연결선을 클릭해 선택하고, 가운데를 드래그하면 꺾을 수 있어요.</span>
        </div>
      ) : (
        <div className="insp-body">
          <div className="insp-h">페이지</div>
          <div className="insp-row">
            <button className="insp-pill" onClick={() => addCard('slide')}>＋ 슬라이드</button>
            <button className="insp-pill" onClick={() => { if (selId != null) duplicatePage(selId) }}>⧉ 복제</button>
            <button className="insp-pill danger" onClick={() => { if (selId != null) removePage(selId) }}>🗑 삭제</button>
          </div>
          {/* 이미 카드로 만들어 둔 마인드맵에만 나온다. 새로 넣는 것은 처음부터
              요소로 펼쳐져 나오므로 이 단추가 필요 없다.
              열 때 자동으로 바꾸지 않는 이유: 잠금 플래그 하나 떼는 것과 달리
              **내용을 통째로 다시 쓰는 일**이고, 필드를 정성껏 채워 둔 사람의 자료다. */}
          {page && page.cardKey === 'mindmap' ? (<>
            <div className="insp-row">
              <button className="insp-pill" onClick={() => { if (selId != null) { pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })); expandMindmap(selId) } }}>
                ⤢ 요소로 펼치기
              </button>
            </div>
            <span style={cap}>가지를 하나씩 옮기고 크기를 바꿀 수 있게 됩니다.
              대신 오른쪽 칸으로 한 번에 고치는 건 그때부터 안 돼요 — 잘못 눌렀으면 {K('mod+Z')} 로 되돌립니다.</span>
          </>) : null}

          {/* **＋ 새 뿌리**(①ㄷ). 아무것도 안 골랐을 때 여기 있다 —
              마인드맵의 「＋ 가지」와 같은 자리라 손이 기억한다.
              글로 줄기를 둘 쓰는 길(ㄹ)도 그대로 열려 있고, 그렇게 들어온 뿌리도 여기 수에 잡힌다. */}
          {tree ? (<>
            <div className="insp-sec">트리</div>
            <div className="insp-row">
              <button className="insp-pill" title="빈 자리에 부모 없는 줄기를 하나 만듭니다"
                onClick={() => { if (!page) return; treeSnap(); treeAdd(page.id, null, 'root') }}>＋ 새 뿌리</button>
              <span className="insp-hint" style={{ margin: 0 }}>지금 뿌리 {tree.roots.length}개</span>
            </div>
            <span style={cap}>상자를 고르면 <b>＋ 자식 · ＋ 형제 · 접기</b>가 나옵니다.</span>
          </>) : null}

          {/* **＋ 가지**(사용자 결정 ㄷ). 펼쳐진 마인드맵에만 나온다 —
              `mindmapCenter` 가 중심 도형 id 를 들고 있어 「이게 마인드맵이다」와
              「어디에 이을까」를 한꺼번에 알려 준다.
              **있던 가지는 안 건드린다.** 가장 넓게 벌어진 틈에 하나 얹을 뿐이라,
              사람이 옮겨 둔 자리가 흐트러지지 않는다. */}
          {page && page.mindmapCenter != null && page.els.some((e) => e.id === page.mindmapCenter) ? (<>
            <div className="insp-sec">마인드맵</div>
            <div className="insp-row">
              <button className="insp-pill" disabled={branchCount >= BRANCH_MAX}
                title={branchCount >= BRANCH_MAX
                  ? `가지는 ${BRANCH_MAX}개까지예요 — 더 늘리면 선이 얼룩처럼 보입니다`
                  : '가장 넓게 벌어진 자리에 하나 붙입니다'}
                onClick={addBranch}>＋ 가지</button>
              <span className="insp-hint" style={{ margin: 0 }}>지금 {branchCount}개</span>
            </div>
            <span style={cap}>있던 가지는 안 건드려요. 빈 자리에 하나 얹습니다.</span>
          </>) : null}

          <div className="insp-sec">배경</div>
          <div className="insp-row seg">
            <button className={!dark ? 'on' : ''} onClick={() => setBg(false)}>밝게</button>
            <button className={dark ? 'on' : ''} onClick={() => setBg(true)}>어둡게</button>
          </div>
          <div className="insp-sec">종이</div>
          <div className="insp-row"><select className="insp-sel" value={curPaper} onChange={(e) => { if (page) setPaper(page.id, e.target.value as PaperType) }}>{PAPER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div className="insp-sec">전환</div>
          <div className="insp-row wrap">{TRANS.map(([k, lab]) => (<button key={k || 'none'} className={'insp-pill' + ((page?.trans || '') === k ? ' on' : '')} onClick={() => page && setPageTrans(page.id, k)}>{lab}</button>))}</div>
          <div className="insp-sec">방향</div>
          <div className="insp-row seg">
            <button className={orientation === 'portrait' ? 'on' : ''} onClick={() => setOrientation('portrait')}>세로</button>
            <button className={orientation === 'landscape' ? 'on' : ''} onClick={() => setOrientation('landscape')}>가로</button>
          </div>
          <div className="insp-sec">내용</div>
          <div className="ax-editwrap"><Editor /></div>
        </div>
      )}

      {/* 짚어 둔 칸이 사라질 때 — **삭제 계열에서만** 묻는다.
          추가할 때까지 물으면 사람들은 읽지 않고 누르게 되고,
          그러면 정작 지워질 때의 경고까지 함께 흘려보낸다. */}
      {loss && lostThreads.length > 0 && (
        <AnchorLossDialog
          el={el || undefined}
          lost={lostThreads}
          what={loss.axis === 'row' ? `${loss.at + 1}행` : `${loss.at + 1}열`}
          onCancel={() => setLoss(null)}
          onGo={(keep) => {
            const { axis, at, run } = loss
            setLoss(null)
            run()
            void shiftAnchors(axis, at, -1, keep ? 'keep' : 'delete')
          }} />
      )}
    </div>
  )
}
