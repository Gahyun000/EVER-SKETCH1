// 팀 관리 마스터·디테일(2026-09-21)의 순수 계산 — 왼쪽 목록(sideList) · 오른쪽 표(teamView) · 팀원 넣기 후보(addCandidates).
// 실행: node --experimental-strip-types --import ./ts_register.mjs team_view.test.mjs
import { SEL_ALL, SEL_NONE, addCandidates, sideList, teamView } from './src/teams/teamModel.ts'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const U = (id, name, role = 'writer', dept = '', status = 'active') => ({ id, name, role, dept, status })
const hong = U('u1', '홍길동', 'writer', 'SI개발본부')
const kwak = U('u2', '곽두섭', 'viewer', '청결청소부')
const lee = U('u3', '이순신', 'writer', '제2본부')
const kim = U('u4', '김가현', 'writer', 'SI개발본부')
const admin = U('u0', '관리자', 'admin')
const pend = U('u9', '대기중', 'writer', '', 'pending')
const users = [hong, kwak, lee, kim, admin, pend]
const teams = [
  { id: 't_si', name: 'SI개발팀', members: [kwak, hong] },
  { id: 't_11', name: '11', members: [] },
  { id: 't_yy', name: '영업팀', members: [kim] },
]

// ── 왼쪽 목록 ──
{
  const s = sideList(users, teams)
  check(s.all.count === 4, '「전체」는 편성 대상만 센다 — 관리자·승인 대기는 빠진다', String(s.all.count))
  check(s.none.count === 1 && s.none.name === '팀 미배정', '「팀 미배정」 인원', String(s.none.count))
  check(JSON.stringify(s.teams.map((t) => t.name)) === JSON.stringify([...teams.map((t) => t.name)].sort((a, b) => a.localeCompare(b, 'ko'))),
    '팀은 가나다순', s.teams.map((t) => t.name).join(','))
  check(s.teams.find((t) => t.key === 't_si').count === 2 && s.teams.find((t) => t.key === 't_11').count === 0, '팀마다 인원')
  const s0 = sideList([hong], [{ id: 't', name: 'A', members: [hong] }])
  check(s0.none.count === 0, '미배정 0명이어도 항목은 돌려준다(목록 자리가 변하지 않게)')
}

// ── 오른쪽 표 ──
{
  const all = teamView(users, teams, SEL_ALL)
  check(all.rows[0].user.id === 'u3' && all.rows[0].team === null, '「전체」는 미배정이 맨 위')
  check(all.count === 4 && all.total === 4, '「전체」 인원 · 걸린 수')
  check(all.rows.filter((r) => r.team?.id === 't_si').map((r) => r.user.name).join(',') === '홍길동,곽두섭',
    '팀 안에서는 역할(작성자 → 열람자) · 이름순')
  const si = teamView(users, teams, 't_si')
  check(si.rows.length === 2 && si.rows.every((r) => r.team?.name === 'SI개발팀'), '팀을 고르면 그 팀 사람만')
  const none = teamView(users, teams, SEL_NONE)
  check(none.rows.length === 1 && none.rows[0].user.name === '이순신', '「팀 미배정」은 팀 없는 사람만')
  const empty = teamView(users, teams, 't_11')
  check(empty.rows.length === 0 && empty.count === 0, '빈 팀은 빈 표 · 인원 0 (삭제 가드가 본다)')
  check(teamView(users, teams, 't_gone').rows.length === 0, '없는 팀을 고르면 빈 결과 — 무엇을 고를지는 화면이 정한다')

  check(teamView(users, teams, SEL_ALL, '곽').rows.map((r) => r.user.name).join() === '곽두섭', '이름으로 걸린다')
  check(teamView(users, teams, SEL_ALL, 'si개발본부').total === 2, '부서로 걸린다(대소문자 무시)')
  check(teamView(users, teams, SEL_ALL, '영업').rows.map((r) => r.user.name).join() === '김가현', '「전체」에서는 팀 이름으로도 걸린다')
  check(teamView(users, teams, 't_si', '영업').total === 0, '팀 안에서는 팀 이름으로 걸리지 않는다(이름·부서만)')
  const q = teamView(users, teams, 't_si', '곽')
  check(q.total === 1 && q.count === 2, '검색해도 「팀원 N명」(count)은 줄지 않는다 — 삭제 가드가 거짓말하지 않게')
}

// ── 쪽 나누기 ──
{
  const many = Array.from({ length: 45 }, (_, i) => U('m' + i, '사람' + String(i).padStart(2, '0')))
  const v1 = teamView(many, [], SEL_ALL, '', 1, 20)
  check(v1.rows.length === 20 && v1.totalPages === 3 && v1.page === 1, '20명씩 · 3페이지')
  const v3 = teamView(many, [], SEL_ALL, '', 3, 20)
  check(v3.rows.length === 5, '마지막 페이지는 나머지')
  check(teamView(many, [], SEL_ALL, '', 99, 20).page === 3, '없는 페이지는 마지막으로')
  check(teamView([], [], SEL_ALL).totalPages === 1, '아무도 없어도 1/1 페이지')
}

// ── 팀원 넣기 후보 ──
{
  const c = addCandidates(users, teams, 't_si')
  check(!c.some((r) => r.team?.id === 't_si'), '이미 이 팀인 사람은 빠진다')
  check(c.some((r) => r.user.id === 'u3' && r.team === null) && c.some((r) => r.user.id === 'u4' && r.team?.name === '영업팀'),
    '미배정과 다른 팀 사람이 들어간다 — 지금 팀을 옆에 적어 옮겨짐을 미리 말한다')
  check(!c.some((r) => r.user.id === 'u0' || r.user.id === 'u9'), '관리자·승인 대기는 후보가 아니다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
