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
// 오려 만든 갈래 목록은 **꼭짓점이 있는 곳**에서 온다 — 목록을 따로 적으면 어긋난다.
export { CLIPPED } from './shapePaths'

export const FCOLORS = ['#eaf0ff', '#dceeb1', '#f4d2c1', '#e7e3fb', '#cdeacf', '#fdf3b6', '#ffffff', '#111318']

/**
 * **채우기색을 안 쓰는 갈래.**
 *
 * 글상자·아이콘·글맵시·그림·메모는 속이 없고, 표는 **칸마다** 색이 따로 있다
 * (`cbg`) — 표 전체를 한 색으로 칠하는 일은 없다.
 *
 * 2026-09-16 에 여기로 올렸다. 전에는 캔버스 안(`FreeLayer`)에만 있었는데, 도구줄에도
 * 채우기가 생기면서 **같은 목록이 두 벌**이 될 참이었다. 두 벌은 언젠가 어긋나고,
 * 그러면 한쪽에서만 칠해지는 갈래가 생긴다.
 */
export const NO_FILL = ['text', 'icon', 'wordart', 'image', 'note', 'table']

// 되돌리기 스택은 canvas/history.ts 로 옮겼다(store.ts 와의 순환 참조를 피하기 위해).
// 기존 import 경로를 유지하기 위해 여기서 다시 내보낸다.
export {
  pushSnap, popSnap, pushUndoRaw, pushRedo, popRedo,
  canUndo, canRedo, resetHistory, dropHistory,
} from './history'
