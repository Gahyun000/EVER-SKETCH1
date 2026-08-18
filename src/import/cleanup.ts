// 3차 HTML Import — P4 'AI로 정리'(규칙 기반 제안 엔진).
// 가져온 결과 위에서 안전한 제안을 계산한다. LLM 없이 동작(제안→사람이 수락).
// 순수 함수 — DOM/스토어에 의존하지 않아 단위 테스트 가능.

import type { Page } from '../state/store'
import { polish } from '../builder/polish'

export interface KpiSuggestion { pageId: number; title: string; kv: string[] }
export interface CleanupPlan {
  polishCount: number        // 공백·기호 다듬을 곳 개수
  kpi: KpiSuggestion[]        // 성과(KPI) 카드 전환 후보
}

// "이름: 값" 형태의 지표 줄
const KV = /^\s*(.+?)\s*[:：]\s*(\S.*)$/

export function analyzeCleanup(pages: Page[]): CleanupPlan {
  let polishCount = 0
  const kpi: KpiSuggestion[] = []

  for (const p of pages) {
    for (const k of Object.keys(p.fields)) {
      const v = p.fields[k]
      if (v && polish(v) !== v) polishCount++
    }
    for (const b of p.blocks || []) {
      if (b.text && polish(b.text) !== b.text) polishCount++
    }
    // KPI 후보: note 페이지에서 '이름:값' 줄이 2개 이상
    if (p.cardKey === 'note' && p.blocks) {
      const kv = p.blocks
        .filter((b) => b.type === 'text' || b.type === 'bullet')
        .map((b) => b.text)
        .filter((t) => KV.test(t))
      if (kv.length >= 2) {
        const h1 = p.blocks.find((b) => b.type === 'h1')
        kpi.push({ pageId: p.id, title: h1?.text || p.fields.title || '기대 성과', kv: kv.slice(0, 3) })
      }
    }
  }
  return { polishCount, kpi }
}
