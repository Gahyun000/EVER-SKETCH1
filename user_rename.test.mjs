// **이름을 바꿀 길이 있는가.**
//
// 2026-09-16 · 처음 만들어진 관리자 이름이 「시스템 관리자」였는데 그걸 바꿀 길이
// **서버에도 화면에도 터미널 도구에도 없었다.** 씨앗 코드의 글자를 고쳐도 소용이
// 없다 — 그 값은 계정을 처음 만들 때 한 번만 쓰이고, 이미 있으면 그 함수는 아무것도
// 안 한다(멱등). DB 를 직접 여는 것 말고는 방법이 없었다.
//
// 여기서 지키는 것.
//   · 길이 **셋 다** 있다 — 서버 · 화면 · 터미널(화면에 못 들어가는 상황의 탈출구)
//   · 화면은 **이름 옆**에서 고친다 — 단추 칸을 따로 만들면 무엇의 이름인지 멀어진다
//   · 결재 기록에는 **사람 이름을 안 박는다** — 박으면 바꿔도 지난 건이 안 따라온다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs user_rename.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|#).*$/gm, '')

const auth = bare(read('./server/auth.py'))
const routes = bare(read('./server/routes_auth.py'))
const cli = bare(read('./server/admin_cli.py'))
const api = bare(read('./src/auth/authApi.ts'))
const ui = bare(read('./src/auth/UsersAdmin.tsx'))
const css = read('./src/auth/auth.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

// ── 길이 셋 다 있다 ─────────────────────────────────
check(/def set_name\(actor_id/.test(auth), '서버에 이름 바꾸는 함수가 있다')
check(/@router\.post\("\/users\/\{uid\}\/name"\)/.test(routes), '서버에 그 주소가 있다')
check(/require_action\(user, perm\.USER_MANAGE\)/.test(
  routes.slice(routes.indexOf('def set_name'), routes.indexOf('class StatusIn'))),
  '**관리자만** 바꾼다')
check(/sub\.add_parser\("rename"/.test(cli) && /def cmd_rename/.test(cli),
  '터미널에도 있다 — 화면에 못 들어가는 상황의 탈출구')
check(/apiSetName/.test(api) && /users\/\$\{uid\}\/name/.test(api), '화면이 쓸 길이 있다')
check(/apiSetName\(u\.id/.test(ui), '사용자 관리 화면이 그걸 부른다')

// ── 값을 거른다 ─────────────────────────────────────
{
  // **다음 함수까지만 자른다.** 원래는 `def change_password` 를 끝 표지로 삼았는데,
  // 2026-09-18 에 그 사이로 `def set_own_password` 가 들어오면서 **남의 함수 본문까지
  // 같이 잘렸고**, 거기 있는 `_kill_sessions` 때문에 「이름을 바꿨다고 쫓아내지 않는다」가
  // 거짓으로 실패했다. 규칙이 깨진 것이 아니라 자르는 자리가 깨진 것이었다 —
  // 이웃 이름을 표지로 쓰면 이웃이 바뀔 때마다 이런다.
  const _i = auth.indexOf('def set_name')
  const _j = auth.indexOf('\ndef ', _i + 1)
  const fn = auth.slice(_i, _j < 0 ? auth.length : _j)
  check(/name = \(name or ""\)\.strip\(\)/.test(fn), '앞뒤 공백을 턴다')
  check(/if not name:/.test(fn), '빈 이름을 막는다')
  check(/len\(name\) > MAX_NAME/.test(fn),
    '가입할 때와 **같은 자**를 쓴다 (한쪽만 느슨하면 그쪽으로 들어온다)')
  check(/audit\(actor_id, "rename"/.test(fn) && /was %s/.test(fn),
    '앞 이름을 감사로그에 남긴다 — 「그때 그 사람」을 되짚을 자리가 여기뿐이다')
  check(/if before == name:/.test(fn), '같은 이름이면 조용히 지나간다 (로그가 안 불어난다)')
  // **세션을 안 끊는다.** 역할 변경·비활성화와 다르다 — 이름은 무엇을 할 수 있는지를
  // 안 바꾸므로 쓰던 사람을 로그인 화면으로 밀어낼 까닭이 없다.
  check(!/_kill_sessions/.test(fn), '이름을 바꿨다고 쫓아내지 않는다')
}

// ── 화면 ────────────────────────────────────────────
check(/renaming/.test(ui) && /setRenaming/.test(ui), '고치는 중인 줄을 화면이 안다')
check(/es-rename-b/.test(ui) && /es-rename\b/.test(ui), '고치는 자리와 입력칸이 있다')
check(ui.indexOf('es-rename-b') > ui.indexOf('u.name'), '고치는 자리가 **이름 옆**이다')
check(/key === 'Escape'/.test(ui.slice(ui.indexOf('es-rename'), ui.indexOf('es-rename') + 1400))
  || /Escape/.test(ui), 'Escape 로 그만둘 수 있다')
check(/\.es-rename-b\{/.test(css) && /\.es-rename\{/.test(css), '그 자리에 모양이 있다')

// ── 결재 기록에 사람 이름을 안 박는다 ───────────────
// 박으면 사람 이름을 바꿔도 지난 결재 건이 안 따라온다. 지금은 id 만 적고 볼 때마다
// 계정에서 찾아가므로, 한 번 바꾸면 과거 건까지 전부 새 이름으로 보인다.
{
  const ap = bare(read('./server/approvals.py'))
  const cols = (ap.match(/_COLS = \(([\s\S]*?)\)/) || [])[1] || ''
  check(!/requester_name|approver_name/.test(cols),
    '결재 기록에 사람 이름을 안 박는다', cols.replace(/\s+/g, ' ').slice(0, 80))
  check(/project_name/.test(cols),
    '자료 이름은 **일부러** 박는다 — 그건 「그때 낸 것」의 이름이다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
