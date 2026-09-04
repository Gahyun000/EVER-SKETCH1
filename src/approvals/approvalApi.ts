// 결재 API 클라이언트.
// **남의 결재 건은 404 다** — 없는 것과 구분되지 않는다(서버가 일부러 그렇게 답한다).
import { checkAuth } from '../auth/session'
import type { DraftStateSnapshot } from '../persistence/draftStorage'

const API = '/api/approvals'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface ApprovalComment {
  id: string
  approval_id: string
  /** null = 전체 의견. 값이 있으면 그 슬라이드에 붙는다. */
  page_id: number | null
  page_no: number | null
  author: string
  author_name?: string
  body: string
  created_at: number
}

export interface Approval {
  id: string
  project_id: string
  project_name: string
  folder_path: string
  kind: 'approval' | 'revision'
  /** **제출 시점의 팀**(D9). 사람이 옮겨도 이 값은 안 바뀐다. */
  team_id: string
  round: number
  status: ApprovalStatus
  requester: string
  requester_name?: string
  approver: string
  approver_name?: string
  request_message: string
  decision_message: string
  page_count: number
  created_at: number
  updated_at: number
  decided_at: number | null
  comment_count?: number
  /** 상세에서만 온다 — 목록에 실으면 문서 전체가 응답에 딸려 나간다. */
  snapshot?: DraftStateSnapshot
  comments?: ApprovalComment[]
}

export interface StatusChip {
  approval_id: string
  status: ApprovalStatus
  round: number
  kind: 'approval' | 'revision'
  decided_at: number | null
  created_at: number
}

export class ApprovalApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message); this.status = status; this.name = 'ApprovalApiError'
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: 'same-origin' })
  checkAuth(res)
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch { /* JSON 이 아니면 무시 */ }
    throw new ApprovalApiError(res.status, detail || `요청에 실패했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export interface ApprovalListing {
  approvals: Approval[]
  counts: Record<ApprovalStatus, number>
}

export async function apiListApprovals(status?: ApprovalStatus | ''): Promise<ApprovalListing> {
  const q = status ? `?status=${status}` : ''
  return req<ApprovalListing>(q)
}

export async function apiGetApproval(aid: string): Promise<Approval> {
  const d = await req<{ approval: Approval }>(`/${aid}`)
  return d.approval
}

/** 자료 목록에 상태 칩을 붙일 때 **한 번에** 가져온다 — 건마다 되물으면 12건에 요청이 13번 나간다. */
export async function apiStatusMap(): Promise<Record<string, StatusChip>> {
  const d = await req<{ status_map: Record<string, StatusChip> }>('/status-map')
  return d.status_map || {}
}

export async function apiRequestApproval(projectId: string, message = ''): Promise<Approval> {
  const d = await req<{ ok: boolean; approval: Approval }>('/request', {
    method: 'POST', body: JSON.stringify({ project_id: projectId, message }),
  })
  return d.approval
}

export async function apiDecide(
  aid: string, action: 'approve' | 'reject', message = '',
): Promise<Approval> {
  const d = await req<{ ok: boolean; approval: Approval }>(`/${aid}/decide`, {
    method: 'POST', body: JSON.stringify({ action, message }),
  })
  return d.approval
}

export async function apiWithdraw(aid: string): Promise<Approval> {
  const d = await req<{ ok: boolean; approval: Approval }>(`/${aid}/withdraw`, { method: 'POST' })
  return d.approval
}

export async function apiAddComment(
  aid: string, body: string, pageId?: number | null, pageNo?: number | null,
): Promise<ApprovalComment> {
  const d = await req<{ ok: boolean; comment: ApprovalComment }>(`/${aid}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, page_id: pageId ?? null, page_no: pageNo ?? null }),
  })
  return d.comment
}

export async function apiDeleteComment(cid: string): Promise<void> {
  await req<{ ok: boolean }>(`/comments/${cid}`, { method: 'DELETE' })
}

// ── 화면 표시 ──
export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: '대기', approved: '승인', rejected: '반려', withdrawn: '거둠',
}
/** 상태 순서 — **대기가 먼저**다. 할 일이 맨 앞에 온다. */
export const STATUS_ORDER: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'withdrawn']
