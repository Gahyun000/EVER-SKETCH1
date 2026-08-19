import { useEffect, useRef, useState } from 'react'
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
  return (<>
    <div className="pv-h">미리보기</div>
    <div className="stage" ref={stageRef}>
      {page
        ? (
          <div style={{ width: W * scale, height: H * scale, flex: '0 0 auto' }}>
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <PageWithCanvas page={page} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} interactive={true} />
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
