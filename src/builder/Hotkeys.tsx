import { useEffect, useRef } from 'react'
import { useBuilder } from '../state/store'
import type { FreeEl, Page } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import type { Tool } from '../state/canvasUI'
import { pushSnap, popSnap, pushRedo, popRedo, pushUndoRaw, mkFreeEl } from '../canvas/model'

interface Props {
  presentOpen: boolean; helpOpen: boolean; tutorialOpen: boolean
  onBuild: () => void; onPresent: () => void; onHelp: () => void
  onCloseHelp: () => void; onCloseTutorial: () => void
}

// 컴포넌트 밖 모듈 스코프 클립보드(복사/붙여넣기용)
let CLIP: FreeEl | null = null

// 단일 키 → 도구 (Whimsical/Figma식)
const TOOL_KEYS: Record<string, Tool> = {
  v: 'select', r: 'box', o: 'ellipse', d: 'diamond', t: 'text',
  s: 'sticky', i: 'image', c: 'connect', p: 'pen',
}

export default function Hotkeys(props: Props) {
  const ref = useRef(props)
  ref.current = props

  useEffect(() => {
    function curPage(): Page | null {
      const bs = useBuilder.getState()
      return bs.pages.find((p) => p.id === bs.selectedPageId) || null
    }
    function snapStr(p: Page): string { return JSON.stringify({ els: p.els, conns: p.conns, strokes: p.strokes }) }
    function snap(p: Page) { pushSnap(p.id, snapStr(p)) }
    function selectedEl(): { page: Page; el: FreeEl } | null {
      const p = curPage(); if (!p) return null
      const id = useCanvasUI.getState().selEl; if (id == null) return null
      const el = p.els.find((e) => e.id === id); if (!el) return null
      return { page: p, el }
    }
    function cloneAt(src: FreeEl, dx: number, dy: number): FreeEl {
      const n = mkFreeEl(src.type, src.x + dx, src.y + dy)
      n.w = src.w; n.h = src.h; n.text = src.text; n.color = src.color; n.fs = src.fs
      if (src.src) n.src = src.src
      return n
    }

    function onKey(e: KeyboardEvent) {
      const p = ref.current
      // 발표/도움말/튜토리얼이 열려 있으면 그쪽이 키를 처리 (발표는 자체 핸들러)
      if (p.presentOpen) return
      if (p.helpOpen) { if (e.key === 'Escape') { e.preventDefault(); p.onCloseHelp() } return }
      if (p.tutorialOpen) { if (e.key === 'Escape') { e.preventDefault(); p.onCloseTutorial() } return }

      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      const k = e.key
      const lower = k.length === 1 ? k.toLowerCase() : k

      // --- 문서 단축키: 입력 중에도 동작 ---
      if (mod && (lower === 's' || k === 'Enter')) { e.preventDefault(); p.onBuild(); return }
      if (mod && e.shiftKey && lower === 'p') { e.preventDefault(); p.onPresent(); return }
      if (k === 'F5') { e.preventDefault(); p.onPresent(); return }
      if (k === 'F1') { e.preventDefault(); p.onHelp(); return }

      if (typing) return // 아래는 칸에 글자 입력 중이 아닐 때만

      const bs = useBuilder.getState()
      const ui = useCanvasUI.getState()
      const page = curPage()

      // 되돌리기 / 다시 실행
      if (mod && lower === 'z') {
        e.preventDefault(); if (!page) return
        if (e.shiftKey) { const s = popRedo(page.id); if (s) { pushUndoRaw(page.id, snapStr(page)); bs.setCanvas(page.id, JSON.parse(s)); ui.setSel(null) } }
        else { const s = popSnap(page.id); if (s) { pushRedo(page.id, snapStr(page)); bs.setCanvas(page.id, JSON.parse(s)); ui.setSel(null) } }
        return
      }
      if (mod && lower === 'y') { e.preventDefault(); if (!page) return; const s = popRedo(page.id); if (s) { pushUndoRaw(page.id, snapStr(page)); bs.setCanvas(page.id, JSON.parse(s)); ui.setSel(null) }; return }

      // Esc: 도구 취소 + 선택 해제
      if (k === 'Escape') { ui.setTool('select'); ui.setSel(null); ui.setConnSrc(null); return }

      // 페이지 이동 (이전/다음)
      if (k === 'PageUp' || k === 'PageDown') {
        e.preventDefault(); if (!bs.pages.length) return
        const idx = bs.pages.findIndex((pg) => pg.id === bs.selectedPageId)
        const c = idx < 0 ? 0 : idx
        const next = k === 'PageUp' ? Math.max(0, c - 1) : Math.min(bs.pages.length - 1, c + 1)
        bs.selectPage(bs.pages[next].id); ui.setSel(null); return
      }
      // 페이지 순서 이동: ⌘/Ctrl+Shift+↑/↓
      if (mod && e.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault(); if (bs.selectedPageId != null) bs.movePage(bs.selectedPageId, k === 'ArrowUp' ? -1 : 1); return
      }

      const sel = selectedEl()

      // 삭제
      if ((k === 'Delete' || k === 'Backspace') && sel) { e.preventDefault(); snap(sel.page); bs.removeEl(sel.page.id, sel.el.id); ui.setSel(null); return }

      // 복제
      if (mod && lower === 'd' && sel) { e.preventDefault(); snap(sel.page); const n = cloneAt(sel.el, 16, 16); bs.addEl(sel.page.id, n); ui.setSel(n.id); return }

      // 복사 / 잘라내기 / 붙여넣기
      if (mod && lower === 'c' && sel) { e.preventDefault(); CLIP = { ...sel.el }; return }
      if (mod && lower === 'x' && sel) { e.preventDefault(); CLIP = { ...sel.el }; snap(sel.page); bs.removeEl(sel.page.id, sel.el.id); ui.setSel(null); return }
      if (mod && lower === 'v' && CLIP && page) { e.preventDefault(); snap(page); const n = cloneAt(CLIP, 20, 20); bs.addEl(page.id, n); ui.setSel(n.id); return }

      // 앞으로/뒤로: ⌘/Ctrl + ] / [
      if (mod && (k === ']' || k === '[') && sel) { e.preventDefault(); snap(sel.page); bs.reorderEl(sel.page.id, sel.el.id, k === ']'); return }

      // 방향키로 이동 (Shift=10px)
      if (!mod && (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') && sel) {
        e.preventDefault(); if (!e.repeat) snap(sel.page)
        const step = e.shiftKey ? 10 : 1
        let x = sel.el.x, y = sel.el.y
        if (k === 'ArrowUp') y -= step; else if (k === 'ArrowDown') y += step; else if (k === 'ArrowLeft') x -= step; else x += step
        bs.updateEl(sel.page.id, sel.el.id, { x, y }); return
      }

      // 도구 단축키 (단일 키)
      if (!mod && !e.shiftKey && !e.altKey && lower.length === 1 && TOOL_KEYS[lower]) { ui.setTool(TOOL_KEYS[lower]); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
