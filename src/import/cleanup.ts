// 3차 HTML Import — P4 'AI로 정리'(규칙 기반 제안 엔진).
// 가져온 결과 위에서 안전한 제안을 계산한다. LLM 없이 동작(제안→사람이 수락).
// 순수 함수 — DOM/스토어에 의존하지 않아 단위 테스트 가능.

import type { Page } from '../state/store'
import { polish } from '../builder/polish'

/**
 * **KPI 카드 전환 제안은 뺐다**(2026-09-17 · 사용자 결정).
 *
 * 여기에는 「note 쪽에 `이름:값` 줄이 둘 이상이면 성과(KPI) 카드로 바꿔 드릴까요」가 있었다.
 * 같은 날 KPI 카드가 「빈 화면이나 다름없다」고 판단되어 고르는 목록에서 빠졌는데,
 * 이 제안만 남겨 두면 **사람이 직접은 못 고르는 카드를 기계가 권하는** 상태가 된다.
 * 목록에 없는 것이 만들어지면 「이건 어디서 나왔지」를 아무도 못 푼다.
 *
 * 카드 자체는 등록에 살아 있다(registry.ts 의 `hidden`) — 이미 그 카드로 만들어 둔 쪽은
 * 그대로 그려진다. 없어진 것은 **새로 만들자고 권하는 길**뿐이다.
 * 되살린다면 이 파일의 KV 판정과 AiCleanup 의 항목, 그리고 registry 의 `hidden` 셋을 같이 되돌려야 한다.
 */
export interface CleanupPlan {
  polishCount: number        // 공백·기호 다듬을 곳 개수
}

export function analyzeCleanup(pages: Page[]): CleanupPlan {
  let polishCount = 0

  for (const p of pages) {
    for (const k of Object.keys(p.fields)) {
      const v = p.fields[k]
      if (v && polish(v) !== v) polishCount++
    }
    for (const b of p.blocks || []) {
      if (b.text && polish(b.text) !== b.text) polishCount++
    }
  }
  return { polishCount }
}
