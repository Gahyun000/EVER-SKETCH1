// **관리자가 제 비밀번호를 옛 값 없이 정한다** — 화면 쪽.
//
// 2026-09-18 · 사용자 질문에서 나왔다. 「관리자는 비밀번호 잊으면 어떡함? 우선은 관리자 한명임.」
// 재 보니 화면에는 길이 없었다 — 본인 초기화는 막혀 있고, 비밀번호 변경은 옛 값을 묻는다.
//
// **본인 초기화를 여는 쪽은 사람을 가둔다.** 초기화는 세션을 끊으므로 내 창이 그 자리에서
// 로그인 화면으로 튕기고, 한 번만 보이는 임시 비밀번호가 그 화면과 함께 사라진다
// (시험 서버에서 재 봤다 — 남의 것을 초기화하자 그 창이 「로그인이 만료되어…」로 바뀌었다).
// 그래서 **내가 값을 직접 정하는** 길로 열었다. 놓칠 글자가 없다.
//
// 서버 쪽 계약은 server/test_admin_self_pw.py 가 지킨다. 여기서는 **화면**을 본다:
//   · 평소 길은 그대로다(처음 값은 옛 값을 묻는 쪽)
//   · 이 길은 **관리자에게만** 보인다
//   · 들어가면 옛 값 칸이 **사라지고**, 무엇을 내주는지 적힌 칸이 뜬다
//   · 되돌아오는 길이 있다
//   · 부르는 API 가 갈린다 — 관리자가 아닌데 이 갈래로 들어와도 일반 길로 간다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs admin_self_pw.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
/** 주석을 지운다 — JSX 주석부터. 이 파일이 지키는 말이 주석에도 적혀 있어서,
 *  안 지우면 주석이 자기를 지키는 꼴이 된다. */
const bare = (t) => t
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
function cut(t, a, b) {
  const i = t.indexOf(a); if (i < 0) return ''
  const j = b ? t.indexOf(b, i + a.length) : -1
  return j < 0 ? t.slice(i) : t.slice(i, j)
}

const SRC = bare(readFileSync('./src/auth/ChangePasswordForm.tsx', 'utf8'))
const CSS = readFileSync('./src/auth/auth.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const API = bare(readFileSync('./src/auth/authApi.ts', 'utf8'))

// ── ① 평소 길은 그대로다 ──────────────────────────────
{
  check(/const \[noOld, setNoOld\] = useState\(false\)/.test(SRC),
    '**처음은 옛 값을 묻는 쪽**이다 — 이 길은 사람이 일부러 들어와야 한다')
  const FORM = cut(SRC, '<form onSubmit={submit}>', '</form>')
  check(FORM.length > 400, '입력부를 찾았다', `${FORM.length}자`)
  check(/noOld \? \([\s\S]{0,900}?\) : \([\s\S]{0,300}?id="es-old"/.test(FORM),
    '옛 값 칸은 **아닐 때만** 그린다 — 들어가면 사라진다', FORM.slice(0, 80))
  check(/autoComplete="current-password"/.test(FORM), '평소에는 여전히 현재 비밀번호를 묻는다')
}

// ── ② 관리자에게만 보인다 ────────────────────────────
{
  check(/const canNoOld = isAdmin\(me\)/.test(SRC),
    '관리자인지는 **한 곳**에서 정한다')
  const LINK = cut(SRC, 'canNoOld && !noOld && (', '</button>')
  check(LINK.length > 40, '「기억나지 않습니다」 길을 찾았다', `${LINK.length}자`)
  check(/지금 비밀번호가 기억나지 않습니다/.test(LINK), '글자가 무엇을 하는 길인지 말한다')
  check(/setNoOld\(true\)/.test(LINK) && /setOldPw\(''\)/.test(LINK),
    '들어가면서 적어 둔 옛 값을 지운다 — 남겨 두면 어느 길로 갔는지 흐려진다')
  // **자물쇠가 하나면 자물쇠가 아니다.** 보이는 것만 막고 부르는 데서 안 막으면,
  // 화면이 바뀌는 날 조용히 뚫린다.
  const CALL = cut(SRC, 'const submit = async', '} catch')
  check(/if \(noOld && canNoOld\) await apiSetOwnPassword\(newPw\)/.test(CALL),
    '부를 때도 **관리자인지 다시 본다** — 화면에서만 막으면 화면이 바뀌는 날 뚫린다', CALL.trim().slice(0, 140))
  check(/else await apiChangePassword\(oldPw, newPw\)/.test(CALL),
    '아니면 평소 길로 간다')
}

// ── ③ 무엇을 내주는지 적혀 있다 ──────────────────────
{
  const WARN = cut(SRC, '<div className="es-msg warn">', '</div>')
  check(WARN.length > 60, '알리는 칸을 찾았다', `${WARN.length}자`)
  check(/지금 비밀번호를 묻지 않고 바꿉니다/.test(WARN), '무엇이 달라지는지 말한다')
  check(/자리를 비운 사이|화면을 잠그/.test(WARN),
    '**무엇을 내주는지** 말한다 — 옛 값 확인은 자리 비운 사이를 막던 장치였다', WARN.trim().slice(0, 90))
  check(/지금 비밀번호를 압니다/.test(WARN) && /setNoOld\(false\)/.test(WARN),
    '되돌아오는 길이 같은 칸 안에 있다')
}

// ── ④ 셈이 갈린다 ───────────────────────────────────
{
  // 식을 **꺼내서 실제로 돌린다.** 여기에 같은 식을 베껴 쓰면 베낀 것을 재게 된다.
  const grab = (n) => (SRC.match(new RegExp('const ' + n + ' = ([^\\n]+(?:\\n\\s+&&[^\\n]+)?)')) || [])[1]
  const can = grab('canSubmit'), same = grab('sameAsOld')
  check(!!can && !!same, '셈을 찾았다', JSON.stringify({ can, same }))
  const f = (noOld, oldPw, newPw, confirm) => {
    const sameAsOld = Function('noOld', 'newPw', 'oldPw', 'return (' + same + ')')(noOld, newPw, oldPw)
    return Function('noOld', 'oldPw', 'newPw', 'confirm', 'sameAsOld', 'busy',
      'return (' + can + ')')(noOld, oldPw, newPw, confirm, sameAsOld, false)
  }
  check(f(false, 'oldpw123', 'newpw12345', 'newpw12345') === true, '평소 길: 옛 값이 있으면 낼 수 있다')
  check(f(false, '', 'newpw12345', 'newpw12345') === false, '평소 길: **옛 값이 비면 못 낸다**')
  check(f(true, '', 'newpw12345', 'newpw12345') === true, '이 길: 옛 값 없이도 낼 수 있다')
  check(f(true, '', 'short7x', 'short7x') === false, '이 길에도 8자 규칙은 그대로다')
  check(f(true, '', 'newpw12345', 'newpw9999') === false, '두 번 친 값이 다르면 못 낸다')
  // 옛 값을 안 묻는데 「옛 값과 같다」를 따지면, 빈 문자열과 견주다 이상한 곳에서 막힌다.
  check(f(true, '', '', '') === false, '빈 값으로는 못 낸다')
}

// ── ⑤ 색과 이름 ─────────────────────────────────────
{
  const warn = cut(CSS, '.es-msg.warn {', '}')
  check(warn.length > 10, 'warn 칸 색이 정해져 있다')
  check(!/#fdf0f0|#7d2027/.test(warn),
    'err(빨강)와 **다른 색**이다 — 이건 「잘못됐다」가 아니라 「알고 하는 것」이다', warn)
  // `.es-inline` 은 이미 「입력칸 + 작은 단추」 묶음이 쓰고 있다. 한 이름이 두 모양을 하면
  // 한쪽을 고칠 때 다른 쪽이 깨진다.
  check(/\.es-inline \{ display: flex/.test(CSS), '.es-inline 은 원래 쓰임 그대로다')
  check(/\.es-link \{/.test(CSS) && !/className="es-inline"/.test(SRC),
    '새 글단추는 **제 이름**을 쓴다 — 남의 이름을 뺏지 않는다')
  check(/apiSetOwnPassword/.test(API) && /'\/password\/force'/.test(API),
    '길이 따로다 — /password 에 「옛 값 생략」을 얹으면 빈 문자열 하나로 확인이 통과한다')
  check(/apiChangePassword[\s\S]{0,200}?'\/password'/.test(API), '평소 길은 그대로 남아 있다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
