// 지적과 나의 **관계** — 순수 함수만.
//
// 상태(zustand) 안에 두면 이 계산을 검사하려고 fetch·세션까지 끌고 와야 한다.
// 누구에게 온 지적인지는 서버와 상관없이 정해진다.
/**
 * 이 지적이 나와 어떤 사이인가.
 *
 * **등급이 아니라 관계로 가른다.** 관리자든 작성자든, 내 자료에 달린
 * 남의 지적은 '내가 답해야 할 것' 이고 내가 쓴 것은 '내가 기다리는 것' 이다.
 * 등급으로 가르면 관리자에게는 전부 똑같이 보이고, 정작 자기 자료에 달린
 * 지적을 못 찾는다.
 *
 *   'to-me'  내 자료에 달렸고 내가 쓴 게 아니다 — 답해야 한다
 *   'mine'   내가 쓴 것 — 상대의 답을 기다린다
 *   'other'  그 밖 (동료 자료에 달린 남의 지적)
 */
export type CmtRelation = 'to-me' | 'mine' | 'other'

export function relationOf(t: { author_id: string }, meId: string | undefined,
                           docIsMine: boolean): CmtRelation {
  // 아직 로그인 정보가 안 왔으면 **아무 것도 내 몫으로 세지 않는다.**
  // 이게 없으면 화면이 뜨는 순간 내가 쓴 지적까지 '나에게' 로 잡혀서,
  // 「확인할 의견 3건」이 잠깐 떴다가 1건으로 줄어든다 — 본 사람은 두 건을
  // 놓친 줄 알고 목록을 뒤진다.
  if (!meId) return 'other'
  if (t.author_id === meId) return 'mine'
  return docIsMine ? 'to-me' : 'other'
}

/** 답해야 할 것(미해결) 개수. 화면 곳곳에서 같은 숫자를 써야 한다. */
export function countToMe(threads: { author_id: string; resolved_at: number | null }[], meId: string | undefined,
                          docIsMine: boolean): number {
  if (!docIsMine) return 0
  return threads.filter((t) => !t.resolved_at && relationOf(t, meId, true) === 'to-me').length
}


/**
 * 목록 순서 — **답해야 할 것이 맨 위로.**
 *
 * 스무 건이 쌓인 목록에서 내가 답할 것을 눈으로 찾게 두면, 결국 몇 건은
 * 못 보고 지나간다. 그다음이 내가 쓴 것(상대의 답을 기다리는 것),
 * 해결된 것은 맨 아래다. 같은 무리 안에서는 달린 순서대로 — 대화는
 * 시간 순으로 읽혀야 한다.
 */
const RANK: Record<CmtRelation, number> = { 'to-me': 0, mine: 1, other: 2 }

export function sortThreads<T extends { author_id: string; resolved_at: number | null; created_at: number }>(
  threads: T[], meId: string | undefined, docIsMine: boolean,
): T[] {
  return threads.slice().sort((a, b) => {
    const ra = a.resolved_at ? 1 : 0, rb = b.resolved_at ? 1 : 0
    if (ra !== rb) return ra - rb
    const da = RANK[relationOf(a, meId, docIsMine)]
    const db = RANK[relationOf(b, meId, docIsMine)]
    if (da !== db) return da - db
    return a.created_at - b.created_at
  })
}
