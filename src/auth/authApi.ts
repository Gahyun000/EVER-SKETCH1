// 인증 API 클라이언트.
// 세션은 HttpOnly 쿠키로 오간다 — JS 가 토큰을 읽지 않는다(XSS 로 탈취되지 않게).
import { notifyUnauthorized } from './session'

const API = '/api/auth'

export type Level = 0 | 1 | 2 | 3

export interface Me {
  id: string
  login_id: string
  name: string
  dept: string
  level: Level
  status: 'pending' | 'active' | 'disabled'
  requested_level: 1 | 2 | 3
  must_change_pw: boolean
  level_name: string
}

/** 서버가 준 detail 을 그대로 사용자에게 보여준다 — "HTTP 400" 보다 훨씬 쓸모 있다. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: 'same-origin' })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch {
      /* JSON 이 아니면 무시 */
    }
    // 로그인 시도의 401 은 "비밀번호 틀림"이지 세션 만료가 아니다. 구분해서 알린다.
    if (res.status === 401 && path !== '/login') notifyUnauthorized()
    throw new ApiError(res.status, detail || `요청에 실패했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export async function apiMe(): Promise<Me | null> {
  const d = await req<{ user: Me | null }>('/me')
  return d.user
}

export async function apiLogin(login_id: string, password: string): Promise<Me> {
  const d = await req<{ ok: boolean; user: Me }>('/login', {
    method: 'POST', body: JSON.stringify({ login_id, password }),
  })
  return d.user
}

export async function apiSignup(input: {
  login_id: string; password: string; name: string; dept: string; requested_level: 1 | 2 | 3
}): Promise<{ message: string }> {
  return req<{ ok: boolean; status: string; message: string }>('/signup', {
    method: 'POST', body: JSON.stringify(input),
  })
}

export async function apiLogout(): Promise<void> {
  await req<{ ok: boolean }>('/logout', { method: 'POST' })
}

export async function apiChangePassword(old_password: string, new_password: string): Promise<{ message: string }> {
  return req<{ ok: boolean; message: string }>('/password', {
    method: 'POST', body: JSON.stringify({ old_password, new_password }),
  })
}

// ── 사용자 관리 (L3) ──
export async function apiListUsers(status?: string): Promise<Me[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const d = await req<{ users: Me[] }>(`/users${q}`)
  return d.users || []
}

export async function apiApprove(uid: string, level: 1 | 2 | 3): Promise<Me> {
  const d = await req<{ ok: boolean; user: Me }>(`/users/${uid}/approve`, {
    method: 'POST', body: JSON.stringify({ level }),
  })
  return d.user
}

export async function apiSetStatus(uid: string, status: 'active' | 'disabled'): Promise<Me> {
  const d = await req<{ ok: boolean; user: Me }>(`/users/${uid}/status`, {
    method: 'POST', body: JSON.stringify({ status }),
  })
  return d.user
}

export const LEVEL_LABEL: Record<number, string> = {
  0: '미부여', 1: 'L1 열람자', 2: 'L2 작성자', 3: 'L3 관리자',
}

export const LEVEL_DESC: Record<number, string> = {
  1: '발행된 회차 자료를 봅니다. 편집은 하지 않습니다.',
  2: '내 이북을 작성·수정하고 받은 메모에 답합니다. (임원·부서 담당자)',
  3: '전체 관리 — 회차 개설, 가입 승인, 메모 작성, 최종 발행. (회의 주관)',
}
