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
  /** 담당자가 「고쳤습니다」를 누른 시각. **닫힌 것이 아니다** —
   *  지적한 사람이 확인하고 닫을 때까지 미해결로 남는다. */
  fixed_at?: number | null
  fixed_by?: string | null
  /** 가리키던 칸이 사라진 시각. 표에서 그 행·열이 지워졌다는 뜻이다.
   *  지적은 남기고 핀만 그리지 않는다 — 검토 이력이 조용히 사라지는 것이 제일 나쁘다. */
  lost_at?: number | null
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

/** 표에서 행·열이 늘거나 줄었을 때 앵커를 따라 옮긴다.
 *  이걸 안 하면 지적은 그대로인데 **엉뚱한 칸**을 가리키게 된다. */
export async function apiShiftAnchors(pid: string, input: {
  el_id: number; axis: 'row' | 'col'; at: number; delta: number; on_lost?: 'keep' | 'delete'
}): Promise<{ moved: number; lost: number; deleted: number }> {
  return await req(`/api/projects/${pid}/comments/shift`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export async function apiSetFixed(cid: string, fixed: boolean, body?: string): Promise<Comment> {
  return (await req<{ comment: Comment }>(`/api/comments/${cid}/fixed`, {
    method: 'POST', body: JSON.stringify({ fixed, body }),
  })).comment
}

export async function apiDeleteComment(cid: string): Promise<void> {
  await req(`/api/comments/${cid}`, { method: 'DELETE' })
}

export { cellKey, cellLabel, parseCell, type CellRange } from './anchor'
