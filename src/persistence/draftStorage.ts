import type { BuilderState, Orientation, Page, SizePreset } from '../state/store'
import type { ThemeName } from '../design/tokens'

export const DRAFT_VERSION = 1
export const DRAFT_DB = 'ebook_html_workspace'
export const DRAFT_STORE = 'drafts'
export const CURRENT_DRAFT_KEY = 'current'

export interface DraftStateSnapshot {
  title: string
  orientation: Orientation
  theme: ThemeName
  font: string
  size: SizePreset
  selectedPageId: number | null
  pages: Page[]
}

export interface WorkspaceDraftV1 {
  draftVersion: 1
  app: 'ebook_html'
  title: string
  sourceName?: string
  updatedAt: string
  savedAt: string
  state: DraftStateSnapshot
}

export interface DraftMeta {
  title: string
  sourceName?: string
  updatedAt: string
  pageCount: number
}

/** 저장된 쪽의 **빠진 칸을 메운다.**

 *  `Page` 타입은 `els`·`conns`·`strokes` 를 **반드시 있다**고 적어 두었다.
 *  그런데 쪽은 **서버 JSON 에서** 온다 — 타입은 거기까지 못 간다.
 *  칸이 하나 없으면 `page.conns.map(...)` 이 멈추고, React 는 멈춘 부분을
 *  통째로 지운다: **결재함 상세가 하얘지고, 그 위에 떠 있던 확인창까지 같이 사라진다.**
 *  오류 메시지도 안 뜬다. 쓰는 사람 눈에는 「눌렀는데 아무 일도 안 일어난다」로만 보인다.
 *
 *  **`fields` 때와 같은 부류다.** 그때는 읽는 자리마다 `?.` 를 붙였는데,
 *  `els`·`conns`·`strokes` 는 읽는 자리가 서른 곳이 넘는다 —
 *  자리마다 막으면 다음에 새로 쓰는 한 줄이 또 샌다.
 *  그래서 **들어오는 문 두 곳**(`fullState` · 결재 스냅샷 뷰어)에서 한 번 메운다.
 *
 *  **있는 값은 절대 안 건드린다.** 없는 칸만 채운다.
 *  id 가 없는 쪽에는 **음수**를 준다 — 0 을 돌려주면 그런 쪽이 여럿일 때
 *  React key 가 겹쳐 엉뚱한 쪽이 그려진다. 진짜 id 와도 안 부딪힌다. */
export function fullPage(p?: Partial<Page> | null, i = 0): Page {
  const s = (p || {}) as Partial<Page>
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    ...s,
    id: typeof s.id === 'number' ? s.id : -(i + 1),
    cardKey: s.cardKey || '',
    fields: s.fields && typeof s.fields === 'object' ? s.fields : {},
    free: !!s.free,
    els: arr(s.els),
    conns: arr(s.conns),
    strokes: arr(s.strokes),
  } as Page
}

/** 쪽 목록째로 메운다. 목록 자체가 없으면 빈 목록. */
export function fullPages(pages?: unknown): Page[] {
  return Array.isArray(pages) ? pages.map((p, i) => fullPage(p as Partial<Page>, i)) : []
}

/**
 * **고른 쪽이 진짜 있는 쪽인지 확인한다.**
 *
 * 2026-09-14. 쪽은 멀쩡히 있는데 무대만 「카드를 추가하세요」로 비는 자료를 봤다.
 * 왼쪽 필름에는 쪽이 그려져 있는데 가운데만 빈다 — 미리보기가
 * `pages.find((p) => p.id === selectedPageId)` 로 고른 쪽을 찾는데,
 * `selectedPageId` 가 없거나(옛 자료·밖에서 만든 자료) 지워진 쪽을 가리키면
 * 그 find 가 undefined 를 내놓기 때문이다. **쪽이 있는데 아무것도 안 보인다**는
 * 점에서, els·conns 가 없을 때 화면이 하얘지던 것과 같은 종류의 구멍이다.
 *
 * 지금 서버가 만드는 자료는 모두 이 값을 넣는다. 그래도 경계에서 메워 둔다 —
 * 들어오는 자료가 성하다고 믿는 것이 그때도 틀렸다.
 */
export function fullSelected(pages: Page[], sel?: unknown): number | null {
  if (!pages.length) return null
  // 가리키는 쪽이 실제로 있으면 그대로 둔다. 사람이 보던 자리를 옮기지 않는다.
  if (typeof sel === 'number' && pages.some((p) => p.id === sel)) return sel
  return pages[0].id
}

const nowIso = () => new Date().toISOString()

export function snapshotFromState(s: Pick<BuilderState, 'title' | 'orientation' | 'theme' | 'font' | 'size' | 'selectedPageId' | 'pages'>): DraftStateSnapshot {
  return {
    title: s.title,
    orientation: s.orientation,
    theme: s.theme,
    font: s.font,
    size: s.size,
    selectedPageId: s.selectedPageId,
    pages: JSON.parse(JSON.stringify(s.pages || [])),
  }
}

export function createDraft(state: DraftStateSnapshot, sourceName?: string): WorkspaceDraftV1 {
  const ts = nowIso()
  return {
    draftVersion: DRAFT_VERSION,
    app: 'ebook_html',
    title: state.title || '제목 없음',
    sourceName,
    updatedAt: ts,
    savedAt: ts,
    state,
  }
}

export function normalizeDraft(input: unknown): WorkspaceDraftV1 | null {
  const d = input as Partial<WorkspaceDraftV1> | null
  if (!d || d.draftVersion !== DRAFT_VERSION || d.app !== 'ebook_html' || !d.state) return null
  const st = d.state as Partial<DraftStateSnapshot>
  if (!Array.isArray(st.pages)) return null
  return {
    draftVersion: DRAFT_VERSION,
    app: 'ebook_html',
    title: String(d.title || st.title || '제목 없음'),
    sourceName: d.sourceName ? String(d.sourceName) : undefined,
    updatedAt: String(d.updatedAt || d.savedAt || nowIso()),
    savedAt: String(d.savedAt || d.updatedAt || nowIso()),
    state: {
      title: String(st.title || d.title || '제목 없음'),
      orientation: st.orientation === 'landscape' ? 'landscape' : 'portrait',
      theme: (st.theme === 'dark' ? 'dark' : 'light') as ThemeName,
      font: String(st.font || 'auto'),
      size: st.size === 's' || st.size === 'l' ? st.size : 'm',
      selectedPageId: typeof st.selectedPageId === 'number' ? st.selectedPageId : null,
      pages: st.pages as Page[],
    },
  }
}

export function draftMeta(input: unknown): DraftMeta | null {
  const d = normalizeDraft(input)
  if (!d) return null
  return { title: d.state.title || d.title, sourceName: d.sourceName, updatedAt: d.updatedAt, pageCount: d.state.pages.length }
}

const DB_VERSION = 2
export const VERSION_STORE = 'versions'

export function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_DB, DB_VERSION)
    let settled = false
    const done = (fn: () => void) => { if (settled) return; settled = true; window.clearTimeout(timer); fn() }
    // 다른 탭이 구버전 DB 연결을 쥐고 있으면 'blocked' 가 뜨고, 핸들러가 없으면 이 promise 는
    // resolve 도 reject 도 되지 않는다. boot() 가 여기서 await 하므로 라이브러리가 영영 안 뜬다.
    const timer = window.setTimeout(() => {
      done(() => reject(new Error('workspace db open timeout — 이 앱을 연 다른 탭을 닫고 새로고침해 주세요')))
    }, 4000)
    req.onblocked = () => {
      done(() => reject(new Error('workspace db blocked — 이 앱을 연 다른 탭을 닫고 새로고침해 주세요')))
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE)
      if (!db.objectStoreNames.contains(VERSION_STORE)) db.createObjectStore(VERSION_STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => done(() => resolve(req.result))
    req.onerror = () => done(() => reject(req.error || new Error('workspace db open failed')))
  })
}

export async function idbTx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openWorkspaceDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const req = run(tx.objectStore(storeName))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('db request failed'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => { db.close(); reject(tx.error || new Error('db transaction failed')) }
  })
}

export async function saveDraft(draft: WorkspaceDraftV1): Promise<void> {
  await idbTx(DRAFT_STORE, 'readwrite', (store) => store.put(draft, CURRENT_DRAFT_KEY))
}

export async function loadDraft(): Promise<WorkspaceDraftV1 | null> {
  const raw = await idbTx(DRAFT_STORE, 'readonly', (store) => store.get(CURRENT_DRAFT_KEY))
  return normalizeDraft(raw)
}

export async function clearDraft(): Promise<void> {
  await idbTx(DRAFT_STORE, 'readwrite', (store) => store.delete(CURRENT_DRAFT_KEY))
}
