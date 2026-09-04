// 팀 편성 화면의 순수 계산 — 노드 단독 실행.
//
// 여기서 틀리면 "팀에 안 들어간 사람"이 화면에서 사라진다. 그 사람은 L3 이면
// 로그인해서 빈 화면을 보고, L2 면 승인받아도 아무에게도 공유되지 않는다.
// 둘 다 **본인이 말하기 전에는 아무도 모르는** 종류의 사고다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs teams.test.mjs

const {
  assignable, teamOfUser, unassigned, moveMessage, deleteBlockReason,
  normalizeQuery, matchPerson, matchTeam, highlight, buildGroups, PAGE_SIZE,
} = await import('./src/teams/teamModel.ts')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

const u = (id, name, role, status = 'active') => ({ id, name, role, status })

const USERS = [
  u('u_admin', '관리자', 'admin'),
  u('u_na', '나작성', 'writer'),
  u('u_ga', '가작성', 'writer'),
  u('u_view', '다열람', 'viewer'),
  u('u_pending', '대기중', 'writer', 'pending'),
  u('u_off', '중지됨', 'viewer', 'disabled'),
  u('u_none', '미부여', ''),
]

// ── 편성 대상 ──
const a = assignable(USERS)
check(a.map((x) => x.id).join(',') === 'u_ga,u_na,u_view',
  '작성자·열람자만, 작성자 먼저, 그 안에서 이름순')
check(!a.some((x) => x.role === 'admin'), '관리자는 편성 대상이 아니다 — 팀에 넣어도 달라지는 게 없다')
check(!a.some((x) => x.status !== 'active'), '승인 대기·중지 계정은 넣을 수 없다')
check(!a.some((x) => x.role === ''), '역할 미부여 계정은 넣을 수 없다')
check(USERS.length === 7, '원본 배열을 건드리지 않는다(길이 그대로)')
check(USERS[1].id === 'u_na', '원본 배열의 순서를 건드리지 않는다')

// ── 소속 ──
const TEAMS = [
  { id: 't1', name: 'A팀', members: [u('u_ga', '가작성', 'writer')] },
  { id: 't2', name: 'B팀', members: [u('u_view', '다열람', 'viewer')] },
]
const of = teamOfUser(TEAMS)
check(of['u_ga'].name === 'A팀' && of['u_view'].name === 'B팀', '누가 어느 팀인지 알려준다')
check(of['u_na'] === undefined, '아무 팀에도 없으면 없는 것으로 나온다')

const left = unassigned(USERS, TEAMS)
check(left.map((x) => x.id).join(',') === 'u_na', '아직 팀이 없는 사람만 남는다')
check(unassigned(USERS, []).length === 3, '팀이 하나도 없으면 편성 대상 전원이 미배정')
check(unassigned([], TEAMS).length === 0, '사람이 없으면 빈 목록')

// ── 옮긴 결과 문구 ──
check(moveMessage('김가현', '영업1팀', []) === '김가현 님을 영업1팀에 넣었습니다.',
  '처음 넣을 때는 「넣었습니다」')
check(moveMessage('김가현', 'B팀', [{ id: 't1', name: 'A팀' }])
  === '김가현 님을 A팀에서 B팀(으)로 옮겼습니다.',
  '옮길 때는 어디서 왔는지 말해준다')
check(moveMessage('김가현', 'C팀', [{ id: 't1', name: 'A팀' }, { id: 't2', name: 'B팀' }])
  .includes('A팀 · B팀에서'), '여러 팀에서 빠졌으면 전부 말해준다')
check(moveMessage('김가현', 'B팀', [{ id: 't1', name: '' }])
  === '김가현 님을 B팀으로 옮겼습니다.',
  '이전 팀 이름을 모르면 이름 없이라도 옮겼다고 말한다')

// ── 삭제 가드 ──
check(deleteBlockReason(TEAMS[0]).includes('1명'), '팀원이 있으면 이유를 돌려준다')
check(deleteBlockReason({ id: 't3', name: '빈팀', members: [] }) === null,
  '빈 팀은 지울 수 있다')


// ══════════════════════════════════════════════════════
// 조회 · 묶음 (SCR-TEAM-01)
// ══════════════════════════════════════════════════════
const U = [
  u('u1', '김가현', 'writer'), u('u4', '최장부서', 'writer'),
  u('u2', '박열람', 'viewer'), u('u3', '이작성', 'writer'),
  u('u_admin2', '관리자', 'admin'),
]
U[0].dept = 'SI개발본부'; U[1].dept = '디지털전환추진본부'
U[2].dept = '기획실';     U[3].dept = '생산본부'
const T = [
  { id: 't1', name: '영업1팀', members: [U[2]] },
  { id: 't2', name: '기술2팀', members: [U[3]] },
  { id: 't3', name: '신사업TF', members: [] },
]
const names = (r) => r.groups.flatMap((g) => [`[${g.name}]`, ...g.members.map((m) => m.name)])

// ── 검색어 다듬기 ──
check(normalizeQuery('  영업 ') === '영업', '앞뒤 공백을 버린다')
check(normalizeQuery('ABC') === 'abc', '소문자로 맞춘다 — 대소문자를 가리지 않는다')
check(normalizeQuery(undefined) === '', 'undefined 는 빈 검색어')

// ── 걸리는 조건 ──
check(matchPerson(U[0], '') === true, '검색어가 없으면 전부 걸린다')
check(matchPerson(U[0], '김') === true, '이름으로 걸린다')
check(matchPerson(U[0], '본부') === true, '부서로도 걸린다')
check(matchPerson(U[2], '본부') === false, '안 걸리는 사람은 안 걸린다(기획실)')
check(matchTeam(T[0], '영업') === true, '팀은 이름으로 걸린다')
check(matchTeam(T[0], '기술') === false, '다른 팀 이름에는 안 걸린다')

// ── 걸린 자리 표시 ──
check(highlight('김가현', '가').match === '가', '걸린 글자를 집어낸다')
check(highlight('김가현', '가').before === '김' && highlight('김가현', '가').after === '현',
  '앞뒤를 나눠 준다 — 화면이 가운데만 칠한다')
check(highlight('김가현', '없음') === null, '못 찾으면 null')
check(highlight('김가현', '') === null, '검색어가 없으면 칠하지 않는다')

// ── 묶음 ──
let r = buildGroups(U, T)
check(r.groups[0].kind === 'unassigned', '**미배정이 맨 위** (v2.3 확정)')
check(r.groups[0].members.map((m) => m.name).join() === '김가현,최장부서', '미배정은 팀 없는 사람만')
check(!r.groups[0].members.some((m) => m.role === 'admin'), '관리자는 편성 대상이 아니므로 안 나온다')
check(names(r).indexOf('[영업1팀]') < names(r).indexOf('박열람'), '팀 이름이 그 팀원보다 위')
check(r.groups.some((g) => g.name === '신사업TF' && g.total === 0), '빈 팀도 나온다')
check(r.totalPeople === 4, '사람 4명 (관리자 제외)')

r = buildGroups(U, T, '영업')
check(names(r).join() === '[영업1팀],박열람', '팀 이름이 걸리면 그 팀 사람 전원')
check(!names(r).includes('[기술2팀]'), '안 걸린 팀은 숨는다')
check(!names(r).includes('[아직 팀이 없는 사람]'), '걸린 미배정이 없으면 그 묶음도 없다')

r = buildGroups(U, T, '김')
check(names(r).join() === '[아직 팀이 없는 사람],김가현', '사람이 걸리면 그 사람 + 속한 묶음 줄')

r = buildGroups(U, T, '본부')
check(names(r).filter((x) => !x.startsWith('[')).sort().join() === '김가현,이작성,최장부서',
  '부서로 찾으면 여러 묶음에 걸쳐 걸린다')

r = buildGroups(U, T, 'TF')
check(names(r).join() === '[신사업TF]', '빈 팀은 **이름이 걸리면** 남는다 — 만들어 놓고 잊은 팀을 알아야 한다')

r = buildGroups(U, T, '없는이름')
check(r.groups.length === 0 && r.totalPeople === 0, '아무것도 안 걸리면 빈 결과')

// ── 총원은 검색으로 줄지 않는다 (팀 삭제 가드가 이 값을 본다) ──
r = buildGroups(U, T, '박열람')
const t1 = r.groups.find((g) => g.id === 't1')
check(t1.total === 1 && t1.members.length === 1, '검색해도 total 은 팀의 실제 인원')

// ── 쪽 나누기 : 사람 기준 ──
r = buildGroups(U, T, '', 1, 2)
check(r.totalPages === 2 && r.page === 1, '4명 · 한 쪽 2명 → 2쪽')
check(r.groups.flatMap((g) => g.members).length === 2, '첫 쪽에 사람 2명')
check(names(r).join() === '[아직 팀이 없는 사람],김가현,최장부서', '묶음 줄은 쪽 수에 안 낀다')
check(!names(r).includes('[신사업TF]'), '빈 팀은 제 차례가 오는 쪽에만 — 첫 쪽에는 안 나온다')
check(names(buildGroups(U, T, '', 2, 2)).includes('[신사업TF]'),
  '빈 팀은 마지막 쪽에 나온다 — 붙잡을 사람이 없어도 어딘가에는 보여야 한다')
r = buildGroups(U, T, '', 2, 2)
check(r.groups.flatMap((g) => g.members).map((m) => m.name).join() === '박열람,이작성', '둘째 쪽')
check(buildGroups(U, T, '', 99, 2).page === 2, '없는 쪽을 달라고 하면 마지막 쪽')
check(buildGroups(U, T, '', 0, 2).page === 1, '0쪽을 달라고 하면 첫 쪽')
check(buildGroups([], [], '').totalPages === 1, '아무도 없어도 쪽은 1')
check(PAGE_SIZE === 20, '한 쪽 20명')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
