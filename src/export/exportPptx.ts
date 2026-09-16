import PptxGenJS from 'pptxgenjs'
import type { Page, FreeEl } from '../state/store'
import { saveWithPicker } from './exportFiles'
import { coveredSet, mergeCovering, trackSizes } from '../canvas/tableOps'
import { cellBackground, cellTextColor, isSlotEl, lockedRowCount, todayPlace } from '../template/slots'

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

/** TODAY 마커를 PPT 에도 그린다.
 *
 *  표 안에 그리는 표시라 pptxgenjs 의 표 기능으로는 옮길 길이 없다 — **도형 두 개**로
 *  다시 그린다. 세로 파선 하나와 주황 알약 하나.
 *
 *  **자리는 화면에서 그대로 읽는다.** 계산으로 맞추려다 6~8px 어긋났다(2026-09-16):
 *  `todayX`·`todayY` 는 `.fel` 상자가 아니라 **안쪽 격자**(.feltable)에서 잰 값인데,
 *  표는 테두리와 여백만큼 안으로 들어가 있다(재어 보니 왼쪽 8px · 위 6px).
 *  화면에 이미 그려져 있는 것을 읽으면 그런 어긋남이 아예 생기지 않는다 —
 *  카드 글자·박스를 옮길 때 쓰는 방법과 같다.
 *
 *  화면이 없을 때(내보내기용 DOM 이 없는 경우)만 계산으로 간다. 그때는 여백만큼
 *  어긋나지만, 아예 안 그리는 것보다는 낫다.
 */
function addTodayMarker(slide: any, ST: any, el: FreeEl, cw: number[], sc: number,
                        sx: number, sy: number, node: HTMLElement | null, nr: DOMRect | null) {
  const place = todayPlace(el)
  if (!place) return
  const ORANGE = 'D98A2A'

  let x: number, y: number, h: number, py: number
  const line = node && nr
    ? node.querySelector<HTMLElement>('.fel[data-el-id="' + el.id + '"] .fel-today')
    : null
  const pill = line ? line.querySelector<HTMLElement>('.fel-today-pill') : null
  if (line && pill && nr) {
    const lr = line.getBoundingClientRect(), pr = pill.getBoundingClientRect()
    x = (lr.left - nr.left) * sx
    y = (lr.top - nr.top) * sy
    h = lr.height * sy
    py = (pr.top - nr.top) * sy
  } else {
    let dx: number
    if (place.kind === 'px') { dx = place.x; py = place.y }
    else {
      if (place.col < 0 || place.col >= cw.length) return
      let acc = 0
      for (let i = 0; i < place.col; i++) acc += cw[i]
      dx = (el.w * acc) / sc
      py = 1
    }
    x = (el.x + dx) * sx
    y = el.y * sy
    h = el.h * sy
    py = (el.y + py) * sy
  }

  slide.addShape(ST.line, {
    x, y, w: 0.001, h,
    line: { color: ORANGE, width: 1.5, dashType: 'dash' },
  })
  // 알약. 선이 가운데 오도록 왼쪽으로 반 칸 물린다 — 화면의 translateX(-50%) 와 같다.
  const pw = 0.38, ph = 0.13
  slide.addText('TODAY', {
    x: x - pw / 2, y: py, w: pw, h: ph,
    shape: ST.roundRect, rectRadius: 0.06,
    fill: { color: ORANGE }, line: { type: 'none' },
    color: 'FFFFFF', fontSize: 6, bold: true, align: 'center', valign: 'middle', margin: 0,
  })
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
        // 머리글은 한 줄이 아닐 수 있다 — 로드맵은 연도 행 + 월 행 = 2줄이다.
        // 화면(FreeLayer)이 쓰는 그 계산을 그대로 쓴다.
        const headRows = isSlotEl(el.slot) ? lockedRowCount(el.slot) : (head ? 1 : 0)
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
            // ── 칸 색(2026-09-16) ──
            //
            // 여기서 `el.cbg` 를 **아예 안 읽고 있었다.** 그래서 내려받은 PPT 에서는
            // 진행 표시 색이 전부 사라지고 머리글까지 회색이 됐다(사용자 신고 ⑤).
            // 실제로 재어 보니 화면에는 칠해진 칸이 18개인데 .pptx 안에는 0개였다.
            //
            // 규칙은 화면과 **같은 함수**에서 온다(slots.cellBackground·cellTextColor).
            // 여기서 따로 판단하면 화면과 내려받은 것이 어긋난다 — 그게 이 버그의 본체다.
            const key = r + '_' + c
            const cbg = el.cbg && el.cbg[key]
            const hx = rgbToHex(cellBackground(cbg))
            if (hx) o.fill = { color: hx }
            const tc = rgbToHex(cellTextColor(cbg))
            if (tc) o.color = tc
            if (r < headRows) {
              o.bold = true
              // 색이 있으면 그 색이 이긴다. 예전에는 F2F5FA 를 **무조건** 덮어써서
              // 양식의 연노랑 머리글(FFFFCC)이 회색으로 바뀌었다.
              if (!hx) o.fill = { color: 'F2F5FA' }
            }
            row.push({ text: (el.cells && el.cells[r] && el.cells[r][c]) || '', options: o })
          }
          rows.push(row)
        }
        // ── 열 너비·행 높이 ──
        // 안 넘기면 파워포인트가 **전부 똑같이** 나눈다. 로드맵의 Project 칸은
        // 화면에서 월 칸의 4배가 넘는데 내려받으면 같아졌다(재어 본 값: 18열 전부 524933 EMU).
        const cw = trackSizes(el.colw, C), rh = trackSizes(el.rowh, R)
        const sc = cw.reduce((a, b) => a + b, 0), sr = rh.reduce((a, b) => a + b, 0)
        const colW = cw.map((v) => (box.w * v) / sc)
        const rowH = rh.map((v) => (box.h * v) / sr)
        // 테두리 선 모양. 파워포인트 표는 실선·파선·없음 셋뿐이라 점선도 파선으로 간다.
        const bt = (el.borderWidth === 0) ? 'none' : (el.borderDash && el.borderDash !== 'solid') ? 'dash' : 'solid'
        if (rows.length) slide.addTable(rows, { ...box, colW, rowH, fontSize: Math.max(6, (el.fs || 12) * 0.72), border: { type: bt, color: rgbToHex(el.borderColor) || 'CFD5E2', pt: el.borderWidth || 0.5 }, autoPage: false } as any)
        addTodayMarker(slide, ST, el, cw, sc, sx, sy, node, nr)
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
      // 반투명. 화면은 0~1, 파워포인트는 「몇 % 비침」이라 뒤집어 넣는다.
      if (el.opacity != null && el.opacity < 1 && opts.fill.color) {
        opts.fill.transparency = Math.round((1 - el.opacity) * 100)
      }
      const bc = rgbToHex(el.borderColor)
      if (bc && (el.borderWidth == null || el.borderWidth > 0)) opts.line = { color: bc, width: el.borderWidth || 1 }
      else if (el.type === 'box' || el.type === 'round' || el.type === 'sticky') opts.line = { color: 'CFD5E2', width: 1 }
      // 선 모양(실선·파선·점선). 파워포인트에도 그대로 있는 것이라 **버릴 이유가 없었다** —
      // 그냥 안 넘기고 있었다. 점선은 `sysDot`, 파선은 `dash` 가 화면과 제일 가깝다.
      if (opts.line && el.borderDash && el.borderDash !== 'solid') {
        opts.line.dashType = el.borderDash === 'dotted' ? 'sysDot' : 'dash'
      }
      // 그림자. 화면은 drop-shadow(0 3px 7px rgba(0,0,0,.32)) 하나뿐이라 그 값을 옮긴다
      // (각 90도 = 아래쪽, 거리 3px ≈ 2.25pt, 번짐 7px ≈ 5pt).
      if (el.shadow) opts.shadow = { type: 'outer', color: '000000', opacity: 0.32, angle: 90, offset: 2.25, blur: 5 }
      // 반투명은 **테두리에도** 걸어야 한다. 화면은 요소 전체가 비치는데 채우기에만
      // 걸면 테두리만 진하게 남아 딴 도형처럼 보인다. 글자는 파워포인트가 비치게
      // 못 해서 그대로 남는다 — 이건 그쪽의 한계다.
      if (el.opacity != null && el.opacity < 1 && opts.line && opts.line.color) {
        opts.line.transparency = Math.round((1 - el.opacity) * 100)
      }
      if (el.underline) opts.underline = { style: 'sng' }
      slide.addText(el.text || '', opts)
    }
  }

  const make = async () => (await pptx.write({ outputType: 'blob' })) as Blob
  return saveWithPicker(make, (opts.title || '슬라이드') + '.pptx', { desc: 'PowerPoint 프레젠테이션', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' })
}
