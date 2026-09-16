import { create } from 'zustand'
import { lastOrientation } from './prefs'
import { stripSlotConns, unlockLegacySlots } from '../template/legacyUnlock'
import { useBuilder, reseedUids, resetFitUndo, type BuilderState } from '../state/store'
import { snapshotFromState, fullPages, fullSelected, type DraftStateSnapshot } from './draftStorage'
import {
  apiListProjects, apiCreateProject, apiCreateFromTemplate, apiGetProject, apiRenameProject,
  apiDeleteProject, apiDuplicateProject, type ProjectMeta, type ProjectFull, type ProjectAccess,
} from './projectApi'
import { apiListFolders, type Folder as FolderRow } from './folderApi'
import { setActiveProjectId } from './session'
import { setAutosaveHydrated, setAutosaveReadOnly, markAutosaveHydrated, useAutosave, flushSave, cancelPendingSave } from './autosave'
import { migrateLegacyDraftOnce } from './legacyMigration'
import { loadErrorText } from './loadError'
import { resetHistory } from '../canvas/history'

/** 화면 이름. 둘에서 여섯으로 늘었다 — 결재함·팀 공유·팀 관리·환경 설정이
 *  **덮개에서 화면으로** 올라왔다(셸, 2026-09-10). 덮개는 뒤로 가기도 새로고침도
 *  안 통했고, 편집 중에는 아예 갈 수가 없었다. */
export type LibView = 'library' | 'editor' | 'inbox' | 'team' | 'users' | 'admin' | 'settings'

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
  // 쪽 안의 빠진 칸(els·conns·strokes)까지 메운다 — 하나만 없어도 화면이 하얘진다.
  const pages = fullPages(s.pages)
  return {
    ...base, ...s,
    pages,
    // 고른 쪽이 없거나 지워진 쪽을 가리키면 첫 쪽으로. 안 메우면 **쪽은 있는데
    // 무대만 「카드를 추가하세요」로 빈다** — 필름에는 보이는데 가운데만.
    selectedPageId: fullSelected(pages, s.selectedPageId),
  } as DraftStateSnapshot
}

function applyProject(p: ProjectFull): void {
  setAutosaveHydrated(false)                 // 로드 중 오저장 방지
  resetHistory()                             // 이전 프로젝트의 되돌리기 스냅샷 폐기(페이지 id 가 겹친다)
  resetFitUndo()                             // 같은 이유 — 방향 전환·표 이어적기 되돌리기도 앞 자료의 쪽을 들고 있다
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
  /** 폴더를 못 읽었으면 그 까닭. **비어 있는 것과 못 읽은 것은 다르다** —
   *  나무는 오류를 삼키므로(부가 정보라서), 삼킨 사실만은 남겨야 화면이 말할 수 있다. */
  foldersError: string | null
  /** 어느 계정으로 목록을 받아 뒀는가. 계정이 바뀌면 다시 받는다. */
  bootedFor: string | null

  // ── 폴더 (2026-09-15) ────────────────────────────────
  //
  // **여기로 올라왔다.** 지금까지 폴더와 「지금 어느 폴더에 있는가」는 `LibraryScreen`
  // 안의 `useState` 였다. 그래서 편집에 들어갔다 나오면 그 화면이 통째로 내려갔다
  // 다시 태어나고, `here` 가 `null` 로 돌아가 **늘 「전체」에 떨어졌다.**
  // 깊은 폴더에서 일하던 사람은 자료 하나 고칠 때마다 폴더를 다시 찾아 들어가야 했다.
  //
  // 화면에 두었던 이유는 **계정이 바뀌면 지워지게** 하려는 것이었다(`key={uid}`).
  // 그 일은 `boot()` 이 대신한다 — 아래에서 계정이 바뀌면 여기 셋을 비운다.
  // 스토어에 두면 셸의 사이드바에서도 같은 값을 본다(편집 중에도 왼쪽에 폴더가 보인다).
  folders: FolderRow[]
  /** 지금 서 있는 폴더. `null` 이면 뿌리(전체). */
  here: string | null
  /** 폴더를 몇 단까지 만들 수 있는지(서버가 정한다). */
  maxDepth: number
  setHere: (id: string | null) => void
  /** 폴더 나무를 통째로 받아 온다. **실패하면 던진다** — 부르는 쪽이 사람에게
   *  무슨 말을 할지 정한다(목록 화면은 빨간 줄, 사이드바는 조용히 지나간다). */
  loadFolders: () => Promise<void>
  /** 화면을 옮긴다. **자료를 여는 것과 다르다** — 여는 것은 `open()` 이 하고,
   *  이건 셸의 왼쪽 메뉴와 주소가 쓴다. 편집으로는 여기로 못 간다:
   *  편집은 「어느 자료냐」가 있어야 뜻이 생기므로 반드시 `open()` 을 거친다. */
  setView: (v: Exclude<LibView, 'editor'>) => void
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
  resetFitUndo()                             // 새 문서에도 앞 자료의 쪽이 남으면 안 된다
  useBuilder.setState(newDocSnapshot() as Partial<BuilderState>)
  useAutosave.setState({ status: 'idle', savedAt: undefined, error: undefined })
  useProjects.setState({
    view: 'library', activeId: null, access: null, template: null, list: [], loading: false,
    listError: null, foldersError: null, bootedFor: null,
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
  foldersError: null,
  bootedFor: null,

  folders: [],
  here: null,
  maxDepth: 3,

  setView: (v) => set({ view: v }),
  setHere: (id) => set({ here: id }),

  loadFolders: async () => {
    // 나무를 **한 번에** 받는다 — 검색 범위(D27)를 셈하려면 하위가 필요하고,
    // 한 단씩 물으면 폴더를 오갈 때마다 요청이 줄줄이 나간다.
    //
    // **시간 제한이 여기 안에 있다**(2026-09-16). 부르는 데가 셋이라(나무·자료 목록·
    // boot) 바깥에 두면 한 곳만 빠뜨려도 그 길만 영영 기다린다.
    //
    // 왜 필요했나 — 첫 요청의 **몸이 안 와서** 두 번째 줄로 못 가는 일이 실제로 났다
    // (서버가 터미널 때문에 멈춰 있었다). 그러면 아래 `set` 까지 못 오고, boot 이
    // 이미 폴더를 비워 둔 참이라 **폴더가 아무 말 없이 사라졌다.**
    try {
      const all = await withTimeout(apiListFolders(null), BOOT_STEP_MS)
      const every = await withTimeout(
        fetch('/api/folders?all=true', { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null)), BOOT_STEP_MS,
      ).catch(() => null)
      // **배열이 아니면 안 넣는다.** `undefined` 가 들어가면 다음 렌더에서 `folders.filter`
      // 가 터지고 **자료 목록이 통째로 하얗게 뜬다** — 폴더 하나 못 읽었다고 화면 전체를
      // 잃는 것은 값이 안 맞는 교환이다.
      const rows = Array.isArray(every?.folders) ? (every.folders as FolderRow[]) : all.folders
      set({
        folders: Array.isArray(rows) ? rows : [],
        maxDepth: all.max_depth ?? 3,
        foldersError: null,
      })
    } catch (e) {
      // **삼키더라도 흔적은 남긴다.** 부르는 쪽(나무)이 오류를 삼키는 것은 옳다 —
      // 폴더를 못 읽었다고 자료 목록까지 못 보게 할 이유가 없다. 다만 삼킨 사실까지
      // 없어지면 **폴더가 왜 사라졌는지 아무도 모른다.** 실제로 그래서 못 찾았다.
      set({ foldersError: loadErrorText(e, '폴더') })
      throw e
    }
  },

  boot: async (uid) => {
    // 계정이 같으면 이미 받아 둔 목록을 그대로 쓴다.
    if (get().bootedFor === uid) return
    // 계정이 바뀌었다(또는 처음이다). **앞사람 것을 먼저 비운다.**
    // 스토어가 모듈 단위라 화면을 다시 그려도 저절로 사라지지 않는다.
    resetWorkspace()
    // **폴더도 같이 비운다.** 화면이 들고 있던 때에는 `key={uid}` 가 해 주던 일이다.
    // 안 비우면 앞사람의 폴더 이름이 사이드바에 남고, `here` 가 남의 폴더를 가리킨다.
    set({ bootedFor: uid, loading: true, folders: [], here: null, maxDepth: 3 })
    // **이 두 줄이 같은 보호 안에 있어야 한다.** 예전에는 이관이 try/finally 바깥에 있었고,
    // 그래서 이관이 *던지지 않고 그냥 안 끝나면*(응답 없는 요청, 막힌 IndexedDB 등)
    // 로딩 화면에 영원히 갇혔다 — `bootedFor` 가 이미 찍혀 있어 다시 시도되지도 않았다.
    // catch 는 던지는 것만 잡는다. **안 끝나는 것은 시간으로 끊어야 한다.**
    try {
      // **셋을 나란히 돌린다**(2026-09-16). 전에는 이관이 끝나야 목록을 받기 시작했다 —
      // 둘 다 굼뜨면 8초 + 8초, 「불러오는 중」이 **16초**까지 갔다. 이관은 목록과
      // 아무 상관이 없는 부가 작업인데 목록을 붙잡고 있었다. 나란히 두면 최악이 8초다.
      //
      // **폴더도 여기서 받는다.** 비우는 것은 바로 위 `set` 이 하는데, 다시 채우는 일은
      // 화면(나무)에 맡겨 두고 있었다. 비우는 쪽과 채우는 쪽이 갈라져 있으면 채우는
      // 쪽이 한 번 못 오는 순간 **폴더가 빈 채로 남는다** — 실제로 그렇게 사라졌다.
      // 비운 사람이 도로 채운다.
      // **곁다리는 기다리지 않는다.** 「불러오는 중…」은 **자료 목록**의 말이다.
      // 이관이나 폴더가 굼뜨다고 목록이 8초를 더 서 있을 이유가 없다 — 실제로 폴더
      // 요청 하나가 늦어 목록이 8.5초 갇히는 것을 살아 있는 서버에서 봤다.
      // 둘 다 제 안에 시간 제한이 있고 제 자리에서 제 오류를 말하므로, 여기서
      // 붙들고 있을 까닭이 없다.
      void Promise.all([
        // 레거시 이관은 **부가 작업**이다. 늦으면 그냥 지나간다 — 다음 실행에서 다시 판단한다.
        withTimeout(migrateLegacyDraftOnce(), BOOT_STEP_MS).catch(() => null),
        // 폴더를 못 읽어도 **자료 목록은 뜬다.** 까닭은 `loadFolders` 가 남겨 둔다.
        get().loadFolders().catch(() => null),
      ])
      // 목록만 기다린다. 실패는 화면에 말한다 — 이 화면의 주인공이다.
      await withTimeout(get().loadList(), BOOT_STEP_MS)
        .catch((e) => { set({ listError: loadErrorText(e, '목록') }) })
    } catch (e) {
      // 위에서 저마다 받아 내므로 여기까지 오는 것은 뜻밖의 것뿐이다. 그래도 갈래를
      // 따져서 적는다 — 「여기 오는 건 늘 시간 초과」라고 못박아 두면 나중에 이 안에
      // 다른 것이 들어왔을 때 조용히 거짓말을 한다.
      set({ listError: loadErrorText(e, '목록') })
    } finally {
      // **편집 화면에서만 내려온다.** 예전에는 무조건 'library' 로 되돌렸는데,
      // 셸이 들어오면서 그게 주소를 이겼다 — `/inbox` 로 들어와도 목록을 받고 나면
      // 「내 자료」로 튕겼다(주소는 /inbox 인데 화면은 내 자료였다).
      // 여기가 하려던 일은 「앞사람 것을 비웠으니 편집에 남아 있지 말자」이지,
      // 「어느 화면이든 내 자료로 보내자」가 아니다.
      set((st) => ({ view: st.view === 'editor' ? 'library' : st.view, loading: false }))
    }
  },

  loadList: async () => {
    try {
      const list = await apiListProjects()
      set({ list, listError: null })
    } catch (e) {
      // **0개와 「못 받아 왔다」는 다른 말이다.** 조용히 빈 목록으로 두면
      // 사람은 자료가 사라진 줄 알고, 다시 시도할 방법도 모른다.
      //
      // **「못 받아 왔다」도 한 가지가 아니다**(2026-09-16). 서버가 거절한 것과
      // 서버에 닿지도 못한 것은 사람이 할 일이 다르다 — 한 문장으로 뭉쳐 두었더니
      // 실제로 일이 났을 때 화면만 보고는 어느 쪽인지 알 수 없어 서버 로그를
      // 뒤져야 했다(사용자가 그 화면과 로그를 함께 보내 줬다).
      set({ list: [], listError: loadErrorText(e, '목록') })
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
