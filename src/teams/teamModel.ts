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

// ══════════════════════════════════════════════════════════
// 조회 · 묶음 (SCR-TEAM-01, 시안 v2.3 확정)
// ══════════════════════════════════════════════════════════

/** 한 쪽에 보일 사람 수. `LibraryScreen.PAGE_SIZE`(12)와 달리 명부는 한눈에 보는 편이 낫다. */
export const PAGE_SIZE = 20

export function normalizeQuery(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase()
}

/** 사람은 **이름과 부서**로 걸린다. 팀은 **이름**으로 걸린다. */
export function matchPerson(u: TeamUser, q: string): boolean {
  if (!q) return true
  return u.name.toLowerCase().includes(q) || (u.dept || '').toLowerCase().includes(q)
}

export function matchTeam(t: { name: string }, q: string): boolean {
  if (!q) return true
  return t.name.toLowerCase().includes(q)
}

/**
 * 걸린 자리를 셋으로 쪼갠다 — 화면이 가운데 토막에만 노란 칠을 한다.
 * 못 찾으면 `null`. **왜 이 줄이 걸렸는지**를 글자로 알려주는 장치라,
 * 「색상만으로 상태를 구분하지 않는다」(표준)에도 맞는다.
 */
export function highlight(
  text: string, q: string,
): { before: string; match: string; after: string } | null {
  if (!q) return null
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return null
  return { before: text.slice(0, i), match: text.slice(i, i + q.length), after: text.slice(i + q.length) }
}

export type GroupKind = 'unassigned' | 'team'

export interface Group {
  kind: GroupKind
  id: string            // 팀 id. 미배정은 ''
  name: string
  /** 이 묶음의 **실제** 인원. 검색으로 줄어들지 않는다 — 팀 삭제 가드가 이 값을 본다. */
  total: number
  /** 지금 화면에 보일 사람. */
  members: TeamUser[]
}

export interface GroupsResult {
  groups: Group[]
  /** 조건에 걸린 사람 수(쪽 나누기 전). */
  totalPeople: number
  totalPages: number
  page: number
}

/**
 * 화면에 그릴 묶음을 만든다.
 *
 * **2026-09-21 부터 화면은 이것을 쓰지 않는다** — 마스터·디테일로 바뀌며 표에 묶음 줄이
 * 없어졌다(아래 `teamView`). 규칙 ①(미배정 먼저)·④(사람 기준 쪽 나누기)는 `teamView` 가
 * 그대로 잇는다. 검사(teams.test.mjs)가 규칙의 기록으로 남아 있어 함께 둔다.
 *
 * 확정된 규칙(시안 v2.3):
 *   ① **미배정이 맨 위.** 0명이면 그 묶음은 아예 없다 — 할 일이 없는데 자리를 차지하면
 *      다음에 진짜 생겼을 때 눈에 안 띈다.
 *   ② 팀 이름이 걸리면 **그 팀 사람 전원**, 아니면 **걸린 사람만.**
 *   ③ 검색 중에 아무것도 안 걸린 팀은 숨긴다. 단 **빈 팀은 이름이 걸리면 남는다**
 *      (「팀원이 없습니다」를 보여줘야 만들어 놓고 잊은 팀을 안다).
 *   ④ 쪽 나누기는 **사람 기준**이다. 묶음 줄은 세지 않는다 — 세면 팀이 많을수록
 *      한 쪽에 보이는 사람이 줄어 「20명씩」이라는 말이 거짓이 된다.
 */
export function buildGroups(
  users: TeamUser[], teams: Team[], query = '', page = 1, pageSize = PAGE_SIZE,
): GroupsResult {
  const q = normalizeQuery(query)
  const pool = assignable(users)
  const inTeam = new Set(teams.flatMap((t) => t.members.map((m) => m.id)))

  // 묶음 순서대로 사람을 늘어놓는다 — 쪽을 자르려면 먼저 한 줄로 세워야 한다.
  const raw: Group[] = []
  const unassigned = pool.filter((u) => !inTeam.has(u.id)).filter((u) => matchPerson(u, q))
  if (unassigned.length) {
    raw.push({ kind: 'unassigned', id: '', name: '아직 팀이 없는 사람',
      total: unassigned.length, members: unassigned })
  }
  for (const t of teams) {
    const all = t.members
    const hit = matchTeam(t, q)
    const members = hit ? all : all.filter((u) => matchPerson(u, q))
    if (q && !hit && !members.length) continue
    raw.push({ kind: 'team', id: t.id, name: t.name, total: all.length, members })
  }

  const flat = raw.flatMap((g) => g.members)
  const totalPeople = flat.length
  const totalPages = Math.max(1, Math.ceil(totalPeople / pageSize))
  const cur = Math.min(Math.max(1, page), totalPages)
  const slice = new Set(flat.slice((cur - 1) * pageSize, cur * pageSize).map((m) => m.id))

  // **빈 팀은 붙잡을 사람이 없다.** 그래도 어딘가에는 나와야 한다 —
  // 만들어 놓고 아무도 안 넣은 팀을 화면이 말해주지 않으면 아무도 모른다.
  // 그래서 묶음 차례에서 제가 선 자리(앞에 몇 명이 지나갔는가)로 제 쪽을 정한다.
  let seen = 0
  const pageOfEmpty = new Map<string, number>()
  for (const g of raw) {
    if (g.kind === 'team' && g.total === 0) {
      pageOfEmpty.set(g.id, Math.min(Math.floor(seen / pageSize) + 1, totalPages))
    }
    seen += g.members.length
  }

  const groups = raw
    .map((g) => ({ ...g, members: g.members.filter((m) => slice.has(m.id)) }))
    .filter((g) => g.members.length
      || (g.kind === 'team' && g.total === 0 && pageOfEmpty.get(g.id) === cur))

  return { groups, totalPeople, totalPages, page: cur }
}

// ══════════════════════════════════════════════════════════
// 마스터·디테일 (2026-09-21 · 시안 docs/화면시안_팀관리_마스터디테일_v1.0.html)
// ══════════════════════════════════════════════════════════
//
// 왼쪽은 **팀 목록**, 오른쪽은 **고른 팀 하나의 팀원**이다. 예전에는 한 표에 팀 줄과
// 사람 줄을 섞어 그렸다 — 팀 줄의 인원 배지가 권한 칸에 걸쳐 앉아 열이 어긋났고,
// 「새 팀」은 표 밖 머리 구석에서 만들었는데 결과는 표 안 어딘가에 생겼다.
// 이제 팀은 왼쪽에서 만들고 고르고, 오른쪽 표에는 **사람 줄만** 있다.

/** 왼쪽에서 고를 수 있는 것. 팀은 그 팀 id. */
export const SEL_ALL = '__all'
export const SEL_NONE = '__none'
export type TeamSel = string

export interface SideItem { key: TeamSel; name: string; count: number }

/**
 * 왼쪽 목록 — 「전체」 → 팀들(가나다) → 「팀 미배정」.
 * 미배정은 **0명이어도 자리를 지킨다.** 표에서는 0명이면 묶음을 지웠지만(할 일이 없으면
 * 자리를 차지하지 않는다), 목록은 고르는 자리라 항목이 나타났다 사라지면 손이 헛짚는다.
 * 대신 1명 이상이면 화면이 주황 배지로 알린다(글자 「팀 미배정」이 먼저 말한다).
 */
export function sideList(users: TeamUser[], teams: Team[]): {
  all: SideItem; none: SideItem; teams: SideItem[]
} {
  const pool = assignable(users)
  const none = unassigned(users, teams)
  return {
    all: { key: SEL_ALL, name: '전체', count: pool.length },
    none: { key: SEL_NONE, name: '팀 미배정', count: none.length },
    teams: teams.slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((t) => ({ key: t.id, name: t.name, count: t.members.length })),
  }
}

export interface TeamRow { user: TeamUser; team: { id: string; name: string } | null }

export interface TeamViewResult {
  rows: TeamRow[]
  /** 고른 것의 **실제** 인원(검색 전). 머리의 「팀원 N명」, 팀 삭제 가드가 쓴다. */
  count: number
  /** 조건에 걸린 사람 수(쪽 나누기 전). */
  total: number
  totalPages: number
  page: number
}

/**
 * 오른쪽 표에 그릴 사람.
 *   · 「전체」는 **미배정이 먼저** — 편성이 빠진 사람을 먼저 보게(표 시절 규칙 ①을 그대로 잇는다).
 *     그다음 팀 가나다순, 팀 안에서는 역할·이름순.
 *   · 검색은 이름·부서로 걸리고, 「전체」에서는 **팀 이름**으로도 걸린다(그 팀 사람 전원).
 *   · 없는 팀을 고르고 있으면(다른 창에서 지웠다) 빈 결과다 — 무엇을 고를지는 화면이 정한다.
 */
export function teamView(
  users: TeamUser[], teams: Team[], sel: TeamSel, query = '', page = 1, pageSize = PAGE_SIZE,
): TeamViewResult {
  const q = normalizeQuery(query)
  const pool = assignable(users)
  const byId = new Map(pool.map((u) => [u.id, u]))
  const rank = (u: TeamUser) => (ROLE_RANK[u.role] ?? 9)
  const order = (a: TeamUser, b: TeamUser) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko')
  const membersOf = (t: Team) => t.members.map((m) => byId.get(m.id) || m).slice().sort(order)

  let base: TeamRow[]
  if (sel === SEL_ALL) {
    base = [
      ...unassigned(users, teams).map((u) => ({ user: u, team: null })),
      ...teams.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .flatMap((t) => membersOf(t).map((u) => ({ user: u, team: { id: t.id, name: t.name } }))),
    ]
  } else if (sel === SEL_NONE) {
    base = unassigned(users, teams).map((u) => ({ user: u, team: null }))
  } else {
    const t = teams.find((x) => x.id === sel)
    base = t ? membersOf(t).map((u) => ({ user: u, team: { id: t.id, name: t.name } })) : []
  }

  const hit = base.filter((r) => matchPerson(r.user, q) || (sel === SEL_ALL && !!r.team && matchTeam(r.team, q)))
  const total = hit.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const cur = Math.min(Math.max(1, page), totalPages)
  return { rows: hit.slice((cur - 1) * pageSize, cur * pageSize), count: base.length, total, totalPages, page: cur }
}

/** 「＋ 팀원 넣기」에 띄울 사람 — 이 팀에 **없는** 편성 대상. 지금 팀을 옆에 적어 옮겨짐을 미리 말한다. */
export function addCandidates(users: TeamUser[], teams: Team[], teamId: string): TeamRow[] {
  const of = teamOfUser(teams)
  return assignable(users).filter((u) => of[u.id]?.id !== teamId).map((u) => ({ user: u, team: of[u.id] || null }))
}
