import { useEffect, useRef } from 'react'
import { useBuilder } from '../state/store'
import { useCanvasUI } from '../state/canvasUI'
import { pushSnap, popSnap, pushRedo, popRedo, pushUndoRaw, mkFreeEl } from '../canvas/model'

// 툴바·메뉴·단축키에서 오는 요소 명령(실행취소/다시실행/삭제/복제/앞뒤순서/AI 초안)을
// 선택 컨텍스트를 쥔 채 처리한다. 예전 숨은 Dock 컴포넌트를 대체하는 훅.
export function useCanvasCommands() {
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const addEl = useBuilder((s) => s.addEl)
  const removeEl = useBuilder((s) => s.removeEl)
  const addConn = useBuilder((s) => s.addConn)
  const reorderEl = useBuilder((s) => s.reorderEl)
  const setCanvas = useBuilder((s) => s.setCanvas)
  const selEl = useCanvasUI((s) => s.selEl)
  const selEls = useCanvasUI((s) => s.selEls)
  const setSel = useCanvasUI((s) => s.setSel)

  const page = pages.find((p) => p.id === selId)
  const selected = page ? page.els.find((e) => e.id === selEl) : undefined
  function snap() { if (page) pushSnap(page.id, JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached })) }
  function cur() { return page ? JSON.stringify({ els: page.els, conns: page.conns, strokes: page.strokes, detached: page.detached }) : '' }
  function del() { if (!page || !selEls.length) return; snap(); selEls.forEach((id) => removeEl(page.id, id)); setSel(null) }
  function dup() {
    if (!page || !selected) return; snap()
    const e = mkFreeEl(selected.type, selected.x + 16, selected.y + 16)
    e.w = selected.w; e.h = selected.h; e.text = selected.text; e.color = selected.color; e.fs = selected.fs
    e.bold = selected.bold; e.tcolor = selected.tcolor; e.cells = selected.cells; e.rows = selected.rows; e.cols = selected.cols; e.wa = selected.wa
    addEl(page.id, e); setSel(e.id)
  }
  function z(front: boolean) { if (!page || !selEls.length) return; snap(); selEls.forEach((id) => reorderEl(page.id, id, front)) }
  function undo() { if (!page) return; const st = popSnap(page.id); if (!st) return; pushRedo(page.id, cur()); setCanvas(page.id, JSON.parse(st)); setSel(null) }
  function redo() { if (!page) return; const st = popRedo(page.id); if (!st) return; pushUndoRaw(page.id, cur()); setCanvas(page.id, JSON.parse(st)); setSel(null) }
  function ai() {
    if (!page) return; snap()
    const labels = ['현황 진단', 'AI 도입', '성과 확산']; const ids: number[] = []
    labels.forEach((tx, i) => { const e = mkFreeEl('round', 30 + i * 118, 180); e.w = 104; e.h = 54; e.text = tx; addEl(page.id, e); ids.push(e.id) })
    addConn(page.id, { from: ids[0], to: ids[1] }); addConn(page.id, { from: ids[1], to: ids[2] })
  }

  // 페이지를 넘기면 이전 선택(유령 선택)을 비운다.
  useEffect(() => { setSel(null) }, [selId, setSel])

  const handlers = { undo, redo, del, dup, zf: () => z(true), zb: () => z(false), ai }
  const hRef = useRef(handlers); hRef.current = handlers
  useEffect(() => {
    const map: Record<string, keyof typeof handlers> = {
      'ebook:undo': 'undo', 'ebook:redo': 'redo', 'ebook:del': 'del', 'ebook:dup': 'dup',
      'ebook:z-front': 'zf', 'ebook:z-back': 'zb', 'ebook:ai': 'ai',
    }
    const fns = Object.entries(map).map(([evt, k]) => { const fn = () => hRef.current[k](); window.addEventListener(evt, fn); return [evt, fn] as const })
    return () => fns.forEach(([evt, fn]) => window.removeEventListener(evt, fn))
  }, [])
}
