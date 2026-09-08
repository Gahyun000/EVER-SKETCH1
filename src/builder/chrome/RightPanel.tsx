import { useEffect, useState } from 'react'
import NumInput from './NumInput'
import ApprovalCard from './ApprovalCard'
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
import { addRow, delRow, addCol, delCol, mergeRange, unmergeAt, setAlignRange, setVAlignRange, setCellFsRange, setCellBgRange } from '../../canvas/tableOps'
import AnchorLossDialog from '../../comments/AnchorLossDialog'
import { anchorLostBy } from '../../comments/anchor'
import { useComments } from '../../comments/store'
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
  const expandMindmap = useBuilder((s) => s.expandMindmap)
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
  const { W, H: PAGE_H } = pageSize(orientation)

  /**
   * 행이 늘어 표가 커질 때 **종이 밖으로 밀려나지 않게** 자른다.
   *
   * addRow 는 「행 높이는 그대로, 표 높이가 따라간다」만 안다 — 종이가 얼마나 큰지는
   * 모른다(순수 함수라 그래야 한다). 종이를 아는 것은 여기다.
   *
   * 자를 때 y 도 같이 올린다. 높이만 자르면 아래쪽에 있던 표가 종이 끝에 걸린 채
   * 위로 자라지 못해, 결국 행 높이가 다시 줄어든다 — 고치려던 그 증상이다.
   */
  function fitPage(cur: FreeEl, pt: Partial<FreeEl>): Partial<FreeEl> {
    if (pt.h == null || !isSlotEl(cur.slot)) return pt
    const h = Math.min(pt.h, PAGE_H)
    const y = Math.min(Math.max(0, cur.y), Math.max(0, PAGE_H - h))
    return { ...pt, h, y }
  }

  /** 이 표가 **종이 높이를 다 쓴** 상태인가 — 여기서 행을 더 넣으면 줄 높이가 줄어든다.
   *
   *  「표 아래끝이 종이 아래끝에 닿았는가」로 재면 안 된다. 아래에 붙어 있어도 위가
   *  비어 있으면 fitPage 가 표를 위로 밀어 올려 계속 커질 수 있다 — 그때 경고를 띄우면
   *  아직 자리가 있는데 없다고 말하는 것이 된다. 진짜 천장은 종이 높이 자체다. */
  const tableAtCeiling = !!el && el.type === 'table' && isSlotEl(el.slot)
    && el.h >= PAGE_H - 1

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

  // 숫자 칸은 전부 NumInput 을 쓴다 — 치는 도중에 값을 깎지 않는다.
  // 예전에는 한 글자마다 깎아서, 60 을 50 으로 고치려 하면 5 가 6 으로 박히고
  // 칸을 비울 수조차 없었다(NumInput.tsx 의 설명 참고).
  const numRow = (label: string, val: number, on: (n: number) => void, min = -9999): React.ReactNode => (
    <label className="insp-num"><span>{label}</span>
      <NumInput value={val} onCommit={on} min={min} ariaLabel={label} /></label>
  )

  // ── 표가 바뀌면 지적이 가리키는 칸도 따라 움직여야 한다 ──
  // 안 그러면 지적은 그대로인데 **엉뚱한 칸**을 가리키게 되고, 아무도 모른다.
  const cmtThreads = useComments((s) => s.threads)
  const cmtShift = useComments((s) => s.shift)
  const [loss, setLoss] = useState<{ axis: 'row' | 'col'; at: number; run: () => void } | null>(null)

  const shiftAnchors = async (axis: 'row' | 'col', at: number, delta: number,
                              onLost: 'keep' | 'delete' = 'keep') => {
    if (!el) return
    try { await cmtShift({ el_id: el.id, axis, at, delta, on_lost: onLost }) }
    catch { /* 지적이 없거나 권한이 없으면 조용히 넘어간다 — 표 편집을 막을 일은 아니다 */ }
  }

  /** 지울 때만 묻는다. 가리킬 곳을 잃는 지적이 없으면 그냥 지운다. */
  function askThenDo(axis: 'row' | 'col', at: number, run: () => void) {
    if (!el) return
    const hit = cmtThreads.filter((t) => t.el_id === el.id && !t.lost_at
      && anchorLostBy(t.cell, axis, at))
    if (hit.length === 0) { run(); void shiftAnchors(axis, at, -1); return }
    setLoss({ axis, at, run })
  }

  const lostThreads = loss && el
    ? cmtThreads.filter((t) => t.el_id === el.id && !t.lost_at
        && anchorLostBy(t.cell, loss.axis, loss.at))
    : []

  // 선택한 사진의 실제 비율을 읽어 상자를 다시 잡는다. 자동으로 하지 않고 사용자가 누를 때만 —
  // 일부러 잘라 쓰던 구도를 멋대로 바꾸면 안 되기 때문.
  function fitImageBox() {
    if (!page || !el || el.type !== 'image' || !el.src) return
    const img = new Image()
    img.onload = () => {
      const iw = img.naturalWidth, ih = img.naturalHeight
      if (!iw || !ih) return
      const base = Math.max(el.w, el.h)          // 지금 크기감을 유지한 채 비율만 교정
      const k = base / Math.max(iw, ih)
      pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
      updateEl(page.id, el.id, { w: Math.max(24, Math.round(iw * k)), h: Math.max(24, Math.round(ih * k)) })
    }
    img.src = el.src
  }

  function patchTable(pt: Partial<FreeEl>) {
    if (!page || !el) return
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }))
    updateEl(page.id, el.id, fitPage(el, pt))
    // 행/열이 줄었으면 활성 셀을 새 범위 안으로 당겨 준다.
    // 안 그러면 마지막 행을 두 번 지울 때 두 번째 삭제가 범위 밖을 가리켜 표가 어긋난다.
    const nr = pt.rows, ncl = pt.cols
    if ((nr != null || ncl != null) && tableSel && tableSel.elId === el.id) {
      const maxR = (nr != null ? nr : Infinity) - 1
      const maxC = (ncl != null ? ncl : Infinity) - 1
      const cl = (v: number, m: number) => Math.max(0, Math.min(m, v))
      setTableSel({
        elId: el.id,
        r0: cl(tableSel.r0, maxR), c0: cl(tableSel.c0, maxC),
        r1: cl(tableSel.r1, maxR), c1: cl(tableSel.c1, maxC),
      })
    }
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
  // 선택 범위(없으면 활성 셀 한 칸). 정렬·크기 버튼이 전부 이 네 값을 쓴다.
  const rng = (): [number, number, number, number] => (ts ? [ts.r0, ts.c0, ts.r1, ts.c1] : [ar, ac, ar, ac])
  const cellFs = (el && ts && el.cfs && el.cfs[Math.min(ts.r0, ts.r1) + '_' + Math.min(ts.c0, ts.c1)]) || (el ? el.fs : 12)
  const selCount = ts ? (Math.abs(ts.r1 - ts.r0) + 1) * (Math.abs(ts.c1 - ts.c0) + 1) : 0

  return (
    <div className="ax-inspector">
      {/* **맨 위 고정**(사용자 결정 ㄱ). 탭보다 위라 무엇을 골랐든 늘 보인다 —
          표를 고치는 중에도 「저장 안 됨」이 눈에 든다. 접힌 줄은 32px 이다. */}
      <ApprovalCard />
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
                  <br />열 구성과 머리글은 취합을 위해 고정됩니다.
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
                <div className="insp-hint">셀을 드래그해 여러 칸을 한 번에 칠할 수 있어요. 병합도 같은 방식이에요 — 위 툴바의 <b>표 ⤢ 병합</b>.</div>
              </>)}

              <div className="insp-sec">행</div>
              <div className="insp-row">
                <button className="insp-pill" disabled={!canRow} onClick={() => { patchTable(addRow(el, Math.max(ar, headLocked))); void shiftAnchors('row', Math.max(ar, headLocked), 1) }}>↑ 위에 추가</button>
                <button className="insp-pill" disabled={!canRow} onClick={() => { patchTable(addRow(el, ar + 1)); void shiftAnchors('row', ar + 1, 1) }}>↓ 아래 추가</button>
                <button className="insp-pill danger" disabled={!canRow || headRowSelected}
                  title={headRowSelected ? '머리글 행은 삭제할 수 없어요' : undefined}
                  onClick={() => askThenDo('row', ar, () => patchTable(delRow(el, ar)))}>🗑 행 삭제</button>
              </div>
              {/* 천장에 닿았을 때만 말한다. 늘 띄워 두면 아무도 안 읽는다. */}
              {tableAtCeiling ? (
                <div className="insp-hint warn">이 표가 종이 아래끝까지 찼어요. 여기서 행을 더 넣으면
                  <b> 줄 높이가 줄어듭니다.</b> 표를 위로 옮기거나, 다음 장에 이어 적어 주세요.</div>
              ) : (
                <div className="insp-hint">행을 넣으면 <b>줄 높이는 그대로</b> 두고 표가 그만큼 커져요.</div>
              )}
              {canCol ? (<>
                <div className="insp-sec">열</div>
                <div className="insp-row">
                  <button className="insp-pill" onClick={() => { patchTable(addCol(el, ac)); void shiftAnchors('col', ac, 1) }}>← 왼쪽 추가</button>
                  <button className="insp-pill" onClick={() => { patchTable(addCol(el, ac + 1)); void shiftAnchors('col', ac + 1, 1) }}>→ 오른쪽 추가</button>
                  <button className="insp-pill danger"
                    onClick={() => askThenDo('col', ac, () => patchTable(delCol(el, ac)))}>🗑 열 삭제</button>
                </div>
              </>) : null}
              {canMerge ? (<>
                <div className="insp-sec">셀 병합</div>
                <div className="insp-row">
                  <button className="insp-pill" disabled={!ts || (ts.r0 === ts.r1 && ts.c0 === ts.c1)} onClick={() => { if (ts) patchTable(mergeRange(el, ts.r0, ts.c0, ts.r1, ts.c1)) }}>⤢ 병합</button>
                  <button className="insp-pill" onClick={() => patchTable(unmergeAt(el, ar, ac))}>병합 해제</button>
                </div>
              </>) : null}
              <div className="insp-sec">셀 정렬{selCount > 1 ? ` (${selCount}칸)` : ''}</div>
              <div className="insp-row seg">
                <button title="왼쪽" onClick={() => patchTable(setAlignRange(el, ...rng(), 'left'))}>⇤</button>
                <button title="가운데" onClick={() => patchTable(setAlignRange(el, ...rng(), 'center'))}>⇔</button>
                <button title="오른쪽" onClick={() => patchTable(setAlignRange(el, ...rng(), 'right'))}>⇥</button>
              </div>
              <div className="insp-row seg">
                <button title="위" onClick={() => patchTable(setVAlignRange(el, ...rng(), 'top'))}>⤒</button>
                <button title="세로 가운데" onClick={() => patchTable(setVAlignRange(el, ...rng(), 'middle'))}>⇕</button>
                <button title="아래" onClick={() => patchTable(setVAlignRange(el, ...rng(), 'bottom'))}>⤓</button>
              </div>
              <div className="insp-sec">셀 글자 크기</div>
              <div className="insp-row">
                <label className="insp-num sm"><span>크기</span>
                  <NumInput value={cellFs} min={6} max={200} ariaLabel="셀 글자 크기"
                    onCommit={(n) => patchTable(setCellFsRange(el, ...rng(), n))} /></label>
                <button className="insp-pill" onClick={() => patchTable(setCellFsRange(el, ...rng(), null))}>표 기본으로</button>
              </div>
              <div className="insp-sec">테두리 · 헤더</div>
              <div className="insp-row">
                <ColorPicker value={el.borderColor || '#cfd5e2'} onChange={(c) => patchTable({ borderColor: c })} />
                <select className="insp-sel" style={{ width: 'auto' }} value={el.borderWidth ?? 1} onChange={(e) => patchTable({ borderWidth: Number(e.target.value) })}>
                  <option value={0.5}>얇게</option><option value={1}>보통</option><option value={2}>굵게</option>
                </select>
                <label className="insp-check"><input type="checkbox" checked={el.headRow !== false} onChange={(e) => patchTable({ headRow: e.target.checked })} /> 헤더행</label>
              </div>
              <span style={cap}>셀을 드래그하면 범위가 잡힙니다(Shift+클릭도 범위). 글자 수정은 표를 더블클릭. 표 자체를 옮길 땐 표 가장자리를 끌거나 방향키를 쓰세요.</span>
            </>)}

            {tab === 'style' && (<>
              {el.type === 'image' && el.src ? (<>
                <div className="insp-sec">사진</div>
                <div className="insp-row">
                  <button className="insp-pill" onClick={() => fitImageBox()}>⤢ 사진 비율 맞추기</button>
                </div>
                <div className="insp-hint">상자를 사진 원래 비율로 맞춰 위아래 여백을 없앱니다.</div>
              </>) : null}
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
                <label className="insp-num sm"><span>크기</span>
                  <NumInput value={el.fs} min={6} max={200} ariaLabel="글자 크기"
                    onCommit={(n) => patch({ fs: n })} /></label>
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
          {/* 이미 카드로 만들어 둔 마인드맵에만 나온다. 새로 넣는 것은 처음부터
              요소로 펼쳐져 나오므로 이 단추가 필요 없다.
              열 때 자동으로 바꾸지 않는 이유: 잠금 플래그 하나 떼는 것과 달리
              **내용을 통째로 다시 쓰는 일**이고, 필드를 정성껏 채워 둔 사람의 자료다. */}
          {page && page.cardKey === 'mindmap' ? (<>
            <div className="insp-row">
              <button className="insp-pill" onClick={() => { if (selId != null) { pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })); expandMindmap(selId) } }}>
                ⤢ 요소로 펼치기
              </button>
            </div>
            <span style={cap}>가지를 하나씩 옮기고 크기를 바꿀 수 있게 됩니다.
              대신 오른쪽 칸으로 한 번에 고치는 건 그때부터 안 돼요 — 잘못 눌렀으면 ⌘Z 로 되돌립니다.</span>
          </>) : null}
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

      {/* 짚어 둔 칸이 사라질 때 — **삭제 계열에서만** 묻는다.
          추가할 때까지 물으면 사람들은 읽지 않고 누르게 되고,
          그러면 정작 지워질 때의 경고까지 함께 흘려보낸다. */}
      {loss && lostThreads.length > 0 && (
        <AnchorLossDialog
          el={el || undefined}
          lost={lostThreads}
          what={loss.axis === 'row' ? `${loss.at + 1}행` : `${loss.at + 1}열`}
          onCancel={() => setLoss(null)}
          onGo={(keep) => {
            const { axis, at, run } = loss
            setLoss(null)
            run()
            void shiftAnchors(axis, at, -1, keep ? 'keep' : 'delete')
          }} />
      )}
    </div>
  )
}
