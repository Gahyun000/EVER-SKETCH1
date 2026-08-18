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
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE)
      if (!db.objectStoreNames.contains(VERSION_STORE)) db.createObjectStore(VERSION_STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('workspace db open failed'))
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
