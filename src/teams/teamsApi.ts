// 팀 관리 API 클라이언트 (L1 전용).
// 세션은 HttpOnly 쿠키로 오간다 — authApi 와 같은 규약.
import { ApiError } from '../auth/authApi'
import { notifyUnauthorized } from '../auth/session'
import type { Team, TeamUser } from './teamModel'

const API = '/api/teams'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: 'same-origin' })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch { /* JSON 이 아니면 무시 */ }
    if (res.status === 401) notifyUnauthorized()
    throw new ApiError(res.status, detail || `요청에 실패했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export async function apiListTeams(): Promise<Team[]> {
  const d = await req<{ teams: Team[] }>('')
  return d.teams || []
}

export async function apiCreateTeam(name: string): Promise<Team> {
  const d = await req<{ ok: boolean; team: Team }>('', {
    method: 'POST', body: JSON.stringify({ name }),
  })
  return { ...d.team, members: [] }
}

export async function apiRenameTeam(tid: string, name: string): Promise<void> {
  await req<{ ok: boolean }>(`/${tid}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export async function apiDeleteTeam(tid: string): Promise<void> {
  await req<{ ok: boolean }>(`/${tid}`, { method: 'DELETE' })
}

/** 팀에 넣는다. 돌려주는 것은 **이 사람이 빠져나온 이전 팀** — 화면이 그걸 말해준다. */
export async function apiAddMember(
  tid: string, userId: string,
): Promise<{ id: string; name: string }[]> {
  const d = await req<{ ok: boolean; moved_from: { id: string; name: string }[] }>(
    `/${tid}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) })
  return d.moved_from || []
}

export async function apiRemoveMember(tid: string, userId: string): Promise<void> {
  await req<{ ok: boolean }>(`/${tid}/members/${userId}`, { method: 'DELETE' })
}

export type { Team, TeamUser }
