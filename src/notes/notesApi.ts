import { API_BASE } from '../chat/config'
import { checkAuth } from '../auth/session'
import type { Block } from '../state/store'

export interface Note {
  id: string
  title: string
  blocks: Block[]
  pinned: boolean
  sort: number
  updatedAt?: number
  createdAt?: number
}

export async function listNotes(projectId: string): Promise<Note[]> {
  try {
    const r = await fetch(`${API_BASE}/notes?project_id=${encodeURIComponent(projectId)}`)
    checkAuth(r)
    if (!r.ok) return []   // 403(권한 없음)도 빈 목록으로 — L1 에게는 메모의 존재 자체를 감춘다
    const d = await r.json()
    return (d.notes || []) as Note[]
  } catch { return [] }
}

export async function saveNote(projectId: string, n: Note): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, id: n.id, title: n.title, blocks: n.blocks, pinned: n.pinned, sort: n.sort }),
    })
    checkAuth(r)
  } catch { /* best-effort */ }
}

export async function deleteNoteApi(id: string): Promise<void> {
  try { checkAuth(await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' })) } catch { /* noop */ }
}
