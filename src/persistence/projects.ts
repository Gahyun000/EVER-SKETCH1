import { create } from 'zustand'
import { useBuilder, reseedUids, type BuilderState } from '../state/store'
import { snapshotFromState, type DraftStateSnapshot } from './draftStorage'
import {
  apiListProjects, apiCreateProject, apiCreateFromTemplate, apiGetProject, apiRenameProject,
  apiDeleteProject, apiDuplicateProject, type ProjectMeta, type ProjectFull, type ProjectAccess,
} from './projectApi'
import { setActiveProjectId } from './session'
import { setAutosaveHydrated, setAutosaveReadOnly, markAutosaveHydrated, useAutosave, flushSave, cancelPendingSave } from './autosave'
import { migrateLegacyDraftOnce } from './legacyMigration'
import { resetHistory } from '../canvas/history'

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
  resetHistory()                             // 이전 프로젝트의 되돌리기 스냅샷 폐기(페이지 id 가 겹친다)
  const st = fullState(p.state)
  reseedUids(st.pages || [])
  useBuilder.setState(st as Partial<BuilderState>)
  setActiveProjectId(p.id)
  // 남의 자료를 열었을 때 자동저장이 돌면 **매번 403 이 뜨고**, 사용자는
  // 자기가 뭔가 망가뜨린 줄 안다. 열자마자 저장을 잠근다.
  const acc = p.access || null
  setAutosaveReadOnly(!!acc && !acc.can_write)
  useProjects.setState({ activeId: p.id, view: 'editor', access: acc })
  useAutosave.setState({ status: 'saved', savedAt: new Date(p.updated_at || Date.now()).toISOString(), error: undefined })
  markAutosaveHydrated()                      // 이제부터 편집=저장
}

interface ProjectsState {
  view: LibView
  activeId: string | null
  /** 지금 연 자료로 무엇을 할 수 있는지(서버 판정). 없으면 예전 방식대로 전부 허용. */
  access: ProjectAccess | null
  list: ProjectMeta[]
  loading: boolean
  /** 어느 계정으로 목록을 받아 뒀는가. 계정이 바뀌면 다시 받는다. */
  bootedFor: string | null
  boot: (uid: string | null) => Promise<void>
  loadList: () => Promise<void>
  openProject: (id: string) => Promise<void>
  /** `folderId` — **지금 보고 있는 폴더**에 만든다. 만들고 나서 옮기게 하면
   *  사람은 매번 두 번 일한다(만들기 → 찾기 → 옮기기). */
  newProject: (folderId?: string | null) => Promise<void>
  newFromTemplate: (periodYm: string, folderId?: string | null) => Promise<void>
  adoptCurrentAsNewProject: () => Promise<void>
  backToLibrary: () => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<void>
}

/**
 * 계정이 바뀌거나 로그아웃할 때 작업 공간을 비운다.
 *
 * **왜 필요한가.** `App.tsx` 는 `key={uid}` 로 계정 전환을 처리한다고 적어 두었지만,
 * `useProjects`·`useBuilder` 는 모듈 단위 zustand 스토어라 컴포넌트를 다시 마운트해도
 * 그대로 살아 있다. 그래서 관리자로 보던 목록이 작성자 화면에 남고,
 * 편집 화면에서 로그아웃하면 다음 사람이 **앞사람 슬라이드에 착지한다.**
 * 제목만 새는 게 아니라 본문이 샌다.
 *
 * 서버는 멀쩡하다(작성자에게는 본인 것만 내려준다). 새는 곳은 화면이다 —
 * 권한을 아무리 잘 짜도 화면이 앞사람 것을 들고 있으면 소용이 없다.
 *
 * **일부러 건드리지 않는 것**: `legacyMigration` 의 1회 플래그.
 * 그 함수는 브라우저에 남은 옛 초안을 "라이브러리가 빈 계정"으로 옮긴다.
 * 계정이 바뀔 때마다 다시 돌면 앞사람의 초안이 다음 계정으로 복사된다 —
 * 지금 고치려는 유출과 정확히 같은 종류의 사고다.
 */
export function resetWorkspace(): void {
  cancelPendingSave()
  setAutosaveHydrated(false)
  setAutosaveReadOnly(false)
  resetHistory()
  setActiveProjectId(null)
  useBuilder.setState(emptySnapshot() as Partial<BuilderState>)
  useAutosave.setState({ status: 'idle', savedAt: undefined, error: undefined })
  useProjects.setState({
    view: 'library', activeId: null, access: null, list: [], loading: false, bootedFor: null,
  })
}

export const useProjects = create<ProjectsState>((set, get) => ({
  view: 'library',
  activeId: null,
  access: null,
  list: [],
  loading: false,
  bootedFor: null,

  boot: async (uid) => {
    // 계정이 같으면 이미 받아 둔 목록을 그대로 쓴다.
    if (get().bootedFor === uid) return
    // 계정이 바뀌었다(또는 처음이다). **앞사람 것을 먼저 비운다.**
    // 스토어가 모듈 단위라 화면을 다시 그려도 저절로 사라지지 않는다.
    resetWorkspace()
    set({ bootedFor: uid, loading: true })
    try { await migrateLegacyDraftOnce() } catch { /* noop */ }
    // loadList 가 어떤 이유로든 던져도 라이브러리 화면은 반드시 띄운다.
    // (여기서 멈추면 booted=true 라 재시도도 안 되고 로딩 화면에 영원히 갇힌다)
    try { await get().loadList() } finally { set({ view: 'library', loading: false }) }
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

  newProject: async (folderId) => {
    try { await flushSave() } catch { /* noop */ }
    set({ loading: true })
    try {
      const p = await apiCreateProject('제목 없음', emptySnapshot(), folderId)
      applyProject(p)
      // 새 이북은 빈 슬라이드 한 장으로 시작(구글 슬라이드식). 추가가 자동저장을 유발한다.
      useBuilder.getState().addCard('slide')
      await get().loadList()
    } finally {
      set({ loading: false })
    }
  },

  // 표준 양식으로 시작. 빈 슬라이드와 달리 `addCard` 를 부르지 않는다 —
  // 서버가 이미 한 장을 채워 보냈고, 여기서 한 장을 더 붙이면 '1인 1장'이 깨진다.
  newFromTemplate: async (periodYm, folderId) => {
    try { await flushSave() } catch { /* noop */ }
    set({ loading: true })
    try {
      const p = await apiCreateFromTemplate(periodYm, folderId)
      applyProject(p)
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
    try {
      const snap = snapshotFromState(useBuilder.getState())
      const p = await apiCreateProject(snap.title || '가져온 이북', snap)
      setActiveProjectId(p.id)
      setAutosaveReadOnly(false)              // 내가 만든 것이니 잠금 해제
      useProjects.setState({ activeId: p.id, view: 'editor', access: null })
      useAutosave.setState({ status: 'saved', savedAt: new Date(p.updated_at || Date.now()).toISOString(), error: undefined })
      await get().loadList()
    } catch (e) {
      // 실패해도 게이트는 반드시 되돌린다. 안 그러면 이후 모든 편집이 조용히 저장되지 않는데
      // 배지는 '저장됨'으로 남아 사용자가 작업을 통째로 잃는다.
      useAutosave.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      throw e
    } finally {
      markAutosaveHydrated()
    }
  },

  backToLibrary: async () => {
    try { await flushSave() } catch { /* noop */ }
    setAutosaveHydrated(false)
    setAutosaveReadOnly(false)
    setActiveProjectId(null)
    set({ activeId: null, view: 'library', access: null })
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
