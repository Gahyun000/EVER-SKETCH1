// 프로젝트(내 이북) + 버전 서버 API 클라이언트. IndexedDB를 대체하는 단일 진실 소스.
import type { DraftStateSnapshot } from './draftStorage'
import { checkAuth } from '../auth/session'

const API = '/api'

export interface ProjectMeta {
  id: string
  name: string
  created_at: number   // ms
  updated_at: number   // ms
  published_id: string | null
  page_count: number
  owner_id?: string | null
  cycle_id?: string | null
  submit_status?: string
}
/** 이 자료로 **무엇을 할 수 있는지** — 서버가 판정해서 함께 내려준다.
 *  화면이 역할과 회차 단계를 보고 다시 계산하면 규칙이 두 곳에 생기고,
 *  반드시 어긋난다(그때 사용자에게는 '눌리는데 403' 으로 보인다). */
export interface ProjectAccess {
  mine: boolean
  cycle_status: string | null
  can_write: boolean
  can_comment: boolean
}
export interface ProjectFull extends ProjectMeta {
  state: DraftStateSnapshot
  access?: ProjectAccess
}
export interface DocVersion {
  id: string
  project_id: string
  ts: number           // ms
  label?: string | null
  pinned: boolean
  auto: boolean
  page_count: number
  hash: string
}
export interface DocVersionFull extends DocVersion {
  state: DraftStateSnapshot
}

async function j<T>(res: Response): Promise<T> {
  // 401 이면 세션이 끊긴 것 — 화면을 로그인으로 되돌린다.
  // 관리자가 권한을 바꾸거나 계정을 중지하면 서버가 그 즉시 토큰을 지우므로,
  // 이 처리가 없으면 사용자는 '저장이 안 되는데 이유를 모르는' 상태가 된다.
  checkAuth(res)
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.clone().json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch {
      /* JSON 이 아니면 무시 */
    }
    if (res.status === 403) throw new Error(detail || '권한이 없습니다.')
    throw new Error(detail || 'API ' + res.status + ' ' + res.statusText)
  }
  return res.json() as Promise<T>
}

// ── 프로젝트 ──
export async function apiListProjects(): Promise<ProjectMeta[]> {
  const d = await j<{ projects: ProjectMeta[] }>(await fetch(`${API}/projects`))
  return d.projects || []
}
export async function apiCreateProject(name?: string, state?: DraftStateSnapshot): Promise<ProjectFull> {
  return j<ProjectFull>(await fetch(`${API}/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, state }),
  }))
}
export async function apiGetProject(id: string): Promise<ProjectFull> {
  return j<ProjectFull>(await fetch(`${API}/projects/${id}`))
}
export async function apiSaveProject(id: string, state: DraftStateSnapshot, name?: string): Promise<{ ok: boolean; updated_at: number; name: string }> {
  return j(await fetch(`${API}/projects/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, name }),
  }))
}
export async function apiRenameProject(id: string, name: string): Promise<{ ok: boolean }> {
  return j(await fetch(`${API}/projects/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}
export async function apiDeleteProject(id: string): Promise<{ ok: boolean }> {
  return j(await fetch(`${API}/projects/${id}`, { method: 'DELETE' }))
}
export async function apiDuplicateProject(id: string): Promise<ProjectFull> {
  return j<ProjectFull>(await fetch(`${API}/projects/${id}/duplicate`, { method: 'POST' }))
}

// ── 버전 ──
export async function apiListVersions(pid: string): Promise<DocVersion[]> {
  const d = await j<{ versions: DocVersion[] }>(await fetch(`${API}/projects/${pid}/versions`))
  return d.versions || []
}
export async function apiSaveVersion(pid: string, state: DraftStateSnapshot, opts?: { label?: string; pinned?: boolean; auto?: boolean }): Promise<DocVersion | null> {
  const d = await j<{ ok: boolean; version: DocVersion | null }>(await fetch(`${API}/projects/${pid}/versions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, label: opts?.label, pinned: !!opts?.pinned, auto: opts?.auto ?? true }),
  }))
  return d.version
}
export async function apiGetVersion(pid: string, vid: string): Promise<DocVersionFull> {
  return j<DocVersionFull>(await fetch(`${API}/projects/${pid}/versions/${vid}`))
}
export async function apiPatchVersion(pid: string, vid: string, patch: { label?: string; pinned?: boolean }): Promise<{ ok: boolean }> {
  return j(await fetch(`${API}/projects/${pid}/versions/${vid}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }))
}
export async function apiDeleteVersion(pid: string, vid: string): Promise<{ ok: boolean }> {
  return j(await fetch(`${API}/projects/${pid}/versions/${vid}`, { method: 'DELETE' }))
}
