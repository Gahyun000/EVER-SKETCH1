// **사용자 관리의 검색** — 팀 관리와 같은 자를 쓴다.
//
// 2026-09-18 · 사용자 지시 「사용자도 검색 기능 넣고」. 팀 관리에는 있는데 여기에만
// 없었다. 관리자가 오가며 쓰는 두 화면에서 한쪽만 찾을 수 있으면, 매번 「여기선 되나」를
// 눌러 봐야 한다.
//
// **셈을 파일로 뺀 이유.** 화면 안에 적어 두면 지킴이가 이 셈을 **돌려 볼 수가 없다** —
// 글자로 견주는 검사만 남고, 「대소문자를 무시하나」 같은 것은 못 잰다.
import type { Me } from './authApi'

/** 팀 관리(`teamModel.normalizeQuery`)와 **같은 규칙**이다 — 앞뒤 공백을 털고 소문자로. */
export function normalizeUserQuery(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase()
}

/**
 * **아이디 · 이름 · 부서**로 걸린다.
 *
 * 팀 관리는 「이름 · 부서 · 팀 이름」으로 거는데 여기에는 팀이 없고 **아이디**가 있다.
 * 아이디를 빼면 안 된다 — 관리자가 화면에서 사람을 집는 실마리가 대개 아이디다
 * (같은 이름이 둘일 수 있고, 가입 신청은 아이디로 온다).
 */
export function matchUser(u: Pick<Me, 'login_id' | 'name' | 'dept'>, q: string): boolean {
  if (!q) return true
  return (u.login_id || '').toLowerCase().includes(q)
    || (u.name || '').toLowerCase().includes(q)
    || (u.dept || '').toLowerCase().includes(q)
}

/** 걸러 낸 목록. 차례는 **건드리지 않는다** — 서버가 준 차례가 곧 화면의 차례다. */
export function filterUsers<T extends Pick<Me, 'login_id' | 'name' | 'dept'>>(
  users: readonly T[], query: string,
): T[] {
  const q = normalizeUserQuery(query)
  return q ? users.filter((u) => matchUser(u, q)) : users.slice()
}
