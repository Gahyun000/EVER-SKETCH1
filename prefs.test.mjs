// 마지막에 고른 화면 방향을 기억하는가.
//
// 임원진 요청: 「가로 세로 변경 기능 추가. 한번 선택을 하면 이후 부터는 그 설정으로
// 계속 생성이 되어야 함」. 앞의 절반(바꾸는 단추)은 이미 있었고, 뒤의 절반이 없었다 —
// `emptySnapshot()` 에 'portrait' 가 박혀 있어 새 이북은 늘 세로로 시작했다.
//
// 여기서 지키는 것 둘.
//   · 기억하고 되읽는다
//   · **저장이 막힌 브라우저에서도 죽지 않는다** — 시크릿 창이나 사이트 데이터 차단에서는
//     localStorage 가 읽기도 쓰기도 던진다. 기본값 하나 못 읽었다고 화면이 안 뜨면 안 된다.
//
// 실행: node --experimental-strip-types prefs.test.mjs

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 멀쩡한 브라우저 흉내 ────────────────────────────
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
}

const { lastOrientation, rememberOrientation } = await import('./src/persistence/prefs.ts')

check(lastOrientation() === 'portrait', '아무것도 안 골랐으면 세로 (지금까지의 기본값)')

rememberOrientation('landscape')
check(lastOrientation() === 'landscape', '가로를 고르면 가로로 기억한다')
rememberOrientation('portrait')
check(lastOrientation() === 'portrait', '다시 세로로 바꾸면 세로로 기억한다')

// 이상한 값이 들어 있어도 세로로 떨어진다 — 사람이 손으로 고쳤거나 옛 값일 수 있다.
store.set('es_last_orientation', 'diagonal')
check(lastOrientation() === 'portrait', '모르는 값이 들어 있으면 세로로 본다')
store.set('es_last_orientation', '')
check(lastOrientation() === 'portrait', '빈 값도 세로로 본다')

// 키 이름을 못 박는다 — 바뀌면 사람들의 설정이 조용히 초기화된다.
rememberOrientation('landscape')
check(store.get('es_last_orientation') === 'landscape',
      '저장 키는 es_last_orientation 하나다', [...store.keys()].join(','))

// ── 저장이 막힌 브라우저 ────────────────────────────
globalThis.localStorage = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
  removeItem: () => { throw new Error('blocked') },
}
let threw = false
try { check(lastOrientation() === 'portrait', '읽기가 막혀도 세로로 떨어진다') }
catch { threw = true }
check(!threw, '읽기가 막혀도 **던지지 않는다**')

threw = false
try { rememberOrientation('landscape') } catch { threw = true }
check(!threw, '쓰기가 막혀도 던지지 않는다 (이번 판만 기억 못 할 뿐)')

console.log('\n' + pass + ' 통과, ' + fail + ' 실패')
if (fail) process.exit(1)
