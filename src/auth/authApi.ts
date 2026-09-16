// 인증 API 클라이언트.
// 세션은 HttpOnly 쿠키로 오간다 — JS 가 토큰을 읽지 않는다(XSS 로 탈취되지 않게).
import { notifyUnauthorized } from './session'

const API = '/api/auth'

// 권한은 역할명이 진실이다. 숫자 등급(grade)은 화면 표시용 —
// 등급 체계가 바뀌어도 이 타입과 판정 코드는 그대로다. (server/permissions.py 참조)
export type Role = 'admin' | 'writer' | 'viewer' | ''
export type Grade = 1 | 2 | 3

export interface Me {
  id: string
  login_id: string
  name: string
  dept: string
  status: 'pending' | 'active' | 'disabled'
  must_change_pw: boolean
  role: Role
  requested_role: Role
  grade: Grade | null
  requested_grade: Grade | null
  role_label: string
  requested_role_label: string
}

export const isAdmin = (me: Me | null | undefined): boolean =>
  !!me && me.status === 'active' && me.role === 'admin' 

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
  login_id: string; password: string; name: string; dept: string; requested_role: Role
}): Promise<{ message: string }> {
  return req<{ ok: boolean; status: string; message: string }>('/signup', {
    method: 'POST', body: JSON.stringify(input),
  })
}

/**
 * 아이디 중복 확인. **로그인 전에 쓰는 유일한 조회 API** 라 서버에 시도 제한이 걸려 있다.
 * 429 가 오면 그대로 사용자에게 보여준다 — 「확인 요청이 너무 많습니다」.
 */
export async function apiCheckLoginId(login_id: string): Promise<boolean> {
  const d = await req<{ available: boolean }>(
    `/check-id?login_id=${encodeURIComponent(login_id)}`)
  return !!d.available
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

export async function apiApprove(uid: string, role: Role): Promise<Me> {
  const d = await req<{ ok: boolean; user: Me }>(`/users/${uid}/approve`, {
    method: 'POST', body: JSON.stringify({ role }),
  })
  return d.user
}

/**
 * 비밀번호 초기화 — 관리자 전용. 돌려주는 것은 **임시 비밀번호**다.
 *
 * 관리자가 값을 고르지 않는다(보낼 수도 없다). 고르게 하면 관리자가 그 값을 계속
 * 알고 있어서 그 계정을 사칭할 수 있는 창이 열린 채로 남는다. 서버가 무작위로
 * 발급하고 대상자는 최초 로그인 시 반드시 바꾼다 — 한 번 쓰고 폐기되는 값이다.
 */
export async function apiResetPassword(uid: string): Promise<string> {
  const d = await req<{ ok: boolean; password: string }>(`/users/${uid}/reset-pw`, {
    method: 'POST',
  })
  return d.password
}

/**
 * 이름 바꾸기 — 관리자 전용.
 *
 * **이름은 살아 있는 값이다.** 결재 기록에는 사람의 id 만 적히고 이름은 볼 때마다
 * 계정에서 찾아간다 — 그래서 한 번 바꾸면 **지난 결재 건의 결재자 이름까지** 함께
 * 바뀐다. 되돌려 승인받을 필요가 없다.
 *
 * **자료 제목과 얼어붙은 스냅샷 속 글자는 안 바뀐다.** 만들 때 한 번 박힌 것이라서다.
 * 그건 버그가 아니라 기록이다 — 그때 이름이 그때 이름으로 남는 편이 맞다.
 */
export async function apiSetName(uid: string, name: string): Promise<Me> {
  const d = await req<{ ok: boolean; user: Me }>(`/users/${uid}/name`, {
    method: 'POST', body: JSON.stringify({ name }),
  })
  return d.user
}

export async function apiSetStatus(uid: string, status: 'active' | 'disabled'): Promise<Me> {
  const d = await req<{ ok: boolean; user: Me }>(`/users/${uid}/status`, {
    method: 'POST', body: JSON.stringify({ status }),
  })
  return d.user
}

// 화면 표시. 1등급이 최고 권한(사내 표기 관례, 확정 2026-08-19).
// 서버가 role_label 을 함께 내려주지만, 목록·선택지처럼 클라이언트가 직접 그릴 때 쓴다.
export const ROLE_ORDER: Exclude<Role, ''>[] = ['admin', 'writer', 'viewer']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Lv1 관리자',
  writer: 'Lv2 작성자',
  viewer: 'Lv3 열람자',
  '': '미부여',
}

// 2026-09-04 정정 — 「회차 개설」·「발행된 회차 자료」는 P2 에서 없어진 개념이다.
// 가입 화면에서 사람이 제일 먼저 읽는 문장이라, 여기가 옛말이면 제품 전체가 옛것으로 보인다.
export const ROLE_DESC: Record<string, string> = {
  admin: '전체 관리 — 팀 편성, 가입 승인, 결재, 메모 작성. (회의 주관)',
  writer: '내 자료를 작성·수정하고 받은 메모에 답합니다. (임원·부서 담당자)',
  viewer: '팀에 공유된 자료를 봅니다. 편집은 하지 않습니다.',
}
