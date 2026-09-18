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

  const addCard = useBuilder((st) => st.addCard)

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

  /**
   * **슬라이드 목록에서 키보드로 움직인다**(2026-09-18 · 사용자 결정).
   *
   * 파워포인트 영상에서 나온 일이다 — 「슬라이드 누르고 엔터 누르면 빈 슬라이드가 하나
   * 생성되고, 키보드로 밑에 슬라이드로 넘어가는 기능」. 재 보니 우리는 썸네일이 그냥
   * `div` 라 **포커스를 못 받았고**(눌러도 focus 가 body 에 남았다), 엔터도 방향키도
   * 아무 일이 없었다.
   *
   * **전역 단축키로 만들지 않는다.** ↑↓ 는 이미 「고른 도형 1px 옮기기」다(Hotkeys).
   * 전역으로 걸면 둘이 정면으로 부딪힌다 — 파워포인트도 **초점이 어디 있느냐**로 가른다.
   * 그래서 이 목록 안에서만 듣고, 처리한 키는 `stopPropagation` 으로 캔버스까지 안 보낸다.
   *
   * 엔터로 만든 슬라이드는 **고른 것 바로 뒤**에 들어간다(store 의 slideSpot).
   *
   * 삭제(Delete)는 **아직 안 넣었다.** 되돌리기가 쪽 단위로 따로 관리돼서(`snapDoc`),
   * 실수로 한 장을 날렸을 때 어떻게 돌아오는지 먼저 확인해야 한다.
   */
  const go = (i: number) => {
    const t = pages[Math.max(0, Math.min(pages.length - 1, i))]
    if (t) selectPage(t.id)
  }
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const at = pages.findIndex((p) => p.id === sel)
    const eat = () => { e.preventDefault(); e.stopPropagation() }
    if (e.key === 'ArrowDown') { eat(); go(at + 1); return }
    if (e.key === 'ArrowUp') { eat(); go(at - 1); return }
    if (e.key === 'Home') { eat(); go(0); return }
    if (e.key === 'End') { eat(); go(pages.length - 1); return }
    if (e.key === 'Enter') { eat(); addCard('slide'); return }
  }

  /**
   * **초점이 고른 쪽을 따라간다.**
   *
   * 「지금 고른 것」이 눈에는 파랗게 보이는데 초점은 딴 데 있으면, 다음 ↑ 가 엉뚱한 데서
   * 출발한다. 다만 **이미 목록 안에 초점이 있을 때만** 옮긴다 — 안 그러면 캔버스에서
   * 글을 치는 도중에 초점을 빼앗아 간다.
   */
  useEffect(() => {
    const list = listRef.current
    if (!list || !list.contains(document.activeElement)) return
    const cur = list.querySelector<HTMLElement>('.axth.on')
    if (cur && cur !== document.activeElement) {
      cur.focus()
      cur.scrollIntoView({ block: 'nearest' })
    }
  }, [sel, pages.length])

  return (
    <div className={'axth-list' + (drag ? ' dragging' : '')} ref={listRef}
      role="listbox" aria-label="슬라이드 목록" onKeyDown={onKey}>
      {pages.map((p, i) => {
        const cls = 'axth'
          + (p.id === sel ? ' on' : '')
          + (drag && drag.from === i ? ' lifted' : '')
          + (drag && drag.dropAt === i ? ' dropbefore' : '')
          + (drag && drag.dropAt === pages.length && i === pages.length - 1 ? ' dropafter' : '')
        return (
          // **고른 것만 Tab 으로 들어온다**(roving tabindex). 쪽이 서른이면 Tab 을 서른 번
          // 눌러야 목록을 지나치게 되는데, 그건 키보드로 쓰는 사람에게 벽이다.
          <div key={p.id} data-idx={i} className={cls} onClick={() => selectPage(p.id)}
            role="option" aria-selected={p.id === sel} tabIndex={p.id === sel ? 0 : -1}
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
