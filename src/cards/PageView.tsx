import { useRef, useLayoutEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Page, Orientation, SizePreset } from '../state/store'
import { useBuilder } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import { cardByKey } from './registry'
import { colors, themeTokens } from '../design/tokens'
import { pageSize } from './sizing'
import type { TocItem } from '../builder/util'
import { paperBgStyle } from './paper'
import { pushSnap } from '../canvas/model'

export interface PageViewProps {
  page: Page
  docTitle: string
  orientation: Orientation
  size: SizePreset
  font: string
  tocItems?: TocItem[]
  editable?: boolean   // 캔버스(편집 화면)에서 카드 텍스트를 그 자리에서 인라인 편집
}

function groupColor(group?: string): string {
  if (group === 'model') return colors.blockLime
  if (group === 'extra') return colors.blockCream
  return colors.blockLilac
}
function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// 칸에 포커스되면 그 안 글자를 전체 선택(클릭=전체선택). 드래그로 일부만 긁었으면 그대로 둠.
function selectAllOnFocus(e: React.FocusEvent<HTMLElement>) {
  const node = e.currentTarget
  requestAnimationFrame(() => {
    const sel = window.getSelection()
    if (sel && sel.isCollapsed) { const r = document.createRange(); r.selectNodeContents(node); sel.removeAllRanges(); sel.addRange(r) }
  })
}
function mindmapSVG(fields: Record<string, string>, land: boolean, sc: number): string {
  const center = fields.center || '중심'
  const br = ['b1', 'b2', 'b3', 'b4', 'b5'].map((k) => fields[k]).filter(Boolean)
  const vw = land ? 360 : 250, vh = land ? 190 : 220, cx = vw / 2, cy = vh / 2, rx = vw * 0.34, ry = vh * 0.33
  const n = Math.max(br.length, 1)
  let s = '<svg width="' + (vw * sc).toFixed(0) + '" height="' + (vh * sc).toFixed(0) + '" viewBox="0 0 ' + vw + ' ' + vh + '">'
  const pts = br.map((t, i) => { const a = (-90 + i * (360 / n)) * Math.PI / 180; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), t } })
  pts.forEach((p) => { s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" stroke="#c3cbdb" stroke-width="1.5"/>' })
  pts.forEach((p) => {
    const anc = p.x < cx - 6 ? 'end' : p.x > cx + 6 ? 'start' : 'middle'
    s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5" fill="#2f6df6"/>'
    s += '<text x="' + (p.x + (anc === 'end' ? -6 : anc === 'start' ? 6 : 0)).toFixed(1) + '" y="' + (p.y + (p.y < cy ? -6 : 14)).toFixed(1) + '" font-size="10.5" fill="#3a4150" text-anchor="' + anc + '">' + esc(p.t) + '</text>'
  })
  s += '<rect x="' + (cx - 48) + '" y="' + (cy - 15) + '" width="96" height="30" rx="15" fill="#111318"/><text x="' + cx + '" y="' + (cy + 4) + '" font-size="11" fill="#fff" text-anchor="middle" font-weight="700">' + esc(center) + '</text>'
  return s + '</svg>'
}

// 오토핏 — 내용이 페이지보다 길면 통째로 축소해 맞춘다(잘림 방지). 덱처럼 한 페이지에 담는다.
function FitBox({ children, maxH }: { children: ReactNode; maxH: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const h = el.scrollHeight // 레이아웃 높이(transform 영향 없음) — 폭 고정이라 안정적
    const s = h > maxH + 1 ? Math.max(0.4, (maxH - 2) / h) : 1
    setScale((prev) => (Math.abs(prev - s) > 0.005 ? s : prev))
  })
  return (
    <div ref={ref} style={{ transformOrigin: 'top left', transform: scale < 1 ? `scale(${scale})` : undefined }}>
      {children}
    </div>
  )
}

export default function PageView({ page, docTitle, orientation, size, font, tocItems = [], editable = false }: PageViewProps) {
  const updateField = useBuilder((s) => s.updateField)
  const moveEls = useBuilder((s) => s.moveEls)
  const detachField = useBuilder((s) => s.detachField)
  const detachBox = useBuilder((s) => s.detachBox)
  const setSel = useCanvasUI((s) => s.setSel)
  const pageRef = useRef<HTMLDivElement>(null)
  const { W, H, SC, land } = pageSize(orientation)
  // 문서 테마(EVER-PEAK 라이트/다크) — 페이지(종이) 색만 이 토큰을 따른다.
  const theme = useBuilder((s) => s.theme)
  const T = themeTokens(theme)
  const isDark = theme === 'dark'
  // 슬라이드 페이지 — 배경만 그리고, 내용은 캔버스(FreeLayer) 요소로 직접 편집한다(구글 슬라이드식).
  if (page.cardKey === 'slide') {
    const bg = page.bg || T.page
    return <div style={{ width: W, height: H, backgroundColor: bg, ...paperBgStyle(page.paper), borderRadius: 8, boxShadow: '0 14px 40px rgba(20,25,40,.18)', overflow: 'hidden' }} />
  }
  // 덱 슬라이드 페이지 — 변환된 슬라이드 이미지를 한 장 통째로.
  if (page.cardKey === 'deckslide') {
    return (
      <div style={{ width: W, height: H, borderRadius: 8, boxShadow: '0 14px 40px rgba(20,25,40,.18)', overflow: 'hidden', background: '#fff' }}>
        <img src={page.fields.img} alt="슬라이드" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    )
  }
  const mul = (size === 's' ? 0.86 : size === 'l' ? 1.18 : 1) * SC
  const H1 = (land ? 30 : 26) * mul, BODY = (land ? 15 : 14) * mul
  const pad = Math.round(24 * SC)
  const fontFamily = font === 'auto' ? "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" : font
  const card = cardByKey(page.cardKey)
  const f = page.fields
  // 인라인 편집 필드 — 편집 모드에선 contentEditable 스팬(FreeLayer 위 z-index:4)으로 그 자리에서 수정.
  // 비편집(내보내기/미리보기)에선 값(또는 자리표시자 대체값)만 그린다.
  // 항목을 드래그하면 그 자리 그대로 자유 객체로 떼어내 따라 움직인다(문턱 넘을 때만).
  function startDetachDrag(e: React.PointerEvent<HTMLElement>, boxEl: HTMLElement, styleEl: HTMLElement, k: string, text: string) {
    const sx = e.clientX, sy = e.clientY
    let id: number | null = null, startX = 0, startY = 0
    const move = (ev: PointerEvent) => {
      if (id == null && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 5) {
        const pr = pageRef.current ? pageRef.current.getBoundingClientRect() : null
        if (!pr) return
        const r = boxEl.getBoundingClientRect(); const cs = window.getComputedStyle(styleEl)
        pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
        id = detachField(page.id, k, { x: Math.round(r.left - pr.left), y: Math.round(r.top - pr.top), w: Math.round(r.width), h: Math.round(r.height), text, fs: parseFloat(cs.fontSize) || 14, tcolor: cs.color, bold: parseInt(cs.fontWeight, 10) >= 600, align: (cs.textAlign as 'left' | 'center' | 'right') })
        setSel(id); startX = Math.round(r.left - pr.left); startY = Math.round(r.top - pr.top)
      }
      if (id != null) moveEls(page.id, [{ id, x: startX + (ev.clientX - sx), y: startY + (ev.clientY - sy) }])
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const Ef = ({ k, ph, style }: { k: string; ph?: string; style?: CSSProperties }): ReactNode => {
    const v = f[k] || ''
    if (page.detached && page.detached.includes(k)) return <span style={{ ...style, visibility: 'hidden' }}>{v}</span>
    if (!editable) return <>{v || ph || ''}</>
    return (
      <span className="cardedit" data-ph={ph || '내용 입력'} style={style}
        contentEditable suppressContentEditableWarning
        onFocus={selectAllOnFocus}
        onPointerDown={(e) => { e.stopPropagation(); startDetachDrag(e, e.currentTarget, e.currentTarget, k, e.currentTarget.textContent || '') }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } }}
        onBlur={(e) => { const t = e.currentTarget.textContent || ''; if (t !== (f[k] || '')) updateField(page.id, k, t) }}
      >{v}</span>
    )
  }
  // 스타일 박스(배경/테두리 있는 칸)를 통째로 떼어낸다 — 드래그 시 박스 객체로 분리, 그 칸은 숨김.
  function startDetachBox(e: React.PointerEvent<HTMLElement>, boxEl: HTMLElement, k: string) {
    const sx = e.clientX, sy = e.clientY
    let id: number | null = null, startX = 0, startY = 0
    const move = (ev: PointerEvent) => {
      if (id == null && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 5) {
        const pr = pageRef.current ? pageRef.current.getBoundingClientRect() : null
        if (!pr) return
        const r = boxEl.getBoundingClientRect(); const cs = window.getComputedStyle(boxEl)
        const bw = parseFloat(cs.borderTopWidth) || 0
        const bstyle = cs.borderTopStyle
        pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
        id = detachBox(page.id, k, {
          x: Math.round(r.left - pr.left), y: Math.round(r.top - pr.top),
          w: Math.round(r.width), h: Math.round(r.height),
          text: boxEl.textContent || '', fs: parseFloat(cs.fontSize) || 14,
          tcolor: cs.color, bold: parseInt(cs.fontWeight, 10) >= 600,
          fill: cs.backgroundColor,
          borderColor: (bw > 0 && bstyle !== 'none') ? cs.borderTopColor : undefined,
          borderWidth: (bw > 0 && bstyle !== 'none') ? bw : undefined,
        })
        setSel(id); startX = Math.round(r.left - pr.left); startY = Math.round(r.top - pr.top)
      }
      if (id != null) moveEls(page.id, [{ id, x: startX + (ev.clientX - sx), y: startY + (ev.clientY - sy) }])
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // 스타일 박스 래퍼 — 안의 글자는 클릭하면 편집, 드래그하면 박스째 떼어냄. 떼어내면 그 칸은 자리만 남기고 숨김.
  const EfBox = ({ k, boxStyle, children }: { k: string; boxStyle?: CSSProperties; children: ReactNode }): ReactNode => {
    const hidden = !!(page.detached && page.detached.includes(k))
    if (!editable) return <div style={boxStyle}>{children}</div>
    return (
      <div style={hidden ? { ...boxStyle, visibility: 'hidden' } : boxStyle}
        onPointerDown={hidden ? undefined : (e) => { e.stopPropagation(); startDetachBox(e, e.currentTarget, k) }}>
        {children}
      </div>
    )
  }
  // 박스 안에서 쓰는 인라인 편집(자체 떼어내기 없음 — 클릭=편집, 드래그는 부모 박스가 처리).
  const EfIn = ({ k, ph, style }: { k: string; ph?: string; style?: CSSProperties }): ReactNode => {
    const v = f[k] || ''
    if (!editable) return <>{v || ph || ''}</>
    return (
      <span className="cardedit" data-ph={ph || '내용 입력'} style={style}
        contentEditable suppressContentEditableWarning
        onFocus={selectAllOnFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } }}
        onBlur={(e) => { const t = e.currentTarget.textContent || ''; if (t !== (f[k] || '')) updateField(page.id, k, t) }}
      >{v}</span>
    )
  }
  // 복합 필드(한 칸에 두 값: "이름:값" / "제목|설명") — 두 조각을 각각 인라인 편집, blur 시 합쳐 저장.
  const EfPair = ({ k, sep, lph, rph, lStyle, rStyle, noStop }: { k: string; sep: string; lph?: string; rph?: string; lStyle?: CSSProperties; rStyle?: CSSProperties; noStop?: boolean }): ReactNode => {
    const raw = f[k] || ''
    const i = raw.indexOf(sep)
    const lv = i >= 0 ? raw.slice(0, i) : raw
    const rv = i >= 0 ? raw.slice(i + sep.length) : ''
    if (page.detached && page.detached.includes(k)) return <span style={{ visibility: 'hidden' }}>{raw}</span>
    if (!editable) return (<>{<span style={lStyle}>{lv}</span>}{rv ? <span style={rStyle}>{rv}</span> : null}</>)
    const commit = (nl: string, nr: string) => { const c = nr ? nl + sep + nr : nl; if (c !== raw) updateField(page.id, k, c) }
    const cell = (val: string, ph: string, st: CSSProperties | undefined, done: (t: string) => void): ReactNode => (
      <span className="cardedit" data-ph={ph} style={st} contentEditable suppressContentEditableWarning
        onFocus={selectAllOnFocus}
        onPointerDown={noStop ? undefined : (e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } }}
        onBlur={(e) => done(e.currentTarget.textContent || '')}>{val}</span>
    )
    return (<>{cell(lv, lph || '', lStyle, (t) => commit(t, rv))}{cell(rv, rph || '', rStyle, (t) => commit(lv, t))}</>)
  }
  const gc = groupColor(card ? card.group : undefined)
  const noteBg = (card && card.viz === 'note' && page.bg) ? page.bg : T.page
  const isCover = !!(card && card.kind === 'cover')

  const bookStyle: CSSProperties = { width: W, height: H, fontFamily, backgroundColor: isCover ? T.coverBg : noteBg, ...paperBgStyle(page.paper), borderRadius: 8, boxShadow: '0 14px 40px rgba(20,25,40,.18)', position: 'relative', overflow: 'hidden' }
  const pg: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: pad + 'px ' + (pad - 4) + 'px', boxSizing: 'border-box', color: T.body }
  const eyebrow: CSSProperties = { fontSize: 11.5, letterSpacing: 2, textTransform: 'uppercase', color: T.kick, fontWeight: 800 }
  const divider = '1px solid ' + T.line
  // EVER-PEAK 하단 푸터(표지 제외 페이지 공통)
  const footer = (right: string): ReactNode => (
    <div style={{ position: 'absolute', left: pad, right: pad, bottom: Math.round(pad * 0.55), display: 'flex', justifyContent: 'space-between', fontSize: BODY * 0.62, letterSpacing: 1.4, textTransform: 'uppercase', color: T.footer }}>
      <span>EVER-PEAK · UNIEVER</span><span>{right}</span>
    </div>
  )

  let inner: ReactNode = null
  if (card && card.kind === 'cover') {
    inner = (<div style={{ ...pg, color: T.coverInk }}>
      <div style={{ ...eyebrow, color: 'rgba(255,255,255,.55)' }}>{docTitle}</div>
      <div style={{ margin: 'auto 0' }}>
        <div style={{ fontSize: H1 * 1.2, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1, color: '#fff' }}><Ef k="title" ph={card.title} /></div>
        {f.sub ? <div style={{ color: 'rgba(255,255,255,.78)', fontSize: BODY, marginTop: 10 }}><Ef k="sub" ph="부제" /></div> : null}
      </div>
      <div style={{ height: 8, width: 52, borderRadius: 4, background: T.blue }} />
    </div>)
  } else if (card && card.kind === 'back') {
    inner = (<div style={{ ...pg, justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: H1, fontWeight: 700, lineHeight: 1.15, color: T.ink }}><Ef k="title" ph={card.title} /></div>
      {f.sub ? <div style={{ color: T.sub, fontSize: BODY, marginTop: 10 }}><Ef k="sub" ph="부제(선택)" /></div> : null}
    </div>)
  } else if (card && card.kind === 'toc') {
    // EVER-PEAK 목차 — 번호칩 + 제목 + 페이지번호. 각 줄에 data-goto-seq(M2 핫스팟 좌표 산출용).
    inner = (<div style={pg}>
      <div style={eyebrow}>Contents</div>
      <div style={{ fontSize: H1, fontWeight: 800, marginTop: 6, color: T.ink }}>{f.title || '목차'}</div>
      <div style={{ height: 1, background: T.line, margin: '16px 0 2px' }} />
      <ul style={{ margin: 0, listStyle: 'none', padding: 0, flex: 1 }}>
        {tocItems.length ? tocItems.map((t, i) => (
          <li key={i} data-goto-seq={t.seq} className="toc-row" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'baseline', gap: BODY, padding: (BODY * 0.62) + 'px 4px', borderBottom: divider }}>
            <span style={{ fontSize: BODY * 0.82, fontWeight: 800, color: T.blue, fontVariantNumeric: 'tabular-nums' }}>{String(t.seq).padStart(2, '0')}</span>
            <span style={{ fontSize: BODY * 1.12, fontWeight: 800, color: T.ink }}>{t.title}</span>
            <span style={{ fontSize: BODY * 0.8, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{String(t.page).padStart(2, '0')}</span>
          </li>
        )) : <li style={{ color: T.muted, padding: '8px 0' }}>카드를 추가하면 여기에</li>}
      </ul>
      {footer('')}
    </div>)
  } else if (page.cardKey === 'dsection') {
    // 덱-섹션(P1) — deck_builder 섹션 슬라이드 룩: 번호 태그 + 제목 + 부제 + 카드 그리드(EVER-PEAK).
    // c1~c6 각 "제목|설명". 역할 kind 없음 → exportBook 에서 content 로 처리.
    const cols = f.cols === '2' ? 2 : 3
    const items = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((k) => ({ k, v: f[k] })).filter((x) => x.v)
    inner = (<div style={pg}>
      {f.markN ? <div style={{ ...eyebrow, letterSpacing: 1.5, color: T.blue }}><Ef k="markN" ph="번호" /></div> : null}
      <div style={{ fontSize: H1, fontWeight: 800, marginTop: 6, lineHeight: 1.15, letterSpacing: -0.6, color: T.ink }}><Ef k="title" ph="섹션" /></div>
      {f.sub ? <div style={{ color: T.sub, fontSize: BODY, marginTop: 8, lineHeight: 1.5 }}><Ef k="sub" ph="부제(선택)" /></div> : null}
      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: Math.round(10 * SC) }}>
        {items.map((it, i) => (
          <EfBox key={i} k={it.k} boxStyle={{ background: T.card, border: divider, borderRadius: 10, padding: Math.round(13 * SC) + 'px ' + Math.round(14 * SC) + 'px', minHeight: Math.round(56 * SC), wordBreak: 'keep-all', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <EfPair k={it.k} sep="|" noStop lph="제목" rph="설명" lStyle={{ fontSize: BODY * 1.02, fontWeight: 800, color: T.ink, letterSpacing: -0.3 }} rStyle={{ fontSize: BODY * 0.86, color: T.sub, lineHeight: 1.4 }} />
          </EfBox>
        ))}
      </div>
      {footer('')}
    </div>)
  } else if (card && card.kpi) {
    const rows = ['k1', 'k2', 'k3'].map((k) => ({ k, v: f[k] })).filter((x) => x.v).map((row, i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderTop: divider }}>
        <EfPair k={row.k} sep=":" lph="지표" rph="값" lStyle={{ color: T.sub }} rStyle={{ fontSize: '1.4em', fontWeight: 800, color: T.ink }} />
      </div>
    ))
    inner = (<div style={pg}><div style={eyebrow}>성과</div><div style={{ fontSize: H1, fontWeight: 700, marginTop: 6, color: T.ink }}><Ef k="title" ph={card.title} /></div><div style={{ marginTop: 'auto', fontSize: BODY }}>{rows}</div></div>)
  } else if (card && card.viz === 'flow') {
    const steps = ['s1', 's2', 's3', 's4'].map((k) => ({ k, v: f[k] })).filter((x) => x.v)
    const items: ReactNode[] = []
    steps.forEach((s, i) => {
      if (i > 0) items.push(<span key={'a' + i} style={{ color: T.muted, fontWeight: 700, fontSize: 16 }}>{land ? '→' : '↓'}</span>)
      items.push(<EfBox key={'n' + i} k={s.k} boxStyle={{ background: T.card, border: '1.5px solid ' + T.line, borderRadius: 8, padding: '8px 13px', fontSize: BODY, fontWeight: 600, color: T.body }}><EfIn k={s.k} ph={'단계 ' + (i + 1)} /></EfBox>)
    })
    inner = (<div style={pg}><div style={eyebrow}>프로세스</div><div style={{ fontSize: H1, fontWeight: 700, marginTop: 6, color: T.ink }}><Ef k="title" ph={card.title} /></div>
      <div style={{ margin: 'auto 0', display: 'flex', flexDirection: land ? 'row' : 'column', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{items}</div></div>)
  } else if (card && card.viz === 'mindmap') {
    const brs = ['b1', 'b2', 'b3', 'b4', 'b5'].map((k) => ({ k, v: f[k] })).filter((x) => x.v || editable)
    const vw = land ? 360 : 250, vh = land ? 190 : 220, cx = vw / 2, cy = vh / 2, rx = vw * 0.34, ry = vh * 0.33
    const n = Math.max(brs.length, 1)
    const pts = brs.map((b, i) => { const a = (-90 + i * (360 / n)) * Math.PI / 180; return { k: b.k, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) } })
    const MW = vw * SC, MH = vh * SC
    inner = (<div style={pg}><div style={eyebrow}>마인드맵</div><div style={{ fontSize: H1, fontWeight: 700, marginTop: 6, color: T.ink }}><Ef k="title" ph={card.title} /></div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: 'auto 0' }}>
        <div style={{ position: 'relative', width: MW, height: MH }}>
          <svg width={MW} height={MH} viewBox={`0 0 ${vw} ${vh}`} style={{ position: 'absolute', inset: 0 }}>
            {pts.map((p, i) => (<line key={'l' + i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#c3cbdb" strokeWidth={1.5} />))}
            {pts.map((p, i) => (<circle key={'d' + i} cx={p.x} cy={p.y} r={3.5} fill="#2f6df6" />))}
            <rect x={cx - 48} y={cy - 15} width={96} height={30} rx={15} fill="#111318" />
          </svg>
          <div style={{ position: 'absolute', left: cx * SC, top: cy * SC, transform: 'translate(-50%,-50%)', color: '#fff', fontWeight: 700, fontSize: 11 * SC, maxWidth: 92 * SC, textAlign: 'center', lineHeight: 1.1 }}><Ef k="center" ph="중심 주제" /></div>
          {pts.map((p, i) => (<div key={'t' + i} style={{ position: 'absolute', left: p.x * SC, top: p.y * SC, transform: 'translate(-50%,-50%)', fontSize: 10.5 * SC, color: '#3a4150', background: 'rgba(255,255,255,.9)', padding: '1px 5px', borderRadius: 5, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }}><Ef k={p.k} ph={'가지 ' + (i + 1)} /></div>))}
        </div>
      </div></div>)
  } else if (card && (card.viz === 'sticky' || card.viz === 'board')) {
    const cols = ['#fdf3b6', '#cdeacf', '#f4d2c1', '#e7e3fb', '#dceeb1', '#f9d0e0']
    const keys = card.viz === 'board' ? ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'] : ['n1', 'n2', 'n3', 'n4']
    const notes = keys.map((k) => ({ k, v: f[k] })).filter((x) => x.v)
    inner = (<div style={pg}><div style={eyebrow}>{card.viz === 'board' ? '자유 보드' : '메모'}</div><div style={{ fontSize: H1, fontWeight: 700, marginTop: 6, color: T.ink }}><Ef k="title" ph={card.title} /></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 16, alignContent: 'flex-start' }}>
        {notes.map((nt, i) => (<EfBox key={i} k={nt.k} boxStyle={{ width: 'calc(50% - 5px)', minHeight: 60, borderRadius: 3, padding: '10px 11px', fontSize: 12.5, lineHeight: 1.35, color: '#39371f', boxShadow: '0 2px 6px rgba(0,0,0,.12)', background: cols[i % cols.length], transform: card.viz === 'board' ? (i % 2 ? 'rotate(2.5deg)' : 'rotate(-2.5deg)') : 'none' }}><EfIn k={nt.k} ph={'메모 ' + (i + 1)} /></EfBox>))}
      </div></div>)
  } else if (card && card.viz === 'note') {
    const blocks = page.blocks || []
    const dark = isDark || noteBg === '#111318' || noteBg === '#0e1c30'
    const col = dark ? '#f2f4f8' : colors.ink
    const sub = dark ? '#c4ccda' : '#3a4150'
    const renderB = (b: typeof blocks[number], key: string, child: boolean, ord = 0): ReactNode => {
      const fsc = b.fs || 1                                   // HWP 글자모양: 크기 배율
      const bcol = b.color || col                             // HWP 글자모양: 색
      const base: CSSProperties = { textAlign: (b.align || 'left'), margin: '5px 0', lineHeight: 1.32, color: bcol, fontWeight: b.bold ? 800 : 500 }
      if (b.type === 'divider') return <div key={key} style={{ height: 1, background: dark ? '#3a4150' : '#e4e7ee', margin: '10px 0' }} />
      if (b.type === 'h1') return <div key={key} style={{ ...base, fontSize: H1 * 0.82 * fsc, fontWeight: 800, letterSpacing: -0.5 }}>{b.text}</div>
      if (b.type === 'h2') return <div key={key} style={{ ...base, fontSize: BODY * 1.3 * fsc, fontWeight: 800 }}>{b.text}</div>
      if (b.type === 'h3') return <div key={key} style={{ ...base, fontSize: BODY * 1.12 * fsc, fontWeight: 800 }}>{b.text}</div>
      if (b.type === 'h4') return <div key={key} style={{ ...base, fontSize: BODY * 1.0 * fsc, fontWeight: 800 }}>{b.text}</div>
      if (b.type === 'bullet') return <div key={key} style={{ ...base, fontSize: BODY * fsc, paddingLeft: child ? 26 : 14 }}>•&nbsp;&nbsp;{b.text}</div>
      if (b.type === 'numbered') return <div key={key} style={{ ...base, fontSize: BODY * fsc, paddingLeft: child ? 26 : 14 }}>{ord}.&nbsp;&nbsp;{b.text}</div>
      if (b.type === 'todo') return <div key={key} style={{ ...base, fontSize: BODY * fsc, paddingLeft: child ? 26 : 14, color: b.done ? (dark ? '#8a93a6' : '#9aa2b1') : bcol, textDecoration: b.done ? 'line-through' : undefined }}>{b.done ? '☑' : '☐'}&nbsp;&nbsp;{b.text}</div>
      if (b.type === 'toggle') return <div key={key} style={{ ...base, fontSize: BODY * 1.14 * fsc, fontWeight: 800 }}>▾&nbsp;{b.text}</div>
      if (b.type === 'callout') {
        const tone = b.tone || 'info'
        const tint = tone === 'key' ? colors.tintGreen : tone === 'warn' ? colors.tintAmber : colors.tintBlue
        const bar = tone === 'key' ? colors.barGreen : tone === 'warn' ? colors.barAmber : colors.barBlue
        return <div key={key} data-tone={tone} style={{ ...base, fontSize: BODY * fsc, background: dark ? 'rgba(255,255,255,.08)' : tint, borderLeft: '4px solid ' + bar, borderRadius: 8, padding: Math.round(BODY * 0.55) + 'px ' + Math.round(BODY * 0.7) + 'px', color: b.color || (dark ? '#eef' : colors.ink), fontWeight: 500 }}>{b.text}</div>
      }
      return <div key={key} style={{ ...base, fontSize: BODY * fsc, color: b.color || (b.bold ? col : sub), paddingLeft: child ? 14 : 0 }}>{b.text}</div>
    }
    const nodes: ReactNode[] = []
    let numOrd = 0
    blocks.forEach((b, i) => {
      if (b.type === 'numbered') numOrd++; else numOrd = 0
      nodes.push(renderB(b, 'b' + i, false, numOrd))
      if (b.type === 'toggle' && b.children) b.children.forEach((c, j) => nodes.push(renderB(c, 'c' + i + '_' + j, true)))
    })
    inner = (<div style={{ ...pg, overflow: 'hidden' }}><FitBox maxH={H - pad * 2}>{nodes}</FitBox></div>)
  } else {
    const bodyFields = (card ? card.fields : []).filter((fd) => fd.key !== 'title')
    const pts = bodyFields.map((fd) => ({ k: fd.key, v: f[fd.key], ph: fd.label })).filter((x) => x.v)
    inner = (<div style={pg}><div style={eyebrow}>{card ? card.label : ''}</div>
      <div style={{ fontSize: H1, fontWeight: 800, marginTop: 6, lineHeight: 1.15, letterSpacing: -1, color: T.ink }}><Ef k="title" ph={card ? card.title : '제목'} /></div>
      <ul style={{ marginTop: 'auto', listStyle: 'none', padding: 0, fontSize: BODY }}>{pts.map((pt, i) => (<li key={i} style={{ padding: '9px 0', borderTop: divider, fontWeight: 500, color: T.sub }}><Ef k={pt.k} ph={pt.ph} /></li>))}</ul>
      <div style={{ height: 8, width: 40, borderRadius: 4, background: gc }} /></div>)
  }
  return (<div ref={pageRef} style={bookStyle}>{inner}</div>)
}
