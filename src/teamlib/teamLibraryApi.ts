// 팀 공유 API 클라이언트 (P6).
//
// **여기서 받는 것은 작업본이 아니라 얼어붙은 승인본이다.** 작성자가 지금 그 자료를
// 고치고 있어도 이 화면의 그림은 안 바뀐다 — 승인은 *그때 그 문서*에 대한 승인이다.
//
// 남의 팀 승인본은 **404** 다. 없는 것과 구분되지 않는다(서버가 일부러 그렇게 답한다).
import { checkAuth } from '../auth/session'
import type { Approval, DocState } from '../approvals/approvalApi'

const API = '/api/team-library'

/** 이 팀이 나에게 무엇인가. **글자로 붙는다** — 색으로만 구분하지 않는다(표준). */
export type Relation = 'current' | 'past' | 'other'

/**
 * 팀 목록의 자료 한 줄. `Approval` 에 **파생 상태**가 얹혀 온다(P7).
 * 그림은 승인본 그대로고, 「수정 중」은 그림이 아니라 **글자**로만 나타난다(D8).
 */
export interface LibItem extends Approval {
  doc_state?: DocState
  doc_state_label?: string
}

export interface LibMonth {
  /** `YYYY-MM`. **승인 시각** 기준이다 — 9월에 내고 10월에 승인됐으면 10월이다. */
  ym: string
  items: LibItem[]
}

export interface LibAuthor {
  id: string
  name: string
  dept: string
  is_me: boolean
  count: number
  months: LibMonth[]
}

export interface LibTeam {
  id: string
  name: string
  relation: Relation
  /** 이전 팀·다른 팀 자료는 읽기 전용이다(D19). */
  readonly: boolean
  count: number
  authors: LibAuthor[]
}

export class TeamLibraryError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message); this.status = status; this.name = 'TeamLibraryError'
  }
}

async function req<T>(path = ''): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: 'same-origin' })
  checkAuth(res)
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch { /* JSON 이 아니면 무시 */ }
    throw new TeamLibraryError(res.status, detail || `불러오지 못했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export async function apiTeamLibrary(): Promise<LibTeam[]> {
  const d = await req<{ teams: LibTeam[] }>()
  return d.teams || []
}

/** 승인본 한 건 — 스냅샷째. 결재 대화는 **당사자만** 보므로 남에게는 비어 온다. */
export async function apiTeamApproval(aid: string): Promise<LibItem> {
  const d = await req<{ approval: LibItem }>(`/approval/${aid}`)
  return d.approval
}

/** 지난 승인본들. 목록에는 최신 1건만 뜨므로 여기서 거슬러 올라간다. */
export async function apiTeamHistory(projectId: string): Promise<LibItem[]> {
  const d = await req<{ history: LibItem[] }>(`/history/${projectId}`)
  return d.history || []
}
