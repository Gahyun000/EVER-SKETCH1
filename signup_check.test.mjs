// 가입 화면 검증 로직 — 노드 단독 실행.
//
// 「중복 확인」 버튼 방식의 **유일한 함정**을 여기서 못박는다:
//   확인은 했는데 **그 뒤에 아이디를 고친** 상태.
// 이 상태를 무효로 되돌리지 않으면 중복된 아이디로 가입 버튼이 켜지고,
// 사용자는 "확인까지 했는데 왜 안 되지"를 겪는다. 서버가 막아 주긴 하지만
// 그건 **막는 것**이지 **알려주는 것**이 아니다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs signup_check.test.mjs

const {
  normalizeLoginId, loginIdFormat, idCheckState, passwordState, signupBlockers,
} = await import('./src/auth/signupCheck.ts')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

// ── 아이디 정규화 ──
// 서버가 signup() 에서 strip().lower() 를 한다. 화면이 다른 값으로 확인하면
// "확인한 아이디"와 "가입되는 아이디"가 달라진다.
check(normalizeLoginId('  GaHyun  ') === 'gahyun', '앞뒤 공백을 버리고 소문자로 — 서버와 같은 규칙')
check(normalizeLoginId('') === '', '빈 값은 빈 값')
check(normalizeLoginId(undefined) === '', 'undefined 도 빈 값')

// ── 형식 ──
check(loginIdFormat('').ok === false && loginIdFormat('').quiet === true,
  '빈칸은 틀렸다고 말하지 않는다 — 아직 안 친 것뿐이다')
check(loginIdFormat('ab').ok === false, '2자는 안 된다')
check(loginIdFormat('abc').ok === true, '3자는 된다')
check(loginIdFormat('a'.repeat(32)).ok === true, '32자는 된다')
check(loginIdFormat('a'.repeat(33)).ok === false, '33자는 안 된다')
check(loginIdFormat('GaHyun').ok === true, '대문자는 정규화 뒤에 판정하므로 통과한다')
check(loginIdFormat('가현').ok === false, '한글 2자는 길이에서 걸린다')
check(loginIdFormat('김가현이').ok === false, '길이가 맞아도 한글은 안 된다')
check(loginIdFormat('kim gh').ok === false, '공백이 가운데 있으면 안 된다')
check(['kim.gh', 'kim_gh', 'kim-gh'].every((v) => loginIdFormat(v).ok), '. _ - 는 된다')
check(loginIdFormat('김가현이').message.includes('영문 소문자'),
  '무엇이 안 되는지가 아니라 무엇이 되는지를 말해준다')
check(loginIdFormat('ab').message.includes('3자'), '길이가 문제면 몇 자인지 말해준다')

// ── 확인 상태 ──
// idCheckState(입력값, 확인해 둔 값, 확인 결과)
const S = (typed, checkedFor, available) => idCheckState(typed, checkedFor, available)

check(S('', null, null).kind === 'idle', '빈칸이면 조용히 있는다')
check(S('ab', null, null).kind === 'format', '형식이 틀리면 형식부터 말한다')
check(S('ab', 'ab', true).kind === 'format',
  '형식이 틀리면 확인 결과가 있어도 형식이 이긴다 — 확인이 형식을 덮으면 안 된다')
check(S('newbie', null, null).kind === 'unchecked', '형식은 맞고 아직 안 눌렀으면 「확인해 주세요」')
check(S('newbie', 'newbie', true).kind === 'available', '확인했고 비어 있으면 통과')
check(S('admin', 'admin', false).kind === 'taken', '확인했고 이미 쓰는 중이면 막힌다')

// ★ 이 안의 유일한 함정
check(S('newbie2', 'newbie', true).kind === 'unchecked',
  '확인한 뒤에 아이디를 고치면 확인이 무효가 된다')
check(S('newbie2', 'newbie', true).invalidated === true,
  '무효가 되었다는 사실을 화면이 말할 수 있게 알려준다')
check(S('newbie', 'newbie', true).invalidated === false,
  '고치지 않았으면 무효 표시를 띄우지 않는다')
check(S('  NEWBIE  ', 'newbie', true).kind === 'available',
  '대소문자·공백만 달라진 것은 고친 게 아니다 — 다시 누르게 하면 사람이 헤맨다')
check(S('admin2', 'admin', false).kind === 'unchecked',
  '「이미 쓰는 중」이던 아이디를 고치면 그 빨강도 사라진다')

// ── 비밀번호 ──
const P = (pw, confirm) => passwordState(pw, confirm)
check(P('', '').pw === 'idle' && P('', '').confirm === 'idle', '둘 다 비면 조용히 있는다')
check(P('short', '').pw === 'short', '8자 미만은 짧다고 말한다')
check(P('longenough', '').confirm === 'idle',
  '확인칸이 비면 「다르다」고 하지 않는다 — 아직 안 친 것뿐이다')
check(P('longenough', 'long').confirm === 'mismatch', '다르면 다르다고 한다')
check(P('longenough', 'longenough').confirm === 'match', '같으면 같다고 한다')
check(P('short', 'short').confirm === 'match' && P('short', 'short').pw === 'short',
  '두 칸이 같아도 8자 조건은 따로 본다')
check(P('a'.repeat(129), 'a'.repeat(129)).pw === 'long', '128자를 넘으면 길다고 한다')

// ── 가입 버튼 ──
const READY = {
  typed: 'newbie', checkedFor: 'newbie', available: true,
  password: 'password123', confirm: 'password123', name: '홍길동',
}
check(signupBlockers(READY).length === 0, '다 채우면 막는 게 없다')
check(signupBlockers({ ...READY, checkedFor: null }).includes('id'),
  '중복 확인을 안 누르면 막힌다')
check(signupBlockers({ ...READY, typed: 'newbie3' }).includes('id'),
  '확인 뒤 아이디를 고치면 다시 막힌다 — 이게 핵심이다')
check(signupBlockers({ ...READY, available: false }).includes('id'),
  '이미 쓰는 중이면 막힌다')
check(signupBlockers({ ...READY, confirm: 'password124' }).includes('password'),
  '비밀번호가 다르면 막힌다')
check(signupBlockers({ ...READY, password: 'short', confirm: 'short' }).includes('password'),
  '8자 미만이면 막힌다')
check(signupBlockers({ ...READY, name: '   ' }).includes('name'),
  '이름이 공백뿐이면 막힌다')
check(signupBlockers({ ...READY, typed: 'GaHyun ', checkedFor: 'gahyun' }).length === 0,
  '대소문자·공백만 다른 것은 막지 않는다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
