import type { FreeEl } from '../state/store'
import { newBlock, nextElId } from '../state/store'
interface Def { w: number; h: number; text: string; color: string; fs: number }
const DEFS: Record<string, Def> = {
  box: { w: 120, h: 56, text: '내용', color: '#eaf0ff', fs: 12 },
  round: { w: 120, h: 56, text: '내용', color: '#eaf0ff', fs: 12 },
  ellipse: { w: 96, h: 96, text: '', color: '#eaf0ff', fs: 12 },
  diamond: { w: 104, h: 88, text: '분기', color: '#eef1f6', fs: 12 },
  triangle: { w: 100, h: 88, text: '', color: '#dceeb1', fs: 12 },
  hexagon: { w: 116, h: 76, text: '', color: '#e7e3fb', fs: 12 },
  pentagon: { w: 100, h: 92, text: '', color: '#cdeacf', fs: 12 },
  parallelogram: { w: 124, h: 60, text: '', color: '#eaf0ff', fs: 12 },
  chevron: { w: 128, h: 56, text: '단계', color: '#eaf0ff', fs: 12 },
  arrowR: { w: 128, h: 64, text: '', color: '#dceeb1', fs: 12 },
  arrowL: { w: 128, h: 64, text: '', color: '#dceeb1', fs: 12 },
  arrowU: { w: 72, h: 110, text: '', color: '#dceeb1', fs: 12 },
  arrowD: { w: 72, h: 110, text: '', color: '#dceeb1', fs: 12 },
  star5: { w: 96, h: 96, text: '', color: '#fdf3b6', fs: 12 },
  star4: { w: 96, h: 96, text: '', color: '#fdf3b6', fs: 12 },
  banner: { w: 140, h: 52, text: '리본', color: '#f4d2c1', fs: 12 },
  callout: { w: 128, h: 84, text: '말풍선', color: '#ffffff', fs: 12 },
  text: { w: 130, h: 34, text: '텍스트', color: 'transparent', fs: 12 },
  sticky: { w: 104, h: 88, text: '메모', color: '#fdf3b6', fs: 12 },
  image: { w: 120, h: 80, text: '이미지', color: '#f2f5fa', fs: 12 },
  icon: { w: 46, h: 46, text: '★', color: 'transparent', fs: 26 },
  table: { w: 220, h: 96, text: '', color: 'transparent', fs: 12 },
  wordart: { w: 190, h: 54, text: '글맵시', color: 'transparent', fs: 30 },
  note: { w: 280, h: 120, text: '', color: '#ffffff', fs: 13 },
}
export function mkFreeEl(type: string, x: number, y: number): FreeEl {
  const d = DEFS[type] || DEFS.box
  const el: FreeEl = { id: nextElId(), type, x, y, w: d.w, h: d.h, text: d.text, color: d.color, fs: d.fs }
  if (type === 'table') { el.rows = 2; el.cols = 2; el.cells = [['제목', '제목'], ['내용', '내용']] }
  if (type === 'wordart') { el.wa = true; el.bold = true; el.tcolor = '#2a78d6' }
  if (type === 'note') { el.blocks = [newBlock('text', '')] }
  return el
}
export const FCOLORS = ['#eaf0ff', '#dceeb1', '#f4d2c1', '#e7e3fb', '#cdeacf', '#fdf3b6', '#ffffff', '#111318']
const undoStacks = new Map<number, string[]>()
const redoStacks = new Map<number, string[]>()
function push(map: Map<number, string[]>, pageId: number, snap: string) { const a = map.get(pageId) || []; a.push(snap); if (a.length > 60) a.shift(); map.set(pageId, a) }
function pop(map: Map<number, string[]>, pageId: number): string | null { const a = map.get(pageId); return a && a.length ? (a.pop() as string) : null }
// 새 작업: undo에 쌓고 redo는 무효화
export function pushSnap(pageId: number, snap: string) { push(undoStacks, pageId, snap); redoStacks.delete(pageId) }
export function popSnap(pageId: number): string | null { return pop(undoStacks, pageId) }
// redo용: redo가 undo로 되돌릴 수 있도록 무효화 없이 쌓기
export function pushUndoRaw(pageId: number, snap: string) { push(undoStacks, pageId, snap) }
export function pushRedo(pageId: number, snap: string) { push(redoStacks, pageId, snap) }
export function popRedo(pageId: number): string | null { return pop(redoStacks, pageId) }
export function canUndo(pageId: number): boolean { const a = undoStacks.get(pageId); return !!(a && a.length) }
export function canRedo(pageId: number): boolean { const a = redoStacks.get(pageId); return !!(a && a.length) }
