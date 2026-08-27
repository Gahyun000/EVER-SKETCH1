// 페이지별 되돌리기/다시하기 스냅샷 스택.
// store.ts 가 순환 참조 없이 쓸 수 있도록 model.ts 에서 분리했다(이 파일은 아무것도 import 하지 않는다).
//
// 주의: 키가 "페이지 id 숫자"인데 그 id 는 프로젝트마다 1부터 다시 시작한다.
// 따라서 프로젝트를 바꿔 열 때 resetHistory() 로 반드시 비워야 한다.
// 안 그러면 ⌘Z 한 번이 이전 프로젝트의 스냅샷을 현재 페이지에 덮어쓴다.
const undoStacks = new Map<number, string[]>()
const redoStacks = new Map<number, string[]>()

function push(map: Map<number, string[]>, pageId: number, snap: string) {
  const a = map.get(pageId) || []; a.push(snap); if (a.length > 60) a.shift(); map.set(pageId, a)
}
function pop(map: Map<number, string[]>, pageId: number): string | null {
  const a = map.get(pageId); return a && a.length ? (a.pop() as string) : null
}

// 새 작업: undo에 쌓고 redo는 무효화
export function pushSnap(pageId: number, snap: string) { push(undoStacks, pageId, snap); redoStacks.delete(pageId) }
export function popSnap(pageId: number): string | null { return pop(undoStacks, pageId) }
// redo용: redo가 undo로 되돌릴 수 있도록 무효화 없이 쌓기
export function pushUndoRaw(pageId: number, snap: string) { push(undoStacks, pageId, snap) }
export function pushRedo(pageId: number, snap: string) { push(redoStacks, pageId, snap) }
export function popRedo(pageId: number): string | null { return pop(redoStacks, pageId) }
export function canUndo(pageId: number): boolean { const a = undoStacks.get(pageId); return !!(a && a.length) }
export function canRedo(pageId: number): boolean { const a = redoStacks.get(pageId); return !!(a && a.length) }

// 프로젝트 전환 시 전체 폐기. 페이지 id 네임스페이스가 프로젝트마다 겹치기 때문에 필수.
export function resetHistory(): void { undoStacks.clear(); redoStacks.clear() }
// 페이지 삭제 시 그 페이지 스택만 폐기(메모리 회수 + id 재사용 대비).
export function dropHistory(pageId: number): void { undoStacks.delete(pageId); redoStacks.delete(pageId) }
