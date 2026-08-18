import { create } from 'zustand'
import { cardByKey } from '../cards/registry'
import type { ImportedDoc } from '../import/htmlImport'
import { polish } from '../builder/polish'
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
export interface FreeEl { id: number; type: string; x: number; y: number; w: number; h: number; text: string; color: string; fs: number; src?: string; bold?: boolean; tcolor?: string; rows?: number; cols?: number; cells?: string[][]; merges?: { r: number; c: number; rs: number; cs: number }[]; calign?: Record<string, 'left' | 'center' | 'right'>; headRow?: boolean; wa?: boolean; italic?: boolean; underline?: boolean; rot?: number; align?: 'left' | 'center' | 'right'; gotoSeq?: number; blocks?: Block[]; flipH?: boolean; flipV?: boolean; opacity?: number; shadow?: boolean; reflect?: boolean; locked?: boolean; groupId?: number; borderColor?: string; borderWidth?: number }
export interface Conn { from: number; to: number; bend?: { x: number; y: number }; kind?: 'straight' | 'ortho' | 'curve'; arrow?: 'end' | 'both' | 'none'; color?: string; width?: number; dash?: boolean }
export interface Stroke { points: [number, number][]; color: string; w: number; hl?: boolean }
export type BlockType = 'h1' | 'h2' | 'h3' | 'h4' | 'text' | 'bullet' | 'numbered' | 'todo' | 'divider' | 'toggle' | 'callout'
export type CalloutTone = 'info' | 'key' | 'warn'
export interface Block { id: number; type: BlockType; text: string; bold?: boolean; italic?: boolean; done?: boolean; align?: 'left' | 'center' | 'right'; collapsed?: boolean; children?: Block[]; tone?: CalloutTone; color?: string; fs?: number }
export type PageRole = 'cover' | 'toc' | 'content' | 'back'
export interface DeckTocItem { sectionId: string; markN?: string; title: string; summary?: string; pageNo: string }
export interface Page { id: number; cardKey: string; fields: Record<string, string>; free: boolean; els: FreeEl[]; conns: Conn[]; strokes: Stroke[]; paper?: PaperType; blocks?: Block[]; detached?: string[]; bg?: string; contd?: boolean; trans?: string; role?: PageRole; sectionId?: string; pageNo?: string; tocItems?: DeckTocItem[] }
export interface CanvasData { els: FreeEl[]; conns: Conn[]; strokes: Stroke[]; detached?: string[] }
export interface BuilderState {
  title: string; orientation: Orientation; font: string; size: SizePreset; theme: ThemeName
  pages: Page[]; selectedPageId: number | null
  addCard: (cardKey: string) => void
  updateField: (pageId: number, key: string, value: string) => void
  removePage: (pageId: number) => void
  movePage: (pageId: number, dir: number) => void
  duplicatePage: (pageId: number) => void
  selectPage: (pageId: number) => void
  setTitle: (t: string) => void
  setOrientation: (o: Orientation) => void
  setFont: (f: string) => void
  setSize: (s: SizePreset) => void
  setTheme: (t: ThemeName) => void
  toggleFree: (pageId: number) => void
  addEl: (pageId: number, el: FreeEl) => void
  updateEl: (pageId: number, elId: number, patch: Partial<FreeEl>) => void
  removeEl: (pageId: number, elId: number) => void
  addConn: (pageId: number, conn: Conn) => void
  addStroke: (pageId: number, stroke: Stroke) => void
  reorderEl: (pageId: number, elId: number, toFront: boolean) => void
  setCanvas: (pageId: number, data: CanvasData) => void
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
function defaultsFor(cardKey: string): Record<string, string> {
  const c = cardByKey(cardKey); const f: Record<string, string> = {}
  if (c) c.fields.forEach((fd) => { f[fd.key] = fd.example ?? '' })
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
  addCard: (cardKey) => set((s) => {
    // 슬라이드 = 빈 캔버스 편집 페이지(구글 슬라이드식). 블록편집기 없이 요소로 직접 편집.
    if (cardKey === 'slide') {
      const sp: Page = { id: uid++, cardKey: 'slide', fields: {}, free: true, els: [], conns: [], strokes: [], blocks: [], bg: '' }
      return { pages: [...s.pages, sp], selectedPageId: sp.id }
    }
    const p: Page = { id: uid++, cardKey, fields: defaultsFor(cardKey), free: false, els: [], conns: [], strokes: [] }
    if (cardKey === 'note') {
      p.blocks = [
        { ...newBlock('h1', '새 페이지 제목'), bold: true },
        newBlock('text', '여기에 내용을 적어보세요. ‘/’로 블록을 추가하고, ‘>’로 접히는 토글을 만들 수 있어요.'),
      ]
      p.bg = ''
    }
    return { pages: [...s.pages, p], selectedPageId: p.id }
  }),
  updateField: (pageId, key, value) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, fields: { ...p.fields, [key]: value } })) })),
  removePage: (pageId) => set((s) => { const pages = s.pages.filter((p) => p.id !== pageId); const sel = s.selectedPageId === pageId ? (pages.length ? pages[0].id : null) : s.selectedPageId; return { pages, selectedPageId: sel } }),
  movePage: (pageId, dir) => set((s) => { const i = s.pages.findIndex((p) => p.id === pageId); const j = i + dir; if (i < 0 || j < 0 || j >= s.pages.length) return {} as Partial<BuilderState>; const pages = [...s.pages]; const tmp = pages[i]; pages[i] = pages[j]; pages[j] = tmp; return { pages } }),
  duplicatePage: (pageId) => set((s) => {
    const i = s.pages.findIndex((p) => p.id === pageId); if (i < 0) return {} as Partial<BuilderState>
    const src = s.pages[i]
    const copy = clonePageWithNewIds(src)
    const pages = [...s.pages]; pages.splice(i + 1, 0, copy)
    return { pages, selectedPageId: copy.id }
  }),
  selectPage: (pageId) => set({ selectedPageId: pageId }),
  setTitle: (t) => set({ title: t }),
  setOrientation: (o) => set({ orientation: o }),
  setFont: (fv) => set({ font: fv }),
  setSize: (sz) => set({ size: sz }),
  setTheme: (t) => set({ theme: t }),
  toggleFree: (pageId) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, free: !p.free })) })),
  addEl: (pageId, el) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: [...p.els, el] })) })),
  updateEl: (pageId, elId, patch) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.map((e) => (e.id === elId ? { ...e, ...patch } : e)) })) })),
  removeEl: (pageId, elId) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: p.els.filter((e) => e.id !== elId), conns: p.conns.filter((c) => c.from !== elId && c.to !== elId) })) })),
  addConn: (pageId, conn) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, conns: [...p.conns, conn] })) })),
  addStroke: (pageId, stroke) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, strokes: [...p.strokes, stroke] })) })),
  reorderEl: (pageId, elId, toFront) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => { const i = p.els.findIndex((e) => e.id === elId); if (i < 0) return p; const els = [...p.els]; const e = els.splice(i, 1)[0]; if (toFront) els.push(e); else els.unshift(e); return { ...p, els } }) })),
  setCanvas: (pageId, data) => set((s) => ({ pages: mapPage(s.pages, pageId, (p) => ({ ...p, els: data.els, conns: data.conns, strokes: data.strokes, ...(data.detached !== undefined ? { detached: data.detached } : {}) })) })),
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
      title: p.fields.title || '',
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
        const headline = r.headline || p.fields.title || '요약'
        const blocks: Block[] = [{ ...newBlock('h1', headline), bold: true }]
        r.bullets.forEach((b) => blocks.push(newBlock('bullet', b)))
        return { ...p, blocks, fields: { ...p.fields, title: headline } }
      }),
    }))
    return applied ? { ok: true, count: applied } : { ok: false, error: 'LLM 응답을 받지 못했어요(연결·모델 설정 확인).' }
  },
}))
