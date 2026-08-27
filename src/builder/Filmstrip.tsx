import { useRef, useState, useEffect } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { useBuilder } from '../state/store'
import PageWithCanvas from '../cards/PageWithCanvas'
import { pageSize } from '../cards/sizing'
import { tocItems } from './util'

interface DragState { from: number; y: number; dropAt: number }

// 왼쪽 세로 썸네일 — 실제 페이지를 축소해 미리보기(구글 슬라이드식).
// 썸네일을 끌어서 순서를 바꾼다. ▲▼ 버튼은 한 칸씩 옮기는 용도로 그대로 둔다.
export default function Filmstrip() {
  const pages = useBuilder((s) => s.pages)
  const sel = useBuilder((s) => s.selectedPageId)
  const title = useBuilder((s) => s.title)
  const orientation = useBuilder((s) => s.orientation)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const selectPage = useBuilder((s) => s.selectPage)
  const movePage = useBuilder((s) => s.movePage)
  const reorderPage = useBuilder((s) => s.reorderPage)
  const removePage = useBuilder((s) => s.removePage)
  const items = tocItems(pages)

  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const autoRef = useRef<number | null>(null)

  function stopAuto() { if (autoRef.current !== null) { window.clearInterval(autoRef.current); autoRef.current = null } }
  useEffect(() => stopAuto, [])

  // 커서 y 가 "몇 번째와 몇 번째 사이"인지. 각 카드의 중앙선을 넘었는지로 판정한다.
  function dropIndexAt(clientY: number): number {
    const list = listRef.current
    if (!list) return 0
    const cards = Array.from(list.querySelectorAll<HTMLElement>('[data-idx]'))
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return i
    }
    return cards.length
  }

  function onDragStart(e: RPointerEvent<HTMLElement>, from: number) {
    if (e.button !== 0) return
    const startY = e.clientY
    let started = false

    const move = (ev: PointerEvent) => {
      // 4px 넘게 움직여야 드래그로 친다 — 그냥 클릭은 페이지 선택으로 남긴다.
      if (!started && Math.abs(ev.clientY - startY) < 4) return
      started = true
      ev.preventDefault()
      setDrag({ from, y: ev.clientY, dropAt: dropIndexAt(ev.clientY) })

      // 목록 위아래 끝에 닿으면 자동 스크롤(긴 이북에서 멀리 옮길 때 필요).
      const list = listRef.current
      if (!list) return
      const r = list.getBoundingClientRect()
      const EDGE = 44
      const dn = ev.clientY > r.bottom - EDGE
      const up = ev.clientY < r.top + EDGE
      stopAuto()
      if (up || dn) {
        const step = dn ? 12 : -12
        autoRef.current = window.setInterval(() => {
          list.scrollTop += step
          const d = dragRef.current
          if (d) setDrag({ ...d, dropAt: dropIndexAt(d.y) })
        }, 16)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      stopAuto()
      const d = dragRef.current
      setDrag(null)
      if (!started || !d) return
      // dropAt 은 "빼기 전" 목록 기준의 사이 인덱스다. 자기보다 뒤로 가면 한 칸 당겨진다.
      const dest = d.dropAt > d.from ? d.dropAt - 1 : d.dropAt
      if (dest !== d.from) reorderPage(d.from, dest)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!pages.length) return <div className="axth-empty">＋ 새 슬라이드로 시작하세요</div>

  const { W, H } = pageSize(orientation)
  const miniW = orientation === 'landscape' ? 168 : 150
  const scale = miniW / W
  const miniH = H * scale

  return (
    <div className={'axth-list' + (drag ? ' dragging' : '')} ref={listRef}>
      {pages.map((p, i) => {
        const cls = 'axth'
          + (p.id === sel ? ' on' : '')
          + (drag && drag.from === i ? ' lifted' : '')
          + (drag && drag.dropAt === i ? ' dropbefore' : '')
          + (drag && drag.dropAt === pages.length && i === pages.length - 1 ? ' dropafter' : '')
        return (
          <div key={p.id} data-idx={i} className={cls} onClick={() => selectPage(p.id)}
            onPointerDown={(e) => onDragStart(e, i)}>
            <span className="axth-no" title="끌어서 순서 바꾸기">{i + 1}</span>
            <div className="axth-mini" style={{ width: miniW, height: miniH }}>
              <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                <PageWithCanvas page={p} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} interactive={false} />
              </div>
              <div className="axth-tools" onPointerDown={(e) => e.stopPropagation()}>
                <button title="위로" onClick={(e) => { e.stopPropagation(); movePage(p.id, -1) }}>▲</button>
                <button title="아래로" onClick={(e) => { e.stopPropagation(); movePage(p.id, 1) }}>▼</button>
                <button title="삭제" className="del" onClick={(e) => { e.stopPropagation(); removePage(p.id) }}>✕</button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
