import { useCanvasUI } from '../../state/canvasUI'
import type { Tool } from '../../state/canvasUI'
import { useSelEl } from '../useSelEl'
import ColorPicker from './ColorPicker'
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Pen, Highlighter, Eraser } from 'lucide-react'
import { useAutosave } from '../../persistence/autosave'
import { useBuilder, type PaperType } from '../../state/store'
import { PAPER_OPTIONS } from '../../cards/paper'
import type { FreeEl } from '../../state/store'
import { mergeCovering, mergeRange, unmergeAt } from '../../canvas/tableOps'
import { ROADMAP_MONTH_COL0, isSlotEl, slotAllows, todayColumn, type TodayMode } from '../../template/slots'
import { tableAnchorLabel } from '../../comments/anchorLabel'
import { cellKey } from '../../comments/anchor'
import CommentComposer from '../../comments/CommentComposer'
import { useProjects } from '../../persistence/projects'
import { useComments } from '../../comments/store'
import { useBuilder as useBuilderStore } from '../../state/store'

let FMT: Partial<FreeEl> | null = null

const TEXT_COLORS = ['#1a1a1a', '#2a78d6', '#0f9d58', '#c5501f', '#4a3aa7', '#ffffff']
const PEN_COLORS = ['#111318', '#2462EB', '#e0483d', '#0f9d58']
const HL_COLORS = ['#ffd600', '#8ef58a', '#ff9ecb', '#9ad7ff']


// 갤러리에 노출하는 도형 목록. star4·banner·callout 은 "목록에서만" 뺀 것이라
// Tool 타입 / .fel.* 렌더러 / exportPptx 매핑은 그대로 둔다 — 기존 문서가 깨지면 안 되므로.
const SHAPE_CATS: { cat: string; items: { t: Tool; label: string }[] }[] = [
  { cat: '기본', items: [
    { t: 'box', label: '사각형' },
    { t: 'round', label: '둥근 사각형' },
    { t: 'ellipse', label: '원' },
    { t: 'diamond', label: '마름모' },
    { t: 'triangle', label: '삼각형' },
    { t: 'hexagon', label: '육각형' },
    { t: 'pentagon', label: '오각형' },
    { t: 'parallelogram', label: '평행사변형' },
    { t: 'star5', label: '별' },
  ] },
  { cat: '화살표', items: [
    { t: 'arrowR', label: '오른쪽 화살표' },
    { t: 'arrowL', label: '왼쪽 화살표' },
    { t: 'arrowU', label: '위 화살표' },
    { t: 'arrowD', label: '아래 화살표' },
    { t: 'chevron', label: '갈매기(진행)' },
  ] },
]
const SHAPES: { t: Tool; label: string }[] = SHAPE_CATS.flatMap((c) => c.items)

// 도형 버튼 — PowerPoint 식. 아이콘은 항상 같은 심볼이고, 버튼 어디를 눌러도 갤러리가 열린다.
// 셀 미리보기는 index.css 의 clip-path 를 재사용하므로 캔버스에 그려지는 모양과 동일하다.
// 도형 무장 중이라는 신호는 버튼의 .on 하이라이트뿐 — 해제는 Esc(Hotkeys) 또는 다른 도구 선택.
function ShapeTool() {
  const tool = useCanvasUI((s) => s.tool)
  const setTool = useCanvasUI((s) => s.setTool)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const active = SHAPES.some((sh) => sh.t === tool)
  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left, y: r.bottom + 6 })
    setOpen(true)
  }
  return (
    <span className="shp-wrap">
      <button ref={ref} className={'ib shp-btn' + (active ? ' on' : '')} title="도형" onClick={toggle}>
        <svg className="shp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
          <circle cx="9.5" cy="8.5" r="5.2" />
          <rect x="9" y="10" width="10.5" height="10.5" rx="2.2" />
        </svg>
      </button>
      {open && pos ? createPortal(
        <>
          <div className="shp-back" onClick={() => setOpen(false)} />
          <div className="shp-pop cats" style={{ left: pos.x, top: pos.y }}>
            {SHAPE_CATS.map((c) => (
              <div key={c.cat} className="shp-cat">
                <div className="shp-cat-h">{c.cat}</div>
                <div className="shp-grid">
                  {c.items.map((sh) => (
                    <button key={sh.t} className={'shp-cell' + (tool === sh.t ? ' on' : '')} title={sh.label}
                      onClick={() => { setTool(sh.t); setOpen(false) }}>
                      <span className={'shp-sh ' + sh.t} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>, document.body) : null}
    </span>
  )
}

/**
 * 표 도구 — 표가 선택됐을 때만 나타난다.
 *
 * 병합 버튼이 오른쪽 패널 '표' 탭 **안에만** 있어서, 패널을 닫아둔 사람은
 * 기능이 아예 없는 줄 알았다. 정본 v2.0 에서 로드맵의 진행 구간은
 * '가로 병합 + 단계 이름' 이다 — 병합을 못 찾으면 로드맵을 그릴 수가 없다.
 * 제품의 핵심 조작이 발견되지 않는 곳에 있었다.
 */
/**
 * 「의견 달기」 — 지금 고른 요소(또는 표의 칸)에 검토 의견을 붙인다.
 *
 * 목록에만 쓰면 "3번째 줄 진행 구간" 같은 말이 되고, 받는 사람은 그 줄을
 * 찾는 것부터 해야 한다. 짚어서 달 수 있어야 한 번에 통한다.
 */
function CommentTool() {
  const { el } = useSelEl()
  const tableSel = useCanvasUI((s) => s.tableSel)
  const selectedPageId = useBuilderStore((s) => s.selectedPageId)
  const add = useComments((s) => s.add)
  const setOpen = useComments((s) => s.setOpen)
  const projectId = useComments((s) => s.projectId)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  // 남의 장에는 **검토 단계부터** 지적을 단다. 아직 쓰는 중인 것에 지적이
  // 달리면 쓰는 사람이 흔들린다. 되는지 여부는 서버가 정한다(access).
  const access = useProjects((s) => s.access)
  const canComment = !access || access.can_comment
  if (!projectId) return null

  const ts = el && tableSel && tableSel.elId === el.id ? tableSel : null
  // **끌어 고른 범위 그대로 짚는다.**
  // 예전에는 왼쪽 위 한 칸만 저장했다. 그러면 "3~5월 구간이 앞 장과 다릅니다"
  // 를 짚어도 목록에는 「4행 6열」 한 칸만 남고, 받는 사람은 어느 구간인지
  // 글을 다시 읽어야 했다. 로드맵에서 지적의 대부분은 구간에 달린다.
  const cell = ts ? cellKey(ts.r0, ts.c0, ts.r1, ts.c1) : null
  // 「5행 3~6열」이 아니라 「B프로젝트 · 2월~5월」로 적는다(anchorLabel.ts 주석 참고).
  const where = !el ? '이 장' : cell ? tableAnchorLabel(el, cell) : '고른 요소'

  return (
    <span className="ax-grp gs">
      <span className="lab">검토</span>
      <button className="tbtn" disabled={busy || !canComment}
        title={canComment ? `${where}에 의견을 답니다` : '이 자료에는 의견을 달 수 없습니다'}
        onClick={() => setComposing(true)}>💬 의견 달기</button>
      <span className="tbtn-hint">{canComment ? where : '의견 불가'}</span>
      {composing && (
        <CommentComposer where={where} onClose={() => setComposing(false)}
          onSubmit={async (body) => {
            setBusy(true)
            try {
              await add({ body, page_id: selectedPageId ?? 1, el_id: el ? el.id : null, cell })
              setOpen(true)
            } finally { setBusy(false) }
          }} />
      )}
    </span>
  )
}

/**
 * 표 도구.
 *
 * **표를 안 골랐을 때도 사라지지 않는다.** 예전에는 표를 고르는 순간 이 묶음이
 * 새로 생겼고, 그만큼 툴바가 높아지면서(실측 42px) 아래 문서가 통째로 내려갔다.
 * 손가락은 가만히 있는데 문서가 내려오니 칸을 끌던 사람은 한 줄 아래까지 골랐다.
 * 자리를 늘 지키고 있으면 고르든 말든 높이가 같다 — 줄을 따로 만들 필요도 없다.
 */
function TableTools() {
  const { el, patch } = useSelEl()
  const tableSel = useCanvasUI((s) => s.tableSel)
  const table = el && el.type === 'table' ? el : null

  if (!table) {
    return (
      <span className="ax-grp gs off">
        <span className="lab">표</span>
        <button className="tbtn" disabled title="표를 고르면 쓸 수 있어요">⤢ 병합</button>
        <button className="tbtn" disabled title="표를 고르면 쓸 수 있어요">⤡ 해제</button>
        <span className="tbtn-hint">표의 칸을 고르세요</span>
      </span>
    )
  }

  const ts = tableSel && tableSel.elId === table.id ? tableSel : null
  const inTemplate = isSlotEl(table.slot)
  const canMerge = !inTemplate || slotAllows(table.slot, 'merge')
  const rows = ts ? Math.abs(ts.r1 - ts.r0) + 1 : 0
  const cols = ts ? Math.abs(ts.c1 - ts.c0) + 1 : 0
  const ranged = rows * cols > 1
  const onMerged = !!ts && !!mergeCovering(table.merges, ts.r1, ts.c1)
  // 배부받은 빈 로드맵 — 아직 아무것도 안 그린 상태.
  // 정본에서 진행 구간은 '가로 병합 + 단계 이름' 인데, 빈 표만 보고는
  // 그걸 어떻게 만드는지 알 길이 없다. 그 순간에만 방법을 알려준다.
  // 머리글 병합 6건은 정본이 처음부터 갖고 있다 — 그 이상이 없으면 아직 아무것도 안 그린 것이다.
  // 범위를 잡기 전까지만 알려준다. 범위를 잡은 뒤엔 몇 칸인지가 더 중요하다.
  const blankRoadmap = table.slot === 'SLOT-A' && (table.merges || []).length <= 6 && !ranged

  const why = !canMerge ? '이 표는 표준 양식이라 병합할 수 없어요'
    : !ts ? '표 안에서 칸을 클릭하세요'
    : !ranged ? '두 칸 이상을 끌어서 고르세요'
    : `${rows}행 ${cols}열을 하나로 합칩니다`

  // ── TODAY 마커 ──
  // 로드맵에만 있다. 기본은 자동(열 때마다 실제 오늘)이고, 발표용으로 특정 시점을
  // 붙잡아야 할 때만 사람이 고정한다. 어느 상태인지 글자로 같이 보여준다 —
  // 버튼 세 개만 있으면 지금 자동인지 고정인지 알 수가 없다.
  const canToday = slotAllows(table.slot, 'today')
  const todayMode: TodayMode = table.todayMode ?? 'auto'
  const shownCol = todayColumn(table)
  const monthOf = (c: number) => c - ROADMAP_MONTH_COL0 + 1
  const pickedCol = ts ? Math.min(ts.c0, ts.c1) : null
  const todayWhere =
    shownCol == null
      ? (todayMode === 'off' ? '숨김'
        : todayMode === 'auto' ? '올해가 아님'
        : '자리 없음')
      : (monthOf(shownCol) >= 1 && monthOf(shownCol) <= 12 ? `${monthOf(shownCol)}월` : `${shownCol + 1}열`)

  return (
    <>
    <span className="ax-grp gs">
      <span className="lab">표</span>
      <button className="tbtn" title={why} disabled={!canMerge || !ranged}
        onClick={() => { if (ts) patch(mergeRange(table, ts.r0, ts.c0, ts.r1, ts.c1)) }}>⤢ 병합</button>
      <button className="tbtn" title={canMerge ? (onMerged ? '이 칸의 병합을 풉니다' : '병합된 칸을 고르세요') : why}
        disabled={!canMerge || !onMerged}
        onClick={() => { if (ts) patch(unmergeAt(table, ts.r1, ts.c1)) }}>⤡ 해제</button>
      <span className={'tbtn-hint' + (blankRoadmap ? ' teach' : '')}>
        {blankRoadmap
          ? '끌어 고른 뒤 ⤢ 병합 → 단계 이름'
          : ts ? (ranged ? `${rows}×${cols} 선택` : `${Math.min(ts.r0, ts.r1) + 1}행 ${Math.min(ts.c0, ts.c1) + 1}열`)
          : '칸을 끌어서 선택'}
      </span>
    </span>

    {canToday ? (
      <span className="ax-grp gs">
        <span className="lab">TODAY</span>
        <button className={'tbtn' + (todayMode === 'auto' ? ' on' : '')}
          title="열 때마다 실제 오늘 달로 옮겨갑니다"
          onClick={() => patch({ todayMode: 'auto' })}>오늘</button>
        <button className={'tbtn' + (todayMode === 'fixed' ? ' on' : '')}
          title={pickedCol == null ? '고정할 달의 칸을 먼저 고르세요' : `${monthOf(pickedCol) >= 1 && monthOf(pickedCol) <= 12 ? monthOf(pickedCol) + '월' : (pickedCol + 1) + '열'}에 고정합니다`}
          disabled={pickedCol == null}
          onClick={() => { if (pickedCol != null) patch({ todayMode: 'fixed', today: pickedCol }) }}>이 칸에 고정</button>
        <button className={'tbtn' + (todayMode === 'off' ? ' on' : '')}
          title="마커를 그리지 않습니다"
          onClick={() => patch({ todayMode: 'off' })}>숨기기</button>
        <span className="tbtn-hint">{todayWhere}</span>
      </span>
    ) : null}
    </>
  )
}

export default function EditToolbar() {
  // 표준 양식 자료인가 — 서버가 심어 둔 표시. 연결 도구를 감출지 여기서 갈린다.
  const isTemplateDoc = !!useProjects((s) => s.template)
  const tool = useCanvasUI((s) => s.tool)
  const setTool = useCanvasUI((s) => s.setTool)
  const penWidth = useCanvasUI((s) => s.penWidth)
  const penColor = useCanvasUI((s) => s.penColor)
  const hlColor = useCanvasUI((s) => s.hlColor)
  const setPenWidth = useCanvasUI((s) => s.setPenWidth)
  const setPenColor = useCanvasUI((s) => s.setPenColor)
  const setHlColor = useCanvasUI((s) => s.setHlColor)
  const hlWidth = useCanvasUI((s) => s.hlWidth)
  const setHlWidth = useCanvasUI((s) => s.setHlWidth)
  const eraserWidth = useCanvasUI((s) => s.eraserWidth)
  const setEraserWidth = useCanvasUI((s) => s.setEraserWidth)
  const openPicker = useCanvasUI((s) => s.openPicker)
  const selectedPageId = useBuilder((s) => s.selectedPageId)
  const setPaper = useBuilder((s) => s.setPaper)
  const curPaper = useBuilder((s) => { const pg = s.pages.find((x) => x.id === s.selectedPageId); return (pg && pg.paper) || 'blank' })
  const { el, patch } = useSelEl()
  const emit = (name: string) => window.dispatchEvent(new CustomEvent(name))
  const saveStatus = useAutosave((s) => s.status)
  const savedAt = useAutosave((s) => s.savedAt)
  const error = useAutosave((s) => s.error)
  const saveNow = useAutosave((s) => s.saveNow)
  const saveTitle = saveStatus === 'error' ? (error || '저장 실패') : savedAt ? `마지막 저장: ${new Date(savedAt).toLocaleString()}` : '자동 저장'
  const [flash, setFlash] = useState(false)
  const flashRef = useRef<number | undefined>(undefined)
  const doSave = () => {
    void saveNow()
    setFlash(false)
    requestAnimationFrame(() => setFlash(true))   // 연속 클릭에도 매번 펄스
    if (flashRef.current) window.clearTimeout(flashRef.current)
    flashRef.current = window.setTimeout(() => setFlash(false), 520)
  }
  const saveLabel = saveStatus === 'saving' ? '저장 중'
    : saveStatus === 'dirty' ? '저장 안 됨'
    : saveStatus === 'error' ? '저장 실패'
    : '저장됨'

  // **표준 양식에서는 연결 도구를 감춘다.** 임원은 양식만 쓰고 거기서 흐름도를 그릴 일이
  // 없는데, 버튼이 보이면 눌러 보게 되고 그은 선은 결재 스냅샷까지 따라간다.
  // 자유 이북에서는 그대로다 — 마인드맵·프로세스 카드가 이 도구 위에 서 있다.
  const gsTools: { t: Tool; icon: string; title: string }[] = ([
    { t: 'select', icon: '▣', title: '선택' },
    { t: 'text', icon: 'T', title: '텍스트' },
    { t: 'connect', icon: '→', title: '화살표 연결' },
    { t: 'table', icon: '▦', title: '표' },
    { t: 'wordart', icon: '🅰', title: '글맵시' },
  ] as { t: Tool; icon: string; title: string }[]).filter((x) => !(isTemplateDoc && x.t === 'connect'))
  const size = el ? el.fs : 30
  function setSize(v: number) { if (el) patch({ fs: Math.max(6, Math.min(120, v)) }) }
  function cycleColor() {
    if (!el) return
    const i = TEXT_COLORS.indexOf(el.tcolor || '#1a1a1a')
    patch({ tcolor: TEXT_COLORS[(i + 1) % TEXT_COLORS.length] })
  }

  return (
    /* 두 줄로 나눈다.
       첫 줄 = **늘 쓰는 만들기 도구**(그리기·도형·펜). 무엇을 골랐든 그대로다.
       둘째 줄 = **고른 것에 따라 달라지는 도구**(표·검토).
       둘째 줄은 고른 게 없어도 자리를 지킨다 — 있다가 없어지면 툴바 높이가
       변하고, 그만큼 아래 문서가 내려간다(실측 42px). 손가락은 가만히 있는데
       문서가 움직여서, 칸을 끌던 사람이 한 줄 아래까지 고르게 된다. */
    <div className="ax-tb">
     <div className="ax-tbrow">
      <button className="ib" title="실행취소 (⌘/Ctrl+Z)" onClick={() => emit('ebook:undo')}>↺</button>
      <button className="ib" title="다시실행 (⌘/Ctrl+Shift+Z)" onClick={() => emit('ebook:redo')}>↻</button>
      <button className={'ib save-tb state-' + saveStatus + (flash ? ' flash' : '')} title={saveTitle} aria-label="지금 저장" onClick={doSave}>
        <svg className="save-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
      </button>
      <span className={'save-lab state-' + saveStatus}>{saveLabel}</span>
      <span className="dv" />

      <span className="ax-grp gs">
        <span className="lab">구글 슬라이드</span>
        {gsTools.map((g) => (
          <button key={g.t} className={'ib' + (tool === g.t ? ' on' : '')} title={g.title} onClick={() => setTool(tool === g.t ? 'select' : g.t)}>{g.icon}</button>
        ))}
        <ShapeTool />
        <button className="ib" title="이모지·아이콘·이미지" onClick={openPicker}>😀</button>
      </span>

      <span className="ax-grp gs note-grp">
        <span className="lab">노트</span>
        <select className="ax-fsel" value={curPaper} title="종이 템플릿(이 페이지)" onChange={(e) => { if (selectedPageId != null) setPaper(selectedPageId, e.target.value as PaperType) }}>
          {PAPER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className={'ib' + (tool === 'pen' ? ' on' : '')} title="펜(두께·색) — 다시 누르면 끔" onClick={() => setTool(tool === 'pen' ? 'select' : 'pen')}><Pen size={16} /></button>
        <select className="ax-fsel" value={penWidth} title="펜 두께" onChange={(e) => setPenWidth(Number(e.target.value))}>
          <option value={1.5}>얇게</option>
          <option value={2.5}>보통</option>
          <option value={5}>굵게</option>
        </select>
        {PEN_COLORS.map((c) => <button key={c} className={'ax-dot' + (penColor === c ? ' on' : '')} style={{ background: c }} title="펜 색" onClick={() => setPenColor(c)} />)}
        <button className={'ib' + (tool === 'highlighter' ? ' on' : '')} title="형광펜 — 다시 누르면 끔" onClick={() => setTool(tool === 'highlighter' ? 'select' : 'highlighter')}><Highlighter size={16} /></button>
        <select className="ax-fsel" value={hlWidth} title="형광펜 두께" onChange={(e) => setHlWidth(Number(e.target.value))}>
          <option value={10}>얇게</option>
          <option value={16}>보통</option>
          <option value={26}>굵게</option>
        </select>
        {HL_COLORS.map((c) => <button key={c} className={'ax-dot' + (hlColor === c ? ' on' : '')} style={{ background: c }} title="형광펜 색" onClick={() => setHlColor(c)} />)}
        <button className={'ib' + (tool === 'eraser' ? ' on' : '')} title="지우개(획 삭제) — 다시 누르면 끔" onClick={() => setTool(tool === 'eraser' ? 'select' : 'eraser')}><Eraser size={16} /></button>
        <select className="ax-fsel" value={eraserWidth} title="지우개 크기" onChange={(e) => setEraserWidth(Number(e.target.value))}>
          <option value={14}>작게</option>
          <option value={22}>보통</option>
          <option value={36}>크게</option>
        </select>
      </span>
     </div>

     <div className="ax-tbrow ctx">
      <TableTools />
      <CommentTool />
     </div>
    </div>
  )
}
