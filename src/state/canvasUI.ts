import { create } from 'zustand'
export interface TableSel { elId: number; r0: number; c0: number; r1: number; c1: number }
export type Tool = 'select' | 'box' | 'round' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon' | 'pentagon' | 'parallelogram' | 'chevron' | 'arrowR' | 'arrowL' | 'arrowU' | 'arrowD' | 'star5' | 'star4' | 'banner' | 'callout' | 'text' | 'sticky' | 'image' | 'icon' | 'connect' | 'pen' | 'highlighter' | 'table' | 'wordart' | 'note' | 'eraser'
export interface CanvasUI {
  tool: Tool; selEl: number | null; selEls: number[]; connSrc: number | null; selConn: number | null; tableSel: TableSel | null; lastColor: string
  setTool: (t: Tool) => void
  setSel: (id: number | null) => void
  toggleSel: (id: number) => void
  setSelMany: (ids: number[]) => void
  setConnSrc: (id: number | null) => void
  setSelConn: (i: number | null) => void
  setTableSel: (t: TableSel | null) => void
  setColor: (c: string) => void
  spell: boolean
  setSpell: (b: boolean) => void
  penWidth: number
  penColor: string
  hlColor: string
  hlWidth: number
  eraserWidth: number
  setPenWidth: (w: number) => void
  setPenColor: (c: string) => void
  setHlColor: (c: string) => void
  setHlWidth: (w: number) => void
  setEraserWidth: (w: number) => void
  pickerOpen: boolean
  openPicker: () => void
  closePicker: () => void
}
export const useCanvasUI = create<CanvasUI>((set) => ({
  tool: 'select', selEl: null, selEls: [], connSrc: null, selConn: null, tableSel: null, lastColor: '#2f6df6',
  setTool: (t) => set({ tool: t, connSrc: null }),
  setSel: (id) => set({ selEl: id, selEls: id == null ? [] : [id], selConn: null, tableSel: null }),
  // selConn/tableSel 을 함께 비우는 건 setSel/setSelMany 와 같아야 한다. 여기만 빠져 있으면
  // Shift+클릭 뒤 Delete 때 요소 삭제와 연결선 삭제 핸들러가 동시에 돌아 엉뚱한 선이 지워진다.
  toggleSel: (id) => set((s) => { const has = s.selEls.includes(id); const next = has ? s.selEls.filter((x) => x !== id) : [...s.selEls, id]; return { selEls: next, selEl: next.length ? next[next.length - 1] : null, selConn: null, tableSel: null } }),
  setSelMany: (ids) => set({ selEls: ids, selEl: ids.length ? ids[ids.length - 1] : null, selConn: null, tableSel: null }),
  setConnSrc: (id) => set({ connSrc: id }),
  setSelConn: (i) => set(() => (i == null ? { selConn: null } : { selConn: i, selEl: null, selEls: [], tableSel: null })),
  setTableSel: (t) => set({ tableSel: t }),
  setColor: (c) => set({ lastColor: c }),
  spell: true,
  setSpell: (b) => set({ spell: b }),
  penWidth: 2.5,
  penColor: '#111318',
  hlColor: '#ffd600',
  hlWidth: 16,
  eraserWidth: 22,
  setPenWidth: (w) => set({ penWidth: w }),
  setPenColor: (c) => set({ penColor: c }),
  setHlColor: (c) => set({ hlColor: c }),
  setHlWidth: (w) => set({ hlWidth: w }),
  setEraserWidth: (w) => set({ eraserWidth: w }),
  pickerOpen: false,
  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
}))
