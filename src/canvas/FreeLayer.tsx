import type React from 'react'
import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Page, FreeEl } from '../state/store'
import { useBuilder } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import { mkFreeEl, pushSnap, FCOLORS } from './model'
import NoteBlocks from '../builder/NoteBlocks'
import { coveredSet, mergeCovering } from './tableOps'
import ColorPicker from '../builder/chrome/ColorPicker'

interface Props { page: Page; W: number; H: number; SC: number; interactive: boolean }
const ADDABLE = ['box', 'round', 'ellipse', 'diamond', 'triangle', 'hexagon', 'pentagon', 'parallelogram', 'chevron', 'arrowR', 'arrowL', 'arrowU', 'arrowD', 'star5', 'star4', 'banner', 'callout', 'text', 'sticky', 'image', 'icon', 'table', 'wordart', 'note']
// 도구별 커서 — 펜=펜촉, 형광펜=마커(핫스팟은 팁), 지우개=크기 반영 원형(핫스팟 중앙).
const PEN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='#2462eb' stroke='#ffffff' stroke-width='1.3' stroke-linejoin='round'><path d='M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z'/></svg>"
const HL_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='#8a6d00' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='m9 11-6 6v3h9l3-3'/><path d='m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4Z' fill='#ffd600'/></svg>"
const PEN_CUR = 'url("data:image/svg+xml,' + encodeURIComponent(PEN_SVG) + '") 3 20, crosshair'
const HL_CUR = 'url("data:image/svg+xml,' + encodeURIComponent(HL_SVG) + '") 3 20, crosshair'
function eraserCur(w: number): string {
  const d = Math.max(8, Math.round(w)); const s = d + 4; const h = Math.round(s / 2)
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + s + "' height='" + s + "'><circle cx='" + h + "' cy='" + h + "' r='" + (d / 2) + "' fill='rgba(120,124,134,0.18)' stroke='#555' stroke-width='1.5'/></svg>"
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + h + ' ' + h + ', crosshair'
}
interface Pt { x: number; y: number }

function edgePoint(box: FreeEl, tx: number, ty: number): Pt {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const dx = tx - cx, dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = 1 / Math.max(Math.abs(dx) / (box.w / 2), Math.abs(dy) / (box.h / 2))
  return { x: cx + dx * scale, y: cy + dy * scale }
}
function connPath(a: FreeEl, b: FreeEl, conn?: { kind?: 'straight' | 'ortho' | 'curve'; bend?: Pt }): string {
  const kind = conn?.kind || 'ortho'
  const bend = conn?.bend
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  if (kind === 'straight') {
    const s = edgePoint(a, bc.x, bc.y), t = edgePoint(b, ac.x, ac.y)
    return 'M ' + s.x + ' ' + s.y + ' L ' + t.x + ' ' + t.y
  }
  if (kind === 'curve') {
    const s = edgePoint(a, bc.x, bc.y), t = edgePoint(b, ac.x, ac.y)
    let cx: number, cy: number
    if (bend) { cx = bend.x; cy = bend.y }
    else {
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, dx = t.x - s.x, dy = t.y - s.y, len = Math.hypot(dx, dy) || 1
      const off = Math.min(70, len * 0.28)
      cx = mx - dy / len * off; cy = my + dx / len * off
    }
    return 'M ' + s.x + ' ' + s.y + ' Q ' + cx + ' ' + cy + ' ' + t.x + ' ' + t.y
  }
  // ortho (직각) — bend가 있으면 그 지점을 지나는 꺾은선
  if (bend) {
    const s = edgePoint(a, bend.x, bend.y), t = edgePoint(b, bend.x, bend.y)
    return 'M ' + s.x + ' ' + s.y + ' L ' + bend.x + ' ' + bend.y + ' L ' + t.x + ' ' + t.y
  }
  const dx = bc.x - ac.x, dy = bc.y - ac.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = { x: dx > 0 ? a.x + a.w : a.x, y: ac.y }, t = { x: dx > 0 ? b.x : b.x + b.w, y: bc.y }
    const mx = (s.x + t.x) / 2
    return 'M ' + s.x + ' ' + s.y + ' L ' + mx + ' ' + s.y + ' L ' + mx + ' ' + t.y + ' L ' + t.x + ' ' + t.y
  }
  const s = { x: ac.x, y: dy > 0 ? a.y + a.h : a.y }, t = { x: bc.x, y: dy > 0 ? b.y : b.y + b.h }
  const my = (s.y + t.y) / 2
  return 'M ' + s.x + ' ' + s.y + ' L ' + s.x + ' ' + my + ' L ' + t.x + ' ' + my + ' L ' + t.x + ' ' + t.y
}

// ③ 스마트 스냅: 모서리·중심·캔버스중앙 정렬 + 두 이웃 사이 등간격. 가이드 좌표(v/h)도 반환.
function computeSnap(w: number, h: number, rawX: number, rawY: number, others: FreeEl[], CW: number, CH: number) {
  const TH = 6
  let nx = rawX, ny = rawY
  const xsC = [CW / 2]; const ysC = [CH / 2]
  for (const o of others) { xsC.push(o.x, o.x + o.w / 2, o.x + o.w); ysC.push(o.y, o.y + o.h / 2, o.y + o.h) }
  const offX = [0, w / 2, w], offY = [0, h / 2, h]
  let bestX = 0, gotX = false
  for (const off of offX) for (const c of xsC) { const d = c - (nx + off); if (Math.abs(d) <= TH && (!gotX || Math.abs(d) < Math.abs(bestX))) { bestX = d; gotX = true } }
  if (gotX) nx += bestX
  let bestY = 0, gotY = false
  for (const off of offY) for (const c of ysC) { const d = c - (ny + off); if (Math.abs(d) <= TH && (!gotY || Math.abs(d) < Math.abs(bestY))) { bestY = d; gotY = true } }
  if (gotY) ny += bestY
  // 등간격: 정렬 스냅이 없던 축에서만, 같은 행/열의 두 이웃 사이 gap 동일하면 가운데로.
  if (!gotX) {
    let L: FreeEl | null = null, R: FreeEl | null = null
    for (const o of others) { if (!(ny < o.y + o.h && ny + h > o.y)) continue; if (o.x + o.w <= nx) { if (!L || o.x + o.w > L.x + L.w) L = o } else if (o.x >= nx + w) { if (!R || o.x < R.x) R = o } }
    if (L && R) { const gapL = nx - (L.x + L.w), gapR = R.x - (nx + w); if (Math.abs(gapL - gapR) <= TH) nx += (gapR - gapL) / 2 }
  }
  if (!gotY) {
    let T: FreeEl | null = null, B: FreeEl | null = null
    for (const o of others) { if (!(nx < o.x + o.w && nx + w > o.x)) continue; if (o.y + o.h <= ny) { if (!T || o.y + o.h > T.y + T.h) T = o } else if (o.y >= ny + h) { if (!B || o.y < B.y) B = o } }
    if (T && B) { const gT = ny - (T.y + T.h), gB = B.y - (ny + h); if (Math.abs(gT - gB) <= TH) ny += (gB - gT) / 2 }
  }
  const gv: number[] = [], gh: number[] = []
  for (const off of offX) for (const c of xsC) if (Math.abs(c - (nx + off)) < 0.5 && !gv.includes(c)) gv.push(c)
  for (const off of offY) for (const c of ysC) if (Math.abs(c - (ny + off)) < 0.5 && !gh.includes(c)) gh.push(c)
  return { x: nx, y: ny, v: gv, h: gh }
}

export default function FreeLayer({ page, W, H, interactive }: Props) {
  const tool = useCanvasUI((s) => s.tool)
  const setTool = useCanvasUI((s) => s.setTool)
  const selEl = useCanvasUI((s) => s.selEl)
  const selEls = useCanvasUI((s) => s.selEls)
  const setSel = useCanvasUI((s) => s.setSel)
  const toggleSel = useCanvasUI((s) => s.toggleSel)
  const setSelMany = useCanvasUI((s) => s.setSelMany)
  const connSrc = useCanvasUI((s) => s.connSrc)
  const setConnSrc = useCanvasUI((s) => s.setConnSrc)
  const selConn = useCanvasUI((s) => s.selConn)
  const setSelConn = useCanvasUI((s) => s.setSelConn)
  const tableSel = useCanvasUI((s) => s.tableSel)
  const setTableSel = useCanvasUI((s) => s.setTableSel)
  const lastColor = useCanvasUI((s) => s.lastColor)
  const penWidth = useCanvasUI((s) => s.penWidth)
  const penColor = useCanvasUI((s) => s.penColor)
  const hlColor = useCanvasUI((s) => s.hlColor)
  const hlWidth = useCanvasUI((s) => s.hlWidth)
  const eraserWidth = useCanvasUI((s) => s.eraserWidth)
  const spell = useCanvasUI((s) => s.spell)
  const addEl = useBuilder((s) => s.addEl)
  const updateEl = useBuilder((s) => s.updateEl)
  const setElBlocks = useBuilder((s) => s.setElBlocks)
  const moveEls = useBuilder((s) => s.moveEls)
  const transformEls = useBuilder((s) => s.transformEls)
  const addConn = useBuilder((s) => s.addConn)
  const addStroke = useBuilder((s) => s.addStroke)
  const updateConn = useBuilder((s) => s.updateConn)
  const patchConn = useBuilder((s) => s.patchConn)
  const removeConn = useBuilder((s) => s.removeConn)
  const setCanvas = useBuilder((s) => s.setCanvas)

  const [editing, setEditing] = useState<number | null>(null)
  const [penPts, setPenPts] = useState<[number, number][] | null>(null)
  const [mouse, setMouse] = useState<Pt | null>(null)
  const [bending, setBending] = useState<Pt | null>(null)
  const [nodeDrag, setNodeDrag] = useState<{ fromId: number; x: number; y: number } | null>(null)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const connKeyRef = useRef<{ selConn: number | null; editing: number | null; pageId: number }>({ selConn: null, editing: null, pageId: page.id })
  connKeyRef.current = { selConn, editing, pageId: page.id }
  useEffect(() => {
    if (!interactive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSel(null); setConnSrc(null); setSelConn(null); setEditing(null); setMarquee(null); setTool('select'); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const st = connKeyRef.current
        if (st.selConn == null || st.editing != null) return
        const t = e.target as HTMLElement | null
        if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
        e.preventDefault()
        pushSnap(st.pageId, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
        removeConn(st.pageId, st.selConn); setSelConn(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [interactive, setSel, setConnSrc, setTool, setSelConn, removeConn, page])
  const active = interactive
  const markerId = 'fah' + page.id
  const markerStartId = 'fas' + page.id

  function snap() { pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })) }
  const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))
  const NO_CPT = ['text', 'icon', 'wordart', 'note']            // 연결점 안 띄우는(순수 글자) 타입
  const NO_FILL = ['text', 'icon', 'wordart', 'image', 'note', 'table']  // 채우기색 안 쓰는 타입
  function setFill(el: FreeEl, c: string) { snap(); updateEl(page.id, el.id, { color: c }) }
  function startConnectFrom(id: number) { setSelConn(null); setConnSrc(id); setTool('connect') }
  // 그룹이면 그 그룹 전체 id, 아니면 자기 id
  function expandGroupIds(id: number): number[] {
    const e = page.els.find((x) => x.id === id)
    if (!e || e.groupId == null) return [id]
    return page.els.filter((x) => x.groupId === e.groupId).map((x) => x.id)
  }
  function pickImage(el: FreeEl) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return
      const r = new FileReader(); r.onload = () => { snap(); updateEl(page.id, el.id, { src: String(r.result) }) }; r.readAsDataURL(f)
    }
    inp.click()
  }

  function onLayerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!active) return
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    if (tool === 'eraser') {
      e.preventDefault()
      let cur = page.strokes.slice()
      let did = false
      const R = eraserWidth
      const erase = (px: number, py: number) => {
        const keep = cur.filter((st) => !st.points.some(([sx, sy]) => Math.hypot(sx - px, sy - py) <= R / 2 + (st.w || 2) / 2))
        if (keep.length !== cur.length) { if (!did) { snap(); did = true } cur = keep; setCanvas(page.id, { els: page.els, conns: page.conns, strokes: cur }) }
      }
      erase(x, y)
      const move = (ev: PointerEvent) => erase(ev.clientX - rect.left, ev.clientY - rect.top)
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return
    }
    if (tool === 'pen' || tool === 'highlighter') {
      e.preventDefault(); snap()
      const isHl = tool === 'highlighter'
      const pts: [number, number][] = [[x, y]]; setPenPts([...pts])
      const move = (ev: PointerEvent) => { pts.push([ev.clientX - rect.left, ev.clientY - rect.top]); setPenPts([...pts]) }
      const up = () => {
        // 펜=자유 잉크 획만(도형/화살표 자동 변환 없음 → 지우개로 지워짐). 형광펜도 획.
        if (isHl) addStroke(page.id, { points: pts, color: hlColor, w: hlWidth, hl: true })
        else addStroke(page.id, { points: pts, color: penColor, w: penWidth })
        setPenPts(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return
    }
    if (ADDABLE.indexOf(tool) >= 0) { snap(); const el = mkFreeEl(tool, x - 50, y - 25); addEl(page.id, el); setSel(el.id); setTool('select'); if (tool === 'image') pickImage(el); if (tool === 'note') setEditing(el.id); return }
    if (tool === 'select') {
      setSel(null); setConnSrc(null); setSelConn(null); setEditing(null)
      const s0 = { x, y }
      setMarquee({ x, y, w: 0, h: 0 })
      const mv = (ev: PointerEvent) => { const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top; setMarquee({ x: Math.min(s0.x, cx), y: Math.min(s0.y, cy), w: Math.abs(cx - s0.x), h: Math.abs(cy - s0.y) }) }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up)
        const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top
        const mx = Math.min(s0.x, cx), my = Math.min(s0.y, cy), mw = Math.abs(cx - s0.x), mh = Math.abs(cy - s0.y)
        setMarquee(null)
        if (mw > 4 && mh > 4) {
          const hit = page.els.filter((e2) => e2.x < mx + mw && e2.x + e2.w > mx && e2.y < my + mh && e2.y + e2.h > my).map((e2) => e2.id)
          const ids = new Set<number>()
          for (const id of hit) for (const g of expandGroupIds(id)) ids.add(g)
          if (ids.size) setSelMany([...ids])
        }
      }
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return
    }
    setSel(null); setConnSrc(null); setEditing(null)
  }
  function onLayerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!active || tool !== 'connect' || connSrc === null) { if (mouse) setMouse(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  function onElDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl) {
    if (!active) return
    if (tool === 'connect') {
      e.preventDefault(); e.stopPropagation()
      if (connSrc === null) setConnSrc(el.id)
      else if (connSrc !== el.id) { snap(); addConn(page.id, { from: connSrc, to: el.id }); setConnSrc(null); setMouse(null); setTool('select') }
      return
    }
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') return
    e.preventDefault(); e.stopPropagation()
    if (el.locked) { setSel(el.id); return }   // 잠금: 선택만, 이동 없음
    if (e.shiftKey) { toggleSel(el.id); return }   // Shift 클릭: 선택 토글(이동 없음)
    // 선택 대상 결정: 이미 다중 선택된 요소를 잡으면 그 세트 전체를, 아니면 이 요소(그룹이면 그룹 전체)를
    const group = expandGroupIds(el.id)
    const already = selEls.includes(el.id)
    const dragIds = (already && selEls.length > 1) ? selEls : group
    if (!(already && selEls.length > 1)) setSelMany(dragIds)
    const single = dragIds.length === 1
    const movableIds = dragIds.filter((id) => { const d = page.els.find((x) => x.id === id); return d && !d.locked })
    const starts = movableIds.map((id) => { const d = page.els.find((x) => x.id === id); return { id, x: d ? d.x : 0, y: d ? d.y : 0 } })
    const sx = e.clientX, sy = e.clientY; let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (Math.abs(dx) + Math.abs(dy) > 4) { if (!moved) snap(); moved = true }
      if (single) {
        const s0 = starts[0]
        const sr = computeSnap(el.w, el.h, s0.x + dx, s0.y + dy, page.els.filter((o) => o.id !== el.id), W, H)
        setGuides(sr.v.length || sr.h.length ? { v: sr.v, h: sr.h } : null)
        updateEl(page.id, el.id, { x: sr.x, y: sr.y })
      } else {
        moveEls(page.id, starts.map((s0) => ({ id: s0.id, x: s0.x + dx, y: s0.y + dy })))
      }
    }
    const up = () => { setGuides(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved && already && selEls.length > 1) setSel(el.id) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  function onResizeDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl, dir: string) {
    e.preventDefault(); e.stopPropagation()
    const layer = (e.currentTarget as HTMLElement).closest('.freelayer') as HTMLElement | null
    const rect = layer ? layer.getBoundingClientRect() : null
    if (!rect) return
    const th = (el.rot || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th)
    const R = (px: number, py: number) => ({ x: px * cos - py * sin, y: px * sin + py * cos })
    const ow = el.w, oh = el.h, cx0 = el.x + ow / 2, cy0 = el.y + oh / 2
    const signX = dir.indexOf('e') >= 0 ? 1 : dir.indexOf('w') >= 0 ? -1 : 0
    const signY = dir.indexOf('s') >= 0 ? 1 : dir.indexOf('n') >= 0 ? -1 : 0
    const al = R(-signX * ow / 2, -signY * oh / 2)   // 반대편(고정) 앵커의 중심기준 오프셋(회전 반영)
    const Ax = cx0 + al.x, Ay = cy0 + al.y
    const MINW = 20, MINH = 16; let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const wx = (ev.clientX - rect.left) - Ax, wy = (ev.clientY - rect.top) - Ay
      const lx = wx * cos + wy * sin, ly = -wx * sin + wy * cos
      const nw = signX !== 0 ? Math.max(MINW, Math.abs(lx)) : ow
      const nh = signY !== 0 ? Math.max(MINH, Math.abs(ly)) : oh
      const off = R(signX * nw / 2, signY * nh / 2)
      const ncx = Ax + off.x, ncy = Ay + off.y
      updateEl(page.id, el.id, { x: Math.round(ncx - nw / 2), y: Math.round(ncy - nh / 2), w: Math.round(nw), h: Math.round(nh) })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // 캔버스 회전 손잡이 — 중심 기준 각도. Shift=15도 스냅.
  function onRotateDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl) {
    if (!active) return
    e.preventDefault(); e.stopPropagation()
    const layer = (e.currentTarget as HTMLElement).closest('.freelayer') as HTMLElement | null
    const rect = layer ? layer.getBoundingClientRect() : null
    if (!rect) return
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2; let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top
      let ang = Math.atan2(py - cy, px - cx) * 180 / Math.PI + 90
      ang = ((Math.round(ang) % 360) + 360) % 360
      if (ev.shiftKey) ang = Math.round(ang / 15) * 15 % 360
      updateEl(page.id, el.id, { rot: ang })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // 다중 선택 그룹: 바운딩 박스 크기조절(스케일)
  function onGroupResizeDown(e: React.PointerEvent<HTMLDivElement>, dir: string) {
    e.preventDefault(); e.stopPropagation()
    const sel0 = page.els.filter((el) => selEls.includes(el.id) && !el.locked)
    if (!sel0.length) return
    const bx = Math.min(...sel0.map((el) => el.x)), by = Math.min(...sel0.map((el) => el.y))
    const bx2 = Math.max(...sel0.map((el) => el.x + el.w)), by2 = Math.max(...sel0.map((el) => el.y + el.h))
    const BW = Math.max(1, bx2 - bx), BH = Math.max(1, by2 - by)
    const ax = dir.indexOf('w') >= 0 ? bx2 : bx
    const ay = dir.indexOf('n') >= 0 ? by2 : by
    const starts = sel0.map((el) => ({ id: el.id, x: el.x, y: el.y, w: el.w, h: el.h }))
    const sx0 = e.clientX, sy0 = e.clientY; let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const dx = ev.clientX - sx0, dy = ev.clientY - sy0
      let nBW = BW, nBH = BH
      if (dir.indexOf('e') >= 0) nBW = Math.max(20, BW + dx)
      if (dir.indexOf('w') >= 0) nBW = Math.max(20, BW - dx)
      if (dir.indexOf('s') >= 0) nBH = Math.max(16, BH + dy)
      if (dir.indexOf('n') >= 0) nBH = Math.max(16, BH - dy)
      const scX = (dir.indexOf('e') >= 0 || dir.indexOf('w') >= 0) ? nBW / BW : 1
      const scY = (dir.indexOf('n') >= 0 || dir.indexOf('s') >= 0) ? nBH / BH : 1
      transformEls(page.id, starts.map((m0) => ({ id: m0.id, x: ax + (m0.x - ax) * scX, y: ay + (m0.y - ay) * scY, w: m0.w * scX, h: m0.h * scY })))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // 다중 선택 그룹: 중심 기준 회전(각 요소 위치·각도 함께)
  function onGroupRotateDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation()
    const layer = (e.currentTarget as HTMLElement).closest('.freelayer') as HTMLElement | null
    const rect = layer ? layer.getBoundingClientRect() : null
    if (!rect) return
    const sel0 = page.els.filter((el) => selEls.includes(el.id) && !el.locked)
    if (!sel0.length) return
    const bx = Math.min(...sel0.map((el) => el.x)), by = Math.min(...sel0.map((el) => el.y))
    const bx2 = Math.max(...sel0.map((el) => el.x + el.w)), by2 = Math.max(...sel0.map((el) => el.y + el.h))
    const gcx = (bx + bx2) / 2, gcy = (by + by2) / 2
    const starts = sel0.map((el) => ({ id: el.id, cx: el.x + el.w / 2, cy: el.y + el.h / 2, w: el.w, h: el.h, rot: el.rot || 0 }))
    const a0 = Math.atan2((e.clientY - rect.top) - gcy, (e.clientX - rect.left) - gcx); let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const a = Math.atan2((ev.clientY - rect.top) - gcy, (ev.clientX - rect.left) - gcx)
      const d = a - a0, dd = d * 180 / Math.PI
      transformEls(page.id, starts.map((m0) => {
        const rxp = m0.cx - gcx, ryp = m0.cy - gcy
        const ncx = gcx + rxp * Math.cos(d) - ryp * Math.sin(d)
        const ncy = gcy + rxp * Math.sin(d) + ryp * Math.cos(d)
        return { id: m0.id, x: ncx - m0.w / 2, y: ncy - m0.h / 2, rot: ((Math.round(m0.rot + dd) % 360) + 360) % 360 }
      }))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // ① draw-from-node: 선택 도형의 4방향 핸들에서 끌면 새 상자+연결 생성(기존 도형 위면 그 도형과 연결)
  function onNodeDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl, dir: 't' | 'r' | 'b' | 'l') {
    if (!active) return
    e.preventDefault(); e.stopPropagation()
    const layer = (e.currentTarget as HTMLElement).closest('.freelayer') as HTMLElement | null
    const rect = layer ? layer.getBoundingClientRect() : null
    if (!rect) return
    const move = (ev: PointerEvent) => { setNodeDrag({ fromId: el.id, x: ev.clientX - rect.left, y: ev.clientY - rect.top }) }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setNodeDrag(null)
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top
      const target = page.els.find((t) => t.id !== el.id && x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h)
      snap()
      if (target) { addConn(page.id, { from: el.id, to: target.id }); setSel(target.id); return }
      const NW = 120, NH = 56
      const far = Math.hypot(x - (el.x + el.w / 2), y - (el.y + el.h / 2)) > 40
      let nx: number, ny: number
      if (far) { nx = x - NW / 2; ny = y - NH / 2 }
      else if (dir === 'r') { nx = el.x + el.w + 40; ny = el.y + (el.h - NH) / 2 }
      else if (dir === 'l') { nx = el.x - NW - 40; ny = el.y + (el.h - NH) / 2 }
      else if (dir === 'b') { nx = el.x + (el.w - NW) / 2; ny = el.y + el.h + 40 }
      else { nx = el.x + (el.w - NW) / 2; ny = el.y - NH - 40 }
      const nb = mkFreeEl('box', Math.max(0, Math.round(nx)), Math.max(0, Math.round(ny)))
      nb.text = ''
      addEl(page.id, nb)
      addConn(page.id, { from: el.id, to: nb.id })
      setSel(nb.id); setEditing(nb.id)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  function onLineDown(e: React.PointerEvent<SVGPathElement>, i: number) {
    if (!active) return
    e.preventDefault(); e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect(); let did = false, moved = false
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= 4) return
      moved = true
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top
      if (!did) { snap(); did = true } updateConn(page.id, i, { x, y }); setBending({ x, y })
    }
    const up = () => { setBending(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) setSelConn(i) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const conns = page.conns.map((c, i) => {
    const a = page.els.find((e) => e.id === c.from); const b = page.els.find((e) => e.id === c.to)
    if (!a || !b) return null
    const d = connPath(a, b, c)
    const stroke = c.color || '#8b93a5'
    const w = c.width || 2
    const arrow = c.arrow || 'end'
    const dash = c.dash ? '6 5' : undefined
    const sel = active && selConn === i
    return (
      <g key={'c' + i}>
        {sel ? <path d={d} fill="none" stroke="#2462EB" strokeOpacity={0.28} strokeWidth={w + 6} strokeLinecap="round" /> : null}
        <path d={d} fill="none" stroke={stroke} strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round"
          markerEnd={arrow === 'none' ? undefined : 'url(#' + markerId + ')'} markerStart={arrow === 'both' ? 'url(#' + markerStartId + ')' : undefined} />
      </g>
    )
  })
  const hits = active ? page.conns.map((c, i) => {
    const a = page.els.find((e) => e.id === c.from); const b = page.els.find((e) => e.id === c.to)
    if (!a || !b) return null
    return <path key={'hit' + i} d={connPath(a, b, c)} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onPointerDown={(e) => onLineDown(e, i)} />
  }) : null
  const hlStrokes = page.strokes.map((st, i) => {
    if (!st.hl || st.points.length < 2) return null
    const d = 'M ' + st.points.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ')
    return <path key={'h' + i} d={d} fill="none" stroke={st.color} strokeWidth={st.w} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} style={{ mixBlendMode: 'multiply' }} />
  })
  const strokes = page.strokes.map((st, i) => {
    if (st.hl || st.points.length < 2) return null
    const d = 'M ' + st.points.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ')
    return <path key={'s' + i} d={d} fill="none" stroke={st.color} strokeWidth={st.w} strokeLinecap="round" strokeLinejoin="round" />
  })
  const penPath = penPts && penPts.length > 1
    ? <path d={'M ' + penPts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ')} fill="none" stroke={tool === 'highlighter' ? hlColor : penColor} strokeWidth={tool === 'highlighter' ? hlWidth : penWidth} strokeLinecap="round" opacity={tool === 'highlighter' ? 0.4 : 1} style={tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined} />
    : null
  let rubber = null
  if (active && tool === 'connect' && connSrc !== null && mouse) {
    const src = page.els.find((e) => e.id === connSrc)
    if (src) { const s = edgePoint(src, mouse.x, mouse.y); rubber = <line x1={s.x} y1={s.y} x2={mouse.x} y2={mouse.y} stroke="#f0a020" strokeWidth={2} strokeDasharray="5 4" /> }
  }
  let nodeRubber = null
  if (active && nodeDrag) {
    const src = page.els.find((e) => e.id === nodeDrag.fromId)
    if (src) { const s = edgePoint(src, nodeDrag.x, nodeDrag.y); nodeRubber = <line x1={s.x} y1={s.y} x2={nodeDrag.x} y2={nodeDrag.y} stroke="#2462EB" strokeWidth={2} strokeDasharray="5 4" /> }
  }
  const guideEls = active && guides ? [
    ...guides.v.map((x, i) => <line key={'gv' + i} x1={x} y1={0} x2={x} y2={H} stroke="#f0389d" strokeWidth={1} strokeDasharray="4 3" />),
    ...guides.h.map((y, i) => <line key={'gh' + i} x1={0} y1={y} x2={W} y2={y} stroke="#f0389d" strokeWidth={1} strokeDasharray="4 3" />),
  ] : null

  return (
    <div className={'freelayer' + (active ? '' : ' off') + (active && tool === 'select' && !page.free ? ' passthru' : '')} style={{ width: W, height: H, cursor: !active ? undefined : tool === 'pen' ? PEN_CUR : tool === 'highlighter' ? HL_CUR : tool === 'eraser' ? eraserCur(eraserWidth) : undefined }} onPointerDown={onLayerDown} onPointerMove={active ? onLayerMove : undefined}>
      <svg className="freeconn" width={W} height={H}>
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="context-stroke" /></marker>
          <marker id={markerStartId} markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto"><path d="M8,0 L0,3 L8,6 Z" fill="context-stroke" /></marker>
        </defs>
        {hlStrokes}{conns}{strokes}{penPath}{rubber}{nodeRubber}{guideEls}{hits}
        {bending ? <circle cx={bending.x} cy={bending.y} r={6} fill="#fff" stroke="#8b93a5" strokeWidth={2} /> : null}
      </svg>
      {active && marquee ? <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} /> : null}
      {active && tool === 'connect' ? <div className="conn-hint">{connSrc === null ? '이을 도형을 클릭하세요 (첫 번째)' : '이어줄 다른 도형을 클릭하세요 (두 번째)'}</div> : null}
      {page.els.map((el) => {
        const isImg = el.type === 'image'
        const isTable = el.type === 'table'
        const isNote = el.type === 'note'
        const style: CSSProperties = { left: el.x, top: el.y, width: el.w, height: el.h }
        if (isNote) { style.height = 'auto'; style.minHeight = el.h }
        const tf: string[] = []
        if (el.rot) tf.push('rotate(' + el.rot + 'deg)')
        if (el.flipH) tf.push('scaleX(-1)')
        if (el.flipV) tf.push('scaleY(-1)')
        if (tf.length) { style.transform = tf.join(' '); style.transformOrigin = 'center' }
        if (el.opacity != null && el.opacity < 1) style.opacity = el.opacity
        if (el.shadow) style.filter = 'drop-shadow(0 3px 7px rgba(0,0,0,.32))'
        if (el.reflect) (style as React.CSSProperties & { WebkitBoxReflect?: string }).WebkitBoxReflect = 'below 2px linear-gradient(transparent 45%, rgba(0,0,0,.28))'
        if (!isImg && !isTable && el.color !== 'transparent') style.background = el.color
        if (el.color === '#111318') style.borderColor = '#111318'
        if (el.borderColor) style.borderColor = el.borderColor
        if (el.borderWidth != null) style.borderWidth = el.borderWidth
        const txtStyle: CSSProperties = { fontSize: el.fs }
        if (el.bold) txtStyle.fontWeight = 800
        if (el.tcolor) txtStyle.color = el.tcolor
        else if (el.color === '#111318') txtStyle.color = '#fff'
        if (el.wa) { txtStyle.fontWeight = 900; txtStyle.letterSpacing = '0.01em'; txtStyle.textShadow = '0 1px 0 rgba(0,0,0,.18)' }
        if (el.italic) txtStyle.fontStyle = 'italic'
        if (el.underline) txtStyle.textDecoration = 'underline'
        if (el.align) txtStyle.textAlign = el.align
        const cls = 'fel ' + el.type + (selEls.includes(el.id) ? ' sel' : '') + (connSrc === el.id ? ' connsrc' : '')
        const editingThis = editing === el.id
        return (
          <div key={el.id} className={cls} style={style}
            data-goto-seq={el.gotoSeq || undefined}
            onPointerDown={active ? (e) => onElDown(e, el) : undefined}
            onPointerEnter={active && tool === 'select' ? () => setHoverId(el.id) : undefined}
            onPointerLeave={active && tool === 'select' ? () => setHoverId((h) => (h === el.id ? null : h)) : undefined}
            onDoubleClick={active ? () => { if (isImg) pickImage(el); else setEditing(el.id) } : undefined}>
            {isNote
              ? (<div className="note-inner" style={{ pointerEvents: editingThis ? 'auto' : 'none' }}
                  onPointerDown={editingThis ? (e) => e.stopPropagation() : undefined}
                  onDoubleClick={editingThis ? (e) => e.stopPropagation() : undefined}>
                  <NoteBlocks blocks={el.blocks || []} onChange={(b) => setElBlocks(page.id, el.id, b)} compact />
                </div>)
              : isTable
              ? (() => {
                  const R = el.rows || 2, C = el.cols || 2
                  const cov = coveredSet(el.merges)
                  const border = el.borderColor || '#cfd5e2', bw = el.borderWidth ?? 1
                  const head = el.headRow !== false
                  const tableActive = selEls.includes(el.id)
                  const ts = (tableSel && tableSel.elId === el.id) ? tableSel : null
                  const inSel = (r: number, c: number) => !!ts && r >= Math.min(ts.r0, ts.r1) && r <= Math.max(ts.r0, ts.r1) && c >= Math.min(ts.c0, ts.c1) && c <= Math.max(ts.c0, ts.c1)
                  return (
                    <div className="feltable" style={{ display: 'grid', gridTemplateColumns: `repeat(${C}, 1fr)`, gridTemplateRows: `repeat(${R}, 1fr)`, width: '100%', height: '100%' }}>
                      {Array.from({ length: R * C }).map((_, k) => {
                        const r = Math.floor(k / C), c = k % C
                        if (cov.has(r + '_' + c)) return null
                        const m = mergeCovering(el.merges, r, c)
                        const val = (el.cells && el.cells[r] && el.cells[r][c]) || ''
                        const al = (el.calign && el.calign[r + '_' + c]) || undefined
                        const sel = inSel(r, c)
                        return (
                          <div key={k} className={'feltd' + (sel ? ' cellsel' : '')} suppressContentEditableWarning
                            style={{ border: bw + 'px solid ' + border, fontSize: el.fs, padding: '3px 5px', overflow: 'hidden', background: sel ? '#dbe7ff' : (head && r === 0 ? '#f2f5fa' : '#fff'), fontWeight: head && r === 0 ? 700 : 400, textAlign: al, gridColumn: m ? `${c + 1} / span ${m.cs}` : `${c + 1}`, gridRow: m ? `${r + 1} / span ${m.rs}` : `${r + 1}` }}
                            contentEditable={editingThis}
                            onPointerDown={(e) => {
                              if (editingThis) { e.stopPropagation(); return }
                              if (tableActive) { e.stopPropagation(); if (e.shiftKey && ts) setTableSel({ elId: el.id, r0: ts.r0, c0: ts.c0, r1: r, c1: c }); else setTableSel({ elId: el.id, r0: r, c0: c, r1: r, c1: c }) }
                            }}
                            onBlur={editingThis ? (e) => { const cells = (el.cells || []).map((row) => row.slice()); while (cells.length < R) cells.push([]); while (cells[r].length < C) cells[r].push(''); cells[r][c] = e.currentTarget.textContent || ''; updateEl(page.id, el.id, { cells }) } : undefined}
                          >{val}</div>
                        )
                      })}
                    </div>
                  )
                })()
              : isImg
              ? (el.src
                  ? <img src={el.src} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  : <div className="feltext" style={{ fontSize: 11, color: '#8a93a5' }}>더블클릭해서 이미지 올리기</div>)
              : (editingThis
                  ? <div className="feltext" contentEditable suppressContentEditableWarning spellCheck={spell} ref={(n) => { if (n) n.focus() }} style={txtStyle}
                      onFocus={(e) => { const n = e.currentTarget; requestAnimationFrame(() => { const sel = window.getSelection(); if (sel && sel.isCollapsed) { const r = document.createRange(); r.selectNodeContents(n); sel.removeAllRanges(); sel.addRange(r) } }) }}
                      onBlur={(e) => { updateEl(page.id, el.id, { text: e.currentTarget.textContent || '' }); setEditing(null) }}>{el.text}</div>
                  : <div className="feltext" style={txtStyle}>{el.text}</div>)}
            {active && isNote && editingThis ? <div className="note-drag" title="드래그해서 이동">⠿</div> : null}
          </div>
        )
      })}
      {active && selEls.length === 1 && selEl != null && editing == null && tool === 'select' ? (() => {
        const se = page.els.find((e) => e.id === selEl)
        if (!se || se.locked) return null
        const w = se.w, h = se.h
        const HS: { d: string; x: number; y: number; cur: string }[] = [
          { d: 'nw', x: 0, y: 0, cur: 'nwse-resize' },
          { d: 'n', x: w / 2, y: 0, cur: 'ns-resize' },
          { d: 'ne', x: w, y: 0, cur: 'nesw-resize' },
          { d: 'e', x: w, y: h / 2, cur: 'ew-resize' },
          { d: 'se', x: w, y: h, cur: 'nwse-resize' },
          { d: 's', x: w / 2, y: h, cur: 'ns-resize' },
          { d: 'sw', x: 0, y: h, cur: 'nesw-resize' },
          { d: 'w', x: 0, y: h / 2, cur: 'ew-resize' },
        ]
        return (
          <div style={{ position: 'absolute', left: se.x, top: se.y, width: w, height: h, transform: se.rot ? `rotate(${se.rot}deg)` : undefined, transformOrigin: 'center', pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', left: w / 2, top: -22, width: 1, height: 22, background: '#2462EB' }} />
            <div title="회전(Shift=15°)" style={{ position: 'absolute', left: w / 2 - 7, top: -29, width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2px solid #2462EB', boxShadow: '0 1px 3px rgba(0,0,0,.25)', cursor: 'grab', pointerEvents: 'auto' }} onPointerDown={(e) => onRotateDown(e, se)} />
            {HS.map((hh) => (
              <div key={'rh' + hh.d} style={{ position: 'absolute', left: hh.x - 5, top: hh.y - 5, width: 10, height: 10, borderRadius: 2, background: '#fff', border: '1.5px solid #2462EB', boxShadow: '0 1px 2px rgba(0,0,0,.25)', cursor: hh.cur, pointerEvents: 'auto' }}
                onPointerDown={(e) => onResizeDown(e, se, hh.d)} />
            ))}
          </div>
        )
      })() : null}
      {active && selEls.length >= 2 && editing == null && tool === 'select' ? (() => {
        const sel0 = page.els.filter((el) => selEls.includes(el.id))
        if (sel0.length < 2) return null
        const bx = Math.min(...sel0.map((el) => el.x)), by = Math.min(...sel0.map((el) => el.y))
        const bx2 = Math.max(...sel0.map((el) => el.x + el.w)), by2 = Math.max(...sel0.map((el) => el.y + el.h))
        const bw = bx2 - bx, bh = by2 - by
        const HS: { d: string; x: number; y: number; cur: string }[] = [
          { d: 'nw', x: bx, y: by, cur: 'nwse-resize' },
          { d: 'n', x: bx + bw / 2, y: by, cur: 'ns-resize' },
          { d: 'ne', x: bx2, y: by, cur: 'nesw-resize' },
          { d: 'e', x: bx2, y: by + bh / 2, cur: 'ew-resize' },
          { d: 'se', x: bx2, y: by2, cur: 'nwse-resize' },
          { d: 's', x: bx + bw / 2, y: by2, cur: 'ns-resize' },
          { d: 'sw', x: bx, y: by2, cur: 'nesw-resize' },
          { d: 'w', x: bx, y: by + bh / 2, cur: 'ew-resize' },
        ]
        return (<>
          <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, border: '1.5px dashed #2462EB', borderRadius: 3, pointerEvents: 'none', zIndex: 5 }} />
          <div style={{ position: 'absolute', left: bx + bw / 2, top: by - 22, width: 1, height: 22, background: '#2462EB', zIndex: 5, pointerEvents: 'none' }} />
          <div title="그룹 회전(Shift=15°)" style={{ position: 'absolute', left: bx + bw / 2 - 7, top: by - 29, width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2px solid #2462EB', boxShadow: '0 1px 3px rgba(0,0,0,.25)', cursor: 'grab', zIndex: 6, pointerEvents: 'auto' }} onPointerDown={onGroupRotateDown} />
          {HS.map((h) => (
            <div key={'grh' + h.d} style={{ position: 'absolute', left: h.x - 5, top: h.y - 5, width: 10, height: 10, borderRadius: 2, background: '#fff', border: '1.5px solid #2462EB', boxShadow: '0 1px 2px rgba(0,0,0,.25)', cursor: h.cur, zIndex: 6, pointerEvents: 'auto' }}
              onPointerDown={(e) => onGroupResizeDown(e, h.d)} />
          ))}
        </>)
      })() : null}
      {active && tool === 'select' && editing == null && hoverId != null && !selEls.includes(hoverId) ? (() => {
        const he = page.els.find((e) => e.id === hoverId)
        if (!he || he.locked || NO_CPT.includes(he.type)) return null
        const pts: { d: 't' | 'r' | 'b' | 'l'; x: number; y: number }[] = [
          { d: 't', x: he.x + he.w / 2, y: he.y },
          { d: 'r', x: he.x + he.w, y: he.y + he.h / 2 },
          { d: 'b', x: he.x + he.w / 2, y: he.y + he.h },
          { d: 'l', x: he.x, y: he.y + he.h / 2 },
        ]
        return (<>{pts.map((pt) => (
          <div key={'cpt' + pt.d} className="cpt" title="끌어서 다른 도형에 연결"
            style={{ position: 'absolute', left: pt.x - 6, top: pt.y - 6, width: 12, height: 12, borderRadius: '50%', background: '#2462EB', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', cursor: 'crosshair', pointerEvents: 'auto', zIndex: 7 }}
            onPointerEnter={() => setHoverId(he.id)}
            onPointerLeave={() => setHoverId((h) => (h === he.id ? null : h))}
            onPointerDown={(e) => onNodeDown(e, he, pt.d)} />
        ))}</>)
      })() : null}
      {active && selEls.length === 1 && selEl != null && editing == null && tool === 'select' ? (() => {
        const se = page.els.find((e) => e.id === selEl)
        if (!se || se.locked) return null
        const top0 = se.y - 42
        const top = top0 < 4 ? se.y + se.h + 8 : top0
        const left = Math.max(2, Math.min(W - 220, se.x))
        const showFill = !NO_FILL.includes(se.type)
        return (
          <div className="ctxbar" style={{ position: 'absolute', left, top, zIndex: 8, pointerEvents: 'auto' }} onPointerDown={(e) => e.stopPropagation()}>
            {showFill ? <ColorPicker value={se.color} onChange={(c) => setFill(se, c)} allowTransparent /> : null}
            {showFill ? FCOLORS.slice(0, 6).map((c) => (
              <button key={c} className="ctx-dot" style={{ background: c }} title="채우기색" onClick={() => setFill(se, c)} />
            )) : null}
            {showFill ? <span className="ctx-sep" /> : null}
            <button className="ctx-b" title="연결(화살표)" onClick={() => startConnectFrom(se.id)}>→</button>
            <button className="ctx-b" title="복제" onClick={() => emit('ebook:dup')}>⧉</button>
            <button className="ctx-b" title="맨 앞으로" onClick={() => emit('ebook:z-front')}>▲</button>
            <button className="ctx-b" title="맨 뒤로" onClick={() => emit('ebook:z-back')}>▼</button>
            <button className="ctx-b danger" title="삭제" onClick={() => emit('ebook:del')}>🗑</button>
          </div>
        )
      })() : null}
    </div>
  )
}
