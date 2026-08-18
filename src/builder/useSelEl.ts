import { useBuilder } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import type { FreeEl } from '../state/store'
import { pushSnap } from '../canvas/model'

// 현재 선택된 자유 캔버스 요소와, 그 요소에 서식을 적용하는 헬퍼.
export function useSelEl() {
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const updateEl = useBuilder((s) => s.updateEl)
  const updateEls = useBuilder((s) => s.updateEls)
  const selEl = useCanvasUI((s) => s.selEl)
  const selEls = useCanvasUI((s) => s.selEls)
  const page = pages.find((p) => p.id === selId)
  const el: FreeEl | undefined = page ? page.els.find((e) => e.id === selEl) : undefined
  function patch(p: Partial<FreeEl>) {
    if (!page || !el) return
    pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes }))
    // 위치·크기(x/y/w/h)는 대표 요소에만, 그 외 서식은 선택된 요소 전체에 적용
    const geometry = 'x' in p || 'y' in p || 'w' in p || 'h' in p
    if (!geometry && selEls.length > 1) updateEls(page.id, selEls, p)
    else updateEl(page.id, el.id, p)
  }
  return { page, el, patch }
}
