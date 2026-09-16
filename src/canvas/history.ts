// 페이지별 되돌리기/다시하기 스냅샷 스택.
// store.ts 가 순환 참조 없이 쓸 수 있도록 model.ts 에서 분리했다(이 파일은 아무것도 import 하지 않는다).
//
// 주의: 키가 "페이지 id 숫자"인데 그 id 는 프로젝트마다 1부터 다시 시작한다.
// 따라서 프로젝트를 바꿔 열 때 resetHistory() 로 반드시 비워야 한다.
// 안 그러면 ⌘Z 한 번이 이전 프로젝트의 스냅샷을 현재 페이지에 덮어쓴다.
//
// ── 쪽 **안**의 일과 쪽 **자체**의 일 (2026-09-16) ──────────────────
//
// 여기 스택은 쪽마다 따로다. 그래서 쪽이 **생기고 없어지고 순서가 바뀌는** 일은
// 어느 쪽의 일도 아니라서 ⌘Z 로 돌아오지 않았다 — 사용자 신고 ⑥ 의 남은 절반이다.
// 쪽을 지우고 ⌘Z 를 눌러도 아무 일이 안 일어났다.
//
// 그래서 문서 전체를 통째로 기억하는 스택을 **하나 더** 둔다. 둘 중 무엇을 먼저
// 되돌릴지는 **번호**로 정한다 — 쌓을 때마다 번호를 하나씩 올리고, ⌘Z 는 번호가 큰
// 쪽(=나중에 한 일)을 되돌린다. 번호가 없으면 「쪽을 지우고 → 글자를 고치고 → ⌘Z」에서
// 글자가 아니라 쪽이 돌아온다. 사람이 방금 한 일부터 돌아와야 한다.
interface Entry { n: number; snap: string }
let tick = 0

const undoStacks = new Map<number, Entry[]>()
const redoStacks = new Map<number, Entry[]>()
const docUndo: Entry[] = []
const docRedo: Entry[] = []

function push(map: Map<number, Entry[]>, pageId: number, snap: string) {
  const a = map.get(pageId) || []; a.push({ n: ++tick, snap }); if (a.length > 60) a.shift(); map.set(pageId, a)
}
function pop(map: Map<number, Entry[]>, pageId: number): string | null {
  const a = map.get(pageId); return a && a.length ? (a.pop() as Entry).snap : null
}
function pushDoc(a: Entry[], snap: string) { a.push({ n: ++tick, snap }); if (a.length > 60) a.shift() }
function popDoc(a: Entry[]): string | null { return a.length ? (a.pop() as Entry).snap : null }
function topN(a: Entry[] | undefined): number { return a && a.length ? a[a.length - 1].n : -1 }

// 새 작업: undo에 쌓고 redo는 무효화
export function pushSnap(pageId: number, snap: string) { push(undoStacks, pageId, snap); redoStacks.delete(pageId); docRedo.length = 0 }
export function popSnap(pageId: number): string | null { return pop(undoStacks, pageId) }
// redo용: redo가 undo로 되돌릴 수 있도록 무효화 없이 쌓기
export function pushUndoRaw(pageId: number, snap: string) { push(undoStacks, pageId, snap) }
export function pushRedo(pageId: number, snap: string) { push(redoStacks, pageId, snap) }
export function popRedo(pageId: number): string | null { return pop(redoStacks, pageId) }
export function canUndo(pageId: number): boolean { const a = undoStacks.get(pageId); return !!(a && a.length) }
export function canRedo(pageId: number): boolean { const a = redoStacks.get(pageId); return !!(a && a.length) }

// ── 문서 단위(쪽이 생기고·없어지고·자리를 바꾸는 일) ──────────────
/** 새 작업. 쪽 이력과 마찬가지로 다시하기를 무효화한다. */
export function pushDocSnap(snap: string) { pushDoc(docUndo, snap); docRedo.length = 0; redoStacks.clear() }
export function popDocSnap(): string | null { return popDoc(docUndo) }
/** 다시하기가 되돌리기로 돌아올 수 있도록 무효화 없이 쌓기. */
export function pushDocUndoRaw(snap: string) { pushDoc(docUndo, snap) }
export function pushDocRedo(snap: string) { pushDoc(docRedo, snap) }
export function popDocRedo(): string | null { return popDoc(docRedo) }

/** ⌘Z 가 **무엇부터** 되돌려야 하나. 번호가 큰 쪽 = 나중에 한 일. */
export function nextUndoKind(pageId: number): 'doc' | 'page' | null {
  const d = topN(docUndo), p = topN(undoStacks.get(pageId))
  if (d < 0 && p < 0) return null
  return d > p ? 'doc' : 'page'
}
export function nextRedoKind(pageId: number): 'doc' | 'page' | null {
  const d = topN(docRedo), p = topN(redoStacks.get(pageId))
  if (d < 0 && p < 0) return null
  return d > p ? 'doc' : 'page'
}
/** 지금 되돌릴 것이 문서 단위로 남아 있나(인라인 「되돌리기」 단추가 묻는다). */
export function hasDocUndo(): boolean { return docUndo.length > 0 }

// 프로젝트 전환 시 전체 폐기. 페이지 id 네임스페이스가 프로젝트마다 겹치기 때문에 필수.
export function resetHistory(): void {
  undoStacks.clear(); redoStacks.clear(); docUndo.length = 0; docRedo.length = 0; tick = 0
}
// 페이지 삭제 시 그 페이지 스택만 폐기(메모리 회수 + id 재사용 대비).
export function dropHistory(pageId: number): void { undoStacks.delete(pageId); redoStacks.delete(pageId) }
