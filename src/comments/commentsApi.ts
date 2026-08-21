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

/**
 * 앵커 문자열 ↔ 칸 범위.
 *
 *   "3_5"        칸 하나
 *   "3_3:3_5"    범위 (왼쪽 위 : 오른쪽 아래)
 *
 * **콜론이 없으면 칸 하나로 읽는다.** 이미 달려 있는 의견을 그대로 살리기
 * 위해서다 — 형식을 바꾸면서 기존 지적이 가리키던 자리를 잃으면, 바로 그
 * '검토 이력이 조용히 사라지는' 일이 된다.
 */
export interface CellRange { r0: number; c0: number; r1: number; c1: number }

export function parseCell(cell: string | null | undefined): CellRange | null {
  if (!cell) return null
  const [a, b] = cell.split(':')
  const pt = (s: string) => {
    const [r, c] = s.split('_').map(Number)
    return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 ? { r, c } : null
  }
  const p0 = pt(a)
  if (!p0) return null
  const p1 = b ? pt(b) : p0
  if (!p1) return null
  return {
    r0: Math.min(p0.r, p1.r), c0: Math.min(p0.c, p1.c),
    r1: Math.max(p0.r, p1.r), c1: Math.max(p0.c, p1.c),
  }
}

/** 칸 범위 → 앵커 문자열. 한 칸이면 콜론 없이 쓴다(예전 형식 그대로). */
export function cellKey(r0: number, c0: number, r1: number, c1: number): string {
  const a = Math.min(r0, r1), b = Math.min(c0, c1)
  const x = Math.max(r0, r1), y = Math.max(c0, c1)
  return a === x && b === y ? `${a}_${b}` : `${a}_${b}:${x}_${y}`
}

/**
 * 사람이 읽는 위치.
 *
 * 한 줄짜리 범위를 "3행 3열~3행 5열" 로 쓰면 읽는 사람이 다시 세어봐야 한다.
 * 바뀌는 쪽만 범위로 적는다 — "3행 3~5열".
 */
export function cellLabel(cell: string | null): string {
  const rg = parseCell(cell)
  if (!rg) return ''
  const rows = rg.r0 === rg.r1 ? `${rg.r0 + 1}행` : `${rg.r0 + 1}~${rg.r1 + 1}행`
  const cols = rg.c0 === rg.c1 ? `${rg.c0 + 1}열` : `${rg.c0 + 1}~${rg.c1 + 1}열`
  return `${rows} ${cols}`
}
