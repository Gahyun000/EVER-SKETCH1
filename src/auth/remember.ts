// 로그인 기억하기 — 아이디, 그리고 **선택하면 비밀번호까지**.
//
// ── 이 파일이 원래 무엇이었나 ──
// 처음에는 아이디만 저장했고, 첫 줄에 이렇게 적혀 있었다:
//   "비밀번호는 어떤 형태로도 localStorage·쿠키·IndexedDB 에 넣지 않는다(UDS-107 §5)."
// 그 판단은 지금도 기술적으로 옳다. 아래를 켜면 실제로 이렇게 된다:
//   · 노트북이 잠기지 않은 채 자리를 비우면, 개발자도구를 여는 누구나 평문을 본다
//   · 로그아웃해도 남는다(세션과 수명이 다르다)
//   · XSS 가 한 번이라도 나면 그대로 털린다. 브라우저 금고와 달리 OS 보호가 없다
//
// ── 그런데 왜 켰나 ──
// 사내망 전용 도구이고, 매번 비밀번호를 치는 부담을 없애 달라는 요청을
// 더 안전한 두 대안(세션 30일 유지 · 브라우저 비밀번호 관리자)과 함께 제시한 뒤
// **책임자가 이 방식을 선택했다**(2026-09-04).
// 기록: docs/작업대장/작업이력대장_2026-09-03_결재전환_표준팩재이식_P0_P1.md
//
// ── 그래서 지킨 것 ──
// 1. 기본값은 꺼짐. 켠 사람에게만 저장한다.
// 2. 화면에 무슨 일이 일어나는지 그대로 적는다("이 기기에 평문으로 저장").
// 3. **난독화하지 않는다.** base64 로 감싸면 안전해 보이지만 안전해지지는 않는다.
//    보호처럼 보이는 것이 진짜 보호보다 나쁘다 — 사람들이 믿어 버린다.
// 4. 로그인에 성공했을 때만 저장한다. 틀린 값을 기억하면 방해만 된다.
// 5. 비밀번호를 바꾸면 지운다. 낡은 값이 자동으로 채워지면 잠긴 줄 알게 된다.

const ID_KEY = 'es_remember_login_id'
const PW_KEY = 'es_remember_pw'

/** 시크릿 모드·저장소 차단 환경 — 기능이 없을 뿐 로그인은 되어야 한다. */
function get(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function put(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch { /* 저장 못 해도 무시 */ }
}

export function loadRemembered(): { loginId: string; password: string } {
  const loginId = get(ID_KEY)
  // 아이디 없이 비밀번호만 남아 있으면 쓸 데가 없다. 그런 찌꺼기는 없는 셈 친다.
  return { loginId, password: loginId ? get(PW_KEY) : '' }
}

/** 로그인 성공 뒤에만 부른다. `password` 가 없으면 비밀번호는 지운다. */
export function saveRemembered(loginId: string, password?: string): void {
  const id = (loginId || '').trim()
  put(ID_KEY, id)
  put(PW_KEY, id && password ? password : '')
}

/** 비밀번호만 지운다(아이디는 남긴다) — 비밀번호를 바꿨을 때. */
export function clearRememberedPassword(): void {
  put(PW_KEY, '')
}

export function clearRemembered(): void {
  put(ID_KEY, '')
  put(PW_KEY, '')
}
