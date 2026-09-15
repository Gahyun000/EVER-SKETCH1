// 검색 줄이 쓰는 **순수 규칙** — 날짜 범위 한 벌.
//
// 2026-09-15 · 세 화면이 제각각이던 검색 줄을 한 벌로 맞추면서, 범위 판정도 한 군데로
// 모았다. 전에는 자료 목록에만 기간이 있었고(`scopedProjects` 안), 팀 공유·결재함에는
// 아예 없었다. 화면마다 따로 적으면 「9월 8일까지」가 어디서는 8일을 넣고 어디서는
// 빼는 날이 온다.

/** 하루의 **끝까지** 넣는다. `to` 를 자정으로 잡으면 「9월 8일까지」가 8일을 뺀다 —
 *  사람이 「8일까지」라고 쓸 때 8일에 만든 것을 빼고 싶어 하는 경우는 없다. */
export function rangeOf(from?: string, to?: string): { fromTs: number; toTs: number } {
  return {
    fromTs: from ? new Date(from + 'T00:00:00').getTime() : -Infinity,
    toTs: to ? new Date(to + 'T23:59:59').getTime() : Infinity,
  }
}

/** 그 시각이 범위 안인가. 값이 없으면(0·null) **범위를 걸었을 때만** 뺀다 —
 *  아직 안 낸 자료를 「기간 없음」으로 늘 감추면 목록에서 사라져 버린다. */
export function inRange(ts: number | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!ts) return false
  const { fromTs, toTs } = rangeOf(from, to)
  return ts >= fromTs && ts <= toTs
}

/** 검색어가 걸리는가. 여러 칸 중 **하나라도** 맞으면 된다.
 *  대소문자를 안 가린다 — 사람이 아이디를 소문자로 칠지 대문자로 칠지는 그때그때다. */
export function hits(term: string, ...fields: (string | null | undefined)[]): boolean {
  const t = (term || '').trim().toLowerCase()
  if (!t) return true
  return fields.some((f) => (f || '').toLowerCase().includes(t))
}
