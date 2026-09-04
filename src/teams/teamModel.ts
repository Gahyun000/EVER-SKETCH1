/**
 * 팀 편성 화면의 순수 계산.
 *
 * 화면은 두 가지를 보여준다 — **각 팀에 누가 있는가**와 **아직 아무 팀에도 없는 사람**.
 * 후자가 중요하다. 팀에 안 들어간 L2 는 자기 자료를 아무와도 공유할 수 없고,
 * 팀에 안 들어간 L3 은 로그인해도 **빈 화면**을 본다(7.1 — L3 의 유일한 화면이 팀 공유다).
 * 편성이 빠진 것을 화면이 말해주지 않으면 그 사람이 직접 말할 때까지 아무도 모른다.
 *
 * React 를 모른다 — 그래서 노드로 그냥 실행해서 검증할 수 있다.
 */

export type TeamRole = 'admin' | 'writer' | 'viewer' | ''

export interface TeamUser {
  id: string
  name: string
  dept?: string
  role: TeamRole
  status: 'pending' | 'active' | 'disabled'
}

export interface Team {
  id: string
  name: string
  members: TeamUser[]
}

/** 화면에 팀을 나열하는 순서에 맞춘 역할 순서. */
const ROLE_RANK: Record<string, number> = { writer: 0, viewer: 1 }

/**
 * 팀에 넣을 수 있는 사람.
 *
 * **관리자(L1)는 제외한다.** L1 은 모든 팀을 보고(7.1), 결재를 타지 않고 스위치로
 * 공유한다(D15) — 팀에 넣어도 달라지는 것이 하나도 없다. 그런데 화면에 넣을 수 있게
 * 두면 "관리자를 A팀에 넣으면 뭔가 달라지나?"라는 잘못된 기대가 생긴다.
 * 아무 효과 없는 선택지를 주지 않는다.
 *
 * 승인 대기·중지 계정도 제외한다. 승인 전 계정을 미리 넣어 두면 승인되는 순간
 * 아무도 다시 보지 않은 채 팀 자료가 열린다(서버도 같은 이유로 400 을 낸다).
 */
export function assignable(users: TeamUser[]): TeamUser[] {
  return users
    .filter((u) => u.status === 'active' && (u.role === 'writer' || u.role === 'viewer'))
    .slice()
    .sort((a, b) =>
      (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) ||
      a.name.localeCompare(b.name, 'ko'))
}

/** 사용자 id → 지금 속한 팀. 한 시점 한 팀이므로 값은 하나다(server/teams.add_member). */
export function teamOfUser(teams: Team[]): Record<string, { id: string; name: string }> {
  const out: Record<string, { id: string; name: string }> = {}
  for (const t of teams) for (const m of t.members) out[m.id] = { id: t.id, name: t.name }
  return out
}

/** 아직 아무 팀에도 없는 사람. 화면 맨 위에 둔다 — 편성이 빠진 것을 먼저 보게. */
export function unassigned(users: TeamUser[], teams: Team[]): TeamUser[] {
  const has = teamOfUser(teams)
  return assignable(users).filter((u) => !has[u.id])
}

/**
 * 옮긴 결과를 사람 말로.
 *
 * 팀에 넣으면 이전 팀에서 **조용히 빠진다**(한 시점 한 팀). 조용히 두면 L1 은
 * 자기가 무엇을 했는지 모른 채 "A팀에서 왜 사라졌지"를 나중에 겪는다.
 */
export function moveMessage(
  name: string, toTeam: string, movedFrom: { id: string; name: string }[],
): string {
  if (!movedFrom.length) return `${name} 님을 ${toTeam}에 넣었습니다.`
  const from = movedFrom.map((t) => t.name).filter(Boolean).join(' · ')
  if (!from) return `${name} 님을 ${toTeam}으로 옮겼습니다.`
  return `${name} 님을 ${from}에서 ${toTeam}(으)로 옮겼습니다.`
}

/**
 * 팀을 지울 수 있는가. 못 지우면 그 이유를 돌려준다(서버와 같은 규칙 — 화면이 먼저 말해준다).
 *
 * 화면에서 막는 것은 친절이고, 막는 것은 서버다(`teams.delete_team`).
 * 둘 중 하나만 있으면 안 된다 — 화면만 있으면 우회되고, 서버만 있으면
 * 누르고 나서야 안 된다는 걸 안다.
 */
export function deleteBlockReason(team: Team): string | null {
  if (team.members.length) {
    return `팀원 ${team.members.length}명이 남아 있습니다. 먼저 팀원을 옮겨 주세요.`
  }
  return null
}
