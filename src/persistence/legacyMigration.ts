// 서버(SQLite) 전환 1회 이관: 기존 브라우저(IndexedDB) 단일 초안을 서버 프로젝트로 옮긴다.
// 유실 방지용. 라이브러리가 비어 있을 때만 이관(중복 방지)하고, 그때만 레거시 초안을 비운다.
import { loadDraft, clearDraft } from './draftStorage'
import { apiCreateProject, apiListProjects } from './projectApi'

let done = false

export async function migrateLegacyDraftOnce(): Promise<string | null> {
  if (done) return null
  done = true
  try {
    const draft = await loadDraft()
    const st = draft?.state
    if (st && Array.isArray(st.pages) && st.pages.length) {
      const existing = await apiListProjects()
      let newId: string | null = null
      if (!existing.length) {
        const p = await apiCreateProject(st.title || draft?.title || '이전 작업본', st)
        newId = p.id
        await clearDraft()   // 실제로 옮겼을 때만 원본 제거
      }
      // 라이브러리가 비어있지 않아 이관을 건너뛴 경우, 레거시 초안은 그대로 남긴다.
      // (지우면 복구 경로가 없다. 다음 실행에서 다시 판단한다.)
      return newId
    }
  } catch { /* noop */ }
  return null
}
