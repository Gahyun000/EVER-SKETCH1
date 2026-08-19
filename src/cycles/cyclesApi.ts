// 회차 API 클라이언트.
import { ApiError } from '../auth/authApi'
import { checkAuth } from '../auth/session'

const API = '/api/cycles'

export type CycleStatus = 'draft' | 'writing' | 'review' | 'published' | 'closed'
export type SubmitStatus = 'draft' | 'submitted' | 'returned' | 'approved'

export interface Cycle {
  id: string
  title: string
  period_ym: string
  status: CycleStatus
  due_at: number | null
  template_id: string | null
  created_at: number
  published_at: number | null
  closed_at: number | null
}

export interface CycleProject {
  id: string
  name: string
  owner_id: string
  submit_status: SubmitStatus
  updated_at: number
  page_count: number
}

export interface CycleProgress {
  total: number
  counts: Record<SubmitStatus, number>
  submitted: number
}

export interface CycleDetail {
  cycle: Cycle
  projects: CycleProject[]
  progress?: CycleProgress      // 관리자에게만 내려온다
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
    throw new ApiError(res.status, detail || `요청에 실패했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export async function apiListCycles(): Promise<Cycle[]> {
  return (await req<{ cycles: Cycle[] }>('')).cycles || []
}

export async function apiGetCycle(id: string): Promise<CycleDetail> {
  return req<CycleDetail>(`/${id}`)
}

export async function apiCreateCycle(input: {
  period_ym: string; title?: string; due_at?: number | null
}): Promise<Cycle> {
  return (await req<{ ok: boolean; cycle: Cycle }>('', {
    method: 'POST', body: JSON.stringify(input),
  })).cycle
}

export async function apiSetCycleStatus(id: string, status: CycleStatus): Promise<Cycle> {
  return (await req<{ ok: boolean; cycle: Cycle }>(`/${id}/status`, {
    method: 'POST', body: JSON.stringify({ status }),
  })).cycle
}

export async function apiDistribute(id: string, userIds?: string[]): Promise<{
  created_count: number; skipped_count: number
  created: { project_id: string; owner_id: string; name: string }[]
}> {
  return req(`/${id}/distribute`, {
    method: 'POST', body: JSON.stringify({ user_ids: userIds || null }),
  })
}

// ── 실물 PPT 업로드 · 슬라이드별 배부 ──
export interface SlideInfo {
  index: number
  title: string
  tables: number
  texts: number
  images: number
}

export interface Deck {
  id: string
  cycle_id: string
  filename: string
  slide_count: number
  slides: SlideInfo[]
  warnings: string[]
  uploaded_at: number
}

/** 파일 업로드는 JSON 이 아니다 — Content-Type 을 브라우저가 정하게 둬야
 *  multipart 경계 문자열이 붙는다. 직접 지정하면 서버가 파싱하지 못한다. */
export async function apiUploadDeck(cycleId: string, file: File): Promise<Deck> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(`${API}/${cycleId}/deck`, {
    method: 'POST', body, credentials: 'same-origin',
  })
  checkAuth(res)
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = typeof j?.detail === 'string' ? j.detail : ''
    } catch { /* JSON 이 아니면 무시 */ }
    throw new ApiError(res.status, detail || `파일을 올리지 못했어요 (HTTP ${res.status})`)
  }
  return (await res.json()).deck as Deck
}

/** 아직 안 올렸으면 null — 404 는 오류가 아니라 '없음'이다. */
export async function apiGetDeck(cycleId: string): Promise<Deck | null> {
  try {
    return (await req<{ deck: Deck }>(`/${cycleId}/deck`)).deck
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function apiDeleteDeck(cycleId: string): Promise<void> {
  await req(`/${cycleId}/deck`, { method: 'DELETE' })
}

export async function apiDistributeSlides(cycleId: string, input: {
  assignments: { slide: number; user_id: string }[]
  common?: number[]
}): Promise<{
  created_count: number; skipped_count: number
  created: { project_id: string; owner_id: string; name: string; page_count: number }[]
}> {
  return req(`/${cycleId}/deck/distribute`, {
    method: 'POST',
    body: JSON.stringify({ assignments: input.assignments, common: input.common || null }),
  })
}

export async function apiSetSubmitStatus(pid: string, status: SubmitStatus): Promise<void> {
  await req(`/projects/${pid}/submit`, { method: 'POST', body: JSON.stringify({ status }) })
}

// ── 화면 문구 ──
export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  draft: '준비', writing: '작성', review: '검토', published: '발행', closed: '마감',
}

export const SUBMIT_LABEL: Record<SubmitStatus, string> = {
  draft: '작성중', submitted: '제출', returned: '반려', approved: '승인',
}

/** 회차 상태 전이 규칙 — 서버(cycles.py::_ALLOWED_NEXT)와 같은 표. */
export const NEXT_STATUS: Record<CycleStatus, CycleStatus[]> = {
  draft: ['writing', 'closed'],
  writing: ['review', 'draft', 'closed'],
  review: ['published', 'writing', 'closed'],
  published: ['closed', 'review'],
  closed: [],
}

/** 'YYYY-MM' → '2026년 10월' */
export function periodLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  return m ? `${m[1]}년 ${Number(m[2])}월` : ym
}

export function fmtKst(ts?: number | null): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/** 이번 달 다음 달을 기본 회차로 제안한다 — 회의 자료는 보통 다음 회차를 미리 연다. */
export function defaultPeriod(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
