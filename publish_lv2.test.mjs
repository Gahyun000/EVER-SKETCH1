// **이북 발행을 작성자(Lv2)에게도 열었다.**
//
// 2026-09-16 · 사용자 지시: 「Lv2까진 이북발행 가능하게」.
//
// 그전에는 관리자 전용이었고, 이유가 `permissions.py` 에 적혀 있었다 —
// 「발행하면 열람자 전원에게 공개되고, 본 사람은 되돌릴 수 없다」.
// **그 걱정은 없어지지 않았다.** 사라진 것은 「관리자만」이라는 범위뿐이고,
// 그 자리에 「제 자료만」이 들어왔다. 판정의 주인은 서버이고(server/test_uds107.py ·
// server/test_permissions.py 가 잰다), 이 파일은 **화면 쪽**을 잰다.
//
// 화면이 지켜야 할 것 셋
//   · 보이는 것과 서버가 허락하는 것의 **넓이가 같다** — 넓으면 눌러도 안 되는 단추가
//     생기고, 좁으면 되는데 못 하는 기능이 된다.
//   · **⌘Enter 도 같은 규칙으로 막힌다.** 예전에는 메뉴만 가려 두고 단축키는 열려 있어서,
//     권한 없는 사람이 눌러도 그대로 서버까지 갔다. 보이지 않는 기능은 눌러지지도 않아야 한다.
//   · 거절당하면 **이유를 말한다.** 403 은 `ok` 도 `error` 도 없는 `{detail}` 이라,
//     예전에는 화면에 이유 없이 「실패: 」만 떴다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs publish_lv2.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const { canPublish, isAdmin } = await import('./src/auth/authApi.ts')
const menu = bare(read('./src/builder/chrome/MenuBar.tsx'))
const hk = bare(read('./src/builder/Hotkeys.tsx'))
const book = bare(read('./src/export/exportBook.ts'))
const py = read('./server/permissions.py')
const app = read('./server/app.py')

const me = (role, status = 'active') => ({ role, status })

// ── ① 누가 발행할 수 있나 ─────────────────────────
{
  check(canPublish(me('admin')) === true, '관리자는 발행한다')
  check(canPublish(me('writer')) === true, '**작성자도 발행한다** — 이번에 열린 것')
  check(canPublish(me('viewer')) === false,
    '열람자는 못 한다 — 제출조차 못 하는 개인 작업 공간이다(D13)')
  check(canPublish(me('writer', 'pending')) === false, '승인 대기 중인 사람은 못 한다')
  check(canPublish(me('writer', 'disabled')) === false, '비활성 계정도 못 한다')
  check(canPublish(null) === false && canPublish(undefined) === false, '로그인 안 했으면 못 한다')
  // 관리자 판정은 그대로다 — 발행이 열렸다고 다른 관리 기능까지 열리면 안 된다.
  check(isAdmin(me('writer')) === false, '작성자가 관리자가 된 것은 아니다')
}

// ── ② 서버가 허락하는 넓이와 같다 ──────────────────
// 화면이 서버보다 넓으면 눌러도 안 되는 단추가 생긴다. 좁으면 되는데 못 하는 기능이 된다.
{
  check(!/_ADMIN_ONLY = \([^)]*PUBLISH/.test(py), '서버에서도 PUBLISH 가 관리자 전용에서 빠졌다')
  check(/if action == PUBLISH:\s*\n(\s*#[^\n]*\n)*\s*return owns/.test(py),
    '서버는 작성자에게 **제 자료만** 열어 준다')
  // 열람자 분기는 PUBLISH 를 다루지 않는다 → 그 분기의 마지막 `return False` 로 떨어진다.
  const vi = py.indexOf('if actor.role == VIEWER:')
  const vblock = py.slice(vi, py.indexOf('# ── 작성자'))
  check(vi > 0 && !/PUBLISH/.test(vblock),
    '열람자 분기에는 발행이 아예 없다 — 있으면 그 스케치가 전원 공개된다')
}

// ── ③ 메뉴 ───────────────────────────────────────
{
  check(/\{ label: '↧ 이북\(웹\) 만들기'[^}]*publish: true \}/.test(menu),
    '메뉴가 **발행 가능한 사람** 기준으로 걸린다')
  check(!/\{ label: '↧ 이북\(웹\) 만들기'[^}]*admin: true \}/.test(menu),
    '「관리자만」 표시는 사라졌다')
  check(/const pub = canPublish\(me\)/.test(menu), '같은 함수로 판정한다 — 규칙이 두 벌이면 갈라진다')
  check(/\(admin \|\| !it\.admin\) && \(pub \|\| !it\.publish\)/.test(menu),
    '거르는 자리도 둘 다 본다')
  // 관리 항목까지 같이 열리면 안 된다.
  //
  // **세는 검사여야 한다**(2026-09-16 파괴 검사 E). 처음에는 「환경설정에 admin:true 가
  // 있나」만 봤는데, 환경설정 항목이 **두 군데**(파일 메뉴 · 도구 메뉴) 있어서 한쪽만
  // publish 로 바꿔도 나머지 하나가 걸려 통과했다. 있나 없나가 아니라 **몇 개인가**를 센다.
  const pubItems = menu.match(/\{ label: '[^']*'[^}]*publish: true \}/g) || []
  check(pubItems.length === 1, '발행 기준으로 열린 항목은 **딱 하나**다', '지금 ' + pubItems.length + '개')
  check(pubItems.length === 1 && /이북\(웹\) 만들기/.test(pubItems[0]),
    '그 하나가 이북 만들기다', pubItems[0] || '(없음)')
  const settings = menu.match(/\{ label: '⚙ 환경설정'[^}]*\}/g) || []
  check(settings.length > 0 && settings.every((t) => /admin: true/.test(t)),
    '환경설정은 **하나도 빠짐없이** 관리자만이다', settings.join(' / ') || '(없음)')
}

// ── ④ ⌘Enter ────────────────────────────────────
{
  check(/if \(mod && k === 'Enter'\) \{ e\.preventDefault\(\); if \(canPublish\(useAuth\.getState\(\)\.me\)\) p\.onBuild\(\); return \}/.test(hk),
    '**⌘Enter 도 같은 규칙으로 막힌다** — 예전에는 여기만 열려 있었다')
  check(/import \{ canPublish \} from '\.\.\/auth\/authApi'/.test(hk), '메뉴와 같은 함수를 쓴다')
}

// ── ⑤ 거절당하면 이유를 말한다 ─────────────────────
{
  check(/b\.error \|\| b\.detail/.test(book),
    '**서버가 준 이유(detail)를 그대로 옮긴다** — 403 에는 error 가 없다')
  check(/!res\.ok \|\| b\.ok === undefined/.test(book),
    '성공 모양이 아니면 실패로 본다 — 예전에는 `ok` 가 없으면 이유 없는 「실패: 」였다')
  check(/서버가 ' \+ res\.status \+ ' 로 거절했습니다/.test(book), '이유가 없으면 상태 번호라도 말한다')
  check(/catch \{/.test(book), '본문이 JSON 이 아니어도 터지지 않는다')
  check(/먼저 자료를 저장한 뒤 발행해 주세요/.test(app),
    '저장 안 된 문서로 발행하려 하면 **할 일을 말해 준다**')
}

// ── ⑥ 누가 발행했는지 남는다 ──────────────────────
//
// 예전에는 `audit(None, ...)` 이었다 — 「인증 배선은 나중에」라고 미뤄 둔 자리인데,
// 그 배선은 이미 와 있었다. 관리자만 발행하던 때는 「관리자 중 누군가」로 좁혀지기라도
// 했지만, 이제 작성자도 발행한다. 누가 무엇을 내보냈는지 모르는 로그는 로그가 아니다.
{
  check(/auth_store\.audit\(user\.get\("id"\), "publish"/.test(app),
    '**발행한 사람이 감사로그에 남는다**')
  check(!/auth_store\.audit\(None, "publish"/.test(app), '이름 없이 남기던 옛 줄은 사라졌다')
}

// ── ⑦ 어느 자료를 발행하는지 보고 판정한다 ────────────
// 예전처럼 리소스 없이 물으면 「남의 자료 id 를 넣어 발행」이 열린다.
{
  const b = app.slice(app.indexOf('def build('), app.indexOf('ts = time.strftime'))
  check(/require_project\(user, req\.project_id, perm\.PUBLISH\)/.test(b),
    '**자료 소유자를 보고 판정한다**')
  check(!/^\s*require_action\(user, perm\.PUBLISH\)\s*$/m.test(b),
    '리소스 없이 묻던 옛 줄은 사라졌다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
