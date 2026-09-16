import { toPng } from 'html-to-image'
import type { Page } from '../state/store'
import { cardByKey } from '../cards/registry'

export interface ExportSettings { title: string; orientation: string; theme?: string }
interface OutPage { role: string; seq?: number; title?: string; imageDataUrl: string }
// 목차 클릭 영역(핫스팟) — 좌표는 페이지 대비 0~1 비율. generator.py의 _hotspots.json 계약과 동일.
interface Hotspot { seq: number; x: number; y: number; w: number; h: number; label: string }
export interface BuildResult { ok: boolean; id?: string; url?: string; error?: string }

// 목차 페이지 노드에서 data-goto-seq 줄들의 위치를 페이지 대비 비율로 뽑는다(OCR 불필요·정확).
function tocHotspots(node: HTMLElement): Hotspot[] {
  const nr = node.getBoundingClientRect()
  if (!nr.width || !nr.height) return []
  const out: Hotspot[] = []
  node.querySelectorAll<HTMLElement>('[data-goto-seq]').forEach((el) => {
    const seq = parseInt(el.dataset.gotoSeq || '', 10)
    if (!seq || seq < 1) return
    const r = el.getBoundingClientRect()
    let x = (r.left - nr.left) / nr.width
    let y = (r.top - nr.top) / nr.height
    let w = r.width / nr.width
    let h = r.height / nr.height
    // 페이지 안으로 클램프(generator는 벗어난 좌표를 버린다)
    x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y))
    w = Math.max(0, Math.min(1 - x, w)); h = Math.max(0, Math.min(1 - y, h))
    if (w <= 0 || h <= 0) return
    out.push({ seq, x, y, w, h, label: (el.textContent || '').trim().slice(0, 40) })
  })
  return out
}

export async function exportBook(pages: Page[], settings: ExportSettings, projectId?: string): Promise<BuildResult> {
  const out: OutPage[] = []
  const hotspots: Hotspot[] = []
  let seq = 0
  for (const p of pages) {
    const node = document.getElementById('export-page-' + p.id)
    if (!node) continue
    const dataUrl = await toPng(node as HTMLElement, { pixelRatio: 2, cacheBust: true })
    const c = cardByKey(p.cardKey)
    let role = p.role || 'content'
    if (!p.role) {
      if (c && c.kind === 'cover') role = 'cover'
      else if (c && c.kind === 'back') role = 'back'
      else if (c && c.kind === 'toc') role = 'toc'
    }
    if (role === 'content') {
      seq++
      out.push({ role, seq, title: p.fields?.title || p.sectionId || (c ? c.title : '페이지' + seq), imageDataUrl: dataUrl })
    } else {
      out.push({ role, imageDataUrl: dataUrl })
      if (role === 'toc') hotspots.push(...tocHotspots(node as HTMLElement))
    }
  }
  const res = await fetch('/api/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: settings.title, orientation: settings.orientation, theme: settings.theme || 'light', pages: out, hotspots, project_id: projectId }),
  })
  // **거절당했으면 그 이유를 그대로 옮긴다**(2026-09-16).
  // 예전에는 성공했을 때의 모양(`{ ok, url }`)만 읽었다. 403·500 은 `ok` 도 `error` 도
  // 없는 `{ detail: ... }` 이라, 화면에는 이유 없이 **「실패: 」** 만 떴다.
  // 서버는 「먼저 자료를 저장한 뒤 발행해 주세요」처럼 할 일을 말해 주는데, 그 말이
  // 사용자에게 닿지 않고 있었다.
  let body: unknown = null
  try { body = await res.json() } catch { /* 본문이 JSON 이 아닐 수도 있다 */ }
  const b = (body || {}) as { ok?: boolean; error?: string; detail?: string; url?: string }
  if (!res.ok || b.ok === undefined) {
    return { ok: false, error: b.error || b.detail || ('서버가 ' + res.status + ' 로 거절했습니다') } as BuildResult
  }
  return b as BuildResult
}
