// 개인 폴더 API 클라이언트.
// **남의 폴더는 404 다** — 없는 것과 구분되지 않는다(서버가 일부러 그렇게 답한다).
import { checkAuth } from '../auth/session'
import type { Crumb } from './folderNav'

const API = '/api/folders'

export interface Folder {
  id: string
  name: string
  parent_id: string | null
  owner_id: string
  created_at: number
  updated_at: number
  /** 들어가 보지 않고도 빈 폴더인지 알 수 있게 서버가 세어 준다. */
  folder_count: number
  project_count: number
}

export class FolderApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message); this.status = status; this.name = 'FolderApiError'
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
    throw new FolderApiError(res.status, detail || `요청에 실패했어요 (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export interface FolderListing {
  folders: Folder[]
  /** 루트→현재 폴더 경로. 루트 자신은 들어 있지 않다. */
  path: Crumb[]
  /** 서버가 정한 최대 깊이 — 화면이 숫자를 따로 들고 있지 않게(D24). */
  max_depth: number
}

export async function apiListFolders(parent?: string | null): Promise<FolderListing> {
  const q = parent ? `?parent=${encodeURIComponent(parent)}` : ''
  return req<FolderListing>(q)
}

export async function apiCreateFolder(name: string, parentId?: string | null): Promise<Folder> {
  const d = await req<{ ok: boolean; folder: Folder }>('', {
    method: 'POST', body: JSON.stringify({ name, parent_id: parentId || null }),
  })
  return d.folder
}

export async function apiRenameFolder(fid: string, name: string): Promise<Folder> {
  const d = await req<{ ok: boolean; folder: Folder }>(`/${fid}`, {
    method: 'PATCH', body: JSON.stringify({ name }),
  })
  return d.folder
}

export async function apiMoveFolder(fid: string, parentId: string | null): Promise<Folder> {
  const d = await req<{ ok: boolean; folder: Folder }>(`/${fid}/move`, {
    method: 'POST', body: JSON.stringify({ parent_id: parentId }),
  })
  return d.folder
}

export async function apiDeleteFolder(fid: string): Promise<void> {
  await req<{ ok: boolean }>(`/${fid}`, { method: 'DELETE' })
}

export type { Crumb }
