// 챗 액션 브리지 — ui_action(type/payload)을 실제 스토어/캔버스 조작으로 연결.
// 의도 엔진(server/intent)이 내는 이북 액션을 프론트 동작에 매핑한다.
import { useBuilder } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import type { Orientation, BookPlan, PageEdit, PageAdd, FreeEl } from '../state/store'
import type { Tool } from '../state/canvasUI'
import { mkFreeEl, pushSnap } from '../canvas/model'

export interface UiAction { type: string; payload?: Record<string, unknown>; auto_apply?: boolean; requires_confirm?: boolean }

const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))

export function applyUiAction(a: UiAction) {
  const B = useBuilder.getState()
  const C = useCanvasUI.getState()
  const p = a.payload || {}
  switch (a.type) {
    // 슬라이드
    case 'add_slide':
      B.addCard('slide')
      break
    case 'duplicate_slide':
      if (B.selectedPageId != null) B.duplicatePage(B.selectedPageId)
      break
    case 'delete_slide':
      if (B.selectedPageId != null) B.removePage(B.selectedPageId)
      break
    // 도형 삭제 — payload {all?|tool?|count?} 로 현재 페이지 요소 제거(없으면 선택/마지막)
    case 'delete_elements': {
      const pageId = B.selectedPageId != null ? B.selectedPageId : (B.pages.length ? B.pages[B.pages.length - 1].id : null)
      if (pageId == null) break
      const page = B.pages.find((pg) => pg.id === pageId)
      if (!page || !page.els.length) break
      pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes }))
      let ids: number[]
      if (p.all) ids = page.els.map((e) => e.id)
      else if (p.tool) {
        let cand = page.els.filter((e) => e.type === String(p.tool))
        const cnt = Number(p.count)
        if (Number.isFinite(cnt) && cnt > 0) cand = cand.slice(-Math.floor(cnt))
        ids = cand.map((e) => e.id)
      } else if (C.selEl != null) ids = [C.selEl]
      else ids = [page.els[page.els.length - 1].id]
      for (const id of ids) B.removeEl(page.id, id)
      C.setSel(null)
      break
    }
    // 요소 삽입 — count 가 있으면 현재 페이지 캔버스에 실제로 N개 배치, 없으면 도구만 켠다.
    case 'insert_element': {
      const tool = String(p.tool || 'box') as Tool
      const AUTO = ['box', 'round', 'ellipse', 'diamond', 'triangle', 'text', 'sticky', 'icon', 'table', 'wordart']
      const pageId = B.selectedPageId != null ? B.selectedPageId : (B.pages.length ? B.pages[B.pages.length - 1].id : null)
      const rawN = Number(p.count)
      const n = Number.isFinite(rawN) ? Math.max(1, Math.min(20, Math.floor(rawN))) : 0
      // 배치 가능한 도형 + 개수 지정 + 현재 페이지 존재 → 실제 생성(연결·이미지는 상호작용 필요 → 폴백)
      if (n >= 1 && pageId != null && AUTO.indexOf(tool) >= 0) {
        const page = B.pages.find((pg) => pg.id === pageId)
        if (page) {
          pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes }))
          const PER_ROW = 3, DX = 140, DY = 82, X0 = 40, Y0 = 70
          let lastId: number | null = null
          for (let i = 0; i < n; i++) {
            const col = i % PER_ROW, row = Math.floor(i / PER_ROW)
            const el: FreeEl = mkFreeEl(tool, X0 + col * DX, Y0 + row * DY)
            B.addEl(page.id, el)
            lastId = el.id
          }
          C.setTool('select')
          if (lastId != null) C.setSel(lastId)
          break
        }
      }
      // 폴백: 도구만 켜기(개수 없음/페이지 없음/연결·이미지 등)
      C.setTool(tool)
      break
    }
    // 배경/테마
    case 'set_theme':
      if (B.selectedPageId != null) B.setPageBg(B.selectedPageId, p.theme === 'dark' ? '#0e1c30' : '')
      break
    case 'set_orientation':
      B.setOrientation((p.orientation === 'landscape' ? 'landscape' : 'portrait') as Orientation)
      break
    // 정렬(z-order)
    case 'z_order':
      emit(p.dir === 'back' ? 'ebook:z-back' : 'ebook:z-front')
      break
    // (G4) 생성 에이전트 — 서버 planner 의 BookPlan 을 카드로 통째로 적용
    case 'apply_book_plan':
      if (p.plan) {
        B.applyPlan(p.plan as BookPlan)
        // (G6) opt-in 자동 export — 브리프에 '뽑아/출간' 신호가 있을 때만. ExportLayer 가 새 페이지를
        // 렌더한 뒤 캡처하도록 한 틱 미뤄 이북(PDF) 빌드를 트리거한다(기존 make() 리스너 재사용).
        if (p.export_after) setTimeout(() => emit('ebook:build'), 400)
      }
      break
    // (G5) 부분 수정 에이전트 — 대상 페이지 필드만 수정(edits) + 새 장 추가(adds)
    case 'apply_page_edits':
      B.applyPageEdits((p.edits as PageEdit[]) || [], (p.adds as PageAdd[]) || [])
      break
    // 전역 동작
    case 'import_html':
      emit('ebook:import')
      break
    case 'make_ebook':
      emit('ebook:build')
      break
    case 'present':
      emit('ebook:present')
      break
    case 'undo':
      emit('ebook:undo')
      break
    case 'redo':
      emit('ebook:redo')
      break
    // 하위호환: 기존 카드 추가
    case 'add_card':
      if (p.cardKey) B.addCard(String(p.cardKey))
      break
    default:
      break
  }
}
