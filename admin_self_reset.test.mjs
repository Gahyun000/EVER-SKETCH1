// **관리자 본인 초기화는 막혀 있다** — 그 자리는 「지금 비밀번호가 기억나지 않습니다」가 맡는다.
//
// ── 이 줄이 하루 사이에 열렸다 닫혔다(2026-09-18) ──
// 처음에는 막혀 있었다. 이유는 「본인 것을 무작위로 날리면 화면에 뜬 글자를 놓치는 순간
// 관리자가 스스로 잠긴다」였다. 사용자가 되물었다 — 「모달이 뜨고 닫기를 누르면 로그인
// 화면으로 가게 설정하면 되잖아.」 **맞는 말이었다.** 튕기는 것은 「세션이 끊겼다」가 아니라
// 401 을 만난 순간 화면이 그렇게 하기로 한 것이라, 그 시점은 화면이 정할 수 있다.
// 그래서 **열었고**, 실제로 붙여 놓고 보니 **같은 자리를 푸는 길이 둘**이 됐다.
// 사용자가 셋을 견주고 골랐다 — 「2번보다 3만 있으면 되겠다.」
//
// **왜 3쪽인가.** 초기화는 무작위 값을 한 번만 보여 주므로 **복사해 둬야** 하고,
// 들어가서 **또 한 번 바꿔야** 한다. 직접 정하기는 그 자리에서 내 값으로 끝난다 —
// 걸음이 하나 짧고 놓칠 글자가 없다. 같은 일을 하는 길이 둘이면 둘 다 반쯤만 관리된다.
//
// 이 파일은 **닫힌 채로 있는지**와, 닫아 놓고 **갈 곳을 말해 주는지**를 본다.
// 열려 있던 길(③)의 계약은 admin_self_pw.test.mjs 가 본다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs admin_self_reset.test.mjs
import { readFileSync } from 'node:fs'

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
const SE = readFileSync('./src/auth/session.ts', 'utf8')
const PY = readFileSync('./server/auth.py', 'utf8')

// ── ① 서버가 막는다 ────────────────────────────────
{
  const fn = cut(PY, 'def admin_reset_password', '\ndef ')
  check(fn.length > 200, '서버 함수를 찾았다')
  // **글과 코드를 갈라 본다.** 설명글에도 같은 말이 적혀 있어, 안 가르면 글이 코드 대신 통과한다.
  const Q = String.fromCharCode(34).repeat(3)
  const doc = cut(fn, Q, Q)
  const code = fn.slice(fn.indexOf(doc) + doc.length + 3)
  check(code.length > 80 && !code.includes(Q), '설명글과 코드를 갈랐다', `${code.length}자`)
  check(/if actor_id == target_id:/.test(code),
    '**본인은 막는다** — 코드에서', code.trim().slice(0, 80))
  // 「안 됩니다」만 하면 관리자는 다음에 무엇을 눌러야 할지 모른다.
  const msg = cut(code, 'if actor_id == target_id:', 'target = get_user')
  check(/비밀번호 변경/.test(msg) && /기억나지 않습니다/.test(msg),
    '막으면서 **어디로 가라고** 말해 준다', msg.trim())
  check(/열었다 닫혔다|2번보다 3/.test(doc),
    '열었다 닫은 내력이 **설명글에** 남아 있다 — 왜 열었는지가 왜 닫았는지의 배경이다')
}

// ── ② 화면도 막는다 ────────────────────────────────
{
  const BTN = cut(UA, '<button className="es-mini" disabled={self || busy || u.status', '</button>')
  check(BTN.length > 40, '초기화 단추를 찾았다', `${BTN.length}자`)
  check(/disabled=\{self \|\| busy/.test(BTN), '**본인 줄에서는 안 눌린다**')
  check(/본인은 「비밀번호 변경」을 쓰세요/.test(BTN) && /기억나지 않습니다/.test(BTN),
    '마우스를 올리면 **어디로 가라고** 말해 준다 — 죽은 단추만 있으면 이유를 모른다', BTN.trim().slice(0, 120))
}

// ── ③ 걷은 장치가 남아 있지 않다 ────────────────────
{
  // 안 쓰는 장치를 남겨 두면 「어딘가 쓰이나」 싶어 다음 사람이 붙들고 있게 된다.
  check(!/export function holdUnauthorized/.test(SE),
    '미루는 장치(holdUnauthorized)를 걷었다 — 잡아 둘 일이 없어졌다')
  check(!/_resetHold/.test(SE), '그 장치의 되돌리기도 같이 걷었다')
  check(!/holdUnauthorized/.test(UA), '화면에도 부르는 자리가 없다')
  // 걷으면서 본래 하던 일까지 망가뜨리면 안 된다.
  const nu = cut(SE, 'export function notifyUnauthorized', '\n}')
  check(/if \(handler\) handler\(\)/.test(nu) && !/held/.test(nu),
    '**알리는 일 자체는 그대로**다 — 401 을 만나면 곧바로 알린다', nu.trim())
  check(/걷었다/.test(SE), '무엇이 있었고 왜 걷었는지가 그 자리에 적혀 있다')
  check(!/closeIssued/.test(UA), '창을 닫으며 로그아웃하던 길도 없다')
  check(!/const logout = useAuth/.test(UA),
    '안 쓰게 된 logout 도 걷었다 — 남겨 두면 「여기서도 로그아웃하나」로 읽힌다')
}

// ── ④ 남의 것 초기화는 그대로다 ─────────────────────
{
  // **이걸 같이 걷으면 잊은 사람이 화면으로 돌아올 길이 아예 없어진다.**
  const RP = cut(UA, 'const resetPw = async', '\n  const pendingCount')
  check(/await apiResetPassword\(u\.id\)/.test(RP), '남의 것 초기화는 살아 있다')
  check(/await load\(\)/.test(RP), '초기화 뒤 목록을 다시 받는다(중지→사용 중이 바뀔 수 있다)')
  check(/setIssued\(\{ user: u, password \}\)/.test(RP), '임시 비밀번호를 한 번 보여 준다')
  check(/당사자에게 전달해 주세요/.test(UA), '창의 말이 「남에게 전달」로 돌아왔다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
