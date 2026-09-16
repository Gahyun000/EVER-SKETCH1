import { create } from 'zustand'
export interface TableSel { elId: number; r0: number; c0: number; r1: number; c1: number }
export type Tool = 'select' | 'box' | 'round' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon' | 'pentagon' | 'parallelogram' | 'chevron' | 'arrowR' | 'arrowL' | 'arrowU' | 'arrowD' | 'star5' | 'star4' | 'banner' | 'callout' | 'text' | 'sticky' | 'image' | 'icon' | 'connect' | 'pen' | 'highlighter' | 'table' | 'wordart' | 'note' | 'eraser'
/**
 * 색 단추가 기억하는 **세 자리.** 파워포인트와 같다 — 글꼴 색 · 채우기 · 윤곽선이
 * 각자 「마지막에 쓴 색」을 들고 있고, 단추를 그냥 누르면 그 색이 바로 칠해진다.
 * 색을 새로 고르는 일보다 **같은 색을 여러 번 쓰는 일**이 훨씬 잦아서다.
 */
export type InkRole = 'text' | 'fill' | 'border'

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
  /** **마지막에 쓴 색**(역할별). 도구줄의 색 단추가 띠로 보여 주고, 그냥 누르면 이 색을 칠한다. */
  inkText: string
  inkFill: string
  inkBorder: string
  setInk: (role: InkRole, c: string) => void
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
  inkText: '#1a1a1a',
  inkFill: '#eaf0ff',
  inkBorder: '#5b6270',
  setInk: (role, c) => set(role === 'text' ? { inkText: c } : role === 'fill' ? { inkFill: c } : { inkBorder: c }),
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
