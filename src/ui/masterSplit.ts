import { MASTER_DEFAULT, MASTER_MAX, MASTER_MIN } from '../persistence/prefs'

/**
 * 마스터-디테일 — 왼쪽 목록, 오른쪽 상세. 결재함(P5)과 팀 공유(P6)가 같이 쓴다.
 *
 * **여기에는 화면이 없다.** 폭을 어디까지 허용할지, 목록이 바뀌었을 때 무엇을
 * 골라 둘지 — 두 화면이 똑같이 답해야 하는 물음만 모아 둔다. 같은 판단을 두
 * 컴포넌트가 각자 적으면 언젠가 한쪽만 고쳐지고, 「결재함에서는 되는데 팀
 * 공유에서는 안 된다」가 된다.
 */

/** 끌어 옮긴 폭을 허용 범위 안으로 밀어 넣는다.
 *  **벽에 부딪히게 두고 접지는 않는다** — 사이드바는 끝까지 좁히면 접혔지만
 *  여기 목록은 접을 데가 없다. 목록이 사라지면 고를 방법이 없어서다. */
export function clampMaster(px: number): number {
  // NaN 만 따로 받는다. `Math.max(MIN, NaN)` 은 NaN 이고 그대로 나가면 화면이
  // `width: NaNpx` 가 되어 **칸이 통째로 사라진다.** 무한은 벽에 걸리므로 그냥 둔다 —
  // 어느 쪽으로 무한인지가 곧 어느 벽인지라, 따로 정해 주면 오히려 거짓말이 된다.
  if (Number.isNaN(px)) return MASTER_DEFAULT
  return Math.round(Math.min(MASTER_MAX, Math.max(MASTER_MIN, px)))
}

/**
 * 무엇을 골라 둘 것인가 (③ㄴ · 첫 줄 자동 선택).
 *
 * **고르던 것이 아직 목록에 있으면 안 건드린다.** 목록은 검색·탭·새로고침으로
 * 수시로 다시 그려지는데, 그때마다 맨 위로 튕기면 방금 읽던 자리를 잃는다.
 * 사라졌을 때만 맨 위로 옮긴다 — 비워 두면 오른쪽이 「골라 주세요」 한 줄로
 * 남아, 화면의 절반 넘는 자리가 아무 말도 안 하게 된다.
 *
 * 빈 목록에서는 `null` 이다. 없는 것을 고른 척하지 않는다.
 */
export function keepOrFirst(ids: readonly string[], cur: string | null): string | null {
  if (cur && ids.includes(cur)) return cur
  return ids.length ? ids[0] : null
}
