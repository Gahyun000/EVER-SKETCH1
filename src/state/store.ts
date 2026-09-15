import { create } from 'zustand'
import { pageSize } from '../cards/sizing'
import { fitPagesToPaper } from '../canvas/fitPaper'
import { mindmapParts } from '../cards/mindmapEls'
import { parseMermaid } from '../cards/mermaid'
import { treeParts } from '../cards/treeEls'
import { treeShape, layoutTree, newNode, TREE_CONN } from '../cards/treeOps'
import { rememberOrientation } from '../persistence/prefs'
import { makeContinuation } from '../canvas/tableFlow'
import { cardByKey } from '../cards/registry'
import type { ImportedDoc } from '../import/htmlImport'
import { polish } from '../builder/polish'
import { dropHistory } from '../canvas/history'
import type { ThemeName } from '../design/tokens'
export type Orientation = 'portrait' | 'landscape'
export type SizePreset = 's' | 'm' | 'l'
export type PaperType = 'blank' | 'lined' | 'lined-narrow' | 'dotted' | 'grid'
// G3/G4 — 서버 planner 가 내는 이북 설계. applyPlan 이 카드로 변환한다.
export interface PlanPage { cardKey: string; fields?: Record<string, string> }
export interface BookPlan { title?: string; orientation?: Orientation; theme?: ThemeName; pages: PlanPage[] }
// G5 — 부분 수정: 대상 페이지 필드만 덮어쓰기(edits) + 새 장 끝에 추가(adds).
export interface PageEdit { pageId: number; fields: Record<string, string> }
export interface PageAdd { cardKey: string; fields?: Record<string, string> }
export interface FreeEl { id: number; type: string; x: number; y: number; w: number; h: number; text: string; color: string; fs: number; src?: string; bold?: boolean; tcolor?: string; rows?: number; cols?: number; cells?: string[][]; colw?: number[]; rowh?: number[]; merges?: { r: number; c: number; rs: number; cs: number }[]; calign?: Record<string, 'left' | 'center' | 'right'>; cvalign?: Record<string, 'top' | 'middle' | 'bottom'>; cfs?: Record<string, number>; cbg?: Record<string, string>; today?: number; todayMode?: 'auto' | 'fixed' | 'off'; todayYear?: number; slot?: string; headRow?: boolean; /** 이 표가 **앞 장에서 이어진 조각**이면, 앞에 있던 본문 행의 개수.  없으면 이 표가 머리 조각이다. 취합·저장 검사는 조각들을 한 표로 센다 (server/template_guard.py). */ contFrom?: number; wa?: boolean; italic?: boolean; underline?: boolean; rot?: number; align?: 'left' | 'center' | 'right'; gotoSeq?: number; blocks?: Block[]; flipH?: boolean; flipV?: boolean; opacity?: number; shadow?: boolean; reflect?: boolean; locked?: boolean; groupId?: number; borderColor?: string; borderWidth?: number ;
  /** **트리 2단계.** 이 상자가 접혀 있다(▸). 아래쪽이 `hidden` 이 된다. */
  folded?: boolean
  /** 접힌 윗대 때문에 **편집 화면에서만** 안 보인다.
   *  결재·팀 공유·내보내기는 이 값을 보지 않는다 — 낸 것과 가진 것이 달라지면 안 된다(사용자 결정 ②ㄴ). */
  hidden?: boolean
  /** 아래 띠 머리에 **흐리게 다시 놓은 부모**. 값은 원본 상자 id.
   *  다시 앉힐 때마다 지우고 새로 만든다 — 남겨 두면 원본 글자를 고쳤을 때 안 따라간다. */
  echoOf?: number }
export interface Conn { from: number; to: number; bend?: { x: number; y: number }; kind?: 'straight' | 'ortho' | 'curve'; arrow?: 'end' | 'both' | 'none'; color?: string; width?: number; dash?: boolean }
export interface Stroke { points: [number, number][]; color: string; w: number; hl?: boolean }
export type BlockType = 'h1' | 'h2' | 'h3' | 'h4' | 'text' | 'bullet' | 'numbered' | 'todo' | 'divider' | 'toggle' | 'callout'
export type CalloutTone = 'info' | 'key' | 'warn'
export interface Block { id: number; type: BlockType; text: string; bold?: boolean; italic?: boolean; done?: boolean; align?: 'left' | 'center' | 'right'; collapsed?: boolean; children?: Block[]; tone?: CalloutTone; color?: string; fs?: number }
export type PageRole = 'cover' | 'toc' | 'content' | 'back'
export interface DeckTocItem { sectionId: string; markN?: string; title: string; summary?: string; pageNo: string }
export interface Page { id: number; cardKey: string; fields: Record<string, string>; free: boolean; els: FreeEl[]; conns: Conn[]; strokes: Stroke[]; paper?: PaperType; blocks?: Block[]; detached?: string[]; bg?: string; contd?: boolean; trans?: string; role?: PageRole; sectionId?: string; pageNo?: string; tocItems?: DeckTocItem[];
  /** 이 쪽이 **마인드맵에서 펼쳐진 것**이면 중심 도형의 id.
   *
   *  펼치고 나면 그냥 도형과 선이라 「이게 마인드맵이었다」를 알 길이 없다.
   *  그래서 「＋ 가지」를 어디에 붙일지도 모른다. 중심 id 하나만 적어 두면
   *  **표시와 붙일 자리**를 한꺼번에 해결한다. */
  mindmapCenter?: number
  /** 이 쪽이 **트리에서 펼쳐진 것**이면 뿌리 도형의 id. 마인드맵의 `mindmapCenter` 와 같은 몫이다.
   *  방향을 바꿀 때 자르지 말고 다시 앉혀야 하는지를 이것으로 안다. */
  treeRoot?: number
  /** **트리에 속한 상자 명단**(뿌리 목록이 아니다). 선이 하나도 없는 외톨이 —
   *  「＋ 새 뿌리」로 갓 만든 것 — 를 트리 안에 붙들어 두는 몫만 한다.
   *  누가 뿌리인지는 여기가 아니라 **선**이 정한다(treeOps.treeShape). */
  treeRoots?: number[]
  /** 그 트리가 왼→오른(LR)인가 위→아래(TD)인가. 다시 앉힐 때 필요하다. */
  treeDir?: 'LR' | 'TD'
  /** 트리를 만든 **머메이드 원문.** 그림을 고쳐도 이건 안 고친다 —
   *  「처음에 무엇을 쳤는가」의 기록이고, 다시 펼치고 싶을 때 되돌아갈 자리다. */
  treeSrc?: string }
export interface CanvasData { els: FreeEl[]; conns: Conn[]; strokes: Stroke[]; detached?: string[] }
export interface BuilderState {
  title: string; orientation: Orientation; font: string; size: SizePreset; theme: ThemeName
  pages: Page[]; selectedPageId: number | null
  addCard: (cardKey: string, count?: number, src?: string) => void
  updateField: (pageId: number, key: string, value: string) => void
  removePage: (pageId: number) => void
  movePage: (pageId: number, dir: number) => void
  /** 드래그 재정렬용: from 위치의 페이지를 빼서 to 위치에 끼워 넣는다(스왑 아님). */
  reorderPage: (from: number, to: number) => void
  duplicatePage: (pageId: number) => void
  selectPage: (pageId: number) => void
  setTitle: (t: string) => void
  setOrientation: (o: Orientation) => void
  /** 방향을 바꾸며 끌어들인 것을 **통째로 되돌린다.**
   *  ⌘Z 는 **지금 쪽 하나만** 되돌린다(이력이 쪽별이다) — 방향은 모든 쪽을 건드리므로
   *  그걸로는 부족하다. 그래서 되돌릴 것을 따로 들고 있다가 한 번에 돌려놓는다. */
  undoFit: () => void
  /** 방금 「다음 장에 이어 적기」로 생긴 쪽을 **통째로 없던 일로.**
   *  ⌘Z 는 쪽 안의 요소만 되돌린다(이력이 쪽별이다) — 쪽이 생긴 것은 못 지운다. */
  undoContinue: () => void
  setFont: (f: string) => void
  setSize: (s: SizePreset) => void
  setTheme: (t: ThemeName) => void
  toggleFree: (pageId: number) => void
  /** 카드로 만들어 둔 마인드맵을 옮길 수 있는 요소들로 펼친다(되돌리기 가능). */
  expandMindmap: (pageId: number) => void
  addEl: (pageId: number, el: FreeEl) => void
  /** 표를 다음 장으로 잇는다. 새 쪽과 새 조각을 만들고 그 쪽으로 옮겨 간다.
   *  만들어진 것을 돌려준다 — 부르는 쪽이 새 조각을 골라 줘야 사용자가 바로 이어 쓴다. */
  continueTable: (pageId: number, elId: number, headRows: number) =>
    { pageId: number; elId: number } | null
  updateEl: (pageId: number, elId: number, patch: Partial<FreeEl>) => void
  removeEl: (pageId: number, elId: number) => void
  addConn: (pageId: number, conn: Conn) => void
  addStroke: (pageId: number, stroke: Stroke) => void
  reorderEl: (pageId: number, elId: number, toFront: boolean) => void
  setCanvas: (pageId: number, data: CanvasData) => void
  /** 트리에 상자 하나를 붙인다(①).
   *  `kind`: 자식 · 형제 · 새 뿌리. **뿌리를 골라 「형제」를 부르면 새 뿌리가 된다** —
   *  단추 글자도 그때 「＋ 새 뿌리」로 바뀐다(RightPanel). 붙인 뒤 트리를 다시 앉힌다. */
  treeAdd: (pageId: number, elId: number | null, kind: 'child' | 'sibling' | 'root') => void
  /** 가지를 접거나 편다(②). 접힘은 `folded`, 안 보임은 매번 다시 계산한다. */
  treeFold: (pageId: number, elId: number) => void
  updateConn: (pageId: number, index: number, bend: { x: number; y: number }) => void
  patchConn: (pageId: number, index: number, patch: Partial<Conn>) => void
  removeConn: (pageId: number, index: number) => void
  setBlocks: (pageId: number, blocks: Block[]) => void
  setElBlocks: (pageId: number, elId: number, blocks: Block[]) => void
  moveEls: (pageId: number, moves: { id: number; x: number; y: number }[]) => void
  updateEls: (pageId: number, ids: number[], patch: Partial<FreeEl>) => void
  transformEls: (pageId: number, items: { id: number; x?: number; y?: number; w?: number; h?: number; rot?: number }[]) => void
  detachField: (pageId: number, key: string, box: { x: number; y: number; w: number; h: number; text: string; fs: number; tcolor?: string; bold?: boolean; align?: 'left' | 'center' | 'right' }) => number
  detachBox: (pageId: number, key: string, box: { x: number; y: number; w: number; h: number; text: string; fs: number; tcolor?: string; bold?: boolean; align?: 'left' | 'center' | 'right'; fill?: string; borderColor?: string; borderWidth?: number }) => number
  groupEls: (pageId: number, ids: number[]) => void
  ungroupEls: (pageId: number, ids: number[]) => void
  setPageBg: (pageId: number, bg: string) => void
  setPaper: (pageId: number, paper: PaperType) => void
  setPageTrans: (pageId: number, trans: string) => void
  importDoc: (doc: ImportedDoc) => void
  importDeckSlides: (urls: string[], title: string) => void
  importPages: (pages: Page[], title?: string) => void
  applyPlan: (plan: BookPlan) => void
  applyPageEdits: (edits: PageEdit[], adds?: PageAdd[]) => void
  polishAll: () => void
  setCard: (pageId: number, cardKey: string, fields: Record<string, string>) => void
  summarizeNotes: () => Promise<{ ok: boolean; error?: string; count?: number }>
}
let blockUid = 1
export const newBlock = (type: BlockType = 'text', text = ''): Block => ({ id: blockUid++, type, text })
let uid = 1
let elUid = 100000
// 자유 캔버스 요소 id 단일 발급원(mkFreeEl 포함 모두 여기서). reseedUids가 로드 때 이 카운터를 끌어올림.
export function nextElId(): number { return elUid++ }
// 새 페이지의 필드는 빈칸으로 시작한다.
// registry 의 example 을 그대로 넣으면 같은 카드를 두 번 추가했을 때 글자까지 똑같은 페이지가 나오고,
// 지우지 않은 예시 문구가 그대로 내보내기까지 따라간다.
// 빈칸은 PageView 의 data-ph 자리표시자가 안내하므로 화면이 비어 보이지도 않는다.
// (AI 경로 buildPlanPage 도 같은 이유로 빈칸을 쓴다 — 정책을 하나로 맞춘 것)
/** 방금 방향을 바꾸며 끌어들인 것. 「되돌리기」 한 번을 위해서만 들고 있는다 —
 *  다음 번 끌어들임이 덮어쓴다. 쌓아 두면 언제 적 것인지 아무도 모른다.
 *
 *  `after` 는 **그때 우리가 내놓은 쪽 목록 그 자체**다. 방향을 되돌릴 때 지금 쪽이
 *  아직 그 객체면 「그 사이 아무도 안 고쳤다」는 뜻이라, 자르지 말고 되돌리면 된다(ㄴ).
 *  한 글자만 고쳐도 새 객체가 되므로 **어림짐작이 아니라 확실하다.** */
let lastFit: { pages: Page[]; orientation: Orientation; after: Page[] } | null = null

/** 방금 이어 적기로 생긴 쪽. 되돌리기 **한 번**을 위해서만 들고 있는다. */
let lastCont: { pages: Page[]; selectedPageId: number | null } | null = null

/** **자료를 바꿔 열 때 비운다.**
 *
 *  `history.ts` 가 바로 이 이유로 `resetHistory()` 를 반드시 부르라고 적어 두었는데,
 *  위의 둘에는 그걸 안 붙였었다(2026-09-14에 찾음). 들고 있는 것이 **앞 자료의 쪽**이라,
 *  남아 있으면 다음 자료에 앞 자료의 쪽을 덮어쓸 수 있다. */
export function resetFitUndo(): void { lastFit = null; lastCont = null }

function defaultsFor(cardKey: string): Record<string, string> {
  const c = cardByKey(cardKey); const f: Record<string, string> = {}
  if (c) c.fields.forEach((fd) => { f[fd.key] = '' })
  return f
}
// (G4/G5 공유) planner/editor 의 페이지 스펙 한 장을 실제 Page 로 만든다.
// 미채운 필드는 예시 대신 빈칸(근거 없는 수치/문구 주입 방지). note 는 제목 블록으로.
function buildPlanPage(sp: PlanPage | PageAdd): Page {
  const cardKey = sp.cardKey
  const given = sp.fields || {}
  if (cardKey === 'note') {
    const title = (given.title || '새 페이지').toString()
    return { id: uid++, cardKey: 'note', fields: {}, free: false, els: [], conns: [], strokes: [], blocks: [{ ...newBlock('h1', title), bold: true }], bg: '' }
  }
  const empties: Record<string, string> = {}
  const c = cardByKey(cardKey)
  if (c) c.fields.forEach((fd) => { empties[fd.key] = '' })
  const fields = { ...empties, ...given }
  return { id: uid++, cardKey, fields, free: false, els: [], conns: [], strokes: [] }
}
const isPlannablePage = (cardKey: string) => cardKey === 'note' || cardKey === 'slide' || !!cardByKey(cardKey)
const mapPage = (pages: Page[], id: number, fn: (p: Page) => Page) => pages.map((p) => (p.id === id ? fn(p) : p))
function clonePageWithNewIds(src: Page): Page {
  const copy: Page = JSON.parse(JSON.stringify(src))
  copy.id = uid++
  const idMap = new Map<number, number>()
  copy.els = copy.els.map((el) => {
    const nextId = elUid++
    idMap.set(el.id, nextId)
    return { ...el, id: nextId }
  })
  copy.conns = copy.conns.flatMap((conn) => {
    const from = idMap.get(conn.from)
    const to = idMap.get(conn.to)
    return from && to ? [{ ...conn, from, to }] : []
  })
  return copy
}
// 저장된 프로젝트를 로드할 때, 그 안의 id들이 모듈 카운터(uid/elUid/blockUid)보다 크면
// 새로 추가하는 요소가 기존 id와 충돌한다. 로드 직후 카운터를 최대 id 다음으로 끌어올린다.
export function reseedUids(pages: Page[]): void {
  let maxP = 0, maxEl = 0, maxBlk = 0
  const walk = (bs?: Block[]) => { for (const b of bs || []) { if (b.id > maxBlk) maxBlk = b.id; walk(b.children) } }
  for (const p of pages || []) {
    if (p.id > maxP) maxP = p.id
    for (const e of p.els || []) { if (e.id > maxEl) maxEl = e.id; walk(e.blocks) }
    walk(p.blocks)
  }
  if (maxP >= uid) uid = maxP + 1
  if (maxEl >= elUid) elUid = maxEl + 1
  if (maxBlk >= blockUid) blockUid = maxBlk + 1
  // 기존 데이터 치유: 한 페이지 안에서 중복된 요소 id는 새 id로 분리(2번째부터). 겹쳐 쌓이던 도형이 풀린다.
  for (const p of pages || []) {
    const seen = new Set<number>()
    for (const e of p.els || []) {
      if (seen.has(e.id)) e.id = elUid++
      seen.add(e.id)
    }
  }
}

export const useBuilder = create<BuilderState>((set, get) => ({
  title: '유니에버 AX 사업모델', orientation: 'portrait', font: 'auto', size: 'm', theme: 'light',
  pages: [], selectedPageId: null,
  addCard: (cardKey, count, src) => set((s) => {
    // 슬라이드 = 빈 캔버스 편집 페이지(구글 슬라이드식). 블록편집기 없이 요소로 직접 편집.
    if (cardKey === 'slide') {
      const sp: Page = { id: uid++, cardKey: 'slide', fields: {}, free: true, els: [], conns: [], strokes: [], blocks: [], bg: '' }
      return { pages: [...s.pages, sp], selectedPageId: sp.id }
    }
    // 마인드맵은 **카드로 두지 않고 그 자리에서 요소로 펼친다.**
    // 카드로 두면 그림이 SVG 한 덩어리라 가지 하나를 잡을 수가 없다 — 임원진이
    // 「위치 이동 및 사이즈 조정 안됨」이라고 한 것이 이것이다.
    // 자세한 이유는 cards/mindmapEls.ts 의 설명.
    if (cardKey === 'mindmap') {
      const { W, H } = pageSize(s.orientation)
      const { els, conns } = mindmapParts(defaultsFor('mindmap'), W, H, nextElId, count)
      // 중심은 제목 다음(제목이 없으면 첫째)이다 — 가지들이 여기로 이어져 있다.
      const center = conns.length ? conns[0].from : undefined
      const mp: Page = { id: uid++, cardKey: 'slide', fields: {}, free: true,
                         els, conns, strokes: [], blocks: [], bg: '', mindmapCenter: center }
      return { pages: [...s.pages, mp], selectedPageId: mp.id }
    }
    // 트리도 마인드맵처럼 **그 자리에서 요소로 펼친다.** 카드로 두면 SVG 한 덩어리가 되어
    // 상자 하나를 못 잡는다 — 마인드맵을 카드에서 뺀 것과 같은 이유다.
    if (cardKey === 'tree') {
      const { W, H } = pageSize(s.orientation)
      const g = parseMermaid(src || '')
      const dir = g.dir
      // 원하신 방향이 이 종이에 안 들어가면 treeParts 가 눕힌다 — **쓴 방향을 그대로 적는다.**
      const { els, conns, rootId, dir: used } = treeParts(g, W, H, nextElId, dir)
      // **뿌리를 전부 적는다.** 글에 줄기를 둘 쓰면(ㄹ) 부모 없는 상자가 둘 나온다 —
      // 하나만 적어 두면 둘째 줄기를 앱이 모른 채로 남는다(사용자 지적 · 2026-09-15).
      const roots = treeShape(els, conns).roots
      const rs = roots.length ? roots : [rootId]
      // **처음 펼칠 때부터 접어 넣는다**(③). treeParts 는 한 띠만 알아서, 깊은 그림을
      // 넣으면 눕히거나 간격을 줄여 버틴다 — 8레벨짜리를 넣어 보니 위→아래로 누워
      // 여덟 줄이 됐다. 같은 종이 아래 띠로 이어 그리는 편이 읽기 쉽다.
      // **쓴 방향을 준다**(`used` 가 아니라 `dir`). treeParts 는 한 띠만 알아서
      // 깊으면 눕혀 버리는데, 이제는 눕히기 전에 **접어 넣을** 수 있다 —
      // 8레벨을 넣어 보니 위→아래로 누워 여덟 줄이 됐다. 사람이 쓴 방향이 우선이다.
      const laid = layoutTree(els, conns, W, H, dir, rs)
      const tp: Page = { id: uid++, cardKey: 'slide', fields: {}, free: true,
                         els: laid.els, conns: laid.conns, strokes: [], blocks: [], bg: '',
                         treeRoot: rootId, treeRoots: rs,
                         treeDir: laid.dir, treeSrc: src || '' }
      return { pages: [...s.pages, tp], selectedPageId: tp.id }
    }
    const p: Page = { id: uid++, cardKey, fields: defaultsFor(cardKey), free: false, els: [], conns: [], strokes: [] }
    if (cardKey === 'note') {
      // 빈 제목 블록 + 빈 본문 블록. 안내 문구를 값으로 넣으면 페이지마다 같은 글이 박히고,
      // 지우지 않으면 그대로 내보내진다. 사용법 안내는 블록 자리표시자가 맡는다.
      p.blocks = [
        { ...newBlock('h1', ''), bold: true },
        newBlock('text', ''),
      ]
      p.bg = ''
    }
    return { pages: [...s.pages, p], selectedPageId: p.id }
  }),
  updateField: (pageId, key, value) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, fields: { ...p.fields, [key]: value } })) })),
  removePage: (pageId) => set((s) => {
    dropHistory(pageId)
    const at = s.pages.findIndex((p) => p.id === pageId)
    const pages = s.pages.filter((p) => p.id !== pageId)
    // 지운 자리의 다음(없으면 이전) 페이지로. 무조건 1페이지로 튀면 여러 장 정리할 때
    // 매번 원래 보던 곳까지 다시 스크롤해 내려와야 한다.
    let sel = s.selectedPageId
    if (s.selectedPageId === pageId) {
      sel = pages.length ? pages[Math.min(at, pages.length - 1)].id : null
    }
    return { pages, selectedPageId: sel }
  }),
  movePage: (pageId, dir) => set((s) => { const i = s.pages.findIndex((p) => p.id === pageId); const j = i + dir; if (i < 0 || j < 0 || j >= s.pages.length) return {} as Partial<BuilderState>; const pages = [...s.pages]; const tmp = pages[i]; pages[i] = pages[j]; pages[j] = tmp; return { pages } }),
  // movePage 는 인접 스왑이라 임의 위치 이동을 표현할 수 없다(28→3 이면 25번 눌러야 한다).
  // 드래그 재정렬은 잘라내서 끼워 넣는 방식이어야 중간 페이지들의 상대 순서가 유지된다.
  reorderPage: (from, to) => set((s) => {
    const n = s.pages.length
    if (from < 0 || from >= n) return {} as Partial<BuilderState>
    const dest = Math.max(0, Math.min(n - 1, to))
    if (dest === from) return {} as Partial<BuilderState>
    const pages = [...s.pages]
    const [moved] = pages.splice(from, 1)
    pages.splice(dest, 0, moved)
    return { pages }
  }),
  duplicatePage: (pageId) => set((s) => {
    const i = s.pages.findIndex((p) => p.id === pageId); if (i < 0) return {} as Partial<BuilderState>
    const src = s.pages[i]
    const copy = clonePageWithNewIds(src)
    const pages = [...s.pages]; pages.splice(i + 1, 0, copy)
    return { pages, selectedPageId: copy.id }
  }),
  selectPage: (pageId) => set({ selectedPageId: pageId }),
  setTitle: (t) => set({ title: t }),
  // 고른 방향을 기억해 둔다 — **다음에 만드는 이북**이 이 방향으로 시작한다.
  // (임원진 요청: 「한번 선택을 하면 이후 부터는 그 설정으로 계속 생성」)
  // 지금 문서에는 아무 영향이 없다. 기억은 이 브라우저에만 남는다(persistence/prefs.ts).
  setOrientation: (o) => set((s) => {
    // **같은 방향을 다시 누른 것은 아무 일도 아니다.** 이 줄이 없으면 마인드맵이
    // 다시 앉혀지면서(ㄱ) 사람이 맞춰 둔 배치가 까닭 없이 정리된다.
    if (o === s.orientation) return {}
    rememberOrientation(o)

    // ㄴ · **되돌아가는 길.** 바꾸기 전 방향으로 다시 가는데, 그 사이 아무것도 안
    // 고쳤으면 자르지 말고 **그때 쪽을 그대로 돌려준다.** 영상에서 본 것이 이것이다 —
    // 사람은 「가로」를 다시 눌러 되돌리려 했는데 자리가 안 돌아왔다.
    // 그 사이 고쳤으면(=쪽 객체가 바뀌었으면) 손대지 않는다. 사람이 한 일을 덮지 않는다.
    if (lastFit && lastFit.orientation === o && lastFit.after === s.pages) {
      const back = lastFit
      lastFit = null
      window.dispatchEvent(new CustomEvent('ebook:fitted', { detail: { moved: 0, restored: true } }))
      return { orientation: o, pages: back.pages }
    }

    // **종이 밖으로 나가는 것을 안으로 끌어들인다**(사용자 결정 ㄴ, 2026-09-13).
    // 방향은 종이 크기만 바꾸고 요소 좌표는 그대로라, 가로에서 만든 것을 세로로 바꾸면
    // 오른쪽에 있던 것들이 밖에 남는다 — 화면에서는 잘려서 안 보이고 내보내야 안다.
    // **안 나간 것은 안 건드린다.** 비율대로 전부 옮기면 사람이 맞춰 둔 자리가 통째로 흐트러진다.
    // 마인드맵만은 통째로 다시 앉힌다(ㄱ) — 자르면 가지들이 한 줄에 포개진다.
    const { W, H } = pageSize(o)
    const { pages, moved, overlapping } = fitPagesToPaper(s.pages, W, H)
    // **옮긴 게 없으면 들고 있던 것도 비운다.** 안 비우면 오래된 되돌리기가 남아,
    // 그 사이 한 일까지 함께 사라진다.
    lastFit = moved ? { pages: s.pages, orientation: s.orientation, after: pages } : null
    // 조용히 옮기면 「내가 놓은 자리가 아닌데」가 된다. 화면이 한 줄로 알린다.
    // 0개일 때도 쏜다 — 앞서 띄워 둔 알림을 **접으라는 뜻**이다.
    window.dispatchEvent(new CustomEvent('ebook:fitted', { detail: { moved, overlapping } }))
    return { orientation: o, pages }
  }),

  undoContinue: () => set(() => {
    if (!lastCont) return {}
    const back = lastCont
    lastCont = null
    return { pages: back.pages, selectedPageId: back.selectedPageId }
  }),

  undoFit: () => set(() => {
    if (!lastFit) return {}
    const back = lastFit
    lastFit = null
    // 방향도 같이 되돌린다. `setOrientation` 을 거치면 또 끌어들이므로 곧장 넣는다.
    rememberOrientation(back.orientation)
    return { pages: back.pages, orientation: back.orientation }
  }),
  setFont: (fv) => set({ font: fv }),
  setSize: (sz) => set({ size: sz }),
  setTheme: (t) => set({ theme: t }),
  toggleFree: (pageId) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, free: !p.free })) })),

  // 이미 **카드로 만들어 둔** 마인드맵을 요소로 펼친다.
  //
  // 새로 넣는 것은 addCard 가 처음부터 펼쳐서 주지만, 그 전에 만든 자료는 카드 그대로
  // 남아 있다. 열 때 자동으로 바꾸지는 않는다 — 잠금 플래그 하나 떼는 것과 달리
  // **내용을 통째로 다시 쓰는 일**이고, 필드를 정성껏 채워 둔 사람의 자료다.
  // 사람이 누를 때만 바꾸고, 잘못 눌렀으면 실행 취소로 되돌린다.
  expandMindmap: (pageId) => set((s) => {
    const src = s.pages.find((p) => p.id === pageId)
    if (!src || src.cardKey !== 'mindmap') return {} as Partial<BuilderState>
    const { W, H } = pageSize(s.orientation)
    const { els, conns } = mindmapParts(src.fields || {}, W, H, nextElId)
    return { pages: mapPage(s.pages, pageId, (p) => ({
      ...p, cardKey: 'slide', fields: {}, free: true,
      els: [...(p.els || []), ...els], conns: [...(p.conns || []), ...conns],
    })) }
  }),
  addEl: (pageId, el) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: [...p.els, el] })) })),
  // 표가 종이 끝에 닿았을 때 **다음 장에서 이어 적게** 한다.
  //
  // 새 쪽에는 머리글·꼬리말 이름표를 함께 옮겨 붙인다. 표만 덩그러니 있는 장은
  // 2쪽만 펼친 사람에게 「이게 누구 자료인지」를 말해 주지 못한다.
  //
  // 되돌리기 스택은 **쪽마다** 있어서(canvas/history.ts) 쪽이 생기는 일은 ⌘Z 로
  // 되돌아가지 않는다. 대신 되돌릴 길을 다른 데 뒀다 — 이은 조각의 본문 행을 다 지우면
  // 그 조각과 쪽이 함께 사라진다(RightPanel).
  continueTable: (pageId, elId, headRows) => {
    let made: { pageId: number; elId: number } | null = null
    set((s) => {
      const i = s.pages.findIndex((p) => p.id === pageId)
      if (i < 0) return {} as Partial<BuilderState>
      const src = s.pages[i]
      const head = src.els.find((e) => e.id === elId)
      if (!head || head.type !== 'table') return {} as Partial<BuilderState>

      // 같은 슬롯의 조각들을 모아 「앞에 몇 줄이 있었나」를 센다.
      // 쪽 순서대로 훑는다 — 조각은 언제나 앞 쪽에 있는 것이 먼저다.
      let prior = 0
      for (const pg of s.pages) {
        for (const e of pg.els) {
          if (e.type !== 'table' || e.slot !== head.slot) continue
          prior += Math.max(0, (e.rows || 0) - headRows)
        }
      }

      const cont = makeContinuation(head, prior, headRows, head.y, nextElId())
      const labels = src.els
        .filter((e) => e.slot === 'head' || e.slot === 'foot')
        .map((e) => ({ ...e, id: nextElId() }))
      const np: Page = {
        id: uid++, cardKey: 'slide', fields: {}, free: true,
        els: [...labels, cont], conns: [], strokes: [], blocks: [], bg: '',
      }
      const pages = [...s.pages]
      pages.splice(i + 1, 0, np)
      made = { pageId: np.id, elId: cont.id }
      // 저절로 이어질 수도 있으므로(⑤ ㄷ) **되돌릴 것을 남긴다.**
      lastCont = { pages: s.pages, selectedPageId: s.selectedPageId }
      return { pages, selectedPageId: np.id }
    })
    return made
  },
  updateEl: (pageId, elId, patch) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => (e.id === elId ? { ...e, ...patch } : e)) })) })),
  removeEl: (pageId, elId) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.filter((e) => e.id !== elId), conns: p.conns.filter((c) => c.from !== elId && c.to !== elId) })) })),
  addConn: (pageId, conn) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, conns: [...p.conns, conn] })) })),
  addStroke: (pageId, stroke) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, strokes: [...p.strokes, stroke] })) })),
  reorderEl: (pageId, elId, toFront) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => { const i = p.els.findIndex((e) => e.id === elId); if (i < 0) return p; const els = [...p.els]; const e = els.splice(i, 1)[0]; if (toFront) els.push(e); else els.unshift(e); return { ...p, els } }) })),
  setCanvas: (pageId, data) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: data.els, conns: data.conns, strokes: data.strokes, ...(data.detached !== undefined ? { detached: data.detached } : {}) })) })),
  treeAdd: (pageId, elId, kind) => set((s) => {
    const { W, H } = pageSize(s.orientation)
    return { pages: mapPage(s.pages, pageId, (p) => {
      const known = p.treeRoots || (p.treeRoot != null ? [p.treeRoot] : [])
      const shape = treeShape(p.els, p.conns, known)
      const id = nextElId()
      const roots = known.slice()
      const els = [...p.els, newNode(id, kind === 'root' ? '새 뿌리' : '새 상자')]
      const conns = p.conns.slice()
      // 뿌리의 「형제」는 **또 하나의 뿌리**다. 부모가 없으니 이을 데가 없다.
      const parent = kind === 'root' ? null
        : kind === 'child' ? elId
        : (elId != null ? (shape.parent.get(elId) ?? null) : null)
      if (parent == null) {
        roots.push(id)
      } else if (kind === 'sibling' && elId != null) {
        // 고른 상자 **바로 뒤**에 끼운다 — 줄 순서는 선 순서를 따르므로 맨 뒤에 붙이면
        // 새 상자가 형제들 맨 아래로 간다. 사람이 기대하는 자리는 고른 것 바로 밑이다.
        const at = conns.findIndex((c) => c && c.to === elId)
        const nc = { from: parent, to: id, ...TREE_CONN }
        if (at >= 0) conns.splice(at + 1, 0, nc); else conns.push(nc)
      } else {
        conns.push({ from: parent, to: id, ...TREE_CONN })
      }
      const laid = layoutTree(els, conns, W, H, p.treeDir || 'LR', roots)
      return { ...p, els: laid.els, conns: laid.conns, treeDir: laid.dir,
               treeRoots: roots, treeRoot: roots[0] ?? p.treeRoot }
    }) }
  }),
  treeFold: (pageId, elId) => set((s) => {
    const { W, H } = pageSize(s.orientation)
    return { pages: mapPage(s.pages, pageId, (p) => {
      const known = p.treeRoots || (p.treeRoot != null ? [p.treeRoot] : [])
      const els = p.els.map((e) => (e.id === elId ? { ...e, folded: !e.folded } : e))
      const laid = layoutTree(els, p.conns, W, H, p.treeDir || 'LR', known)
      return { ...p, els: laid.els, conns: laid.conns, treeDir: laid.dir }
    }) }
  }),
  updateConn: (pageId, index, bend) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, conns: p.conns.map((c, i) => (i === index ? { ...c, bend } : c)) })) })),
  patchConn: (pageId, index, patch) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, conns: p.conns.map((c, i) => (i === index ? { ...c, ...patch } : c)) })) })),
  removeConn: (pageId, index) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, conns: p.conns.filter((_, i) => i !== index) })) })),
  setBlocks: (pageId, blocks) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, blocks })) })),
  setElBlocks: (pageId, elId, blocks) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => (e.id === elId ? { ...e, blocks } : e)) })) })),
  moveEls: (pageId, moves) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => { const m = moves.find((x) => x.id === e.id); return m ? { ...e, x: m.x, y: m.y } : e }) })) })),
  updateEls: (pageId, ids, patch) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)) })) })),
  transformEls: (pageId, items) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => { const m = items.find((x) => x.id === e.id); if (!m) return e; const patch: Partial<FreeEl> = {}; if (m.x != null) patch.x = m.x; if (m.y != null) patch.y = m.y; if (m.w != null) patch.w = m.w; if (m.h != null) patch.h = m.h; if (m.rot != null) patch.rot = m.rot; return { ...e, ...patch } }) })) })),
  // 카드 항목을 그 자리 그대로 자유 텍스트 객체로 떼어낸다(템플릿에선 그 칸을 숨김).
  detachField: (pageId, key, box) => {
    const id = nextElId()
    const el: FreeEl = { id, type: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text: box.text, color: 'transparent', fs: box.fs, tcolor: box.tcolor, bold: box.bold, align: box.align }
    set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: [...p.els, el], detached: [...(p.detached || []), key] })) }))
    return id
  },
  // 스타일 박스(플로우 단계·dsection 카드·스티키 등)를 배경·테두리째 통째로 떼어낸다.
  detachBox: (pageId, key, box) => {
    const id = nextElId()
    const el: FreeEl = { id, type: 'box', x: box.x, y: box.y, w: box.w, h: box.h, text: box.text, color: box.fill && box.fill !== 'transparent' ? box.fill : 'transparent', fs: box.fs, tcolor: box.tcolor, bold: box.bold, align: box.align, borderColor: box.borderColor, borderWidth: box.borderWidth }
    set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: [...p.els, el], detached: [...(p.detached || []), key] })) }))
    return id
  },
  groupEls: (pageId, ids) => set((s) => { const gid = nextElId(); return { pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => (ids.includes(e.id) ? { ...e, groupId: gid } : e)) })) } }),
  ungroupEls: (pageId, ids) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => (ids.includes(e.id) ? { ...e, groupId: undefined } : e)) })) })),
  setPageBg: (pageId, bg) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, bg })) })),
  setPaper: (pageId, paper) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, paper })) })),
  setPageTrans: (pageId, trans) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, trans })) })),
  importDoc: (doc) => set(() => {
    const mk = (cardKey: string, fields: Record<string, string>, extra: Partial<Page> = {}): Page =>
      ({ id: uid++, cardKey, fields, free: false, els: [], conns: [], strokes: [], ...extra })
    const pages: Page[] = [
      mk('cover', { title: doc.cover.title, sub: doc.cover.sub }),
      mk('toc', {}),
    ]
    for (const s of doc.sections) {
      const blocks: Block[] = [{ ...newBlock('h1', s.title), bold: true }]
      for (const b of s.blocks) { const nb = newBlock(b.type, b.text); if (b.tone) nb.tone = b.tone; blocks.push(nb) }
      pages.push(mk('note', { title: s.title }, { blocks, bg: '', contd: s.contd }))
    }
    return { pages, selectedPageId: pages[0] ? pages[0].id : null, title: doc.title || '가져온 이북' }
  }),
  // 변환한 덱 슬라이드(이미지 URL)를 각각 한 페이지로 캔버스에 채운다.
  importDeckSlides: (urls, title) => set(() => {
    const pages: Page[] = urls.map((u) => ({
      id: uid++, cardKey: 'deckslide', fields: { img: u },
      free: false, els: [], conns: [], strokes: [],
    }))
    return { pages, selectedPageId: pages[0] ? pages[0].id : null, title: title || '가져온 덱' }
  }),
  // 덱 IR을 편집 가능한 요소로 변환해 만든 페이지들을 로드(구글 슬라이드식 편집).
  importPages: (pgs, title) => set((s) => {
    const pages = pgs.map((p) => ({ ...p, id: uid++ }))
    return { pages, selectedPageId: pages[0] ? pages[0].id : null, title: title || s.title }
  }),
  // (G4) 서버 planner 의 BookPlan 을 실제 카드로 변환해 전체 교체(빈 이북에서 한 번에 초안 완성).
  applyPlan: (plan) => set((s) => {
    const valid = (plan.pages || []).filter((sp) => sp && isPlannablePage(sp.cardKey))
    const pages: Page[] = valid.map(buildPlanPage)
    return {
      pages,
      selectedPageId: pages.length ? pages[0].id : null,
      title: plan.title || s.title,
      orientation: plan.orientation || s.orientation,
      theme: plan.theme || s.theme,
    }
  }),
  // (G5) 부분 수정: 대상 페이지의 '주어진 필드 키'만 덮어쓰고(나머지 값·다른 페이지는 그대로), adds 는 끝에 추가.
  // diff 기반 — 되돌리기(undo)로 안전망. edits 는 존재하는 페이지에만 적용(환각 pageId 무시).
  applyPageEdits: (edits, adds) => set((s) => {
    let pages = s.pages
    if (edits && edits.length) {
      const byId = new Map(edits.map((e) => [e.pageId, e.fields || {}]))
      pages = pages.map((p) => (byId.has(p.id) ? { ...p, fields: { ...p.fields, ...byId.get(p.id) } } : p))
    }
    let sel = s.selectedPageId
    if (adds && adds.length) {
      const newPages = adds.filter((a) => a && isPlannablePage(a.cardKey)).map(buildPlanPage)
      if (newPages.length) {
        pages = [...pages, ...newPages]
        sel = newPages[0].id  // 추가한 첫 장으로 이동(결과를 바로 확인)
      }
    }
    return { pages, selectedPageId: sel }
  }),
  polishAll: () => set((s) => ({
    pages: s.pages.map((p) => ({
      ...p,
      fields: Object.fromEntries(Object.entries(p.fields).map(([k, v]) => [k, polish(v)])),
      blocks: p.blocks ? p.blocks.map((b) => ({ ...b, text: polish(b.text) })) : p.blocks,
    })),
  })),
  setCard: (pageId, cardKey, fields) => set((s) => ({
    pages: mapPage(s.pages, pageId, (p) => ({ ...p, cardKey, fields: { ...p.fields, ...fields } })),
  })),
  // (B) 본문(note) 페이지들을 LLM으로 요약해 EVER-PEAK식 카드로 치환. 실패 섹션은 원문 유지(폴백).
  summarizeNotes: async () => {
    const st = get()
    const targets = st.pages.filter((p) => {
      const c = cardByKey(p.cardKey)
      return !(c && c.kind) && !!(p.blocks && p.blocks.length)
    })
    if (!targets.length) return { ok: false, error: '요약할 본문 페이지가 없어요(먼저 HTML을 가져오세요).' }
    const sections = targets.map((p) => ({
      title: p.fields?.title || '',
      text: (p.blocks || []).map((b) => b.text).filter(Boolean).join('\n'),
    }))
    let data: { ok?: boolean; error?: string; results?: Array<{ headline?: string; bullets?: string[] }> }
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      })
      data = await res.json()
    } catch {
      return { ok: false, error: '서버(/api/summarize) 연결 실패 — 서버가 떠 있는지 확인하세요.' }
    }
    if (!data || !data.ok || !data.results) return { ok: false, error: data?.error || '요약 실패' }
    const results = data.results
    let applied = 0
    set((s) => ({
      pages: s.pages.map((p) => {
        const idx = targets.findIndex((t) => t.id === p.id)
        if (idx < 0) return p
        const r = results[idx]
        if (!r || !r.bullets || !r.bullets.length) return p   // 실패 섹션 → 원문(A) 유지
        applied++
        const headline = r.headline || p.fields?.title || '요약'
        const blocks: Block[] = [{ ...newBlock('h1', headline), bold: true }]
        r.bullets.forEach((b) => blocks.push(newBlock('bullet', b)))
        return { ...p, blocks, fields: { ...p.fields, title: headline } }
      }),
    }))
    return applied ? { ok: true, count: applied } : { ok: false, error: 'LLM 응답을 받지 못했어요(연결·모델 설정 확인).' }
  },
}))
