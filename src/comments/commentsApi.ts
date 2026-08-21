// 앵커 메모 API 클라이언트.
import { ApiError } from '../auth/authApi'
import { checkAuth } from '../auth/session'

export interface Comment {
  id: string
  project_id: string
  thread_id: string
  page_id: number
  el_id: number | null
  cell: string | null          // 'r_c' 또는 'r0_c0:r1_c1'(범위)
  body: string
  author_id: string
  created_at: number
  resolved_at: number | null
  resolved_by: string | null
}

export interface Thread extends Comment {
  replies: Comment[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  checkAuth(res)
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch { /* JSON 이 아니면 무시 */ }
    throw new ApiError(res.status, detail || `요청에 실패했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export async function apiListComments(pid: string): Promise<Thread[]> {
  return (await req<{ comments: Thread[] }>(`/api/projects/${pid}/comments`)).comments || []
}

export async function apiAddComment(pid: string, input: {
  body: string; page_id: number; el_id?: number | null; cell?: string | null; reply_to?: string
}): Promise<Comment> {
  return (await req<{ comment: Comment }>(`/api/projects/${pid}/comments`, {
    method: 'POST', body: JSON.stringify(input),
  })).comment
}

export async function apiResolveComment(cid: string, resolved: boolean): Promise<Comment> {
  return (await req<{ comment: Comment }>(`/api/comments/${cid}/resolve`, {
    method: 'POST', body: JSON.stringify({ resolved }),
  })).comment
}

export async function apiDeleteComment(cid: string): Promise<void> {
  await req(`/api/comments/${cid}`, { method: 'DELETE' })
}

export { cellKey, cellLabel, parseCell, type CellRange } from './anchor'
