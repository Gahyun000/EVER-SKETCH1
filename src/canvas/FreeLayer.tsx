import type React from 'react'
import { Fragment, useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { intakeImage } from '../builder/imageIntake'
import type { CSSProperties } from 'react'
import type { Page, FreeEl } from '../state/store'
import { useBuilder } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import { useProjects } from '../persistence/projects'
import { mkFreeEl, pushSnap, FCOLORS, NO_FILL } from './model'
import { centerSpot } from './dropSpot'
import { overlayOpen } from '../ui/overlay'
import { CLIPPED, SHAPE_RADIUS, dashArray, polyClip, polyPoints } from './shapePaths'
import NoteBlocks from '../builder/NoteBlocks'
import { bandRange, coveredSet, dragTrack, growToMerges, mergeCovering, sizeTracks, trackSizes } from './tableOps'
import { cellBackground, cellEditable, cellTextColor, clampTodayX, clampTodayY, isSlotEl, lockedRowCount, todayPlace } from '../template/slots'
import { tableAnchorLabel } from '../comments/anchorLabel'
import { isContinuation } from './tableFlow'
import { treeShape, descendantCount, knownOf, isTreePage } from '../cards/treeOps'
import { parseCell } from '../comments/anchor'
import { pinsOfPage, useComments } from '../comments/store'
import type { Thread } from '../comments/commentsApi'
import '../template/template.css'
import ColorPicker from '../builder/chrome/ColorPicker'

interface Props { page: Page; W: number; H: number; SC: number; interactive: boolean }

/**
 * 표준 양식 요소를 **종이 안에** 붙잡아 둔다.
 *
 * 2026-09-07 에 양식 요소의 자리 잠금을 풀었다. 예전 근거였던 「잠그지 않으면
 * 임원마다 레이아웃이 달라져 취합이 깨진다」는 사실이 아니었다 — 취합은 슬롯
 * 이름과 칸 값을 읽지 좌표를 읽지 않는다. 하지만 풀고 나면 새로 생기는 사고가 있다:
 * **끌다가 종이 밖으로 나가면 그 표는 아무에게도 안 보인다.** 작성자는 결재에
 * 올린 뒤에야 안다. 이 저장소에 `test_template_geometry.py` 가 있는 이유가 그거다.
 *
 * 그래서 잠그는 대신 **가둔다.** 사람이 끄는 동안 종이 가장자리에서 멈춘다.
 * 서버도 저장할 때 다시 본다(`server/template_guard.py`) — 화면만 믿지 않는다.
 *
 * 슬롯이 없는 요소는 건드리지 않는다. 그건 양식이 아니라 그 사람의 물건이고,
 * 종이에 살짝 걸쳐 두는 것도 그 사람 선택이다.
 */
function penIn(slot: string | undefined, x: number, y: number,
               w: number, h: number, W: number, H: number): { x: number; y: number } {
  if (!isSlotEl(slot)) return { x, y }
  return {
    x: Math.min(Math.max(0, x), Math.max(0, W - w)),
    y: Math.min(Math.max(0, y), Math.max(0, H - h)),
  }
}
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

/**
 * 지적 핀 하나. 올렸을 때 **어디를 가리키는지도** 함께 보여준다 —
 * 범위로 짚으면 핀은 왼쪽 위 한 칸에만 붙어서, 글만 뜨면 어디까지가
 * 지적 범위인지 다시 헤아려야 한다.
 *
 * **파일 맨 바깥에 둔다**(2026-09-16). 전에는 `FreeLayer` 안에 선언돼 있었는데,
 * 그러면 캔버스를 다시 그릴 때마다 새 부품이 되어 리액트가 핀을 **버리고 새로 만든다**.
 * 같은 잘못이 오른쪽 패널에서는 「스크롤이 맨 위로 튄다 · 치던 칸에서 손이 떨어진다」로
 * 터졌다(RightPanel 의 `Acc` 주석 참고). 핀은 제 상태가 없어 눈에 띄는 탈은 없었지만,
 * **같은 잘못**이라 같이 옮긴다.
 */
function Pin({ list, el, focusId, onFocus }: {
  list: Thread[]
  el?: FreeEl
  focusId: string | null
  onFocus: (id: string | null) => void
}) {
  return (
    <div className={'cmt-pin' + (list.every((t) => t.resolved_at) ? ' done' : '')
      + (list.some((t) => t.id === focusId) ? ' on' : '')}
      title={list.map((t) => {
        const w = tableAnchorLabel(el, t.cell)
        return (w ? w + ' — ' : '') + t.body
      }).join('\n').slice(0, 200)}
      onPointerDown={(e) => { e.stopPropagation(); onFocus(list[0].id) }}
      onClick={(e) => e.stopPropagation()}>
      {list.length}
    </div>
  )
}

/**
 * TODAY 마커 — 세로 점선 하나와 잡을 수 있는 「TODAY」 알약.
 *
 * **왜 여기(모듈 바깥)에 있나.** 컴포넌트를 다른 컴포넌트 **안에서** 만들면 렌더마다
 * 새 타입이 되어 React 가 통째로 떼었다 다시 붙인다 — 끌던 손이 떨어지고 포커스가
 * 날아간다. 오른쪽 패널이 튀던 것(`Acc`)과 같은 결함이라, `inner_component.test.mjs`
 * 가 모든 .tsx 를 훑어 막는다.
 *
 * **자리 규칙은 `slots.todayPlace` 한 군데서 온다.** 기본은 자동(실제 오늘 달),
 * 한 번 끌면 그 px 자리에 선다. 「오늘」 단추가 px 를 지워 자동으로 되돌린다.
 * 사용자 결정 ③ㄱ(2026-09-16): 자동을 잃으면 9월에 만든 자료를 11월에 열었을 때
 * 마커가 9월에 서 있는 옛 문제가 돌아온다.
 */
function TodayMark({ el, R, active, zoom, snap, patch, onPick }: {
  el: FreeEl
  R: number
  active: boolean
  zoom: (from: Element) => number
  snap: () => void
  patch: (p: Partial<FreeEl>) => void
  onPick: () => void
}) {
  const place = todayPlace(el)
  const lineRef = useRef<HTMLDivElement | null>(null)
  // **:focus-visible 로는 부족하다**(2026-09-16, 화면에서 보고 알았다). 끌어 옮긴 직후에는
  // 마우스로 포커스가 간 것이라 크롬이 `:focus-visible` 을 안 준다 — 화살표 키는 먹는데
  // 테두리는 안 보인다. 「골라 놓고 왜 표시가 없나」가 되므로 직접 표시한다.
  const [picked, setPicked] = useState(false)
  if (!place) return null

  // 표 밖으로는 못 나간다 — 규칙은 slots 에 있다(불러 볼 수 있어야 검사가 잰다).
  const clampX = (v: number) => clampTodayX(v, el.w)
  const clampY = (v: number) => clampTodayY(v, el.h)

  /** 지금 서 있는 자리를 px 로 잰다.
   *  열에 서 있을 때는 **DOM 에서 직접 읽는다.** 열 너비를 다시 계산하면 테두리
   *  1px 이 어긋나, 손을 대는 순간 마커가 톡 튀어 옮겨 간 것처럼 보인다. */
  const measure = (): { x: number; y: number } => {
    if (place.kind === 'px') return { x: place.x, y: place.y }
    const line = lineRef.current
    const box = line ? line.parentElement : null
    if (!line || !box) return { x: 0, y: 1 }
    const z = zoom(line)
    const lr = line.getBoundingClientRect(), br = box.getBoundingClientRect()
    return { x: (lr.left - br.left) / z, y: 1 }
  }

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!active) return
    // 멈추지 않으면 밑의 표가 같이 골라지고 **표째로 끌려간다.**
    e.preventDefault(); e.stopPropagation()
    const btn = e.currentTarget
    btn.focus(); onPick()
    const z = zoom(btn)
    const start = measure()
    const sx = e.clientX, sy = e.clientY
    let did = false
    btn.classList.add('drag')
    btn.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      // 되돌릴 자리는 **한 번 끄는 동안 한 번만** 찍는다. 매번 찍으면 ⌘Z 를
      // 픽셀 수만큼 눌러야 원래 자리로 돌아온다.
      if (!did) { snap(); did = true }
      patch({ todayX: clampX(start.x + (ev.clientX - sx) / z), todayY: clampY(start.y + (ev.clientY - sy) / z) })
    }
    const up = () => {
      btn.classList.remove('drag')
      btn.removeEventListener('pointermove', move)
      btn.removeEventListener('pointerup', up)
    }
    btn.addEventListener('pointermove', move)
    btn.addEventListener('pointerup', up)
  }

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!active) return
    const k = e.key
    if (k === 'Escape') { e.currentTarget.blur(); return }
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return
    // **막지 않으면 표가 움직인다.** Hotkeys 가 window 에서 같은 키로 고른 요소를
    // 옮긴다 — TODAY 를 밀려던 손이 로드맵 표를 통째로 민다.
    e.preventDefault(); e.stopPropagation()
    if (!e.repeat) snap()
    const step = e.shiftKey ? 10 : 1
    const at = measure()
    let x = at.x, y = at.y
    if (k === 'ArrowLeft') x -= step
    else if (k === 'ArrowRight') x += step
    else if (k === 'ArrowUp') y -= step
    else y += step
    patch({ todayX: clampX(x), todayY: clampY(y) })
  }

  const free = place.kind === 'px'
  return (
    <div ref={lineRef} className={'fel-today' + (free ? ' free' : '')}
      style={free
        ? { left: place.x }
        : { gridColumn: `${place.col + 1}`, gridRow: `1 / span ${R}` }}
      aria-label="이번 달">
      <button type="button" className={'fel-today-pill' + (picked ? ' picked' : '')} tabIndex={active ? 0 : -1}
        style={free ? { top: place.y } : undefined}
        title={active ? '끌어서 옮기세요 · 고른 뒤 화살표 키(Shift = 10px). 「오늘」 단추로 되돌립니다' : undefined}
        onPointerDown={onDown} onKeyDown={onKey}
        onFocus={() => setPicked(true)} onBlur={() => setPicked(false)}>TODAY</button>
    </div>
  )
}

/**
 * 되돌리기가 기억하는 **한 쪽의 모습**. 한 글로 만들어 두면 「고친 게 있나」를
 * 글자끼리 견주기만 하면 된다.
 */
function snapOf(pg: Page): string {
  return JSON.stringify({ els: pg.els, conns: pg.conns, strokes: pg.strokes, detached: pg.detached })
}

export default function FreeLayer({ page, W, H, interactive }: Props) {
  // ── 접기는 **편집 화면에서만** 듣는다 (사용자 결정 ②ㄴ · 2026-09-15) ──────
  //
  // `hidden` 은 문서에 그대로 들어 있다. 여기서만 안 그린다.
  // 결재·팀 공유(SlideViewer)·내보내기(exportPptx·PDF)는 `interactive={false}` 라
  // **저절로 다 펴진다.** 작성자가 접어 둔 걸 잊어도 결재자가 덜 보는 일이 없다 —
  // 그게 `doc_state` 의 잠금이 지키려는 것과 같은 규칙이다.
  //
  // 처음엔 「보이는 대로 내보내기」를 제안했다가 사용자가 「트리를 만든 데는 이유가
  // 있는데 왜 접어서 나가나」라고 물어 뒤집었다. 승인본이 작업본보다 적으면 안 된다.
  const hiddenIds = new Set<number>()
  if (interactive) for (const e of page.els) if (e && e.hidden) hiddenIds.add(e.id)
  const shownEls = hiddenIds.size ? page.els.filter((e) => !hiddenIds.has(e.id)) : page.els
  const shownConn = (c: { from: number; to: number }) => !hiddenIds.has(c.from) && !hiddenIds.has(c.to)
  const treeFold = useBuilder((st) => st.treeFold)
  const tshape = interactive && isTreePage(page) ? treeShape(page.els, page.conns, knownOf(page)) : null

  const tool = useCanvasUI((s) => s.tool)
  /**
   * **지금 무언가를 놓는 중인가**(도형·글상자·표·아이콘…).
   *
   * 2026-09-17 · 사용자 지적: 「텍스트 상자랑 맞물리면 도형이 생성이 안 돼.
   * 사용자 입장에선 왜 안 되지? 라고 생각이 될 수 있잖아.」 — 맞았다.
   *
   * 빈 곳을 누르면 그려지는데 **기존 요소 위를 누르면 아무 일도 안 일어났다.**
   * 커서는 십자 그대로고, 엉뚱하게 그 요소가 골라진다. 아무 말도 없다.
   * (매뉴얼 그림을 찍을 때 내가 이걸 밟고는, 고치는 대신 「빈 곳을 고르라」고
   *  매뉴얼에 적어 뒀다. 적을 게 아니라 고쳤어야 할 일이었다.)
   *
   * **막을 까닭이 없다.** 파워포인트도 키노트도 도형 도구를 든 채로는 기존 개체
   * 위에 그냥 그려진다 — 겹쳐 놓는 것이 잘못이 아니기 때문이다.
   *
   * 그래서 이 값을 **세 자리가 같이 본다**(레이어 · 요소 · 표 칸). 한 곳만 고치면
   * 「글상자 위에는 되는데 표 위에는 안 되는」 식으로 갈라진다.
   * 연결선·펜·형광펜·지우개는 요소 위 클릭이 **뜻이 있으므로** 여기 안 넣는다.
   */
  const adding = ADDABLE.indexOf(tool) >= 0
  const setTool = useCanvasUI((s) => s.setTool)
  const selEl = useCanvasUI((s) => s.selEl)
  const selEls = useCanvasUI((s) => s.selEls)
  const setSel = useCanvasUI((s) => s.setSel)
  const toggleSel = useCanvasUI((s) => s.toggleSel)
  const setSelMany = useCanvasUI((s) => s.setSelMany)
  const connSrc = useCanvasUI((s) => s.connSrc)
  // 지금 연 자료가 표준 양식인가. **서버가 심어 둔 표시**를 본다 —
  // 요소 모양으로 짐작하면 자유 이북에 표가 셋 있을 때도 양식으로 오인한다.
  const isTemplateDoc = !!useProjects((st) => st.template)
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
  // 편집 중인 노드와 "지금 값을 스토어에 반영하는 함수"를 들고 있는다.
  // 텍스트 저장은 onBlur 하나뿐인데, Esc·빈 곳 클릭은 setEditing(null) 로 요소를 먼저 언마운트해
  // onBlur 가 아예 안 붙은 상태로 사라진다 → 방금 친 글자가 통째로 유실된다.
  // 그래서 편집을 끝내는 모든 경로가 endEditing() 을 거치게 하고, 거기서 먼저 커밋한다.
  const editRef = useRef<{ id: number; node: HTMLElement; commit: () => void } | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  /**
   * **칸에 들어가기 직전의 모습.** 여기 담아 두었다가, 나올 때 **달라졌으면** 되돌리기에 넣는다.
   *
   * 2026-09-16 · 사용자: 「뒤로가기(⌘Z)가 제대로 작동 안 함」. 재 보니 도형을 옮기거나
   * 색을 칠할 때는 되돌릴 자리를 찍는데(`snap()`), **칸 글자에는 아무것도 안 찍고 있었다.**
   * 그래서 칸을 고치고 나온 뒤 ⌘Z 를 눌러도 **아무 일도 안 일어났다**(실제로 그렇게 재 봤다).
   *
   * 들어갈 때 바로 찍지 않고 **나올 때 견주는** 까닭: 들어갔다 그냥 나온 것까지 한 단계로 세면
   * ⌘Z 를 눌러도 화면이 안 바뀌는 헛걸음이 쌓인다. 사람은 「또 안 되네」로 읽는다.
   */
  const editSnapRef = useRef<string | null>(null)
  function commitEditing() {
    const cur = editRef.current
    if (!cur) return
    editRef.current = null
    const before = editSnapRef.current
    editSnapRef.current = null
    cur.commit()
    if (before == null) return
    // 스토어가 방금 바뀌었으므로 **지금 값**을 다시 읽는다 — 이 함수가 들고 있는 `page` 는 옛것이다.
    const now = useBuilder.getState().pages.find((p) => p.id === page.id)
    if (now && snapOf(now) !== before) pushSnap(page.id, before)
  }
  function endEditing() { commitEditing(); setEditing(null) }
  // 더블클릭한 화면 좌표. 편집을 켠 뒤 그 자리에 커서를 놓는 데 쓴다 —
  // contentEditable 은 다음 렌더에야 켜지므로 브라우저가 놓아 준 커서는 남지 않는다.
  const editAtRef = useRef<{ x: number; y: number } | null>(null)
  function startEditing(id: number, at?: { x: number; y: number }) {
    if (editRef.current && editRef.current.id !== id) commitEditing()
    if (editSnapRef.current == null) editSnapRef.current = snapOf(page)
    editAtRef.current = at || null
    setEditing(id)
  }
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
      // **위가 덮여 있으면 아래는 키를 안 건드린다**(2026-09-18 · ui/overlay 참고).
      if (overlayOpen()) return
      if (e.key === 'Escape') { setSel(null); setConnSrc(null); setSelConn(null); endEditing(); setMarquee(null); setTool('select'); return }
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

  // 메뉴 '삽입 → 이미지' 는 파워포인트처럼 곧바로 파일창이 떠야 한다.
  // 도구만 켜두면 "캔버스를 한 번 더 클릭해야 한다"는 걸 모르는 사람이 아무 반응 없다고 느낀다.
  useEffect(() => {
    if (!interactive) return
    const onInsert = () => {
      const el = mkFreeEl('image', Math.round(W / 2) - 130, Math.round(H / 2) - 90)
      addEl(page.id, el)
      setSel(el.id)
      setTool('select')
      pickImage(el, true)
    }
    window.addEventListener('ebook:insert-image', onInsert)
    return () => window.removeEventListener('ebook:insert-image', onInsert)
  })

  /**
   * **고르면 곧바로 놓인다**(사용자 결정 · 2026-09-17 도형, 2026-09-18 글상자·표·글맵시).
   *
   * 이름이 `ebook:insert-shape` 였는데 도형만이 아니게 되어 `ebook:place` 로 바꿨다 —
   * 이름이 하는 일과 어긋나면 다음 사람이 「도형 말고 다른 걸 놓으려면 딴 길이 있겠지」
   * 하고 길을 하나 더 판다.
   *
   * 바로 위 '삽입 → 이미지' 와 **같은 까닭, 같은 방식**이다. 그때 적어 둔
   * 「도구만 켜두면 한 번 더 클릭해야 하는 걸 모르는 사람이 아무 반응 없다고 느낀다」가
   * 도형에도 그대로 들어맞았다. 자리는 `centerSpot` 이 정한다 — 거기에 까닭을 적어 뒀다.
   *
   * **놓는 규칙은 여기 한 곳에만 둔다.** 도구줄이 직접 `addEl` 을 부르면 캔버스 밖에서
   * 요소가 생기는 길이 하나 더 생기고, 그 길은 되돌리기(snap)도 가둠(penIn)도 안 거친다.
   * 그래서 도구줄은 「이 모양을 놓아 달라」고 말만 하고, 놓는 일은 캔버스가 한다.
   *
   * **클릭해서 놓는 길은 그대로 남긴다.** 단축키(r·o·d)로 도구를 든 사람은 여전히
   * 원하는 자리를 찍어서 놓는다 — 자리를 정확히 잡고 싶을 때의 길이다.
   */
  useEffect(() => {
    if (!interactive) return
    const onPlace = (ev: Event) => {
      const type = (ev as CustomEvent<{ type?: string }>).detail?.type
      // 모르는 이름이 오면 **아무 일도 하지 않는다.** mkFreeEl 은 모르는 갈래를
      // 조용히 네모(DEFS.box)로 바꾸므로, 안 막으면 오타가 네모로 둔갑해서 나온다.
      if (!type || ADDABLE.indexOf(type) < 0) return
      const el = mkFreeEl(type, 0, 0)
      const at = centerSpot(page.els, el.w, el.h, W, H)
      el.x = at.x; el.y = at.y
      snap()
      addEl(page.id, el)
      setSel(el.id)
      setTool('select')
      // **글을 담는 것은 커서까지 넣어 준다**(2026-09-18). 도형은 놓아 두기만 해도 뜻이 있지만
      // 글상자는 「텍스트」라고 적힌 빈 상자일 뿐이다 — 재 보니 지금은 여기서 **두 번 더**
      // 눌러야 글이 써졌다(고르기 → 캔버스 찍기 → 두 번 눌러 편집, 세 걸음).
      // 메모(note)가 이미 이렇게 한다. `startEditing` 을 좌표 없이 부르면 기본 글자가
      // **통째로 골라져서**, 그냥 치면 덮어써진다(키노트·파워포인트와 같은 손놀림).
      if (type === 'text' || type === 'wordart') startEditing(el.id)
    }
    window.addEventListener('ebook:place', onPlace)
    return () => window.removeEventListener('ebook:place', onPlace)
  })

  // 편집 중일 때, 편집 중인 요소 "밖"을 누르면 값을 저장하고 편집을 끝낸다.
  // 카드 페이지는 레이어가 pointer-events:none 이라 onLayerDown 이 안 오므로 여기서 받는다.
  useEffect(() => {
    if (!interactive) return
    const onDown = (e: PointerEvent) => {
      const cur = editRef.current
      if (cur == null) return
      const t = e.target as Node | null
      if (!t) return
      const host = cur.node.closest('.fel')
      if (host && host.contains(t)) return          // 편집 중인 요소 안 → 그대로
      const page = layerRef.current?.parentElement
      if (!page || !page.contains(t)) return        // 툴바·패널 클릭은 native blur 가 처리
      endEditing()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [interactive])
  const active = interactive

  // 검토 의견 핀 — 지적이 붙은 자리를 문서 위에서 바로 가리킨다.
  // 목록만 있으면 "3번째 줄" 을 눈으로 찾아야 한다. 그게 이 기능을 만든 이유다.
  const cmtThreads = useComments((s) => s.threads)
  const cmtShowResolved = useComments((s) => s.showResolved)
  const cmtFocusId = useComments((s) => s.focusId)
  const cmtFocus = useComments((s) => s.focus)
  const pagePins = pinsOfPage(cmtThreads, page.id, cmtShowResolved)
  const pinByEl = new Map<number, typeof pagePins>()
  const pinByCell = new Map<string, typeof pagePins>()
  // 범위로 짚은 자리는 **테두리로 그린다.** 칸마다 핀을 박으면 표가 핀으로 덮이고,
  // 반대로 핀 하나만 두면 어디까지가 지적 범위인지 알 수 없다.
  // key: 'elId_r_c' → 그 칸이 범위의 어느 가장자리인지.
  const rangeEdges = new Map<string, { t: boolean; b: boolean; l: boolean; r: boolean; done: boolean }>()
  for (const t of pagePins) {
    if (t.el_id == null) continue
    const rg = parseCell(t.cell)
    // 핀은 **범위의 왼쪽 위 칸 하나에만** 붙는다.
    const key = rg ? t.el_id + '_' + rg.r0 + '_' + rg.c0 : null
    const bucket = key ? pinByCell : pinByEl
    const k = (key ?? t.el_id) as never
    const cur = (bucket as Map<unknown, typeof pagePins>).get(k) || []
    ;(bucket as Map<unknown, typeof pagePins>).set(k, [...cur, t])
    if (!rg || (rg.r0 === rg.r1 && rg.c0 === rg.c1)) continue   // 한 칸이면 핀으로 충분하다
    for (let r = rg.r0; r <= rg.r1; r++) {
      for (let c = rg.c0; c <= rg.c1; c++) {
        const kk = t.el_id + '_' + r + '_' + c
        const prev = rangeEdges.get(kk)
        const e = {
          t: r === rg.r0, b: r === rg.r1, l: c === rg.c0, r: c === rg.c1,
          done: !!t.resolved_at,
        }
        rangeEdges.set(kk, prev
          ? { t: prev.t || e.t, b: prev.b || e.b, l: prev.l || e.l, r: prev.r || e.r,
              done: prev.done && e.done }
          : e)
      }
    }
  }

  // 페이지가 작업창보다 크면 Preview 가 CSS 로 축소해 그린다(맞춤 배율).
  // 그때 마우스가 지나간 **화면 픽셀은 페이지 좌표보다 크다.** 배율로 나누지 않으면
  // 드래그·크기조절·회전이 전부 커서보다 덜 움직인다(1040px 페이지를 800px 창에 넣으면 23% 어긋난다).
  // rect.width 는 이미 축소가 반영된 값이라 논리 폭 W 로 나누면 그게 곧 현재 배율이다.
  const zoomOf = (r: { width: number }) => (r.width > 0 ? r.width / W : 1)
  const layerZoom = (from: Element) => {
    const n = from.closest('.freelayer') as HTMLElement | null
    return n ? zoomOf(n.getBoundingClientRect()) : 1
  }
  const markerId = 'fah' + page.id
  const markerStartId = 'fas' + page.id

  function snap() { pushSnap(page.id, snapOf(page)) }

  /**
   * 칸 범위를 잡는다. **병합 칸에 닿으면 그 칸 전체를 품도록 넓힌다**(tableOps.growToMerges).
   *
   * 사람이 고른 범위는 **모두 이 문으로 들어온다** — 끌기·클릭·Shift 클릭·방향키·Tab.
   * 한 군데라도 `setTableSel` 을 직접 부르면 거기서만 옛 결함이 살아남는다:
   * 2행 높이로 병합된 칸(2027년)에 닿는 순간 범위가 0행으로 **줄어들어** 월 줄이 빠졌다.
   */
  function pickRange(el: FreeEl, r0: number, c0: number, r1: number, c1: number) {
    const g = growToMerges(el.merges, r0, c0, r1, c1)
    setTableSel({ elId: el.id, r0: g.r0, c0: g.c0, r1: g.r1, c1: g.c1 })
  }

  /**
   * 머리 띠를 눌러 **줄·열을 통째로** 고른다(2026-09-16 · 사용자 결정 ㄷ).
   *
   * **`growToMerges` 를 쓰지 않는다.** 여기서 넓히면 월 줄을 눌러도 양옆의 2행 병합
   * (Project·2027년)이 딸려 와 2행이 된다 — 이 기능이 있는 이유가 바로 그걸 피하려는 것이다.
   * `bandRange` 가 「그 줄에서 시작하는 칸」만 세어 딱 맞는 범위를 준다.
   */
  function pickBand(el: FreeEl, axis: 'row' | 'col', i: number) {
    const r = bandRange(el, axis, i)
    if (!r) return
    setTableSel({ elId: el.id, r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c1 })
  }

  /** 머리 띠를 **끌면** 여러 줄이 이어서 골라진다. 두 띠의 범위를 합친다. */
  function startBandDrag(el: FreeEl, axis: 'row' | 'col', i0: number, from: Element) {
    pickBand(el, axis, i0)
    const layer = from.closest('.freelayer')
    let last = i0
    const move = (ev: PointerEvent) => {
      const node = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const band = node ? (node.closest('[data-band]') as HTMLElement | null) : null
      if (!band || band.dataset.band !== axis || band.dataset.bel !== String(el.id)) return
      if (!layer || !layer.contains(band)) return
      const i = Number(band.dataset.bi)
      if (!Number.isFinite(i) || i === last) return
      last = i
      const a = bandRange(el, axis, i0), b = bandRange(el, axis, i)
      if (!a || !b) return
      setTableSel({ elId: el.id,
        r0: Math.min(a.r0, b.r0), c0: Math.min(a.c0, b.c0),
        r1: Math.max(a.r1, b.r1), c1: Math.max(a.c1, b.c1) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── 표 셀 키보드 조작 ──────────────────────────────────────────────
  // 칸을 고른 상태에서 바로 글자를 치면 그 칸이 갈아끼워지고, Tab·방향키로 칸을 옮긴다.
  function focusCell(elId: number, r: number, c: number, mode: 'all' | 'end') {
    const n = layerRef.current?.querySelector(`[data-el-id="${elId}"] [data-rc="${r}_${c}"]`) as HTMLElement | null
    if (!n) return
    n.focus()
    const s = window.getSelection(); if (!s) return
    const rg = document.createRange(); rg.selectNodeContents(n)
    if (mode === 'end') rg.collapse(false)
    s.removeAllRanges(); s.addRange(rg)
  }
  function editCellNow(el: FreeEl, r: number, c: number, mode: 'all' | 'end') {
    // flushSync 로 편집 상태를 즉시 DOM 에 반영해야 이어지는 키 입력이 그 칸으로 들어간다.
    flushSync(() => {
      if (editRef.current && editRef.current.id !== el.id) commitEditing()
      // 여기도 **같은 자리**를 찍는다. 키보드로 칸에 들어오는 길이 따로 있어서,
      // 한쪽만 찍어 두면 「더블클릭으로 고치면 되돌아가고 키보드로 고치면 안 되는」 꼴이 된다.
      if (editSnapRef.current == null) editSnapRef.current = snapOf(page)
      editAtRef.current = null
      setEditing(el.id)
    })
    focusCell(el.id, r, c, mode)
  }
  function clearCells(el: FreeEl, ts: { r0: number; c0: number; r1: number; c1: number }) {
    const R = el.rows || 2, C = el.cols || 2
    const R0 = Math.max(0, Math.min(ts.r0, ts.r1)), R1 = Math.min(R - 1, Math.max(ts.r0, ts.r1))
    const C0 = Math.max(0, Math.min(ts.c0, ts.c1)), C1 = Math.min(C - 1, Math.max(ts.c0, ts.c1))
    const cells = (el.cells || []).map((row) => row.slice())
    while (cells.length < R) cells.push([])
    for (let r = R0; r <= R1; r++) { while (cells[r].length < C) cells[r].push(''); for (let c = C0; c <= C1; c++) cells[r][c] = '' }
    snap(); updateEl(page.id, el.id, { cells })
  }
  // capture 단계로 잡아야 Hotkeys 의 한 글자 도구 단축키·방향키 이동보다 먼저 처리된다.
  useEffect(() => {
    if (!active || editing != null || tool !== 'select' || !tableSel) return
    const onKey = (e: KeyboardEvent) => {
      // **여기가 발표 Esc 를 먹던 자리다**(2026-09-18). 이 리스너는 window 의 capture 라
      // 제일 먼저 불리고, Escape 를 「고른 칸 풀기」로 삼아 stopPropagation 한다.
      // 위에 전체 화면이 덮여 있으면 그 키는 애초에 내 것이 아니다.
      if (overlayOpen()) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const ts = useCanvasUI.getState().tableSel
      if (!ts) return
      const el = page.els.find((x) => x.id === ts.elId)
      if (!el || el.type !== 'table' || el.locked) return
      const R = el.rows || 2, C = el.cols || 2
      const r = Math.max(0, Math.min(R - 1, ts.r1)), c = Math.max(0, Math.min(C - 1, ts.c1))
      const eat = () => { e.preventDefault(); e.stopPropagation() }
      const k = e.key
      if (k === 'Escape') { eat(); setTableSel(null); return }
      if (k === 'Tab') { eat(); const nc = Math.max(0, Math.min(C - 1, c + (e.shiftKey ? -1 : 1))); pickRange(el, r, nc, r, nc); return }
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        eat()
        const dr = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0
        const dc = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0
        if (e.shiftKey) {   // Shift+방향키 = 잡은 범위를 넓히거나 좁힌다
          const nr = Math.max(0, Math.min(R - 1, ts.r1 + dr)), nc = Math.max(0, Math.min(C - 1, ts.c1 + dc))
          pickRange(el, ts.r0, ts.c0, nr, nc); return
        }
        const nr = Math.max(0, Math.min(R - 1, r + dr)), nc = Math.max(0, Math.min(C - 1, c + dc))
        pickRange(el, nr, nc, nr, nc); return
      }
      if (k === 'Enter' || k === 'F2') { eat(); editCellNow(el, r, c, 'end'); return }
      if (k === 'Delete' || k === 'Backspace') { eat(); clearCells(el, ts); return }
      // 글자 입력 → 그 칸을 통째로 갈아끼우며 편집 시작. preventDefault 를 하지 않는 게 핵심이다:
      // 눌린 키가 방금 포커스를 준 칸으로 그대로 들어가야 한글 조합도 첫 글자가 안 씹힌다.
      if (k === 'Process' || e.isComposing || (k.length === 1 && !e.repeat)) {
        e.stopPropagation()
        editCellNow(el, r, c, 'all')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))
  // 연결점(마우스를 올리면 나오는 파란 점 4개)을 안 띄우는 타입.
  //
  // 2026-09-07 에 **표(table)를 넣었다.** 표에 점이 붙으면 칸을 잡으려다 선이 그어진다 —
  // 실제로 임원회의 양식에서 그 일이 났다. 표끼리 잇는 일은 드물고, 정말 필요하면
  // 도구모음의 「→ 화살표 연결」로 이을 수 있다. **잇는 길이 없어지는 게 아니라,
  // 의도하지 않은 길 하나가 없어지는 것이다.**
  const NO_CPT = ['text', 'icon', 'wordart', 'note', 'table']
  function setFill(el: FreeEl, c: string) { snap(); updateEl(page.id, el.id, { color: c }) }
  // 그룹이면 그 그룹 전체 id, 아니면 자기 id
  function expandGroupIds(id: number): number[] {
    const e = page.els.find((x) => x.id === id)
    if (!e || e.groupId == null) return [id]
    return page.els.filter((x) => x.groupId === e.groupId).map((x) => x.id)
  }
  // 사진의 원래 비율에 맞춰 상자 크기를 정한다. 긴 변을 base 로 맞추고 페이지를 넘지 않게 한다.
  function fitBox(iw: number, ih: number, base = 260): { w: number; h: number } {
    if (!iw || !ih) return { w: base, h: Math.round(base * 0.68) }
    const k = base / Math.max(iw, ih)
    let w = Math.round(iw * k), h = Math.round(ih * k)
    const maxW = Math.round(W * 0.9), maxH = Math.round(H * 0.9)
    const s2 = Math.min(1, maxW / w, maxH / h)
    if (s2 < 1) { w = Math.round(w * s2); h = Math.round(h * s2) }
    return { w: Math.max(24, w), h: Math.max(24, h) }
  }
  // fit=true 면 사진 비율대로 상자를 다시 잡는다(새로 넣을 때).
  // 교체(더블클릭)에서는 false — 사용자가 맞춰 둔 상자를 멋대로 바꾸지 않는다.
  function pickImage(el: FreeEl, fit = false) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'
    // 문서에 붙이지 않은 input 은 브라우저에 따라 .click() 해도 파일 창이 안 뜬다
    // (Safari 계열에서 특히). 화면에 안 보이게 붙였다가 쓰고 나서 치운다.
    inp.style.position = 'fixed'; inp.style.left = '-9999px'; inp.style.opacity = '0'
    document.body.appendChild(inp)
    const cleanup = () => { if (inp.parentNode) inp.parentNode.removeChild(inp) }
    inp.onchange = () => {
      const f = inp.files && inp.files[0]
      if (!f) { cleanup(); return }
      // 원본 그대로 넣으면 자동저장이 매번 수십 MB 를 통째로 올린다 — 넣기 전에 줄인다.
      intakeImage(f)
        .then((r) => {
          snap()
          const patch: Partial<FreeEl> = { src: r.src }
          if (fit && r.w && r.h) Object.assign(patch, fitBox(r.w, r.h))
          updateEl(page.id, el.id, patch)
        })
        .catch(() => { /* 읽기 실패: 빈 이미지 상자로 남는다 */ })
        .finally(cleanup)
    }
    // 사용자가 파일 창을 그냥 닫은 경우에도 정리한다.
    inp.addEventListener('cancel', cleanup)
    inp.click()
  }

  // 셀 드래그 선택 — 끌고 지나간 칸까지 범위를 넓힌다.
  //
  // 좌표로 계산하지 않고 **elementFromPoint 로 실제 칸을 짚는다.**
  // 열 너비(colw)·행 높이(rowh)·병합이 섞이면 좌표 산술로는 어느 칸인지 못 맞춘다.
  // 병합에 덮인 자리는 앵커 칸이 그 영역을 차지하므로 앵커 좌표가 그대로 나온다.
  function startCellDrag(el: FreeEl, r0: number, c0: number, from: Element) {
    const elId = el.id
    // 같은 페이지가 필름스트립 미리보기에도 그려진다 — 거기 칸들도 data-tel 이 같다.
    // 레이어를 확인하지 않으면 커서가 미리보기 위를 지나는 순간 엉뚱한 칸이 잡힌다.
    const layer = from.closest('.freelayer')
    let last = r0 + '_' + c0
    const move = (ev: PointerEvent) => {
      const node = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const cell = node ? (node.closest('[data-tel]') as HTMLElement | null) : null
      if (!cell || cell.dataset.tel !== String(elId)) return
      if (!layer || !layer.contains(cell)) return
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c)
      if (!Number.isFinite(r) || !Number.isFinite(c)) return
      const key = r + '_' + c
      if (key === last) return
      last = key
      // **병합을 반영해 넓힌다.** 이 한 줄이 빠져 있어서, 2행 높이로 병합된 칸
      // (2027년)에 닿는 순간 범위가 0행으로 줄어들며 월 1~12 가 통째로 빠졌다.
      pickRange(el, r0, c0, r, c)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onLayerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!active) return
    // 이 줄은 원래 **요소를 끌 때 마퀴 선택이 같이 시작되는 것**을 막으려고 있다.
    // 무언가를 놓는 중일 때는 그 걱정이 없다 — 위에 그리는 것이 맞는 동작이다.
    if (e.target !== e.currentTarget && !adding) return
    const rect = e.currentTarget.getBoundingClientRect()
    const z = zoomOf(rect)
    const x = (e.clientX - rect.left) / z, y = (e.clientY - rect.top) / z
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
      const move = (ev: PointerEvent) => erase((ev.clientX - rect.left) / z, (ev.clientY - rect.top) / z)
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return
    }
    if (tool === 'pen' || tool === 'highlighter') {
      e.preventDefault(); snap()
      const isHl = tool === 'highlighter'
      const pts: [number, number][] = [[x, y]]; setPenPts([...pts])
      const move = (ev: PointerEvent) => { pts.push([(ev.clientX - rect.left) / z, (ev.clientY - rect.top) / z]); setPenPts([...pts]) }
      const up = () => {
        // 펜=자유 잉크 획만(도형/화살표 자동 변환 없음 → 지우개로 지워짐). 형광펜도 획.
        if (isHl) addStroke(page.id, { points: pts, color: hlColor, w: hlWidth, hl: true })
        else addStroke(page.id, { points: pts, color: penColor, w: penWidth })
        setPenPts(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return
    }
    // stopPropagation 이 없으면 부모(PageWithCanvas)의 onPointerDown 이 곧바로 setSel(null) 로 덮어써서
    // 방금 그린 도형에 핸들·서식 바가 안 뜨고 Delete 도 안 먹는다.
    if (ADDABLE.indexOf(tool) >= 0) { e.stopPropagation(); snap(); const el = mkFreeEl(tool, x - 50, y - 25); addEl(page.id, el); setSel(el.id); setTool('select'); if (tool === 'image') pickImage(el, true); if (tool === 'note') startEditing(el.id); return }
    if (tool === 'select') {
      setSel(null); setConnSrc(null); setSelConn(null); endEditing()
      const s0 = { x, y }
      setMarquee({ x, y, w: 0, h: 0 })
      const mv = (ev: PointerEvent) => { const cx = (ev.clientX - rect.left) / z, cy = (ev.clientY - rect.top) / z; setMarquee({ x: Math.min(s0.x, cx), y: Math.min(s0.y, cy), w: Math.abs(cx - s0.x), h: Math.abs(cy - s0.y) }) }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up)
        const cx = (ev.clientX - rect.left) / z, cy = (ev.clientY - rect.top) / z
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
    setSel(null); setConnSrc(null); endEditing()
  }
  function onLayerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!active || tool !== 'connect' || connSrc === null) { if (mouse) setMouse(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const z = zoomOf(rect)
    setMouse({ x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z })
  }
  function onElDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl) {
    if (!active) return
    if (tool === 'connect') {
      e.preventDefault(); e.stopPropagation()
      if (connSrc === null) setConnSrc(el.id)
      else if (connSrc !== el.id) { snap(); addConn(page.id, { from: connSrc, to: el.id }); setConnSrc(null); setMouse(null); setTool('select') }
      return
    }
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') { e.stopPropagation(); return }
    // **놓는 중이면 손대지 않는다.** 여기서 stopPropagation 하면 레이어가 못 받아
    // 도형이 안 생긴다 — 그게 「왜 안 되지」의 정체였다.
    if (adding) return
    e.preventDefault(); e.stopPropagation()
    // 다른 요소를 편집 중이었으면 값을 저장하고 끝낸다(안 그러면 편집 모드가 계속 남아 Delete 가 먹통).
    if (editRef.current && editRef.current.id !== el.id) endEditing()
    // preventDefault 때문에 native 포커스 이동이 없다 → 카드 텍스트칸이 포커스를 계속 쥐고 있으면
    // Hotkeys 의 '입력 중' 가드가 Delete 를 통째로 삼킨다. 여기서 직접 떼어 준다(그 칸의 onBlur 로 값도 저장됨).
    if (editRef.current == null) {
      const ae = document.activeElement as HTMLElement | null
      if (ae && ae !== document.body && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur()
    }
    // 사람이 직접 잠근 요소만 못 움직인다. 표준 양식 요소는 2026-09-07 부터 움직인다
    // — 대신 penIn() 이 종이 안에 가둔다.
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
    const lz = layerZoom(e.currentTarget)
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / lz, dy = (ev.clientY - sy) / lz
      if (Math.abs(dx) + Math.abs(dy) > 4) { if (!moved) snap(); moved = true }
      if (single) {
        const s0 = starts[0]
        const sr = computeSnap(el.w, el.h, s0.x + dx, s0.y + dy, page.els.filter((o) => o.id !== el.id), W, H)
        setGuides(sr.v.length || sr.h.length ? { v: sr.v, h: sr.h } : null)
        const pin = penIn(el.slot, sr.x, sr.y, el.w, el.h, W, H)
        updateEl(page.id, el.id, { x: pin.x, y: pin.y })
      } else {
        moveEls(page.id, starts.map((s0) => {
          const d = page.els.find((x) => x.id === s0.id)
          const pin = penIn(d?.slot, s0.x + dx, s0.y + dy, d?.w || 0, d?.h || 0, W, H)
          return { id: s0.id, x: pin.x, y: pin.y }
        }))
      }
    }
    const up = () => { setGuides(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved && already && selEls.length > 1) setSel(el.id) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  /**
   * 열 너비 · 행 높이 끌기 — **경계선 하나**를 옮긴다.
   *
   * 여태 `colw`/`rowh` 는 **읽기만 하고 아무도 쓰지 않았다.** 그리는 코드와 행·열을
   * 넣고 뺄 때 배열 길이를 맞추는 코드뿐이었다. 그래서 로드맵의 '사업그룹' 열이
   * 좁으면 사업명이 세 줄로 접히는데 넓힐 방법이 없었다.
   *
   * 합을 그대로 두므로 **표 전체 크기는 안 변한다** — 한쪽이 넓어지면 옆이 좁아진다.
   * 표를 키우는 것은 모서리 손잡이가 할 일이다. 둘을 한 동작에 섞으면 열 하나
   * 넓히려다 표가 종이 밖으로 나간다.
   */
  function onTrackDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl,
                       axis: 'col' | 'row', i: number) {
    e.preventDefault(); e.stopPropagation()
    const n = axis === 'col' ? (el.cols || 1) : (el.rows || 1)
    const base = trackSizes(axis === 'col' ? el.colw : el.rowh, n)
    const px = axis === 'col' ? el.w : el.h
    const lz = layerZoom(e.currentTarget)
    const s0 = axis === 'col' ? e.clientX : e.clientY
    let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const d = ((axis === 'col' ? ev.clientX : ev.clientY) - s0) / lz
      const next = dragTrack(base, i, d, px)
      updateEl(page.id, el.id, axis === 'col' ? { colw: next } : { rowh: next })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>, el: FreeEl, dir: string) {
    e.preventDefault(); e.stopPropagation()
    const layer = (e.currentTarget as HTMLElement).closest('.freelayer') as HTMLElement | null
    const rect = layer ? layer.getBoundingClientRect() : null
    if (!rect) return
    const th = (el.rot || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th)
    const R = (px: number, py: number) => ({ x: px * cos - py * sin, y: px * sin + py * cos })
    const z = zoomOf(rect)
    const ow = el.w, oh = el.h, cx0 = el.x + ow / 2, cy0 = el.y + oh / 2
    const signX = dir.indexOf('e') >= 0 ? 1 : dir.indexOf('w') >= 0 ? -1 : 0
    const signY = dir.indexOf('s') >= 0 ? 1 : dir.indexOf('n') >= 0 ? -1 : 0
    const al = R(-signX * ow / 2, -signY * oh / 2)   // 반대편(고정) 앵커의 중심기준 오프셋(회전 반영)
    const Ax = cx0 + al.x, Ay = cy0 + al.y
    const MINW = 20, MINH = 16; let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const wx = (ev.clientX - rect.left) / z - Ax, wy = (ev.clientY - rect.top) / z - Ay
      const lx = wx * cos + wy * sin, ly = -wx * sin + wy * cos
      const nw = signX !== 0 ? Math.max(MINW, Math.abs(lx)) : ow
      const nh = signY !== 0 ? Math.max(MINH, Math.abs(ly)) : oh
      const off = R(signX * nw / 2, signY * nh / 2)
      const ncx = Ax + off.x, ncy = Ay + off.y
      // 양식 요소는 종이를 넘지 못한다. 폭·높이를 먼저 종이 크기로 자른 뒤 자리를 가둔다 —
      // 순서를 뒤집으면 종이보다 큰 상자를 0 에 붙여 놓고 오른쪽이 잘려 나간다.
      // (회전한 요소는 회전 전 상자로 잰다. 양식 요소는 회전하지 않는다.)
      const bw = isSlotEl(el.slot) ? Math.min(nw, W) : nw
      const bh = isSlotEl(el.slot) ? Math.min(nh, H) : nh
      const pin = penIn(el.slot, Math.round(ncx - bw / 2), Math.round(ncy - bh / 2), bw, bh, W, H)
      updateEl(page.id, el.id, { x: pin.x, y: pin.y, w: Math.round(bw), h: Math.round(bh) })
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
    const z = zoomOf(rect)
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2; let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const px = (ev.clientX - rect.left) / z, py = (ev.clientY - rect.top) / z
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
    const gz = layerZoom(e.currentTarget)
    const sx0 = e.clientX, sy0 = e.clientY; let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const dx = (ev.clientX - sx0) / gz, dy = (ev.clientY - sy0) / gz
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
    const z = zoomOf(rect)
    const gcx = (bx + bx2) / 2, gcy = (by + by2) / 2
    const starts = sel0.map((el) => ({ id: el.id, cx: el.x + el.w / 2, cy: el.y + el.h / 2, w: el.w, h: el.h, rot: el.rot || 0 }))
    const a0 = Math.atan2((e.clientY - rect.top) / z - gcy, (e.clientX - rect.left) / z - gcx); let did = false
    const move = (ev: PointerEvent) => {
      if (!did) { snap(); did = true }
      const a = Math.atan2((ev.clientY - rect.top) / z - gcy, (ev.clientX - rect.left) / z - gcx)
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
    const z = zoomOf(rect)
    const move = (ev: PointerEvent) => { setNodeDrag({ fromId: el.id, x: (ev.clientX - rect.left) / z, y: (ev.clientY - rect.top) / z }) }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setNodeDrag(null)
      const x = (ev.clientX - rect.left) / z, y = (ev.clientY - rect.top) / z
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
      setSel(nb.id); startEditing(nb.id)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  function onLineDown(e: React.PointerEvent<SVGPathElement>, i: number) {
    if (!active) return
    e.preventDefault(); e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect(); const z = zoomOf(rect); let did = false, moved = false
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= 4) return
      moved = true
      const x = (ev.clientX - rect.left) / z, y = (ev.clientY - rect.top) / z
      if (!did) { snap(); did = true } updateConn(page.id, i, { x, y }); setBending({ x, y })
    }
    const up = () => { setBending(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) setSelConn(i) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const conns = page.conns.map((c, i) => {
    if (!shownConn(c)) return null
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
    if (!shownConn(c)) return null
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
    <div ref={layerRef} className={'freelayer' + (active ? '' : ' off') + (active && tool === 'select' && !page.free ? ' passthru' : '')} style={{ width: W, height: H, cursor: !active ? undefined : tool === 'pen' ? PEN_CUR : tool === 'highlighter' ? HL_CUR : tool === 'eraser' ? eraserCur(eraserWidth) : ADDABLE.indexOf(tool) >= 0 ? 'crosshair' : undefined }} onPointerDown={onLayerDown} onPointerMove={active ? onLayerMove : undefined}>
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
      {shownEls.map((el) => {
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
        // 선 모양(실선·파선·점선). 안 적혀 있으면 실선 — 옛 자료가 그대로 보인다.
        if (el.borderDash) style.borderStyle = el.borderDash
        /**
         * **오려 만드는 갈래.** 오리는 규칙을 CSS 가 아니라 여기서 입힌다 —
         * 꼭짓점 한 벌(shapePaths)로 **오리고 또 그리려면** 두 곳이 같은 숫자를 봐야 한다.
         *
         * 상자 테두리는 **아예 끈다.** 오릴 때 같이 잘려서 꼭짓점에 자국만 남기 때문이다.
         * 선은 밑에서 SVG 로 그린다.
         */
        const clipped = CLIPPED.includes(el.type)
        if (clipped) {
          style.clipPath = polyClip(el.type)
          style.borderRadius = SHAPE_RADIUS[el.type] ?? 0
          style.borderWidth = 0
        }
        const txtStyle: CSSProperties = { fontSize: el.fs }
        if (el.bold) txtStyle.fontWeight = 800
        if (el.tcolor) txtStyle.color = el.tcolor
        else if (el.color === '#111318') txtStyle.color = '#fff'
        if (el.wa) { txtStyle.fontWeight = 900; txtStyle.letterSpacing = '0.01em'; txtStyle.textShadow = '0 1px 0 rgba(0,0,0,.18)' }
        if (el.italic) txtStyle.fontStyle = 'italic'
        if (el.underline) txtStyle.textDecoration = 'underline'
        if (el.align) txtStyle.textAlign = el.align
        // `locked` 를 화면에 내보낸다. 예전에는 잠긴 요소도 손 모양(cursor:move)이라
        // 「잡을 수 있다」고 말해 놓고 안 움직였다 — 사용자는 자기가 잘못 잡은 줄 안다.
        // 글상자는 못 움직여도 **글자는 고칠 수 있으므로** 글자 커서를 준다.
        const cls = 'fel ' + el.type + (selEls.includes(el.id) ? ' sel' : '') + (connSrc === el.id ? ' connsrc' : '')
          + (el.type === 'image' && el.src ? ' filled' : '') + (el.locked ? ' locked' : '')
        const editingThis = editing === el.id
        return (
          <div key={el.id} className={cls} style={style}
            data-el-id={el.id}
            title={el.locked && !isTable && !isImg && !isNote
              ? '더블클릭하면 글자를 고칠 수 있어요' : undefined}
            data-goto-seq={el.gotoSeq || undefined}
            onPointerDown={active ? (e) => onElDown(e, el) : undefined}
            onPointerEnter={active && tool === 'select' ? () => setHoverId(el.id) : undefined}
            onPointerLeave={active && tool === 'select' ? () => setHoverId((h) => (h === el.id ? null : h)) : undefined}
            onDoubleClick={active ? (e) => { if (isImg) pickImage(el); else startEditing(el.id, { x: e.clientX, y: e.clientY }) } : undefined}>
            {/* **오려 만든 갈래의 테두리.** 상자에 그릴 수 없으니 그 위에 선을 얹는다.
                굵기를 두 배로 그리면 바깥 절반이 오리는 규칙에 잘려 **딱 제 굵기**만 남고,
                선이 모양 안쪽에 정확히 붙는다. (SVG 에는 「안쪽 선」이 따로 없다.) */}
            {clipped && (el.borderWidth ?? 1.5) > 0 ? (
              <svg className="fel-outline" viewBox={`0 0 ${el.w} ${el.h}`} aria-hidden="true">
                <polygon points={polyPoints(el.type, el.w, el.h)} fill="none"
                  stroke={el.borderColor || '#cfd5e2'}
                  strokeWidth={(el.borderWidth ?? 1.5) * 2}
                  strokeDasharray={dashArray(el.borderDash, el.borderWidth ?? 1.5)}
                  strokeLinecap={el.borderDash === 'dotted' ? 'round' : undefined} />
              </svg>
            ) : null}
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
                  // 템플릿 슬롯이면 헤더가 여러 행일 수 있다(로드맵은 연도 행 + 월 행 = 2).
                  const headRows = isSlotEl(el.slot) ? lockedRowCount(el.slot) : (head ? 1 : 0)
                  const tableActive = selEls.includes(el.id)
                  const ts = (tableSel && tableSel.elId === el.id) ? tableSel : null
                  const inSel = (r: number, c: number) => !!ts && r >= Math.min(ts.r0, ts.r1) && r <= Math.max(ts.r0, ts.r1) && c >= Math.min(ts.c0, ts.c1) && c <= Math.max(ts.c0, ts.c1)
                  return (
                    <div className="feltable" style={{ display: 'grid', gridTemplateColumns: sizeTracks(el.colw, C), gridTemplateRows: sizeTracks(el.rowh, R), width: '100%', height: '100%', position: 'relative' }}>
                      {Array.from({ length: R * C }).map((_, k) => {
                        const r = Math.floor(k / C), c = k % C
                        if (cov.has(r + '_' + c)) return null
                        const m = mergeCovering(el.merges, r, c)
                        const val = (el.cells && el.cells[r] && el.cells[r][c]) || ''
                        const al = (el.calign && el.calign[r + '_' + c]) || undefined
                        // 셀별 세로 정렬·글자 크기(ebook_html 이식). 지정이 없으면 표 기본값을 쓴다.
                        const va = (el.cvalign && el.cvalign[r + '_' + c]) || undefined
                        const cfs = (el.cfs && el.cfs[r + '_' + c]) || el.fs
                        // 편집 중에는 칸 선택 하이라이트를 걷는다 — 글자와 겹쳐 읽기 어렵다.
                        const sel = !editingThis && inSel(r, c)
                        const isHead = r < headRows
                        // 셀 배경색 — 로드맵 진행 셀. 선택 하이라이트가 항상 우선한다.
                        const bg = el.cbg && el.cbg[r + '_' + c]
                        const cellBg = sel ? '#dbe7ff'
                          : (bg ? cellBackground(bg) : (isHead ? '#f2f5fa' : '#fff'))
                        // 헤더 행과 자동 채번 열은 편집 불가(사양 §5).
                        const canEdit = editingThis && cellEditable(el.slot, r, c)
                        // 지적 범위 테두리. 파랑은 '지금 내가 고른 칸' 이라 쓸 수 없다 —
                        // 같은 색이면 내가 고른 것인지 남이 짚은 것인지 구분되지 않는다.
                        const rgE = rangeEdges.get(el.id + '_' + r + '_' + c)
                        const rgC = rgE ? (rgE.done ? '#2f9e59' : '#e08b2c') : ''
                        const pins = pinByCell.get(el.id + '_' + r + '_' + c)
                        return (
                          <Fragment key={k}>
                          <div className={'feltd' + (sel ? ' cellsel' : '') + (rgE ? ' cmt-rg' : '') + (editingThis && !canEdit ? ' cell-locked' : '')} suppressContentEditableWarning
                            data-tel={el.id} data-r={r} data-c={c} data-rc={r + '_' + c}
                            title={editingThis && !canEdit ? '이 칸은 표준 양식이라 수정할 수 없어요' : undefined}
                            style={{ border: bw + 'px ' + (el.borderDash || 'solid') + ' ' + border, fontSize: cfs, padding: '3px 5px', overflow: 'hidden', background: cellBg, color: sel ? undefined : cellTextColor(bg), fontWeight: isHead ? 700 : 400, textAlign: al, gridColumn: m ? `${c + 1} / span ${m.cs}` : `${c + 1}`, gridRow: m ? `${r + 1} / span ${m.rs}` : `${r + 1}`, userSelect: canEdit ? 'text' : 'none', cursor: canEdit ? 'text' : 'default',
                              ...(va ? { display: 'flex', flexDirection: 'column' as const, justifyContent: va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start' } : null),
                              ...(rgE ? {
                                boxShadow: `inset 0 0 0 999px ${rgE.done ? 'rgba(47,158,89,.08)' : 'rgba(224,139,44,.10)'}`,
                                borderTopColor: rgE.t ? rgC : undefined,
                                borderBottomColor: rgE.b ? rgC : undefined,
                                borderLeftColor: rgE.l ? rgC : undefined,
                                borderRightColor: rgE.r ? rgC : undefined,
                                borderTopWidth: rgE.t ? 2 : undefined,
                                borderBottomWidth: rgE.b ? 2 : undefined,
                                borderLeftWidth: rgE.l ? 2 : undefined,
                                borderRightWidth: rgE.r ? 2 : undefined,
                              } : {}) }}
                            contentEditable={canEdit}
                            onKeyDown={canEdit ? (e) => {
                              // 값은 endEditing() 이 먼저 커밋한다. 칸을 옮기기 전에 반드시 거쳐야 한다.
                              const to = (nr: number, nc: number) => { e.preventDefault(); e.stopPropagation(); endEditing(); pickRange(el, nr, nc, nr, nc) }
                              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endEditing(); return }
                              if (e.key === 'Enter' && !e.shiftKey) { to(Math.min(R - 1, r + 1), c); return }
                              if (e.key === 'Tab') { to(r, e.shiftKey ? Math.max(0, c - 1) : Math.min(C - 1, c + 1)) }
                            } : undefined}
                            onPointerDown={(e) => {
                              // 표 칸도 마찬가지다. 여기만 빼 두면 「글상자 위에는
                              // 그려지는데 표 위에는 안 되는」 반쪽이 된다.
                              if (adding) return
                              if (editingThis) { e.stopPropagation(); return }
                              // Shift+클릭은 요소 다중 선택에 쓴다 — 표가 아직 안 골라졌으면 흘려보낸다.
                              if (e.shiftKey && !tableActive) return
                              e.stopPropagation()
                              // **다른 요소를 편집 중이었으면 거기서 끝낸다.**
                              // 칸의 onBlur 는 값만 커밋하고 `editing` 은 그대로 둔다.
                              // 그러면 옛 표가 계속 편집 모드로 남아 모든 칸이
                              // contentEditable 이고, editing 을 보는 다른 겹들도 계속 숨는다.
                              // onElDown 은 이미 같은 일을 하는데 칸으로 들어오는 길에만 빠져 있었다.
                              if (editing != null && editing !== el.id) endEditing()
                              // **첫 누름도 칸 선택으로 시작한다.**
                              //
                              // 예전에는 첫 누름을 표 고르는 데만 쓰고 onElDown 으로 흘려보냈다.
                              // 그러면 누르자마자 끄는 사람에게는 **표가 통째로 움직인다** —
                              // 실제로 126px 밀렸고, 칸을 고르려던 사람 눈에는 '드래그가 안 되는'
                              // 것으로 보였다. 표를 이 자리에서 옮기는 일은 거의 없고,
                              // 칸을 고르는 일은 매번 있다. 표 이동은 ⠿ 손잡이가 맡는다.
                              if (!tableActive) setSel(el.id)
                              if (e.shiftKey && ts) { pickRange(el, ts.r0, ts.c0, r, c); return }
                              pickRange(el, r, c, r, c)
                              startCellDrag(el, r, c, e.currentTarget)
                            }}
                            onDoubleClick={(e) => {
                              // 더블클릭한 **그 칸**에 커서를 놓는다.
                              // 예전엔 표 전체가 편집 모드로 바뀌기만 해서, 글자를 쓰려면
                              // 한 번 더 클릭해야 했다. 더블클릭했는데 아무 일도 안 일어난
                              // 것처럼 보이는 게 문제였다.
                              if (editingThis) return        // 이미 편집 중이면 기본 동작(단어 선택)에 맡긴다
                              e.stopPropagation()
                              startEditing(el.id)          // 이전 편집분을 먼저 저장하고 시작
                              if (!cellEditable(el.slot, r, c)) return
                              const node = e.currentTarget
                              requestAnimationFrame(() => requestAnimationFrame(() => node.focus()))
                            }}
                            onFocus={canEdit ? (e) => {
                              const n = e.currentTarget
                              editRef.current = { id: el.id, node: n, commit: () => {
                                const cells = (el.cells || []).map((row) => row.slice())
                                while (cells.length < R) cells.push([])
                                while (cells[r].length < C) cells[r].push('')
                                cells[r][c] = n.textContent || ''
                                updateEl(page.id, el.id, { cells })
                              } }
                            } : undefined}
                            onBlur={canEdit ? () => { commitEditing() } : undefined}
                          >{val}</div>
                          {/* 핀은 칸 **밖**에 그린다.

                              안에 두면 편집 중인 칸의 자식이 둘(글자 + 핀)이 된다.
                              자식이 하나면 React 는 textContent 로 글자를 갈아 끼우지만,
                              둘이면 마디를 하나씩 맞춰 넣는 방식으로 바뀐다. 그러면
                              React 가 빈 값('')으로 만들어 둔 글자 마디가 그대로 남은 채
                              브라우저가 타자용 마디를 하나 더 만든다 — 마디가 둘이 된다.
                              커밋한 값이 되돌아오는 순간 React 는 **자기 마디**만 채우므로
                              화면에는 같은 글자가 두 번 찍힌다. 빈 칸에 처음 쓸 때만
                              벌어지던 게 이것이다.

                              하나 더. 커밋은 n.textContent 를 읽는데 핀은 자기 개수를
                              글자로 그린다(1, 2...). 핀이 칸 안에 있으면 의견이 하나 달린
                              칸에 '가' 를 쓰면 '가1' 이 저장된다 — 화면에는 안 보이고
                              저장에만 남는, 알아채기 어려운 오염이다.

                              같은 격자 자리에 겹쳐 두므로 핀이 보이는 위치는 그대로다. */}
                          {pins ? (
                            <div className="feltd-pin"
                              data-r={r} data-c={c} data-rc={r + '_' + c}
                              style={{ gridColumn: m ? `${c + 1} / span ${m.cs}` : `${c + 1}`, gridRow: m ? `${r + 1} / span ${m.rs}` : `${r + 1}` }}>
                              <Pin list={pins} el={el} focusId={cmtFocusId} onFocus={cmtFocus} />
                            </div>
                          ) : null}
                          </Fragment>
                        )
                      })}
                      {ts && ts.elId === el.id && !editingThis ? (() => {
                        const R0 = Math.min(ts.r0, ts.r1), R1 = Math.max(ts.r0, ts.r1)
                        const C0 = Math.min(ts.c0, ts.c1), C1 = Math.max(ts.c0, ts.c1)
                        return <div className="feltsel" style={{ gridColumn: `${C0 + 1} / ${C1 + 2}`, gridRow: `${R0 + 1} / ${R1 + 2}`, border: '2px solid #2f6df6', margin: -1, borderRadius: 2, pointerEvents: 'none', zIndex: 3 }} />
                      })() : null}
                      {/* 이동 손잡이(⠿)는 **표 밖**에 그린다 — 손잡이 겹인 아래쪽
                          overlay 에 있다. `.fel` 이 overflow:hidden 이라 여기서 밖으로
                          내보내면 잘려서 잡을 수가 없다. 2026-09-07 에 옮겼다. */}
                      {/* Today 마커 — 기본은 실제 오늘을 따라가고(slots.todayPlace),
                          끌거나 화살표 키로 밀면 그 자리에 선다. 위 도구모음의
                          「오늘」이 다시 자동으로 되돌린다. */}
                      <TodayMark el={el} R={R} active={active}
                        zoom={layerZoom} snap={snap}
                        patch={(pp) => updateEl(page.id, el.id, pp)}
                        onPick={() => setSel(null)} />
                    </div>
                  )
                })()
              : isImg
              ? (el.src
                  ? <img src={el.src} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  : <div className="feltext" style={{ fontSize: 11, color: '#8a93a5' }}>더블클릭해서 이미지 올리기</div>)
              : (editingThis
                  ? <div className="feltext" contentEditable suppressContentEditableWarning spellCheck={spell} style={txtStyle}
                      ref={(n) => {
                        // 인라인 ref 는 렌더마다 다시 붙는다. 같은 노드면 아무 것도 하지 않는다 —
                        // 예전처럼 매번 focus() 하면 마우스를 움직이기만 해도 포커스를 되훔쳐
                        // 다른 도형을 골라 Delete 했을 때 엉뚱하게 이 텍스트가 지워진다.
                        if (!n) return
                        if (editRef.current && editRef.current.node === n) return
                        editRef.current = { id: el.id, node: n, commit: () => updateEl(page.id, el.id, { text: n.textContent || '' }) }
                        n.focus()
                      }}
                      onFocus={(e) => { const n = e.currentTarget; requestAnimationFrame(() => {
                        const sel = window.getSelection(); if (!sel || !sel.isCollapsed) return
                        const at = editAtRef.current; editAtRef.current = null
                        const cr = at && (document as any).caretRangeFromPoint ? (document as any).caretRangeFromPoint(at.x, at.y) as Range | null : null
                        const r = document.createRange()
                        if (cr && n.contains(cr.startContainer)) { r.setStart(cr.startContainer, cr.startOffset); r.collapse(true) }
                        else r.selectNodeContents(n)   // 좌표를 못 얻으면 예전처럼 전체 선택
                        sel.removeAllRanges(); sel.addRange(r)
                      }) }}
                      onBlur={() => { endEditing() }}>{el.text}</div>
                  : <div className="feltext" style={txtStyle}>{el.text}</div>)}
            {active && isNote && editingThis ? <div className="note-drag" title="드래그해서 이동">⠿</div> : null}
            {(() => { const ps = pinByEl.get(el.id); return ps ? <Pin list={ps} focusId={cmtFocusId} onFocus={cmtFocus} /> : null })()}
          </div>
        )
      })}
      {/* **앞 장에서 이어진 조각이라고 말해 준다**(ㄷ · 2026-09-14).
          조각은 머리글을 다시 달고 있어서 **그냥 보면 새 표처럼 보인다** — 그러면
          2쪽만 펼친 사람이 앞 장을 안 찾아보고 같은 내용을 여기 또 적는다.

          **요소 밖에 그린다.** `.fel` 은 `overflow:hidden` 이라(긴 글자가 칸 밖으로
          새는 것을 막는다) 안에 넣으면 표 위로 올린 띠가 통째로 잘린다.
          실물에서 그렇게 나왔다 — DOM 에는 있는데 화면에는 없었다.

          **오른쪽 끝에 붙인다.** 왼쪽 위는 요소 도구막대(⧉ ▲ ▼ 🗑)가 뜨는 자리다 —
          거기 두면 표를 고르는 순간 글자가 그 밑으로 들어가 안 읽힌다. 이것도 실물에서 봤다. */}
      {page.els.map((el) => (el.type === 'table' && isContinuation(el) ? (
        <div key={'cont' + el.id} className="tbl-cont" aria-hidden="true"
          style={{ left: el.x + el.w, top: Math.max(0, el.y - 16) }}>
          ↳ 앞 장에서 이어짐 — {(el.contFrom || 0) + 1}줄부터
        </div>
      ) : null))}

      {/* **가지 접기 손잡이**(②). 상자 **밖**에 그린다 — `.fel` 이 `overflow:hidden` 이라
          안에 넣으면 왼쪽으로 삐져나온 손잡이가 통째로 잘린다(이어 적기 띠에서 겪은 것과 같다).
          자식이 있는 상자에만, 그리고 **편집 화면에서만** 나온다.
          접힌 상자 오른쪽의 「+N」은 **접어서 안 보이는 상자 수**다 — 몇 개를 덮었는지
          모르면 접은 걸 잊는다. */}
      {tshape ? shownEls.map((el) => {
        if (el.echoOf != null) return null
        const kids = (tshape.kids.get(el.id) || []).length
        if (!kids) return null
        const n = el.folded ? descendantCount(tshape, el.id) : 0
        return (
          <Fragment key={'fold' + el.id}>
            {/* **상자 왼쪽 아래 모서리**에 붙인다. 화면에서 보고 두 번 옮겼다 —
                왼쪽 가운데는 **들어오는 화살촉**과 겹쳤고, 위쪽은 요소 도구막대 자리다. */}
            <button className="tree-fold" title={el.folded ? '펴기' : '접기'}
              style={{ left: el.x + 1, top: el.y + el.h + 2 }}
              onPointerDown={(e) => { e.stopPropagation() }}
              onClick={(e) => { e.stopPropagation(); pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })); treeFold(page.id, el.id) }}>
              {el.folded ? '▸' : '▾'}
            </button>
            {el.folded ? (
              <span className="tree-plusn" aria-hidden="true" style={{ left: el.x + el.w + 6, top: el.y + 8 }}>+{n}</span>
            ) : null}
          </Fragment>
        )
      }) : null}

      {/* 크기 손잡이.
          예전에는 「그 표의 칸이 골라져 있으면」 숨겼다. 그런데 표는 **한 번만 눌러도
          칸이 골라진다**(그게 맞는 동작이다). 그래서 손잡이를 보려면 Esc 를 눌러야 했고,
          아무도 그걸 모른다 — 「크기 조절이 안 된다」로 보인다.
          숨긴 이유는 손잡이가 표 가장자리 칸 위에 겹쳐 칸 고르기를 가로채기 때문이었다.
          그러면 숨길 게 아니라 **칸 밖으로 밀어내면 된다.** */}
      {active && selEls.length === 1 && selEl != null && editing == null && tool === 'select' ? (() => {
        const se = page.els.find((e) => e.id === selEl)
        if (!se || se.locked) return null
        const w = se.w, h = se.h
        const isTbl = se.type === 'table'
        // 표는 손잡이를 칸 **밖**으로 낸다. 칸 위에 겹치면 칸 고르기를 가로챈다.
        // 20px 이나 나가는 이유: 표에는 바로 안쪽에 열·행 경계선 손잡이 띠가 한 겹 더
        // 있어서, 가운데 변 손잡이(n·w)가 그 띠의 한가운데 boundary 와 겹친다.
        // 2열짜리 표에서는 정확히 같은 자리다 — 하나를 잡으려다 다른 게 잡힌다.
        //
        // **종이 가장자리에 붙은 표에서는 그만큼 안으로 들인다.** 밖으로만 내면
        // 종이 밖에 그려져 잘리고, 아래쪽에 딱 붙은 표는 크기를 바꿀 방법이 아예 없어진다.
        // 자리가 없으면 0 이 되어 예전처럼 테두리 위에 선다 — 겹치는 것보다 낫다.
        const pad0 = isTbl ? 20 : 0
        const room = (v: number) => Math.max(0, Math.min(pad0, Math.round(v)))
        const padL = room(se.x), padT = room(se.y)
        const padR = room(W - (se.x + w)), padB = room(H - (se.y + h))
        // 띠(열·행 경계선)도 같은 이유로 자리가 없으면 안쪽에 붙인다.
        const bandT = se.y >= 15 ? -14 : 1
        const bandL = se.x >= 15 ? -14 : 1
        const HS: { d: string; x: number; y: number; cur: string }[] = [
          { d: 'nw', x: -padL, y: -padT, cur: 'nwse-resize' },
          { d: 'n', x: w / 2, y: -padT, cur: 'ns-resize' },
          { d: 'ne', x: w + padR, y: -padT, cur: 'nesw-resize' },
          { d: 'e', x: w + padR, y: h / 2, cur: 'ew-resize' },
          { d: 'se', x: w + padR, y: h + padB, cur: 'nwse-resize' },
          { d: 's', x: w / 2, y: h + padB, cur: 'ns-resize' },
          { d: 'sw', x: -padL, y: h + padB, cur: 'nesw-resize' },
          { d: 'w', x: -padL, y: h / 2, cur: 'ew-resize' },
        ]
        return (
          <div style={{ position: 'absolute', left: se.x, top: se.y, width: w, height: h, transform: se.rot ? `rotate(${se.rot}deg)` : undefined, transformOrigin: 'center', pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', left: w / 2, top: -22, width: 1, height: 22, background: '#2462EB' }} />
            <div title="회전(Shift=15°)" style={{ position: 'absolute', left: w / 2 - 7, top: -29, width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2px solid #2462EB', boxShadow: '0 1px 3px rgba(0,0,0,.25)', cursor: 'grab', pointerEvents: 'auto' }} onPointerDown={(e) => onRotateDown(e, se)} />
            {/* 손잡이에 이름을 준다 — 브라우저 테스트가 「오른쪽 아래를 끌었다」를
                말할 수 있어야 크기 조절이 실제로 되는지 확인할 수 있다. */}
            {HS.map((hh) => (
              <div key={'rh' + hh.d} className={'rs-h rs-' + hh.d} data-rs={hh.d}
                style={{ position: 'absolute', left: hh.x - 5, top: hh.y - 5, width: 10, height: 10, borderRadius: 2, background: '#fff', border: '1.5px solid #2462EB', boxShadow: '0 1px 2px rgba(0,0,0,.25)', cursor: hh.cur, pointerEvents: 'auto' }}
                onPointerDown={(e) => onResizeDown(e, se, hh.d)} />
            ))}
            {/* 열·행 경계선 손잡이 — 표를 골랐을 때만 나온다.
                표 **밖**(위쪽 띠 · 왼쪽 띠)에 두므로 칸 고르기와 부딪히지 않는다. */}
            {isTbl ? (() => {
              const C = se.cols || 1, R = se.rows || 1
              const cw = trackSizes(se.colw, C), rh = trackSizes(se.rowh, R)
              const cT = cw.reduce((a, b) => a + b, 0), rT = rh.reduce((a, b) => a + b, 0)
              const out: React.ReactNode[] = []
              // ── 머리 띠(누르면 그 줄·열 통째로) ───────────────────────
              // **경계 손잡이보다 먼저** 그린다 — 뒤에 그린 손잡이가 위에 얹혀,
              // 경계에서는 크기 조절이 이긴다. 띠 하나가 두 가지 일을 한다.
              let bacc = 0
              for (let i = 0; i < C; i++) {
                const x0 = bacc; bacc += cw[i]
                out.push(<div key={'cb' + i} className="trk-band trk-band-col"
                  data-band="col" data-bi={i} data-bel={se.id}
                  title="눌러서 이 열 통째로 고르기 (끌면 여러 열)"
                  style={{ left: (x0 / cT) * 100 + '%', width: (cw[i] / cT) * 100 + '%', top: bandT }}
                  onPointerDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); startBandDrag(se, 'col', i, ev.currentTarget) }} />)
              }
              bacc = 0
              for (let i = 0; i < R; i++) {
                const y0 = bacc; bacc += rh[i]
                out.push(<div key={'rb' + i} className="trk-band trk-band-row"
                  data-band="row" data-bi={i} data-bel={se.id}
                  title="눌러서 이 줄 통째로 고르기 (끌면 여러 줄)"
                  style={{ top: (y0 / rT) * 100 + '%', height: (rh[i] / rT) * 100 + '%', left: bandL }}
                  onPointerDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); startBandDrag(se, 'row', i, ev.currentTarget) }} />)
              }
              let acc = 0
              for (let i = 0; i < C - 1; i++) {
                acc += cw[i]
                out.push(<div key={'cg' + i} className="trk-grip trk-col" title="끌어서 열 너비 조절"
                  style={{ left: (acc / cT) * 100 + '%', top: bandT }}
                  onPointerDown={(ev) => onTrackDown(ev, se, 'col', i)} />)
              }
              acc = 0
              for (let i = 0; i < R - 1; i++) {
                acc += rh[i]
                out.push(<div key={'rg' + i} className="trk-grip trk-row" title="끌어서 행 높이 조절"
                  style={{ top: (acc / rT) * 100 + '%', left: bandL }}
                  onPointerDown={(ev) => onTrackDown(ev, se, 'row', i)} />)
              }
              return <>{out}</>
            })() : null}
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
      {/* 연결점. **표준 양식에서는 아예 안 그린다** —
          임원은 양식만 쓰고 거기서 흐름도를 그릴 일이 없다. 도구모음의 연결 도구도
          같이 감춘다(EditToolbar). 자유 이북에서는 그대로다. */}
      {/* 표 이동 손잡이(⠿) — 자기 겹에 따로 그린다.
          표는 칸을 잡으면 **칸 선택**이 되므로(그게 맞는 동작이다) 표 자체를 끌 곳이
          따로 필요하다. 없애면 표를 옮길 방법이 사라진다.

          왜 겹을 따로 두는가. 예전에는 표 안(.feltable)에 그려서 첫 칸을 9px 덮었고,
          꽉 찬 파란 네모라 혼자 튀었다. 밖으로 내보내려 했더니 `.fel` 이
          overflow:hidden 이라 통째로 잘렸다(브라우저 테스트가 「손잡이는 보이는데
          표가 안 움직인다」로 잡았다). 크기 손잡이 겹에 얹었더니 이번엔
          **칸을 편집하는 동안 사라졌다** — 그 겹은 editing == null 일 때만 뜬다.
          셋 다 아니어야 해서 자기 겹을 갖는다. */}
      {active && tool === 'select' && selEls.length === 1 && selEl != null ? (() => {
        const se = page.els.find((e) => e.id === selEl)
        if (!se || se.type !== 'table' || se.locked) return null
        return (
          <div style={{ position: 'absolute', left: se.x, top: se.y, width: se.w, height: se.h,
                        pointerEvents: 'none', zIndex: 8 }}>
            <div className="tbl-move" title="드래그해서 표 이동"
              onPointerDown={(e) => { e.stopPropagation(); onElDown(e, se) }}>⠿</div>
          </div>
        )
      })() : null}
      {active && !isTemplateDoc && tool === 'select' && editing == null && hoverId != null && !selEls.includes(hoverId) ? (() => {
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
      {active && selEls.length === 1 && selEl != null && editing == null && tool === 'select' && !(tableSel && tableSel.elId === selEl) ? (() => {
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
            {/* 여기 있던 「→ 연결(화살표)」를 2026-09-07 에 뺐다.
                잇는 길이 셋이었다 — 도구모음의 「→」, 마우스를 올리면 나오는 연결점,
                그리고 이 단추. 앞의 둘은 표준 양식에서 감췄는데 이것만 열려 있었다.
                여기에도 조건을 하나 더 다는 대신 **단추를 없앴다.** 두 길이 남아 있어
                잃는 기능이 없고, 판정하는 자리가 늘기는커녕 하나 줄었다. */}
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
