// 결재 API 클라이언트.
// **남의 결재 건은 404 다** — 없는 것과 구분되지 않는다(서버가 일부러 그렇게 답한다).
import { checkAuth } from '../auth/session'
import type { DraftStateSnapshot } from '../persistence/draftStorage'

const API = '/api/approvals'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

/**
 * 자료의 **파생 상태** (P7). `Approvals` 최신 행 하나에서 서버가 계산해서 준다.
 *
 * **화면이 `kind` 와 `status` 를 보고 스스로 짜맞추지 않는다** — 그러면 서버와 화면이
 * 서로 다른 상태를 말하는 날이 오고, 그때 사용자에게는 「목록엔 승인됨인데 열면
 * 수정 중」으로 보인다.
 */
export type DocState =
  | 'draft' | 'pending' | 'rejected' | 'approved' | 'revision_pending' | 'revising'

/** 배지 글자. `draft`·`approved` 가 빈 이유: 목록의 기본값이라 모든 줄에 붙으면
 *  배지가 아니라 배경이 된다. 잠금은 자물쇠로 따로 보인다. */
export const DOC_STATE_LABEL: Record<DocState, string> = {
  draft: '', pending: '결재 중', rejected: '반려',
  approved: '', revision_pending: '수정 요청 중', revising: '수정 중',
}

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
  /**
   * **결재 대화는 당사자만 본다**(P6). 같은 팀 사람이 승인본을 열면 `comments` 는
   * 비어 오고 이 값이 `true` 다 — 자료는 팀의 것이지만 그 자료를 두고 오간 지적은
   * 낸 사람과 결재자 사이의 일이기 때문이다.
   * **감춘 사실 자체는 감추지 않는다** — 몇 건인지는 `comment_count` 로 온다.
   */
  comments_hidden?: boolean
}

export interface StatusChip {
  approval_id: string
  status: ApprovalStatus
  round: number
  kind: 'approval' | 'revision'
  decided_at: number | null
  created_at: number
  /** 파생 상태 — **이걸 보고 그린다.** `status` 는 결재 행 하나의 상태일 뿐이다. */
  state: DocState
  /** 지금 편집이 막혀 있는가. 서버 판정을 그대로 받는다. */
  locked: boolean
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

// ── 수정 요청 (P7 · D8) ──
/**
 * 승인된 자료를 **고치게 해 달라**고 청한다.
 * **승인본은 여기서 아무것도 안 바뀐다** — 팀은 요청이 들어와도, 허락이 나도
 * 직전 승인본을 그대로 본다. 재승인이 나야 그림이 바뀐다.
 */
export async function apiRequestRevision(projectId: string, message = ''): Promise<Approval> {
  const d = await req<{ ok: boolean; approval: Approval }>('/revision-request', {
    method: 'POST', body: JSON.stringify({ project_id: projectId, message }),
  })
  return d.approval
}

/** 수정 요청 허락 · 거절 — 관리자만. 허락해도 승인본은 그대로다. */
export async function apiDecideRevision(
  aid: string, action: 'approve' | 'reject', message = '',
): Promise<Approval> {
  const d = await req<{ ok: boolean; approval: Approval }>(`/${aid}/revision-decide`, {
    method: 'POST', body: JSON.stringify({ action, message }),
  })
  return d.approval
}

/**
 * 수정을 **그만둔다.** 고치기로 해 놓고 안 고칠 수도 있다 —
 * 이 길이 없으면 「수정 중」이 영원히 남는다.
 * **고친 내용은 안 지운다.** 승인본에 반영되지 않을 뿐이다.
 */
export async function apiEndRevision(aid: string): Promise<Approval> {
  const d = await req<{ ok: boolean; approval: Approval }>(`/${aid}/revision-end`, {
    method: 'POST',
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
  pending: '대기', approved: '승인', rejected: '반려', withdrawn: '회수',
}
/** 상태 순서 — **대기가 먼저**다. 할 일이 맨 앞에 온다. */
export const STATUS_ORDER: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'withdrawn']
