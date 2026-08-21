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
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const fit = () => {
      const r = node.getBoundingClientRect()
      const avW = r.width - 24, avH = r.height - 24     // .stage 패딩 12px 양쪽
      if (avW <= 0 || avH <= 0) return
      setScale(Math.min(1, avW / W, avH / H))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(node)
    return () => ro.disconnect()
  }, [W, H])

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
            ? ' — 동료의 자료입니다. 고칠 수는 없고, 보고 의견을 남길 수 있습니다.'
            : access.cycle_status === 'published'
              ? ' — 발행된 회차입니다. 확정본과 어긋나지 않도록 잠겨 있습니다.'
              : ' — 마감된 회차입니다.'}
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
      {pct < 100 ? ` · 화면 ${pct}%` : ''} · {font === 'auto' ? '자동 폰트' : '커스텀 폰트'} · 크기 {size === 's' ? '작게' : size === 'l' ? '크게' : '보통'}
    </div>
  </>)
}
