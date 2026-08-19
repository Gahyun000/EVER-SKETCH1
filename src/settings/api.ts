// EVER-SKETCH fetch 헬퍼. 세션은 HttpOnly 쿠키로 자동 전송된다(토큰을 JS 가 들지 않는다).
import { checkAuth } from '../auth/session'
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' })
  checkAuth(res)          // 401 → 로그인 화면으로
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${t ? ': ' + t : ''}`)
  }
  return (await res.json()) as T
}
