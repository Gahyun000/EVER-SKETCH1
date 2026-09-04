// 결재 스냅샷의 읽기전용 슬라이드 렌더러 — 에디터와 같은 PageWithCanvas 를 interactive=false 로 그린다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import PageWithCanvas from '../cards/PageWithCanvas'
import { pageSize } from '../cards/sizing'
import { tocItems } from '../builder/util'
import type { DraftStateSnapshot } from '../persistence/draftStorage'
import type { Page } from '../state/store'

/** 주어진 가로폭에 맞춰 페이지 한 장을 축소 렌더. */
export function ScaledPage({ snap, page, width }: { snap: DraftStateSnapshot; page: Page; width: number }) {
  const { W, H } = pageSize(snap.orientation)
  const k = width / W
  const items = tocItems(snap.pages)
  return (
    <div className="ap-scaler" style={{ width, height: Math.round(H * k) }}>
      <div style={{ transform: `scale(${k})`, width: W, height: H }}>
        <PageWithCanvas page={page} docTitle={snap.title} orientation={snap.orientation} size={snap.size} font={snap.font} tocItems={items} interactive={false} />
      </div>
    </div>
  )
}

interface ViewerProps {
  snap: DraftStateSnapshot
  idx: number
  onIdx: (i: number) => void
  badge?: (page: Page, i: number) => number     // 썸네일 우상단 배지(코멘트 수)
  children?: ReactNode                          // 스테이지 위에 얹을 요소
}

/** 필름스트립 + 큰 스테이지. 스테이지는 컨테이너 폭/높이에 맞춰 자동 축소. */
export default function SlideViewer({ snap, idx, onIdx, badge, children }: ViewerProps) {
  const pages = snap.pages || []
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageW, setStageW] = useState(600)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const { W, H } = pageSize(snap.orientation)
    const calc = () => {
      const cw = el.clientWidth - 40, ch = el.clientHeight - 40
      const k = Math.min(cw / W, ch / H, 1.4)
      setStageW(Math.max(160, Math.floor(W * k)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [snap.orientation])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return
      if (e.key === 'ArrowRight') onIdx(Math.min(pages.length - 1, idx + 1))
      if (e.key === 'ArrowLeft') onIdx(Math.max(0, idx - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, pages.length, onIdx])

  const cur = pages[Math.min(idx, Math.max(0, pages.length - 1))]
  return (
    <>
      <div className="ap-film">
        {pages.map((p, i) => {
          const n = badge ? badge(p, i) : 0
          return (
            <button key={p.id} className={'ap-thumb' + (i === idx ? ' on' : '')} onClick={() => onIdx(i)} title={`${i + 1}번 슬라이드`}>
              <span className="no">{i + 1}</span>
              {n > 0 ? <span className="cm" title={`코멘트 ${n}개`}>{n}</span> : null}
              <div className="pg"><ScaledPage snap={snap} page={p} width={104} /></div>
            </button>
          )
        })}
      </div>
      <div className="ap-stagewrap">
        <div className="ap-stage" ref={stageRef}>
          {cur ? <div className="pg"><ScaledPage snap={snap} page={cur} width={stageW} /></div> : <div className="ap-cmt-empty">슬라이드가 없습니다</div>}
        </div>
        {pages.length > 0 ? (
          <div className="ap-pnav">
            <button onClick={() => onIdx(Math.max(0, idx - 1))} aria-label="이전">‹</button>
            <span>{Math.min(idx + 1, pages.length)} / {pages.length}</span>
            <button onClick={() => onIdx(Math.min(pages.length - 1, idx + 1))} aria-label="다음">›</button>
          </div>
        ) : null}
        {children}
      </div>
    </>
  )
}
