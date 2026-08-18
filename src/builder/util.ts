import type { Page } from '../state/store'
import { cardByKey } from '../cards/registry'
// 목차 항목: seq(본문 순번) · title · page(책 전체에서의 페이지 위치, 1-based)
export interface TocItem { seq: number; title: string; page: number }
export function tocItems(pages: Page[]): TocItem[] {
  let seq = 0; const out: TocItem[] = []
  pages.forEach((p, i) => {
    if (p.role && p.role !== 'content') return
    const c = cardByKey(p.cardKey)
    if (c && c.kind) return          // 표지·목차·뒷표지(kind 있는 프레임)는 목차 항목이 아님
    seq++                            // 모든 본문 페이지에서 증가(exportBook seq·핫스팟과 정렬)
    if (p.contd) return              // 넘침으로 이어진 페이지는 목차에 안 보이게(단 seq는 소비)
    out.push({ seq, title: p.fields.title || p.sectionId || (c ? c.title : '페이지' + seq), page: i + 1 })
  })
  return out
}
