import { create } from 'zustand'
import { lastOrientation } from './prefs'
import { stripSlotConns, unlockLegacySlots } from '../template/legacyUnlock'
import { useBuilder, reseedUids, type BuilderState } from '../state/store'
import { snapshotFromState, fullPages, type DraftStateSnapshot } from './draftStorage'
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

/** **새로 만드는** 문서의 빈 스냅샷. 방향만 마지막에 고른 것을 따른다.
 *
 *  `emptySnapshot()` 과 갈라 놓은 이유가 있다. 저것은 **이미 저장된 문서**의 빠진
 *  칸을 메우는 바탕이기도 하다. 거기까지 손버릇을 섞으면, 방향이 안 적힌 옛 문서가
 *  **열 때마다 다른 방향으로 보인다** — 사람이 바꾼 적도 없는데. 기본값을 바꾸는
 *  변경은 어디까지 적용되는지가 절반이다(오늘 표준 양식에서 한 번 놓쳤다). */
function newDocSnapshot(): DraftStateSnapshot {
  return { ...emptySnapshot(), orientation: lastOrientation() }
}

// 저장된(부분적일 수 있는) state 를 완전한 스냅샷으로 보정.
function fullState(st?: Partial<DraftStateSnapshot> | null): DraftStateSnapshot {
  const base = emptySnapshot()
  const s = st || {}
  return {
    ...base, ...s,
    // 쪽 안의 빠진 칸(els·conns·strokes)까지 메운다 — 하나만 없어도 화면이 하얘진다.
    pages: fullPages(s.pages),
  } as DraftStateSnapshot
}

function applyProject(p: ProjectFull): void {
  setAutosaveHydrated(false)                 // 로드 중 오저장 방지
  resetHistory()                             // 이전 프로젝트의 되돌리기 스냅샷 폐기(페이지 id 가 겹친다)
  const st = fullState(p.state)
  reseedUids(st.pages || [])
  // 2026-09-07 이전에 만든 표준 양식은 슬롯 요소마다 `locked: true` 가 저장돼 있다.
  // 그 기본값을 뺀 것은 앞으로 만들 자료에만 적용되므로, 이미 나간 자료는 열 때 푼다 —
  // 안 그러면 「크기 조절이 되게 했다」는데 예전 자료에서는 손잡이가 안 나온다.
  unlockLegacySlots(st.pages)
  // 잠금을 풀면서 표에 연결점이 생겼고, 그 사이 그어진 선이 자료에 남아 있을 수 있다.
  // 선은 결재 스냅샷에 그대로 들어간다 — 그은 사람은 그은 줄도 모르는데.
  stripSlotConns(st.pages)
  useBuilder.setState(st as Partial<BuilderState>)
  setActiveProjectId(p.id)
  // 남의 자료를 열었을 때 자동저장이 돌면 **매번 403 이 뜨고**, 사용자는
  // 자기가 뭔가 망가뜨린 줄 안다. 열자마자 저장을 잠근다.
  const acc = p.access || null
  setAutosaveReadOnly(!!acc && !acc.can_write)
  // 표준 양식인지는 **서버가 심어 둔 표시**로 안다(요소 모양으로 짐작하지 않는다).
  // 연결 도구를 감출지 여기서 갈린다.
  useProjects.setState({ activeId: p.id, view: 'editor', access: acc,
                         template: p.template || null })
  useAutosave.setState({ status: 'saved', savedAt: new Date(p.updated_at || Date.now()).toISOString(), error: undefined })
  markAutosaveHydrated()                      // 이제부터 편집=저장
}

interface ProjectsState {
  view: LibView
  activeId: string | null
  /** 지금 연 자료로 무엇을 할 수 있는지(서버 판정). 없으면 예전 방식대로 전부 허용. */
  access: ProjectAccess | null
  /** 지금 연 자료가 표준 양식이면 그 판 번호("v2.0"), 자유 이북이면 null.
   *  **서버가 심어 둔 표시**다 — 요소 모양으로 짐작하지 않는다. */
  template: string | null
  list: ProjectMeta[]
  loading: boolean
  /** 목록을 못 받아 왔다. **조용히 0개로 두지 않는다** — 사람은 자료가 사라진 줄 안다. */
  listError: string | null
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
  useBuilder.setState(newDocSnapshot() as Partial<BuilderState>)
  useAutosave.setState({ status: 'idle', savedAt: undefined, error: undefined })
  useProjects.setState({
    view: 'library', activeId: null, access: null, template: null, list: [], loading: false,
    listError: null, bootedFor: null,
  })
}

/** 기동 한 단계가 이만큼 안 끝나면 그냥 지나간다. 화면이 먼저다. */
export const BOOT_STEP_MS = 8000

/**
 * 약속이 제때 안 끝나면 **끊는다.**
 *
 * `try/catch` 는 *던지는* 것만 잡는다. 응답이 영영 안 오는 요청이나 막힌 IndexedDB 는
 * 던지지 않고 그냥 안 끝나고, 그걸 `await` 하면 그 자리에서 멈춘다 —
 * 화면에는 「불러오는 중…」만 남고 오류는 어디에도 안 찍힌다(그래서 명령창도 조용하다).
 *
 * 원래 약속을 취소하지는 않는다(fetch 는 계속 간다). 여기서 하는 일은
 * **기다리기를 그만두는 것**뿐이다.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const t = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('시간 초과 (' + ms + 'ms)'))
    }, ms)
    p.then(
      (v) => { if (settled) return; settled = true; clearTimeout(t); resolve(v) },
      (e) => { if (settled) return; settled = true; clearTimeout(t); reject(e) },
    )
  })
}

export const useProjects = create<ProjectsState>((set, get) => ({
  view: 'library',
  activeId: null,
  access: null,
  template: null,
  list: [],
  loading: false,
  listError: null,
  bootedFor: null,

  boot: async (uid) => {
    // 계정이 같으면 이미 받아 둔 목록을 그대로 쓴다.
    if (get().bootedFor === uid) return
    // 계정이 바뀌었다(또는 처음이다). **앞사람 것을 먼저 비운다.**
    // 스토어가 모듈 단위라 화면을 다시 그려도 저절로 사라지지 않는다.
    resetWorkspace()
    set({ bootedFor: uid, loading: true })
    // **이 두 줄이 같은 보호 안에 있어야 한다.** 예전에는 이관이 try/finally 바깥에 있었고,
    // 그래서 이관이 *던지지 않고 그냥 안 끝나면*(응답 없는 요청, 막힌 IndexedDB 등)
    // 로딩 화면에 영원히 갇혔다 — `bootedFor` 가 이미 찍혀 있어 다시 시도되지도 않았다.
    // catch 는 던지는 것만 잡는다. **안 끝나는 것은 시간으로 끊어야 한다.**
    try {
      // 레거시 이관은 **부가 작업**이다. 늦으면 그냥 지나간다 — 다음 실행에서 다시 판단한다.
      try { await withTimeout(migrateLegacyDraftOnce(), BOOT_STEP_MS) } catch { /* noop */ }
      await withTimeout(get().loadList(), BOOT_STEP_MS)
    } catch {
      set({ listError: '목록을 불러오지 못했어요.' })
    } finally {
      set({ view: 'library', loading: false })
    }
  },

  loadList: async () => {
    try {
      const list = await apiListProjects()
      set({ list, listError: null })
    } catch {
      // **0개와 「못 받아 왔다」는 다른 말이다.** 조용히 빈 목록으로 두면
      // 사람은 자료가 사라진 줄 알고, 다시 시도할 방법도 모른다.
      set({ list: [], listError: '목록을 불러오지 못했어요.' })
    }
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
      const p = await apiCreateProject('제목 없음', newDocSnapshot(), folderId)
      applyProject(p)
      // 새 이북은 빈 슬라이드 한 장으로 시작(구글 슬라이드식). 추가가 자동저장을 유발한다.
      useBuilder.getState().addCard('slide')
      await get().loadList()
    } finally {
      set({ loading: false })
    }
  },

  // 표준 양식으로 시작. 빈 슬라이드와 달리 `addCard` 를 부르지 않는다 —
  // **서버가 이미 다 채워 보냈다.** 여기서 한 장을 더 붙이면 빈 장이 결재에 올라간다.
  //
  // 예전 주석은 「한 장을 더 붙이면 '1인 1장'이 깨진다」였다. 그 계약은
  // 2026-09-07 에 **「1인 1세트」**로 바뀌었다 — 지켜야 하는 것은 쪽수가 아니라
  // SLOT-A/B/C 가 한 벌 있는 것이고, 쪽은 내용이 많은 사람이 늘려 써도 된다
  // (AGENTS.md · server/template_guard.py). 그래서 여기서 안 부르는 이유도
  // 계약이 아니라 **필요가 없어서**로 바뀌었다.
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
    set({ activeId: null, view: 'library', access: null, template: null })
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
      set({ activeId: null, view: 'library', template: null })
    }
    await get().loadList()
  },

  duplicateProject: async (id) => {
    await apiDuplicateProject(id)
    await get().loadList()
  },

}))
