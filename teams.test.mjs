// 팀 편성 화면의 순수 계산 — 노드 단독 실행.
//
// 여기서 틀리면 "팀에 안 들어간 사람"이 화면에서 사라진다. 그 사람은 L3 이면
// 로그인해서 빈 화면을 보고, L2 면 승인받아도 아무에게도 공유되지 않는다.
// 둘 다 **본인이 말하기 전에는 아무도 모르는** 종류의 사고다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs teams.test.mjs

const {
  assignable, teamOfUser, unassigned, moveMessage, deleteBlockReason,
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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
