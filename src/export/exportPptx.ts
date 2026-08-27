import PptxGenJS from 'pptxgenjs'
import type { Page, FreeEl } from '../state/store'
import { saveWithPicker } from './exportFiles'
import { coveredSet, mergeCovering } from '../canvas/tableOps'

const PXIN = 96  // px per inch(기준)

// rgb()/rgba()/#hex → 대문자 6자리 hex. 완전투명이면 undefined.
function rgbToHex(c?: string): string | undefined {
  if (!c) return undefined
  c = c.trim()
  if (c === 'transparent') return undefined
  if (c.startsWith('#')) {
    if (c.length === 4) return (c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase()
    if (c.length >= 7) return c.slice(1, 7).toUpperCase()
    return undefined
  }
  const m = c.match(/rgba?\(([^)]+)\)/i)
  if (!m) return undefined
  const p = m[1].split(',').map((s) => parseFloat(s))
  if (p.length >= 4 && p[3] === 0) return undefined
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, '0')
  return (h(p[0]) + h(p[1]) + h(p[2])).toUpperCase()
}

// 우리 도형 타입 → pptx 프리셋 도형 이름
const SHAPE: Record<string, string> = {
  box: 'rect', round: 'roundRect', ellipse: 'ellipse', diamond: 'diamond', triangle: 'triangle',
  hexagon: 'hexagon', pentagon: 'pentagon', parallelogram: 'parallelogram', chevron: 'chevron',
  arrowR: 'rightArrow', arrowL: 'leftArrow', arrowU: 'upArrow', arrowD: 'downArrow',
  star5: 'star5', star4: 'star4', banner: 'ribbon2', callout: 'wedgeRectCallout', sticky: 'rect',
}

function edge(b: FreeEl, tx: number, ty: number): { x: number; y: number } {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const dx = tx - cx, dy = ty - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const sc = 1 / Math.max(Math.abs(dx) / (b.w / 2), Math.abs(dy) / (b.h / 2))
  return { x: cx + dx * sc, y: cy + dy * sc }
}

// 편집 가능한 .pptx 생성(하이브리드): 자유요소는 모델→도형/글자/표/이미지,
// 카드 글자·박스는 화면 DOM에서 측정, 연결선은 라인. 펜 손그림/마인드맵 라인은 생략.
export async function exportPptx(pages: Page[], opts: { title: string; W: number; H: number }): Promise<'saved' | 'canceled'> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pptx = new PptxGenJS()
  const Win = opts.W / PXIN, Hin = opts.H / PXIN
  pptx.defineLayout({ name: 'EV', width: Win, height: Hin })
  pptx.layout = 'EV'
  const ST = pptx.ShapeType as any

  for (const p of pages) {
    const node = document.getElementById('export-page-' + p.id) as HTMLElement | null
    const slide = pptx.addSlide()
    const nr = node ? node.getBoundingClientRect() : null
    const sx = nr && nr.width ? Win / nr.width : 1 / PXIN
    const sy = nr && nr.height ? Hin / nr.height : 1 / PXIN
    // 배경: export-page 래퍼는 투명, 실제 배경(표지 다크 등)은 안쪽 페이지 요소에 있다 →
    // 페이지 전체(80%↑)를 덮으면서 배경색이 있는 요소 중 가장 큰 걸 슬라이드 배경으로.
    if (node && nr) {
      let bgHex = rgbToHex(getComputedStyle(node).backgroundColor)
      let bestArea = 0
      node.querySelectorAll<HTMLElement>('*').forEach((c) => {
        if (c.closest('.freelayer')) return
        const hx = rgbToHex(getComputedStyle(c).backgroundColor)
        if (!hx) return
        const r = c.getBoundingClientRect()
        const area = (r.width * r.height) / (nr.width * nr.height)
        if (area >= 0.8 && area > bestArea) { bestArea = area; bgHex = hx }
      })
      if (bgHex) slide.background = { color: bgHex }
    }

    // ── 카드 템플릿 수집(자유레이어 제외) ──
    if (node && nr) {
      const inFree = (el: Element) => !!el.closest('.freelayer')
      // 배경 박스(카드/스티키/플로우 등)
      node.querySelectorAll<HTMLElement>('*').forEach((elm) => {
        if (inFree(elm)) return
        const cs = getComputedStyle(elm)
        if (cs.visibility === 'hidden') return
        const bg = rgbToHex(cs.backgroundColor)
        if (!bg) return
        const r = elm.getBoundingClientRect()
        if (!r.width || !r.height) return
        const area = (r.width * r.height) / (nr.width * nr.height)
        if (area < 0.004 || area > 0.45) return
        const bw = parseFloat(cs.borderTopWidth) || 0
        const hasBorder = bw > 0 || parseFloat(cs.borderTopLeftRadius) > 0
        if (!hasBorder) return
        const line = bw > 0 ? { color: rgbToHex(cs.borderTopColor) || 'E2E6EE', width: Math.max(0.5, bw) } : { type: 'none' as const }
        slide.addShape(ST.roundRect, { x: (r.left - nr.left) * sx, y: (r.top - nr.top) * sy, w: r.width * sx, h: r.height * sy, fill: { color: bg }, line, rectRadius: 0.03 } as any)
      })
      // 텍스트 노드 → 텍스트 상자
      const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      let tn: Node | null
      while ((tn = tw.nextNode())) {
        const text = (tn.textContent || '').trim()
        if (!text) continue
        const parent = tn.parentElement
        if (!parent || inFree(parent)) continue
        const cs = getComputedStyle(parent)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        const range = document.createRange(); range.selectNodeContents(tn)
        const r = range.getBoundingClientRect()
        if (!r.width || !r.height) continue
        slide.addText(text, {
          x: (r.left - nr.left) * sx - 0.02, y: (r.top - nr.top) * sy - 0.01,
          w: r.width * sx + 0.14, h: r.height * sy + 0.06,
          fontSize: Math.max(6, parseFloat(cs.fontSize) * 0.72),
          color: rgbToHex(cs.color) || '1A1A1A',
          bold: parseInt(cs.fontWeight, 10) >= 600,
          italic: cs.fontStyle === 'italic',
          align: cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' ? 'right' : 'left',
          valign: 'top', margin: 0,
        } as any)
      }
      // 카드 내 이미지
      node.querySelectorAll<HTMLImageElement>('img').forEach((im) => {
        if (inFree(im)) return
        const src = im.currentSrc || im.src
        if (!src) return
        const r = im.getBoundingClientRect()
        const box = { x: (r.left - nr.left) * sx, y: (r.top - nr.top) * sy, w: r.width * sx, h: r.height * sy }
        slide.addImage(src.startsWith('data:') ? { data: src.replace(/^data:/, ''), ...box } : { path: src, ...box } as any)
      })
    }

    // ── 연결선(자유요소 사이) ──
    for (const c of p.conns) {
      const a = p.els.find((e) => e.id === c.from), b = p.els.find((e) => e.id === c.to)
      if (!a || !b) continue
      const s = edge(a, b.x + b.w / 2, b.y + b.h / 2), t = edge(b, a.x + a.w / 2, a.y + a.h / 2)
      const x1 = s.x * sx, y1 = s.y * sy, x2 = t.x * sx, y2 = t.y * sy
      const line: any = { color: rgbToHex(c.color) || '8B93A5', width: c.width || 1.5 }
      if (c.dash) line.dashType = 'dash'
      const arrow = c.arrow || 'end'
      if (arrow !== 'none') line.endArrowType = 'triangle'
      if (arrow === 'both') line.beginArrowType = 'triangle'
      slide.addShape(ST.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(0.01, Math.abs(x2 - x1)), h: Math.max(0.01, Math.abs(y2 - y1)), flipH: x2 < x1, flipV: y2 < y1, line } as any)
    }

    // ── 자유요소(모델 기반) ──
    for (const el of p.els) {
      const box = { x: el.x * sx, y: el.y * sy, w: Math.max(0.05, el.w * sx), h: Math.max(0.05, el.h * sy) }
      const common: any = {}
      if (el.rot) common.rotate = Math.round(el.rot)
      if (el.flipH) common.flipH = true
      if (el.flipV) common.flipV = true
      if (el.type === 'image') { if (el.src) slide.addImage(el.src.startsWith('data:') ? { data: el.src.replace(/^data:/, ''), ...box, ...common } : { path: el.src, ...box, ...common } as any); continue }
      if (el.type === 'table') {
        const R = el.rows || 2, C = el.cols || 2
        const cov = coveredSet(el.merges)
        const head = el.headRow !== false
        const rows: any[] = []
        for (let r = 0; r < R; r++) {
          const row: any[] = []
          for (let c = 0; c < C; c++) {
            if (cov.has(r + '_' + c)) continue
            const m = mergeCovering(el.merges, r, c)
            const o: any = { align: (el.calign && el.calign[r + '_' + c]) || 'left', valign: (el.cvalign && el.cvalign[r + '_' + c]) || 'middle' }
            const cf = el.cfs && el.cfs[r + '_' + c]
            if (cf) o.fontSize = Math.max(6, cf * 0.72)   // 표 전체 fontSize 를 셀 단위로 덮어쓴다
            if (m) { o.colspan = m.cs; o.rowspan = m.rs }
            if (head && r === 0) { o.bold = true; o.fill = { color: 'F2F5FA' } }
            row.push({ text: (el.cells && el.cells[r] && el.cells[r][c]) || '', options: o })
          }
          rows.push(row)
        }
        if (rows.length) slide.addTable(rows, { ...box, fontSize: Math.max(6, (el.fs || 12) * 0.72), border: { type: 'solid', color: rgbToHex(el.borderColor) || 'CFD5E2', pt: el.borderWidth || 0.5 }, autoPage: false } as any)
        continue
      }
      if (el.type === 'note') {
        const txt = (el.blocks || []).map((b) => b.text).filter(Boolean).join('\n')
        slide.addText(txt || ' ', { ...box, ...common, fontSize: Math.max(6, (el.fs || 13) * 0.72), color: '2A3346', align: 'left', valign: 'top', margin: 3, fill: { color: 'FFFFFF' }, line: { color: 'E2E6EE', width: 1 } } as any)
        continue
      }
      if (el.type === 'text' || el.type === 'wordart' || el.type === 'icon') {
        const t: any = { ...box, ...common, fontSize: Math.max(6, (el.fs || 14) * 0.72), color: rgbToHex(el.tcolor) || '1A1A1A', bold: !!el.bold || el.type === 'wordart', italic: !!el.italic, align: el.align || (el.type === 'icon' ? 'center' : 'left'), valign: 'middle', margin: 1 }
        if (el.underline) t.underline = { style: 'sng' }
        slide.addText(el.text || ' ', t)
        continue
      }
      // 도형
      const st = ST[SHAPE[el.type] || 'rect'] || ST.rect
      const fill = rgbToHex(el.color)
      const opts: any = { ...box, ...common, shape: st, align: el.align || 'center', valign: 'middle', fontSize: Math.max(6, (el.fs || 12) * 0.72), color: rgbToHex(el.tcolor) || '333333', bold: !!el.bold }
      opts.fill = fill ? { color: fill } : { type: 'none' }
      const bc = rgbToHex(el.borderColor)
      if (bc && (el.borderWidth == null || el.borderWidth > 0)) opts.line = { color: bc, width: el.borderWidth || 1 }
      else if (el.type === 'box' || el.type === 'round' || el.type === 'sticky') opts.line = { color: 'CFD5E2', width: 1 }
      if (el.underline) opts.underline = { style: 'sng' }
      slide.addText(el.text || '', opts)
    }
  }

  const make = async () => (await pptx.write({ outputType: 'blob' })) as Blob
  return saveWithPicker(make, (opts.title || '슬라이드') + '.pptx', { desc: 'PowerPoint 프레젠테이션', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' })
}
