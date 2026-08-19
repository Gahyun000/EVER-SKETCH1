import { useEffect, useState } from 'react'
import { useBuilder } from '../../state/store'
import type { PaperType } from '../../state/store'
import { useCanvasUI } from '../../state/canvasUI'
import { useSelEl } from '../useSelEl'
import Editor from '../Editor'
import ColorPicker from './ColorPicker'
import { pageSize } from '../../cards/sizing'
import { PAPER_OPTIONS } from '../../cards/paper'
import { FCOLORS } from '../../canvas/model'
import { pushSnap } from '../../canvas/model'
import type { FreeEl } from '../../state/store'
import { addRow, delRow, addCol, delCol, mergeRange, unmergeAt, setAlignRange, setCellBgRange } from '../../canvas/tableOps'
import { CBG_LABEL, cbgPalette, cellBackground, isSlotEl, lockedRowCount, slotAllows } from '../../template/slots'
import '../../template/template.css'

const TRANS: [string, string][] = [['', '없음'], ['fade', '페이드'], ['slide', '밀기'], ['zoom', '확대'], ['flip', '넘기기']]
const cap: React.CSSProperties = { fontSize: 11, color: '#98a1b2', display: 'block', marginTop: 6 }
const PRESETS: { name: string; color: string; tcolor: string }[] = [
  { name: '기본', color: '#ffffff', tcolor: '#1a1a1a' },
  { name: '주황', color: '#e0553c', tcolor: '#ffffff' },
  { name: '회색', color: '#8a93a5', tcolor: '#ffffff' },
  { name: '크림', color: '#f6ddc2', tcolor: '#5a4327' },
  { name: '파랑', color: '#2a78d6', tcolor: '#ffffff' },
  { name: '초록', color: '#2fa37a', tcolor: '#ffffff' },
]
type Tab = 'style' | 'text' | 'arrange' | 'table'

// 우측 인스펙터 — PPT/키노트식. 요소 선택 시 스타일/텍스트/정렬 3탭, 미선택 시 페이지 설정.
export default function RightPanel() {
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const orientation = useBuilder((s) => s.orientation)
  const setOrientation = useBuilder((s) => s.setOrientation)
  const setPageBg = useBuilder((s) => s.setPageBg)
  const setPaper = useBuilder((s) => s.setPaper)
  const setPageTrans = useBuilder((s) => s.setPageTrans)
  const addCard = useBuilder((s) => s.addCard)
  const duplicatePage = useBuilder((s) => s.duplicatePage)
  const removePage = useBuilder((s) => s.removePage)
  const groupEls = useBuilder((s) => s.groupEls)
  const ungroupEls = useBuilder((s) => s.ungroupEls)
  const { el, patch } = useSelEl()
  const updateEl = useBuilder((s) => s.updateEl)
  const tableSel = useCanvasUI((s) => s.tableSel)
  const setTableSel = useCanvasUI((s) => s.setTableSel)
  const selElId = useCanvasUI((s) => s.selEl)
  const selEls = useCanvasUI((s) => s.selEls)
  const selConn = useCanvasUI((s) => s.selConn)
  const setSelConn = useCanvasUI((s) => s.setSelConn)
  const patchConn = useBuilder((s) => s.patchConn)
  const removeConn = useBuilder((s) => s.removeConn)
  const [tab, setTab] = useState<Tab>('text')
  const page = pages.find((p) => p.id === selId)
  const conn = (selConn != null && page) ? page.conns[selConn] : undefined
  function patchC(pt: Partial<import('../../state/store').Conn>) {
    if (!page || selConn == null) return
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
    patchConn(page.id, selConn, pt)
  }
  const dark = !!(page && page.bg)
  const curPaper: PaperType = (page && page.paper) || 'blank'
  const { W } = pageSize(orientation)

  // 선택이 바뀌면(새 요소) 종류에 맞는 탭을 자동으로 연다(편집 중엔 안 튐 — id 변화에만 반응).
  useEffect(() => {
    if (!el) return
    const shapeLike = ['box', 'round', 'ellipse', 'diamond', 'triangle', 'sticky', 'image', 'icon', 'table', 'wordart']
    setTab(el.type === 'table' ? 'table' : shapeLike.includes(el.type) ? 'style' : 'text')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selElId])

  function setBg(d: boolean) { if (page) setPageBg(page.id, d ? '#0e1c30' : '') }
  const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))

  // 툴바/메뉴/단축키에서 오는 커스텀 이벤트를 선택 요소/현재 페이지 기준으로 처리(호환 유지).
  useEffect(() => {
    const TC = ['#1a1a1a', '#2a78d6', '#0f9d58', '#c5501f', '#4a3aa7']
    const AL: ('left' | 'center' | 'right')[] = ['left', 'center', 'right']
    const handlers: Record<string, () => void> = {
      'ebook:bg-toggle': () => setBg(!dark),
      'ebook:fmt-bold': () => { if (el) patch({ bold: !el.bold }) },
      'ebook:fmt-italic': () => { if (el) patch({ italic: !el.italic }) },
      'ebook:fmt-underline': () => { if (el) patch({ underline: !el.underline }) },
      'ebook:fmt-color': () => { if (!el) return; const i = TC.indexOf(el.tcolor || '#1a1a1a'); patch({ tcolor: TC[(i + 1) % TC.length] }) },
      'ebook:fmt-clear': () => { if (el) patch({ bold: false, italic: false, underline: false, tcolor: undefined, align: undefined }) },
      'ebook:align-left': () => { if (el) patch({ align: 'left' }) },
      'ebook:align-center': () => { if (el) patch({ align: 'center' }) },
      'ebook:align-right': () => { if (el) patch({ align: 'right' }) },
      'ebook:align-cycle': () => { if (!el) return; const i = AL.indexOf(el.align || 'left'); patch({ align: AL[(i + 1) % 3] }) },
      'ebook:bullet': () => { if (el) patch({ text: /^[•\-]\s/.test(el.text) ? el.text : '• ' + el.text }) },
      'ebook:el-rotate': () => { if (el) patch({ rot: ((el.rot || 0) + 15) % 360 }) },
      'ebook:el-center': () => { if (el) patch({ x: Math.round((W - el.w) / 2) }) },
      'ebook:trans-cycle': () => { if (!page) return; const ks = TRANS.map((t) => t[0]); const i = ks.indexOf(page.trans || ''); setPageTrans(page.id, ks[(i + 1) % ks.length]) },
    }
    const bound = Object.entries(handlers).map(([k, fn]) => { const g = () => fn(); window.addEventListener(k, g); return [k, g] as const })
    return () => bound.forEach(([k, g]) => window.removeEventListener(k, g))
  })

  const numRow = (label: string, val: number, on: (n: number) => void, min = -9999): React.ReactNode => (
    <label className="insp-num"><span>{label}</span>
      <input type="number" value={Math.round(val)} onChange={(e) => on(Math.max(min, Number(e.target.value) || 0))} /></label>
  )

  function patchTable(pt: Partial<FreeEl>) {
    if (!page || !el) return
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
    updateEl(page.id, el.id, pt)
  }
  const ts = (tableSel && el && tableSel.elId === el.id) ? tableSel : null
  const ar = ts ? ts.r1 : 0, ac = ts ? ts.c1 : 0
  // 템플릿 슬롯이면 편집 범위가 제한된다(사양 §5). 서버도 같은 정책으로 거부한다 —
  // 여기서 버튼을 숨기는 것은 '왜 안 되는지' 알려주기 위한 UX다.
  const slot = el?.slot
  const inTemplate = isSlotEl(slot)
  const canRow = !inTemplate || slotAllows(slot, 'row')
  const canCol = !inTemplate || slotAllows(slot, 'col')
  const canMerge = !inTemplate || slotAllows(slot, 'merge')
  const canCbg = !inTemplate || slotAllows(slot, 'cbg')
  const palette = cbgPalette(slot)
  const headLocked = lockedRowCount(slot)
  // 헤더 행이 선택돼 있으면 행 삭제를 막는다 — 표준 양식이 깨진다.
  const headRowSelected = inTemplate && ts != null && Math.min(ts.r0, ts.r1) < headLocked
  const curBg = (el?.cbg && ts) ? el.cbg[Math.min(ts.r0, ts.r1) + '_' + Math.min(ts.c0, ts.c1)] : undefined

  return (
    <div className="ax-inspector">
      {el ? (
        <>
          <div className="insp-tabs">
            {el.type === 'table' ? <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>표</button> : null}
            <button className={tab === 'style' ? 'on' : ''} onClick={() => setTab('style')}>스타일</button>
            <button className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>텍스트</button>
            <button className={tab === 'arrange' ? 'on' : ''} onClick={() => setTab('arrange')}>정렬</button>
          </div>
          <div className="insp-body">
            {tab === 'table' && el.type === 'table' && (<>
              <div className="insp-sec">활성 셀 {ts ? `(${Math.min(ts.r0, ts.r1) + 1}행, ${Math.min(ts.c0, ts.c1) + 1}열)` : '— 표에서 셀 클릭'}</div>

              {inTemplate && (
                <div className="insp-note">
                  표준 양식 표입니다. 칸 내용·행 추가·셀 색만 바꿀 수 있어요.
                  <br />열 구성과 머리글은 회차 취합을 위해 고정됩니다.
                </div>
              )}

              {canCbg && palette && (<>
                <div className="insp-sec">진행 표시</div>
                <div className="insp-row es-cbg-row">
                  {palette.map((color) => (
                    <button key={color} type="button"
                      className={'es-cbg' + (curBg === color ? ' on' : '')}
                      style={{ background: cellBackground(color) }}
                      title={CBG_LABEL[color] || color}
                      disabled={!ts}
                      onClick={() => { if (ts) patchTable(setCellBgRange(el, ts.r0, ts.c0, ts.r1, ts.c1, color)) }} />
                  ))}
                  <button type="button" className="es-cbg clear" title="색 지우기" disabled={!ts}
                    onClick={() => { if (ts) patchTable(setCellBgRange(el, ts.r0, ts.c0, ts.r1, ts.c1, null)) }}>✕</button>
                </div>
                <div className="insp-hint">셀을 드래그해 여러 칸을 한 번에 칠할 수 있어요.</div>
              </>)}

              <div className="insp-sec">행</div>
              <div className="insp-row">
                <button className="insp-pill" disabled={!canRow} onClick={() => patchTable(addRow(el, Math.max(ar, headLocked)))}>↑ 위에 추가</button>
                <button className="insp-pill" disabled={!canRow} onClick={() => patchTable(addRow(el, ar + 1))}>↓ 아래 추가</button>
                <button className="insp-pill danger" disabled={!canRow || headRowSelected}
                  title={headRowSelected ? '머리글 행은 삭제할 수 없어요' : undefined}
                  onClick={() => patchTable(delRow(el, ar))}>🗑 행 삭제</button>
              </div>
              {canCol ? (<>
                <div className="insp-sec">열</div>
                <div className="insp-row">
                  <button className="insp-pill" onClick={() => patchTable(addCol(el, ac))}>← 왼쪽 추가</button>
                  <button className="insp-pill" onClick={() => patchTable(addCol(el, ac + 1))}>→ 오른쪽 추가</button>
                  <button className="insp-pill danger" onClick={() => patchTable(delCol(el, ac))}>🗑 열 삭제</button>
                </div>
              </>) : null}
              {canMerge ? (<>
                <div className="insp-sec">셀 병합</div>
                <div className="insp-row">
                  <button className="insp-pill" disabled={!ts || (ts.r0 === ts.r1 && ts.c0 === ts.c1)} onClick={() => { if (ts) patchTable(mergeRange(el, ts.r0, ts.c0, ts.r1, ts.c1)) }}>⤢ 병합</button>
                  <button className="insp-pill" onClick={() => patchTable(unmergeAt(el, ar, ac))}>병합 해제</button>
                </div>
              </>) : null}
              <div className="insp-sec">셀 정렬</div>
              <div className="insp-row seg">
                <button onClick={() => patchTable(setAlignRange(el, ts ? ts.r0 : ar, ts ? ts.c0 : ac, ar, ac, 'left'))}>⇤</button>
                <button onClick={() => patchTable(setAlignRange(el, ts ? ts.r0 : ar, ts ? ts.c0 : ac, ar, ac, 'center'))}>⇔</button>
                <button onClick={() => patchTable(setAlignRange(el, ts ? ts.r0 : ar, ts ? ts.c0 : ac, ar, ac, 'right'))}>⇥</button>
              </div>
              <div className="insp-sec">테두리 · 헤더</div>
              <div className="insp-row">
                <ColorPicker value={el.borderColor || '#cfd5e2'} onChange={(c) => patchTable({ borderColor: c })} />
                <select className="insp-sel" style={{ width: 'auto' }} value={el.borderWidth ?? 1} onChange={(e) => patchTable({ borderWidth: Number(e.target.value) })}>
                  <option value={0.5}>얇게</option><option value={1}>보통</option><option value={2}>굵게</option>
                </select>
                <label className="insp-check"><input type="checkbox" checked={el.headRow !== false} onChange={(e) => patchTable({ headRow: e.target.checked })} /> 헤더행</label>
              </div>
              <span style={cap}>표에서 셀을 클릭해 고르고(Shift+클릭=범위) 위 버튼으로 편집하세요. 글자 수정은 표를 더블클릭.</span>
            </>)}

            {tab === 'style' && (<>
              <div className="insp-sec">프리셋 스타일</div>
              <div className="insp-sw">{PRESETS.map((ps) => (<span key={ps.name} className="insp-preset" title={ps.name} style={{ background: ps.color, color: ps.tcolor }} onClick={() => patch({ color: ps.color, tcolor: ps.tcolor })}>가</span>))}</div>
              <div className="insp-sec">채우기</div>
              <div className="insp-row"><ColorPicker value={el.color} onChange={(c) => patch({ color: c })} allowTransparent /><span style={{ fontSize: 12, color: '#5b6270' }}>도형 색</span></div>
              <div className="insp-sw">{FCOLORS.map((c) => (<span key={c} className={'insp-chip' + (el.color === c ? ' on' : '')} style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 50%/8px 8px' : c }} onClick={() => patch({ color: c })} />))}</div>
              <div className="insp-sec">테두리</div>
              <div className="insp-row"><ColorPicker value={el.borderColor || '#cfd5e2'} onChange={(c) => patch({ borderColor: c })} allowTransparent /><select className="insp-sel" style={{ width: 'auto' }} value={el.borderWidth ?? 1.5} onChange={(e) => patch({ borderWidth: Number(e.target.value) })}><option value={0}>없음</option><option value={1}>얇게</option><option value={1.5}>보통</option><option value={3}>굵게</option></select></div>
              <div className="insp-sec">불투명도</div>
              <div className="insp-row"><input className="insp-range" type="range" min={0} max={100} value={Math.round((el.opacity ?? 1) * 100)} onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })} /><span style={{ fontSize: 12, color: '#5b6270', width: 42, textAlign: 'right' }}>{Math.round((el.opacity ?? 1) * 100)}%</span></div>
              <div className="insp-sec">효과</div>
              <div className="insp-row">
                <label className="insp-check"><input type="checkbox" checked={!!el.shadow} onChange={(e) => patch({ shadow: e.target.checked })} /> 그림자</label>
                <label className="insp-check"><input type="checkbox" checked={!!el.reflect} onChange={(e) => patch({ reflect: e.target.checked })} /> 반사</label>
              </div>
            </>)}

            {tab === 'text' && (<>
              <div className="insp-sec">글자</div>
              <div className="insp-row">
                <button className={'insp-b' + (el.bold ? ' on' : '')} onClick={() => patch({ bold: !el.bold })}><b>B</b></button>
                <button className={'insp-b' + (el.italic ? ' on' : '')} onClick={() => patch({ italic: !el.italic })}><i>I</i></button>
                <button className={'insp-b' + (el.underline ? ' on' : '')} onClick={() => patch({ underline: !el.underline })}><u>U</u></button>
                <label className="insp-num sm"><span>크기</span><input type="number" value={el.fs} onChange={(e) => patch({ fs: Math.max(6, Number(e.target.value) || 6) })} /></label>
                <ColorPicker value={el.tcolor || '#1a1a1a'} onChange={(c) => patch({ tcolor: c })} />
              </div>
              <div className="insp-sec">정렬</div>
              <div className="insp-row seg">
                <button className={(el.align || 'left') === 'left' ? 'on' : ''} onClick={() => patch({ align: 'left' })}>⇤</button>
                <button className={el.align === 'center' ? 'on' : ''} onClick={() => patch({ align: 'center' })}>⇔</button>
                <button className={el.align === 'right' ? 'on' : ''} onClick={() => patch({ align: 'right' })}>⇥</button>
              </div>
              <div className="insp-row">
                <button className="insp-pill" onClick={() => emit('ebook:bullet')}>글머리표</button>
                <button className="insp-pill" onClick={() => emit('ebook:fmt-clear')}>서식 지우기</button>
              </div>
            </>)}

            {tab === 'arrange' && (<>
              <div className="insp-sec">순서</div>
              <div className="insp-row">
                <button className="insp-pill" onClick={() => emit('ebook:z-front')}>맨 앞으로</button>
                <button className="insp-pill" onClick={() => emit('ebook:z-back')}>맨 뒤로</button>
              </div>
              <div className="insp-sec">크기</div>
              <div className="insp-row">{numRow('너비', el.w, (n) => patch({ w: Math.max(10, n) }), 10)}{numRow('높이', el.h, (n) => patch({ h: Math.max(10, n) }), 10)}</div>
              <div className="insp-sec">위치</div>
              <div className="insp-row">{numRow('X', el.x, (n) => patch({ x: n }))}{numRow('Y', el.y, (n) => patch({ y: n }))}</div>
              <div className="insp-sec">회전</div>
              <div className="insp-row">{numRow('각도', el.rot || 0, (n) => patch({ rot: ((n % 360) + 360) % 360 }))}<button className="insp-pill" onClick={() => emit('ebook:el-center')}>가로 중앙</button></div>
              <div className="insp-sec">뒤집기</div>
              <div className="insp-row">
                <button className={'insp-pill' + (el.flipH ? ' on' : '')} onClick={() => patch({ flipH: !el.flipH })}>↔ 좌우</button>
                <button className={'insp-pill' + (el.flipV ? ' on' : '')} onClick={() => patch({ flipV: !el.flipV })}>↕ 상하</button>
              </div>
              <div className="insp-sec">잠금</div>
              <div className="insp-row">
                <button className={'insp-pill' + (el.locked ? ' on' : '')} onClick={() => patch({ locked: !el.locked })}>{el.locked ? '🔒 잠금 해제' : '🔓 잠금'}</button>
              </div>
              <div className="insp-row" style={{ marginTop: 10 }}>
                <button className="insp-pill" onClick={() => emit('ebook:dup')}>⧉ 복제</button>
                <button className="insp-pill danger" onClick={() => emit('ebook:del')}>🗑 삭제</button>
              </div>
              <div className="insp-sec">그룹</div>
              <div className="insp-row">
                <button className="insp-pill" disabled={selEls.length < 2} onClick={() => { if (page && selEls.length >= 2) groupEls(page.id, selEls) }}>⧉ 그룹화</button>
                <button className="insp-pill" disabled={el.groupId == null} onClick={() => { if (page && el.groupId != null) ungroupEls(page.id, page.els.filter((x) => x.groupId === el.groupId).map((x) => x.id)) }}>그룹 해제</button>
              </div>
              <span style={cap}>여러 요소를 Shift+클릭하거나 빈 곳을 드래그해 함께 고른 뒤 그룹화하세요.</span>
            </>)}
          </div>
        </>
      ) : conn ? (
        <div className="insp-body">
          <div className="insp-h">연결선</div>
          <div className="insp-sec">종류</div>
          <div className="insp-row seg">
            <button className={(conn.kind || 'ortho') === 'straight' ? 'on' : ''} onClick={() => patchC({ kind: 'straight' })}>직선</button>
            <button className={(conn.kind || 'ortho') === 'ortho' ? 'on' : ''} onClick={() => patchC({ kind: 'ortho' })}>직각</button>
            <button className={(conn.kind || 'ortho') === 'curve' ? 'on' : ''} onClick={() => patchC({ kind: 'curve' })}>곡선</button>
          </div>
          <div className="insp-sec">화살촉</div>
          <div className="insp-row seg">
            <button className={(conn.arrow || 'end') === 'none' ? 'on' : ''} onClick={() => patchC({ arrow: 'none' })}>없음</button>
            <button className={(conn.arrow || 'end') === 'end' ? 'on' : ''} onClick={() => patchC({ arrow: 'end' })}>한쪽</button>
            <button className={(conn.arrow || 'end') === 'both' ? 'on' : ''} onClick={() => patchC({ arrow: 'both' })}>양쪽</button>
          </div>
          <div className="insp-sec">두께 · 점선</div>
          <div className="insp-row">
            <select className="insp-sel" style={{ width: 'auto' }} value={conn.width || 2} onChange={(e) => patchC({ width: Number(e.target.value) })}>
              <option value={1}>얇게</option><option value={2}>보통</option><option value={3.5}>굵게</option><option value={5}>매우 굵게</option>
            </select>
            <label className="insp-check"><input type="checkbox" checked={!!conn.dash} onChange={(e) => patchC({ dash: e.target.checked })} /> 점선</label>
          </div>
          <div className="insp-sec">색</div>
          <div className="insp-row"><ColorPicker value={conn.color || '#8b93a5'} onChange={(c) => patchC({ color: c })} /></div>
          <div className="insp-sw">{['#8b93a5', '#1a1a1a', '#2a78d6', '#e0553c', '#2fa37a', '#7a5af8'].map((c) => (<span key={c} className={'insp-chip' + ((conn.color || '#8b93a5') === c ? ' on' : '')} style={{ background: c }} onClick={() => patchC({ color: c })} />))}</div>
          <div className="insp-row" style={{ marginTop: 10 }}>
            <button className="insp-pill danger" onClick={() => { if (page && selConn != null) { pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })); removeConn(page.id, selConn); setSelConn(null) } }}>🗑 연결선 삭제</button>
          </div>
          <span style={cap}>연결선을 클릭해 선택하고, 가운데를 드래그하면 꺾을 수 있어요.</span>
        </div>
      ) : (
        <div className="insp-body">
          <div className="insp-h">페이지</div>
          <div className="insp-row">
            <button className="insp-pill" onClick={() => addCard('slide')}>＋ 슬라이드</button>
            <button className="insp-pill" onClick={() => { if (selId != null) duplicatePage(selId) }}>⧉ 복제</button>
            <button className="insp-pill danger" onClick={() => { if (selId != null) removePage(selId) }}>🗑 삭제</button>
          </div>
          <div className="insp-sec">배경</div>
          <div className="insp-row seg">
            <button className={!dark ? 'on' : ''} onClick={() => setBg(false)}>밝게</button>
            <button className={dark ? 'on' : ''} onClick={() => setBg(true)}>어둡게</button>
          </div>
          <div className="insp-sec">종이</div>
          <div className="insp-row"><select className="insp-sel" value={curPaper} onChange={(e) => { if (page) setPaper(page.id, e.target.value as PaperType) }}>{PAPER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div className="insp-sec">전환</div>
          <div className="insp-row wrap">{TRANS.map(([k, lab]) => (<button key={k || 'none'} className={'insp-pill' + ((page?.trans || '') === k ? ' on' : '')} onClick={() => page && setPageTrans(page.id, k)}>{lab}</button>))}</div>
          <div className="insp-sec">방향</div>
          <div className="insp-row seg">
            <button className={orientation === 'portrait' ? 'on' : ''} onClick={() => setOrientation('portrait')}>세로</button>
            <button className={orientation === 'landscape' ? 'on' : ''} onClick={() => setOrientation('landscape')}>가로</button>
          </div>
          <div className="insp-sec">내용</div>
          <div className="ax-editwrap"><Editor /></div>
        </div>
      )}
    </div>
  )
}
