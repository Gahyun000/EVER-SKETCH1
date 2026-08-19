// 아이디 기억하기 — **아이디만** 저장한다.
//
// 비밀번호는 어떤 형태로도 localStorage·쿠키·IndexedDB 에 넣지 않는다(UDS-107 §5 비밀정보).
// XSS 가 한 번 나면 그대로 털리고, 브라우저 금고와 달리 OS 보호도 받지 못한다.
// 비밀번호를 기억시키고 싶으면 브라우저 비밀번호 관리자를 쓴다 —
// 그래서 입력란에 autocomplete 속성을 정확히 붙여 두었다.

const KEY = 'es_remember_login_id'

export function loadRememberedId(): string {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    // 시크릿 모드나 저장소 차단 환경 — 기능이 없을 뿐 로그인은 되어야 한다.
    return ''
  }
}

export function saveRememberedId(loginId: string): void {
  try {
    const v = (loginId || '').trim()
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
  } catch { /* 저장 못 해도 무시 */ }
}

export function clearRememberedId(): void {
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}
