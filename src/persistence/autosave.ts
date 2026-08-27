import { create } from 'zustand'
import { snapshotFromState } from './draftStorage'
import { useBuilder } from '../state/store'
import { apiSaveProject } from './projectApi'
import { getActiveProjectId } from './session'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface AutosaveState {
  status: SaveStatus
  error?: string
  savedAt?: string
  setStatus: (status: SaveStatus, patch?: Partial<AutosaveState>) => void
  saveNow: () => Promise<boolean>   // 성공 여부. 호출부가 실패를 구분할 수 있어야 한다
}

let timer: number | null = null
let installed = false
let hydrated = false

function scheduleSave(delay = 800) {
  if (!hydrated) return                 // 프로젝트 로드 중(setState)엔 저장 안 함
  if (!getActiveProjectId()) return     // 편집 중인 프로젝트가 없으면 저장 대상 없음
  useAutosave.setState({ status: 'dirty', error: undefined })
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => { void useAutosave.getState().saveNow() }, delay)
}

export const useAutosave = create<AutosaveState>((set) => ({
  status: 'idle',
  setStatus: (status, patch) => set({ ...patch, status }),
  saveNow: async () => {
    const pid = getActiveProjectId()
    if (!pid) { set({ status: 'idle', error: undefined }); return false }
    set({ status: 'saving', error: undefined })
    try {
      const snap = snapshotFromState(useBuilder.getState())
      const r = await apiSaveProject(pid, snap, snap.title)   // 카드 이름 = 문서 제목(자동 동기화)
      const savedAt = new Date(r.updated_at || Date.now()).toISOString()
      set({ status: 'saved', savedAt, error: undefined })
      return true
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      return false
    }
  },
}))

export function installAutosave() {
  if (installed || typeof window === 'undefined') return
  installed = true
  useBuilder.subscribe((s, prev) => {
    if (
      s.title !== prev.title ||
      s.orientation !== prev.orientation ||
      s.theme !== prev.theme ||
      s.font !== prev.font ||
      s.size !== prev.size ||
      s.selectedPageId !== prev.selectedPageId ||
      s.pages !== prev.pages
    ) scheduleSave()
  })
}

// 프로젝트 로드 전/후로 자동저장 게이트를 여닫는다(로드 중 setState 로 인한 오저장 방지).
export function setAutosaveHydrated(v: boolean) { hydrated = v }
export function markAutosaveHydrated() { hydrated = true }

export function hasUnsavedChanges() {
  const st = useAutosave.getState().status
  return st === 'dirty' || st === 'saving' || st === 'error'
}

// 라이브러리로 나가기 전 등, 대기 중 변경을 즉시 서버에 밀어넣는다.
export function cancelPendingSave() { if (timer !== null) { window.clearTimeout(timer); timer = null } }

export async function flushSave() {
  if (getActiveProjectId()) await useAutosave.getState().saveNow()
}
