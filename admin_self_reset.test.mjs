// **관리자가 제 비밀번호를 초기화한다** — 창을 닫을 때 로그인으로.
//
// 2026-09-18 · 사용자가 내 말을 되짚어 물었다. 「모달이 뜨는 순간 내 창이 로그인 화면으로
// 튕기고 그 모달도 같이 사라진다고 했는데 → 관리자는 모달이 뜨고 **닫기를 누르면**
// 로그인 화면으로 가게 설정하면 되잖아.」
//
// **맞는 말이었고, 내가 잰 것과 다른 말을 했다.** 남의 것을 초기화했을 때 그 사람 창이
// 튕기는 것은 실측했지만, 본인 경우는 서버가 막고 있어 **재 본 적이 없었다.**
// 튕기는 것은 「세션이 끊겼다」가 아니라 **401 을 만난 순간 화면이 그렇게 하기로 한 것**이라,
// 그 시점은 화면이 정할 수 있다.
//
// ── 여기서 지키는 것 ──
//   1. 본인 줄의 「비밀번호 초기화」가 **살아 있다**
//   2. 본인일 때는 **끊긴 것을 아는 시점을 창 닫을 때까지 미룬다**(holdUnauthorized)
//   3. 본인일 때는 **목록을 다시 안 받는다**(그 요청이 곧 401 이다)
//   4. 창을 닫으면 **로그인 화면으로 간다**, 그리고 단추 글자가 그렇게 말한다
//   5. 미뤄 둔 401 은 **버리지 않는다** — 버리면 「끊겼는데 아무 일도 안 나는」 화면이 된다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs admin_self_reset.test.mjs
import { readFileSync } from 'node:fs'
import {
  _resetHold, holdUnauthorized, notifyUnauthorized, setSessionLostHandler,
} from './src/auth/session.ts'

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
const PY = readFileSync('./server/auth.py', 'utf8')

// ── ① 잡아 두는 장치를 **실제로 돌려 본다** ─────────────
{
  let n = 0
  setSessionLostHandler(() => { n++ })
  _resetHold()
  notifyUnauthorized()
  check(n === 1, '평소에는 바로 알린다', String(n))

  n = 0
  holdUnauthorized(true)
  notifyUnauthorized(); notifyUnauthorized()
  check(n === 0, '**잡아 두는 동안에는 안 알린다** — 임시 비밀번호 창이 살아 있어야 한다', String(n))
  holdUnauthorized(false)
  check(n === 1, '**풀면 한 번 알린다** — 버리면 「끊겼는데 아무 일도 안 나는」 화면이 된다', String(n))

  n = 0
  holdUnauthorized(true); holdUnauthorized(false)
  check(n === 0, '잡아 둔 동안 아무 일도 없었으면 풀 때도 조용하다', String(n))

  n = 0
  holdUnauthorized(true); notifyUnauthorized()
  holdUnauthorized(false); holdUnauthorized(false)
  check(n === 1, '두 번 풀어도 한 번만 알린다', String(n))

  _resetHold()
  n = 0
  notifyUnauthorized()
  check(n === 1, '되돌리기가 먹는다 — 잡아 둔 채로 다음 시험이 시작되면 그 시험이 조용히 이상해진다')
  setSessionLostHandler(null)
}

// ── ② 서버가 본인을 막지 않는다 ─────────────────────
{
  const fn = cut(PY, 'def admin_reset_password', '\ndef ')
  check(fn.length > 200, '서버 함수를 찾았다')
  // **글과 코드를 갈라 본다.** 이 함수의 설명글에 must_change_pw=1 이 적혀 있어서,
  // 그냥 찾으면 **코드를 0 으로 바꿔 놔도 설명글이 대신 통과한다**(일부러 깨 보다가 잡았다).
  const Q = String.fromCharCode(34).repeat(3)
  const doc = cut(fn, Q, Q)
  const code = fn.slice(fn.indexOf(doc) + doc.length + 3)
  check(code.length > 80 && !code.includes(Q), '설명글과 코드를 갈랐다', `${code.length}자`)

  check(!/if actor_id == target_id:/.test(code),
    '**본인을 막는 줄이 없다** — 뒤집힌 규칙이다', (code.match(/.{0,60}actor_id == target_id.{0,40}/) || [])[0] || '')
  check(/_kill_sessions\(target_id\)/.test(code),
    '세션은 그대로 끊는다 — 안 끊으면 열어 둔 다른 기기가 옛 비밀번호로 계속 산다')
  check(/UPDATE Users SET pw_hash=\?, must_change_pw=1, status='active'/.test(code),
    '본인 것이라도 **최초 로그인에서 또 바꾸게** 한다 — 남의 것과 같아야 한다',
    (code.match(/UPDATE Users SET[^\n]*/) || [])[0] || '')
  check(/뒤집혔다/.test(doc), '왜 뒤집혔는지가 **설명글에** 적혀 있다')
}

// ── ③ 화면 ───────────────────────────────────────
{
  const BTN = cut(UA, '<button className="es-mini" disabled={busy || u.status', '</button>')
  check(BTN.length > 40, '초기화 단추를 찾았다', `${BTN.length}자`)
  check(!/disabled=\{self/.test(BTN),
    '**본인 줄에서도 눌린다** — 막아 두면 관리자가 한 명일 때 길이 없다', BTN.trim().slice(0, 90))

  const RP = cut(UA, 'const resetPw = async', '\n  /** 임시 비밀번호 창을 닫는다')
  check(RP.length > 100, 'resetPw 를 찾았다')
  check(/const self = u\.id === me\?\.id/.test(RP), '본인인지 한 곳에서 정한다')
  check(/if \(self\) holdUnauthorized\(true\)/.test(RP),
    '**부르기 전에** 잡아 둔다 — 응답이 오기 전에 401 이 먼저 올 수도 있다')
  check(/if \(!self\) await load\(\)/.test(RP),
    '본인일 때는 목록을 다시 안 받는다 — 그 요청이 곧 401 이다')
  check(/catch \(e\) \{\s*if \(self\) holdUnauthorized\(false\)/.test(RP),
    '**실패하면 풀어 준다** — 안 풀면 그 뒤로 세션이 끊겨도 화면이 조용해진다', RP.trim().slice(0, 200))

  const CI = cut(UA, 'const closeIssued = ()', '\n\n')
  check(/holdUnauthorized\(false\)/.test(CI) && /void logout\(\)/.test(CI),
    '**창을 닫으면 로그인 화면으로 간다**', CI.trim())
  check(/const self = issued\?\.user\.id === me\?\.id/.test(CI),
    '닫을 때도 본인인지 보고 정한다 — 남의 것을 초기화하고 로그아웃되면 안 된다')

  // 「닫기」라고만 적혀 있으면 눌러 보고서야 나가는 줄 안다.
  check(/label: issued\.user\.id === me\?\.id \? '닫고 로그인 화면으로' : '닫기'/.test(UA),
    '단추가 **무슨 일이 일어나는지 말한다**(「닫고 로그인 화면으로」)')
  check(/dismissible=\{false\}/.test(cut(UA, '<Modal title="임시 비밀번호"', '>')),
    'Esc·바깥 누르기로는 안 닫힌다 — 한 번만 보이는 값이라 실수로 닫히면 끝이다')
  check(/내 비밀번호를 초기화했습니다/.test(UA) && /먼저 복사해 두세요/.test(UA),
    '본인일 때는 **다른 말을 한다** — 「당사자에게 전달해 주세요」는 나한테 할 말이 아니다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
