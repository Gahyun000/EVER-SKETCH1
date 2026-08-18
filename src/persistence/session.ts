// 현재 열려 있는 프로젝트(내 이북) id를 담는 최소 홀더.
// autosave·versionStorage·projects 스토어가 서로 순환 import 없이 공유하기 위한 단일 지점.
let _activeId: string | null = null
export function getActiveProjectId(): string | null { return _activeId }
export function setActiveProjectId(id: string | null): void { _activeId = id }
