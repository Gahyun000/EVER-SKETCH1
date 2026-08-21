import { create } from 'zustand'
import { apiAddComment, apiDeleteComment, apiListComments, apiResolveComment, apiSetFixed, type Thread } from './commentsApi'

/**
 * 앵커 메모 상태.
 *
 * 캔버스(핀)와 오른쪽 목록이 **같은 데이터를 봐야** 한다. 각자 따로 불러오면
 * 한쪽에서 해결했는데 다른 쪽에는 그대로 남는다 — 사용자는 무엇이 참인지 모른다.
 */
interface CommentsState {
  projectId: string | null
  threads: Thread[]
  loading: boolean
  error: string
  open: boolean            // 오른쪽 목록이 열려 있는가
  focusId: string | null   // 방금 고른 스레드
  showResolved: boolean

  load: (pid: string) => Promise<void>
  setOpen: (v: boolean) => void
  focus: (id: string | null) => void
  setShowResolved: (v: boolean) => void
  add: (input: { body: string; page_id: number; el_id?: number | null; cell?: string | null; reply_to?: string }) => Promise<void>
  resolve: (cid: string, resolved: boolean) => Promise<void>
  setFixed: (cid: string, fixed: boolean) => Promise<void>
  remove: (cid: string) => Promise<void>
}

export const useComments = create<CommentsState>((set, get) => ({
  projectId: null,
  threads: [],
  loading: false,
  error: '',
  open: false,
  focusId: null,
  showResolved: false,

  load: async (pid) => {
    set({ projectId: pid, loading: true, error: '' })
    try {
      set({ threads: await apiListComments(pid), loading: false })
    } catch (e) {
      // 메모를 못 불러와도 문서 편집은 계속돼야 한다 — 조용히 비우고 사유만 남긴다.
      set({ threads: [], loading: false, error: e instanceof Error ? e.message : '메모를 불러오지 못했어요.' })
    }
  },
  setOpen: (v) => set({ open: v }),
  focus: (id) => set({ focusId: id, open: id ? true : get().open }),
  setShowResolved: (v) => set({ showResolved: v }),

  add: async (input) => {
    const pid = get().projectId
    if (!pid) return
    await apiAddComment(pid, input)
    await get().load(pid)
  },
  resolve: async (cid, resolved) => {
    const pid = get().projectId
    await apiResolveComment(cid, resolved)
    if (pid) await get().load(pid)
  },
  // 「고쳤습니다」 — 답글이 함께 달리므로 목록을 다시 읽는다.
  setFixed: async (cid, fixed) => {
    const pid = get().projectId
    await apiSetFixed(cid, fixed)
    if (pid) await get().load(pid)
  },
  remove: async (cid) => {
    const pid = get().projectId
    await apiDeleteComment(cid)
    if (pid) await get().load(pid)
  },
}))

/** 이 페이지의 미해결 스레드만 — 핀은 미해결만 그린다(해결된 지적까지 뜨면 화면이 덮인다). */
export function pinsOfPage(threads: Thread[], pageId: number, showResolved: boolean): Thread[] {
  return threads.filter((t) => t.page_id === pageId && (showResolved || !t.resolved_at))
}

export { countMyTurn, relationOf, sortThreads, turnOf, type CmtRelation, type Turn } from './relation'
