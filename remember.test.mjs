// 로그인 기억하기 저장소 — 노드 단독 실행.
//
// 비밀번호까지 저장하기로 한 이상, 여기서 틀리면 사람이 못 들어간다.
// 특히 **낡은 값이 자동으로 채워지는 것**이 위험하다 — 사용자는 계정이
// 잠겼다고 믿고, 몇 번 더 틀리면 실제로 잠긴다.
//
// 실행: node --experimental-strip-types remember.test.mjs

let store = new Map()
let throwing = false
globalThis.localStorage = {
  getItem: (k) => { if (throwing) throw new Error('blocked'); return store.has(k) ? store.get(k) : null },
  setItem: (k, v) => { if (throwing) throw new Error('blocked'); store.set(k, String(v)) },
  removeItem: (k) => { if (throwing) throw new Error('blocked'); store.delete(k) },
}

const {
  loadRemembered, saveRemembered, clearRemembered, clearRememberedPassword,
} = await import('./src/auth/remember.ts')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}
const reset = () => { store = new Map(); throwing = false }

// ── 아무것도 없을 때 ──
reset()
let r = loadRemembered()
check(r.loginId === '' && r.password === '', '처음에는 둘 다 비어 있다')

// ── 아이디만 ──
reset()
saveRemembered('gahyun')
r = loadRemembered()
check(r.loginId === 'gahyun' && r.password === '', '아이디만 저장하면 비밀번호는 비어 있다')

// ── 아이디 + 비밀번호 ──
reset()
saveRemembered('gahyun', 'sketch2026admin')
r = loadRemembered()
check(r.loginId === 'gahyun' && r.password === 'sketch2026admin', '아이디와 비밀번호가 함께 돌아온다')

// ── 저장을 끄면 이전 비밀번호가 남지 않는다 ──
// 체크를 껐는데 예전 값이 남아 있으면, 끈 줄 알면서도 계속 저장돼 있는 상태가 된다.
saveRemembered('gahyun')
r = loadRemembered()
check(r.loginId === 'gahyun' && r.password === '', '비밀번호 없이 다시 저장하면 이전 비밀번호가 지워진다')

// ── 비밀번호만 지우기 (비밀번호 변경 직후) ──
reset()
saveRemembered('gahyun', 'oldpassword1')
clearRememberedPassword()
r = loadRemembered()
check(r.loginId === 'gahyun', '비밀번호만 지워도 아이디는 남는다')
check(r.password === '', '바꾼 뒤에는 낡은 비밀번호가 채워지지 않는다')

// ── 전부 지우기 ──
reset()
saveRemembered('gahyun', 'sketch2026admin')
clearRemembered()
r = loadRemembered()
check(r.loginId === '' && r.password === '', '전부 지우면 둘 다 사라진다')

// ── 찌꺼기: 아이디 없이 비밀번호만 ──
reset()
store.set('es_remember_pw', 'orphan-secret')
r = loadRemembered()
check(r.password === '', '아이디가 없으면 남아 있는 비밀번호는 쓰지 않는다')

// ── 공백 아이디 ──
reset()
saveRemembered('   ', 'sketch2026admin')
r = loadRemembered()
check(r.loginId === '' && r.password === '', '공백만 있는 아이디는 저장하지 않는다')
check(store.has('es_remember_pw') === false, '아이디를 안 저장했으면 비밀번호도 안 남긴다')

// ── 저장소가 막힌 환경(시크릿 모드 등) ──
reset()
throwing = true
let threw = false
try {
  saveRemembered('gahyun', 'sketch2026admin')
  r = loadRemembered()
  clearRememberedPassword()
  clearRemembered()
} catch { threw = true }
check(!threw, '저장소가 막혀 있어도 예외를 던지지 않는다 (로그인 자체는 되어야 한다)')
check(r.loginId === '' && r.password === '', '막힌 환경에서는 빈 값으로 돌아온다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
