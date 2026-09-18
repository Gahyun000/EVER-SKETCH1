import { useEffect, useRef, useState } from 'react'
import { useBuilder } from '../state/store'
import PageWithCanvas from '../cards/PageWithCanvas'
import { pageSize } from '../cards/sizing'
import { tocItems } from './util'
import { useOverlay } from '../ui/overlay'

const TRANS_CSS = `@keyframes tfade{from{opacity:0}to{opacity:1}}@keyframes tslide{from{transform:translateX(64px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes tzoom{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}@keyframes tflip{from{transform:perspective(1200px) rotateY(22deg);opacity:0}to{transform:none;opacity:1}}.ptrans.trans-fade{animation:tfade .4s ease}.ptrans.trans-slide{animation:tslide .42s cubic-bezier(.2,.7,.2,1)}.ptrans.trans-zoom{animation:tzoom .4s ease}.ptrans.trans-flip{animation:tflip .5s ease}`

export default function Present({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pages = useBuilder((s) => s.pages)
  const orientation = useBuilder((s) => s.orientation)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const title = useBuilder((s) => s.title)
  const [idx, setIdx] = useState(0)
  const [scale, setScale] = useState(1)
  const items = tocItems(pages)
  const { W, H } = pageSize(orientation)

  // **덮고 있는 동안은 아래(캔버스)가 키를 안 건드리게 한다** — ui/overlay 참고.
  useOverlay(open)
  useEffect(() => { if (open) setIdx(0) }, [open])
  useEffect(() => {
    function recompute() { setScale(Math.min((window.innerWidth * 0.84) / W, (window.innerHeight * 0.8) / H)) }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [W, H, open])
  /**
   * **발표 중의 키. 바뀌는 값은 전부 ref 로 본다 — deps 에 넣으면 키가 통째로 안 먹는다.**
   *
   * 2026-09-17 · 재 보니 **발표 중 Esc 가 안 닫혔다.** 나가는 단추에는 「✕ 나가기 (Esc)」
   * 라고 적혀 있는데 그 Esc 가 거짓말이었다. 30초 시연(TutorialPlayer)에서 먼저 찾은 것과
   * **똑같은 결함**이다:
   *   · `onClose` 는 Layout 이 렌더마다 새로 만드는 화살표라, deps 에 있으면 이 효과가
   *     렌더마다 떼였다 다시 붙는다.
   *   · 키를 누르면 다른 리스너가 먼저 받아 setState 를 하고, 키 이벤트는 discrete 라
   *     React 18 이 **그 자리에서 곧바로** 다시 그린다.
   *   · 그 다시 그리기가 **이벤트가 아직 퍼지는 도중에** 이 리스너를 떼었다 붙인다.
   *     DOM 규칙상 퍼지는 도중에 떼인 리스너는 안 불린다 — 등록은 돼 있는데 한 번도
   *     안 불리는 모양이 된다.
   *
   * 화살표·스페이스도 같은 배를 탔다. 그래서 `pages.length` 까지 ref 로 옮겨
   * **deps 를 `open` 하나로** 줄인다. 붙였다 뗄 일이 없으면 이 결함은 못 생긴다.
   */
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const lenRef = useRef(pages.length)
  lenRef.current = pages.length
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current()
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setIdx((i) => Math.min(i + 1, Math.max(0, lenRef.current - 1))) }
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  if (!pages.length) {
    return (<div className="present"><button className="pexit" onClick={onClose}>✕ 나가기 (Esc)</button><div style={{ color: '#fff' }}>페이지가 없습니다</div></div>)
  }
  const clamped = Math.min(idx, pages.length - 1)
  const page = pages[clamped]
  return (
    <div className="present">
      <button className="pexit" onClick={onClose}>✕ 나가기 (Esc)</button>
      <style>{TRANS_CSS}</style>
      <div style={{ transform: 'scale(' + scale + ')', transformOrigin: 'center', cursor: 'pointer' }} onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}>
        <div key={clamped} className={'ptrans trans-' + (page.trans || 'none')}>
          <PageWithCanvas page={page} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} interactive={false} />
        </div>
      </div>
      <div className="pnav">
        <button onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)) }}>‹</button>
        <span className="pidx">{clamped + 1} / {pages.length}</span>
        <button onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(pages.length - 1, i + 1)) }}>›</button>
      </div>
    </div>
  )
}
