import { create } from 'zustand'
import { useBuilder, reseedUids, type BuilderState } from '../state/store'
import { snapshotFromState, type DraftStateSnapshot } from './draftStorage'
import {
  apiListProjects, apiCreateProject, apiGetProject, apiRenameProject,
  apiDeleteProject, apiDuplicateProject, type ProjectMeta, type ProjectFull,
} from './projectApi'
import { setActiveProjectId } from './session'
import { setAutosaveHydrated, markAutosaveHydrated, useAutosave, flushSave, cancelPendingSave } from './autosave'
import { migrateLegacyDraftOnce } from './legacyMigration'

export type LibView = 'library' | 'editor'

function emptySnapshot(): DraftStateSnapshot {
  return { title: '제목 없음', orientation: 'portrait', theme: 'light', font: 'auto', size: 'm', selectedPageId: null, pages: [] }
}

// 저장된(부분적일 수 있는) state 를 완전한 스냅샷으로 보정.
function fullState(st?: Partial<DraftStateSnapshot> | null): DraftStateSnapshot {
  const base = emptySnapshot()
  const s = st || {}
  return {
    ...base, ...s,
    pages: Array.isArray(s.pages) ? s.pages : [],
  } as DraftStateSnapshot
}

function applyProject(p: ProjectFull): void {
  setAutosaveHydrated(false)                 // 로드 중 오저장 방지
  const st = fullState(p.state)
  reseedUids(st.pages || [])
  useBuilder.setState(st as Partial<BuilderState>)
  setActiveProjectId(p.id)
  useProjects.setState({ activeId: p.id, view: 'editor' })
  useAutosave.setState({ status: 'saved', savedAt: new Date(p.updated_at || Date.now()).toISOString(), error: undefined })
  markAutosaveHydrated()                      // 이제부터 편집=저장
}

interface ProjectsState {
  view: LibView
  activeId: string | null
  list: ProjectMeta[]
  loading: boolean
  booted: boolean
  boot: () => Promise<void>
  loadList: () => Promise<void>
  openProject: (id: string) => Promise<void>
  newProject: () => Promise<void>
  adoptCurrentAsNewProject: () => Promise<void>
  backToLibrary: () => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<void>
}

export const useProjects = create<ProjectsState>((set, get) => ({
  view: 'library',
  activeId: null,
  list: [],
  loading: false,
  booted: false,

  boot: async () => {
    if (get().booted) return
    set({ booted: true, loading: true })
    try { await migrateLegacyDraftOnce() } catch { /* noop */ }
    await get().loadList()
    set({ view: 'library', loading: false })
  },

  loadList: async () => {
    try {
      const list = await apiListProjects()
      set({ list })
    } catch { set({ list: [] }) }
  },

  openProject: async (id) => {
    try { await flushSave() } catch { /* noop */ }
    set({ loading: true })
    try {
      const p = await apiGetProject(id)
      applyProject(p)
    } finally {
      set({ loading: false })
    }
  },

  newProject: async () => {
    try { await flushSave() } catch { /* noop */ }
    set({ loading: true })
    try {
      const p = await apiCreateProject('제목 없음', emptySnapshot())
      applyProject(p)
      // 새 이북은 빈 슬라이드 한 장으로 시작(구글 슬라이드식). 추가가 자동저장을 유발한다.
      useBuilder.getState().addCard('slide')
      await get().loadList()
    } finally {
      set({ loading: false })
    }
  },

  // 지금 캔버스 내용(예: 방금 가져온 HTML)을 '새 이북'으로 라이브러리에 추가하고 그걸로 전환.
  // 현재 이북은 덮어쓰지 않는다(대기 중 자동저장 취소 후 새 id로 전환).
  adoptCurrentAsNewProject: async () => {
    cancelPendingSave()
    setAutosaveHydrated(false)
    const snap = snapshotFromState(useBuilder.getState())
    const p = await apiCreateProject(snap.title || '가져온 이북', snap)
    setActiveProjectId(p.id)
    useProjects.setState({ activeId: p.id, view: 'editor' })
    useAutosave.setState({ status: 'saved', savedAt: new Date(p.updated_at || Date.now()).toISOString(), error: undefined })
    markAutosaveHydrated()
    await get().loadList()
  },

  backToLibrary: async () => {
    try { await flushSave() } catch { /* noop */ }
    setAutosaveHydrated(false)
    setActiveProjectId(null)
    set({ activeId: null, view: 'library' })
    await get().loadList()
  },

  renameProject: async (id, name) => {
    await apiRenameProject(id, name)
    if (get().activeId === id) useBuilder.getState().setTitle(name)   // 열려 있으면 편집 화면 제목도 갱신
    await get().loadList()
  },

  deleteProject: async (id) => {
    await apiDeleteProject(id)
    if (get().activeId === id) {
      setActiveProjectId(null)
      setAutosaveHydrated(false)
      set({ activeId: null, view: 'library' })
    }
    await get().loadList()
  },

  duplicateProject: async (id) => {
    await apiDuplicateProject(id)
    await get().loadList()
  },
}))
