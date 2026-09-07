import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { countMyTurn, useComments } from '../comments/store'
import { useProjects } from '../persistence/projects'
import { useBuilder } from '../state/store'
import PageWithCanvas from '../cards/PageWithCanvas'
import { pageSize, ratioLabel } from '../cards/sizing'
import { tocItems } from './util'

/**
 * 미리보기(작업창).
 *
 * 페이지의 논리 크기(가로 덱 1040×720)는 작업창보다 큰 게 보통이다.
 * 그래서 **여기서 맞춤 배율로 축소해 그린다.** 좌표계는 건드리지 않는다 —
 * FreeEl 의 x/y 는 언제나 논리 좌표이고, 화면 배율은 FreeLayer 가
 * 자기 DOM 폭에서 되읽어 마우스 좌표를 나눈다(FreeLayer.zoomOf).
 * 배율을 좌표에 섞어 저장하면 창 크기에 따라 문서가 달라진다.
 */
export default function Preview() {
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const orientation = useBuilder((s) => s.orientation)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const title = useBuilder((s) => s.title)
  const page = pages.find((p) => p.id === selId)
  const items = tocItems(pages)
  const { W, H } = pageSize(orientation)

  const stageRef = useRef<HTMLDivElement>(null)
  // **맞춤 배율에서 100% 상한을 뺐다**(2026-09-07).
  //   setScale(Math.min(1, avW / W, avH / H))   ← 예전
  // 세로 이북은 논리 크기가 432×576 이라, 넓은 창에서는 줄일 것도 없으니 그냥 작은
  // 종이가 뜨고 나머지는 회색으로 남았다. 임원진이 「세로 작업공간이 너무 좁다」고
  // 한 게 이것이다. 확대는 CSS transform 이라 글자가 흐려지지 않는다.
  const [fitScale, setFitScale] = useState(1)
  // null = 맞춤(창에 맞춰 자동). 숫자를 넣으면 사람이 정한 배율.
  // 두 값을 한 상태로 합치면 창 크기가 바뀔 때 사람이 정한 값을 덮을지 말지를
  // 매번 따져야 한다 — 갈라 두면 그 질문 자체가 없다.
  const [userZoom, setUserZoom] = useState<number | null>(null)
  const scale = userZoom ?? fitScale

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const fit = () => {
      const r = node.getBoundingClientRect()
      const avW = r.width - 32, avH = r.height - 32     // .stage 패딩 16px 양쪽
      if (avW <= 0 || avH <= 0) return
      setFitScale(Math.min(avW / W, avH / H))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(node)
    return () => ro.disconnect()
  }, [W, H])

  // 방향이 바뀌면 맞춤으로 되돌린다 — 세로에 맞춰 둔 배율이 가로에서 맞을 리 없다.
  useEffect(() => { setUserZoom(null) }, [W, H])

  const ZMIN = 0.25, ZMAX = 4, ZSTEP = 1.25
  const clampZ = (z: number) => Math.max(ZMIN, Math.min(ZMAX, z))
  const zoomBy = (f: number) => setUserZoom((z) => clampZ((z ?? fitScale) * f))

  // ⌘/Ctrl + = − 0. 글자를 치는 중에는 가로챈다 — 표 칸에 '0' 을 쓰다가
  // 배율이 튀면 무슨 일이 난 건지 아무도 모른다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomBy(ZSTEP) }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / ZSTEP) }
      else if (e.key === '0') { e.preventDefault(); setUserZoom(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Ctrl + 휠. React 의 onWheel 은 passive 라 preventDefault 가 안 먹는다 —
  // 그러면 브라우저가 페이지 자체를 확대해 버린다. 직접 붙인다.
  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? ZSTEP : 1 / ZSTEP)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  })

  const pct = Math.round(scale * 100)

  // **무엇을 할 수 있는지는 서버가 정한다**(GET /api/projects/{id} 의 access).
  // 화면이 역할과 회차 단계를 보고 다시 계산하면 규칙이 두 곳에 생기고,
  // 어긋나는 순간 사용자에게는 '눌리는데 저장이 안 되는' 상태로 보인다.
  const access = useProjects((s) => s.access)
  const canWrite = !access || access.can_write

  // **확인할 지적이 있으면 여기서 알려준다.**
  // 지금은 오른쪽 가장자리의 작은 「의견」 탭이 유일한 신호다. 자기 장을
  // 열어 표를 고치고 있는 사람 눈에는 잘 안 들어온다 — 그 사이 지적은
  // 아무도 안 본 채로 남는다. 0건이면 아무것도 띄우지 않는다.
  const me = useAuth((s) => s.me)
  const threads = useComments((s) => s.threads)
  const cmtOpen = useComments((s) => s.open)
  const setCmtOpen = useComments((s) => s.setOpen)
  const cmtFocus = useComments((s) => s.focus)
  const docIsMine = !access || access.mine
  const toMe = countMyTurn(threads, me?.id, docIsMine)
  const first = threads.find((t) => !t.resolved_at && t.author_id !== me?.id)

  return (<>
    <div className="pv-h">
      {!cmtOpen && toMe > 0 && (
        <button className="pv-todo" onClick={() => { setCmtOpen(true); if (first) cmtFocus(first.id) }}
          title="검토 의견 목록을 엽니다">
          확인할 의견 <b>{toMe}건</b>
        </button>
      )}
      {canWrite ? '미리보기' : (
        <span className="pv-ro">
          <b>읽기 전용</b>
          {!access?.mine
            ? ' — 남의 자료입니다. 보기만 할 수 있습니다.'
            : ' — 지금은 고칠 수 없는 상태입니다.'}
        </span>
      )}
    </div>
    <div className="stage" ref={stageRef}>
      {page
        ? (
          <div style={{ width: W * scale, height: H * scale, flex: '0 0 auto' }}>
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <PageWithCanvas page={page} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} interactive={canWrite} />
            </div>
          </div>
        )
        : <div className="pv-empty">카드를 추가하세요</div>}
    </div>
    <div className="pv-cap">
      {orientation === 'landscape' ? '가로 덱' : '세로 이북'} ({ratioLabel(orientation)}) · {W}×{H}
      {' · '}
      {/* 배율은 여태 **보여만 주고** 바꿀 수단이 없었다(그것도 100% 미만일 때만).
          이제 여기서 바꾼다. 「맞춤」은 창에 맞추는 자동 상태로 되돌린다. */}
      <span className="pv-zoom">
        <button title="축소 (⌘/Ctrl −)" onClick={() => zoomBy(1 / ZSTEP)}>−</button>
        <span className="v" title="화면 배율">{pct}%</span>
        <button title="확대 (⌘/Ctrl +)" onClick={() => zoomBy(ZSTEP)}>+</button>
        <button className={'fitb' + (userZoom === null ? ' on' : '')}
          title="창에 맞추기 (⌘/Ctrl 0)" onClick={() => setUserZoom(null)}>맞춤</button>
      </span>
      {' · '}{font === 'auto' ? '자동 폰트' : '커스텀 폰트'} · 크기 {size === 's' ? '작게' : size === 'l' ? '크게' : '보통'}
    </div>
  </>)
}
