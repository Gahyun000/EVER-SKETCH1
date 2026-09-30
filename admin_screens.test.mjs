// **관리 화면 셋을 한 벌로** — 빈 아래 · 가운데 머리줄 · 같은 검색줄.
//
// 2026-09-18 · 사용자가 화면 셋을 나란히 놓고 말했다. 「팀 공유는 같이 고쳐졌는데
// 사용자 관리랑 팀 관리는 위에 띄워져 있는 만큼 밑에 띄워져야 하는데 밑이 너무 비어 있다」,
// 「사용자도 검색 기능 넣고」, 「팀관리, 사용자관리 둘 다 가운데」.
//
// 재 봤다(1500×900): 위 16px / 아래 — 사용자 관리 **489px** · 환경 설정 259px · 팀 관리 127px.
// 팀 관리가 덜한 것은 고쳐서가 아니라 줄이 많아서였다.
//
// 팀 공유·결재함이 멀쩡한 이유는 2026-09-15 에 **카드를 걷었기** 때문이다
// (「카드 자체가 화면 한가운데 뜬 섬이었다」). 관리 화면 셋은 그때 같이 안 걷었다.
// 여기서는 **걷지 않고 늘린다** — 그 둘은 마스터-디테일이라 상세가 넓어야 했지만
// 관리 화면은 표 하나라, 1180 을 넘겨 늘리면 칸이 벌어져 오히려 읽기 나빠진다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs admin_screens.test.mjs
import { readFileSync } from 'node:fs'
import { filterUsers, matchUser, normalizeUserQuery } from './src/auth/userSearch.ts'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const bare = (t) => t
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
const cut = (t, a, b) => {
  const i = t.indexOf(a); if (i < 0) return ''
  const j = b ? t.indexOf(b, i + a.length) : -1
  return j < 0 ? t.slice(i) : t.slice(i, j)
}
const UA = bare(readFileSync('./src/auth/UsersAdmin.tsx', 'utf8'))
const TA = bare(readFileSync('./src/teams/TeamsAdmin.tsx', 'utf8'))
const ACSS = readFileSync('./src/auth/auth.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const SCSS = readFileSync('./src/shell/shell.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const ICSS = readFileSync('./src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// ── ① 카드가 아래까지 간다 ────────────────────────────
{
  const rule = cut(SCSS, '.sh-page > .es-card {', '}')
  check(rule.length > 20, '카드 규칙을 찾았다', rule)
  check(/min-height:\s*100%/.test(rule),
    '**카드가 아래까지 간다** — 내용만큼만 서면 줄이 적은 날 회색 바닥에 흰 섬이 뜬다', rule)
  check(/max-width:\s*1180px/.test(rule),
    '폭은 1180 그대로다 — 표 하나짜리 화면을 더 늘리면 칸이 벌어져 읽기 나빠진다')
  const set = cut(ICSS, '.settings-canvas{', '}')
  check(/min-height:100%/.test(set.replace(/\s/g, '')),
    '환경 설정도 같이 늘린다 — 여긴 카드가 680px 이라 더 좁고 아래가 259px 비어 있었다', set)
  // 아래 여백은 `.sh-page` 의 padding 이 정한다. 그 값이 사라지면 늘려 봐야 바닥에 붙는다.
  const page = cut(SCSS, '.sh-page {', '}')
  check(/padding:\s*16px 18px 28px/.test(page), '위·아래 여백은 그대로 둔다(16 / 28)', page)
}

// ── ② 머리줄 — 둘 다 가운데, 같은 클래스 ───────────────
{
  check(/className="adm-head"/.test(UA) && /className="adm-head"/.test(TA),
    '**두 화면이 같은 머리줄**을 쓴다(사용자 결정 「둘 다 가운데」)')
  check(!/es-admin-head/.test(UA + ACSS),
    '왼쪽 정렬이던 옛 머리줄은 남아 있지 않다 — 둘이 섞이면 어느 쪽이 참인지 모른다')
  const head = cut(ACSS, '.adm-head {', '}')
  check(/text-align:\s*center/.test(head), '가운데 정렬이다', head)
  check(/\.adm-head \.es-brand \{[^}]*justify-content:\s*center/.test(ACSS),
    '제목 줄도 가운데로 모인다 — 칸만 가운데고 글이 왼쪽이면 어중간해진다')
  // 왼쪽 위·오른쪽 위는 그 화면에서만 하는 일이 온다. 없으면 그냥 빈다.
  check(/\.adm-head \.adm-left/.test(ACSS) && /\.adm-head \.adm-right/.test(ACSS),
    '양 끝 자리가 이름으로 정해져 있다(＋새 팀 · 닫기)')
  // 2026-09-21 마스터·디테일: 「＋ 새 팀」은 머리 구석을 떠나 **왼쪽 팀 목록 맨 위 입력칸**이 됐다.
  check(!/adm-left/.test(TA) && /className="tm-add"/.test(TA), '팀 관리의 새 팀은 머리 구석이 아니라 팀 목록 맨 위 입력칸이다')
  check(!/adm-left/.test(UA), '사용자 관리에는 왼쪽 끝에 놓을 것이 없다 — 빈 자리를 억지로 채우지 않는다')
}

// ── ③ 검색 — 사용자 관리에도, 같은 모양으로 ─────────────
{
  const S = cut(UA, '<div className="adm-srch">', '</div>')
  check(S.length > 100, '사용자 관리에 검색 줄이 생겼다', `${S.length}자`)
  check(/placeholder="아이디 · 이름 · 부서"/.test(S),
    '**아이디**로도 걸린다 — 가입 신청은 아이디로 오고, 같은 이름이 둘일 수 있다')
  check(/adm-qbox/.test(S) && /adm-sbtn dark/.test(S) && /adm-sbtn/.test(S),
    '팀 관리와 **같은 클래스**를 쓴다 — 같은 일을 하는 자리는 같게 생겨야 한다')
  check(/>조회</.test(S) && />초기화</.test(S),
    '말도 같다 — 팀 관리가 「조회 · 초기화」다')
  // **치는 대로가 아니라 눌러야 걸린다.** 한 화면은 치는 대로, 다른 화면은 눌러야면
  // 손이 매번 다시 배운다.
  check(/onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) setQ\(qIn\) \}\}/.test(S),
    'Enter 로도 걸린다')
  check(/onClick=\{\(\) => setQ\(qIn\)\}/.test(S), '「조회」를 눌러야 걸린다')
  const FIL = cut(UA, 'const shown =', '\n')
  // 2026-09-21 마스터·디테일: 상태 칩으로 먼저 거른 목록(inTab)을 다시 검색어로 거른다.
  check(/filterUsers\(inTab, q\)/.test(FIL),
    '**걸린 값(q)으로만** 거른다 — 치는 값으로 거르면 「눌러야 걸린다」가 거짓말이 된다', FIL)
  check(/\{ shown\.map\(|\) : shown\.map\(/.test(UA), '목록이 걸러진 것을 그린다')
  check(!/\{users\.map\(/.test(UA), '표가 원본을 그리지 않는다 — 한 곳만 고치면 검색이 안 먹는다')
  // 찾다가 없는 것과 원래 없는 것은 다른 말이다.
  check(/q \? '찾는 사람이 없습니다/.test(UA),
    '검색 0건을 **빈 데이터와 구분해서** 말한다 — 같은 문구면 검색어를 지울 생각을 못 한다')
}

// ── ④ 거르는 셈을 **실제로 돌려 본다** ──────────────────
{
  const U = (login_id, name, dept) => ({ login_id, name, dept })
  const list = [U('gahyun12', '김가현', '기획'), U('gildong', '홍길동', '영업'),
    U('parkJS', '박지수', '영업1팀'), U('choisy', '최서연', '')]
  const ids = (r) => r.map((u) => u.login_id).join(',')
  check(ids(filterUsers(list, '')) === 'gahyun12,gildong,parkJS,choisy',
    '빈 검색어는 전부 준다', ids(filterUsers(list, '')))
  check(ids(filterUsers(list, '영업')) === 'gildong,parkJS', '부서로 걸린다', ids(filterUsers(list, '영업')))
  check(ids(filterUsers(list, '김가현')) === 'gahyun12', '이름으로 걸린다')
  check(ids(filterUsers(list, 'gahyun')) === 'gahyun12', '아이디 일부로도 걸린다')
  check(ids(filterUsers(list, 'PARKJS')) === 'parkJS',
    '**대소문자를 가리지 않는다** — 아이디를 대문자로 친 사람이 못 찾으면 안 된다')
  check(ids(filterUsers(list, '  영업  ')) === 'gildong,parkJS', '앞뒤 공백을 턴다')
  check(ids(filterUsers(list, '없는말')) === '', '없으면 빈다')
  check(matchUser(U('a', '가', ''), '가') === true && matchUser(U('a', '가', undefined), '나') === false,
    '부서가 비어 있어도 터지지 않는다')
  // 차례를 건드리면 서버가 준 차례와 화면이 어긋난다.
  check(ids(filterUsers(list, 'i')) === ids(list.filter((u) => /i/i.test(u.login_id + u.name + u.dept))),
    '거르기만 하고 **차례는 그대로** 둔다')
  check(normalizeUserQuery(null) === '' && normalizeUserQuery(' A ') === 'a',
    '팀 관리와 같은 규칙으로 다듬는다(공백 털고 소문자)')
}

// ── ⑤ 사용자 관리 마스터·디테일 (2026-09-21 · 시안 docs/화면시안_사용자관리_마스터디테일_v1.0.html 안 ㄴ) ──
{
  let p2 = 0, f2 = 0
  const c2 = (cond, label) => { if (cond) { p2++; console.log('✓ ' + label) } else { f2++; console.log('✗ ' + label) } }
  c2(/md-screen/.test(UA) && /className="ap-body md-body"/.test(UA) && /className="md-grip"/.test(UA),
    '결재함·팀 공유·팀 관리와 같은 뼈대(md-screen · ap-body · md-grip)')
  c2(/masterWidth\('um'\)/.test(UA) && /rememberMasterWidth\('um'/.test(UA), '목록 폭은 제 이름(um)으로 기억한다')
  c2(/keepOrFirst\(shown\.map/.test(UA), '고른 사람이 목록에서 빠지면 맨 위로 — 승인하면 다음 대기자가 골라진다')
  c2(!/<table className="es-table">/.test(UA), '여섯 칸 표는 걷었다 — 줄 끝 단추 셋이 오른쪽으로 풀렸다')
  c2(/<h4>권한<\/h4>/.test(UA) && /<h4>계정<\/h4>/.test(UA), '오른쪽은 「권한」·「계정」 두 덩어리')
  c2(/'pending', 'active', 'disabled', 'all'/.test(UA), '상태 칩 넷 — 승인 대기 · 사용 중 · 중지 · 전체')
  c2(/apiListUsers\(\)/.test(UA), '한 번에 다 받아 칩마다 숫자를 센다(상태별로 네 번 묻지 않는다)')
  c2(/created_at/.test(UA) && /last_login_at/.test(UA), '가입 신청 · 승인 · 마지막 로그인을 보여 준다')
  const routes = readFileSync('./server/routes_auth.py', 'utf8')
  c2(/"created_at": u\.get\("created_at"\)/.test(routes) && /"last_login_at"/.test(routes), '서버가 그 세 시각을 내려보낸다')
  pass += p2; fail += f2
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

