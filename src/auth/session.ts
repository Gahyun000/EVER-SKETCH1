// 세션 만료를 앱 전체에 알리는 최소 배선.
//
// projectApi 같은 하위 모듈이 useAuth 를 직접 import 하면 순환 참조가 된다.
// (useAuth → authApi → ... → projectApi → useAuth)
// 그래서 콜백 하나만 등록해 두고 401 을 만나면 그쪽으로 흘려보낸다.
//
// 세션은 서버가 언제든 끊을 수 있다 — 관리자가 레벨을 바꾸거나 계정을 비활성화하면
// 그 즉시 토큰이 삭제된다. 화면이 그걸 모르면 사용자는 "저장이 안 되는데 이유를 모르는" 상태가 된다.

type Handler = () => void

let handler: Handler | null = null

export function setSessionLostHandler(fn: Handler | null): void {
  handler = fn
}

export function notifyUnauthorized(): void {
  if (handler) handler()
}

/** fetch 응답을 보고 401 이면 세션 만료를 알린다. 응답 자체는 그대로 돌려준다. */
export function checkAuth(res: Response): Response {
  if (res.status === 401) notifyUnauthorized()
  return res
}
