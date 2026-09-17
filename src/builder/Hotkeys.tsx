import { useEffect, useRef } from 'react'
import { useBuilder } from '../state/store'
import type { FreeEl, Page } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import { useAuth } from '../auth/useAuth'
import { canPublish } from '../auth/authApi'
import type { Tool } from '../state/canvasUI'
import { pushSnap, popSnap, pushRedo, popRedo, pushUndoRaw, nextUndoKind, nextRedoKind, mkFreeEl } from '../canvas/model'

interface Props {
  presentOpen: boolean; helpOpen: boolean
  onBuild: () => void; onPresent: () => void; onHelp: () => void; onSave: () => void
  onCloseHelp: () => void
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
    // 삭제·잘라내기는 다중 선택 전부를 대상으로 한다.
    // (버튼·메뉴는 useCanvasCommands.del() 로 이미 전부 지우는데 단축키만 1개만 지우고 있었다)
    function selectedEls(): { page: Page; els: FreeEl[] } | null {
      const p = curPage(); if (!p) return null
      const ui = useCanvasUI.getState()
      const ids = ui.selEls.length ? ui.selEls : (ui.selEl != null ? [ui.selEl] : [])
      const els = ids.map((id) => p.els.find((e) => e.id === id)).filter((e): e is FreeEl => !!e)
      return els.length ? { page: p, els } : null
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

      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      const k = e.key
      const lower = k.length === 1 ? k.toLowerCase() : k

      // --- 문서 단축키: 입력 중에도 동작 ---
      // ⌘S 는 메뉴가 '💾 저장 ⌘S' 로 안내하는 대로 저장이어야 한다.
      // 이북 빌드(전 페이지 PNG 캡처)는 수십 초 걸리는 무거운 작업이라 ⌘Enter 로 분리했다.
      if (mod && lower === 's') { e.preventDefault(); p.onSave(); return }
      // **⌘Enter 도 메뉴와 같은 규칙으로 막는다**(2026-09-16). 전에는 메뉴만 가려 두고
      // 단축키는 열려 있어서, 발행 권한이 없는 사람이 눌러도 그대로 서버까지 갔다 —
      // 403 이 오면 화면에는 이유 없이 「실패: 」만 떴다. 보이지 않는 기능은 눌러지지도
      // 않아야 한다.
      if (mod && k === 'Enter') { e.preventDefault(); if (canPublish(useAuth.getState().me)) p.onBuild(); return }
      if (mod && e.shiftKey && lower === 'p') { e.preventDefault(); p.onPresent(); return }
      if (k === 'F5') { e.preventDefault(); p.onPresent(); return }
      if (k === 'F1') { e.preventDefault(); p.onHelp(); return }

      if (typing) return // 아래는 칸에 글자 입력 중이 아닐 때만

      const bs = useBuilder.getState()
      const ui = useCanvasUI.getState()
      const page = curPage()

      /**
       * 되돌리기 / 다시 실행.
       *
       * **되돌린 뒤에도 고른 것을 놓지 않는다**(2026-09-16). 예전에는 늘 `setSel(null)` 이라,
       * 연달아 되돌리면 어디를 보고 있었는지 매번 잃었다 — 되돌린 자리를 다시 찾아 눌러야 했다.
       * 다만 되돌린 모습에 **그 요소가 없으면** 붙잡고 있을 수 없으니 그때만 놓는다.
       * 칸 범위(`tableSel`)는 늘 푼다 — 표의 행·열이 달라졌을 수 있어 옛 범위는 못 믿는다
       * (`setSel` 이 범위를 같이 비운다).
       */
      const restore = (pageId: number, snapJson: string) => {
        const keep = ui.selEl
        bs.setCanvas(pageId, JSON.parse(snapJson))
        const now = useBuilder.getState().pages.find((p) => p.id === pageId)
        const alive = keep != null && !!now && now.els.some((el) => el.id === keep)
        ui.setSel(alive ? keep : null)
      }
      /**
       * **쪽 안의 일과 쪽 자체의 일 중, 나중에 한 것부터**(2026-09-16, 사용자 신고 ⑥).
       *
       * 되돌리기 이력이 쪽마다 따로라 쪽을 더하거나 지운 일은 어느 쪽의 것도 아니었고,
       * 그래서 ⌘Z 가 죽은 것처럼 보였다. 이제 문서 단위 이력(canvas/history.ts)이 따로
       * 있고, 둘 중 **번호가 큰**(= 나중에 쌓인) 것을 먼저 되돌린다. 순서를 안 보면
       * 「쪽을 지우고 → 글자를 고치고 → ⌘Z」에서 글자가 아니라 쪽이 돌아온다.
       *
       * 문서를 통째로 되돌리면 고르고 있던 요소가 그 자리에 없을 수 있어 선택을 놓는다.
       */
      const undoOnce = () => {
        if (!page) return
        if (nextUndoKind(page.id) === 'doc') { bs.undoDoc(); ui.setSel(null); return }
        const s = popSnap(page.id); if (s) { pushRedo(page.id, snapStr(page)); restore(page.id, s) }
      }
      const redoOnce = () => {
        if (!page) return
        if (nextRedoKind(page.id) === 'doc') { bs.redoDoc(); ui.setSel(null); return }
        const s = popRedo(page.id); if (s) { pushUndoRaw(page.id, snapStr(page)); restore(page.id, s) }
      }
      if (mod && lower === 'z') {
        e.preventDefault(); if (!page) return
        if (e.shiftKey) redoOnce(); else undoOnce()
        return
      }
      if (mod && lower === 'y') { e.preventDefault(); redoOnce(); return }

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
      const selMany = selectedEls()
      if ((k === 'Delete' || k === 'Backspace') && selMany) { e.preventDefault(); snap(selMany.page); selMany.els.forEach((el) => bs.removeEl(selMany.page.id, el.id)); ui.setSel(null); return }

      // 복제
      if (mod && lower === 'd' && sel) { e.preventDefault(); snap(sel.page); const n = cloneAt(sel.el, 16, 16); bs.addEl(sel.page.id, n); ui.setSel(n.id); return }

      // 복사 / 잘라내기 / 붙여넣기
      if (mod && lower === 'c' && sel) { e.preventDefault(); CLIP = { ...sel.el }; return }
      if (mod && lower === 'x' && selMany) { e.preventDefault(); CLIP = { ...selMany.els[selMany.els.length - 1] }; snap(selMany.page); selMany.els.forEach((el) => bs.removeEl(selMany.page.id, el.id)); ui.setSel(null); return }
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
