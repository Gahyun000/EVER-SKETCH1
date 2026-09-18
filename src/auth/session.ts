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

// **끊긴 것을 아는 시점을 미루는 장치가 잠깐 있었다**(2026-09-18, 같은 날 걷었다).
//
// 관리자가 **제 비밀번호를 초기화**하는 길을 열면서, 그 순간 끊기는 제 세션 때문에
// 임시 비밀번호 창이 사라지지 않도록 401 을 잡아 두는 `holdUnauthorized` 를 뒀었다.
// 그 길을 걷으면서(사용자 결정 「2번보다 3만 있으면 되겠다」) **잡아 둘 일도 없어졌다.**
// 안 쓰는 장치를 남겨 두면 「어딘가 쓰이나」 싶어 다음 사람이 붙들고 있게 된다.
//
// 다시 필요해지면 그때 다시 만든다 — 어렵지 않다(켜고 끄는 값 하나 + 밀린 것 한 번 알리기).

export function notifyUnauthorized(): void {
  if (handler) handler()
}

/** fetch 응답을 보고 401 이면 세션 만료를 알린다. 응답 자체는 그대로 돌려준다. */
export function checkAuth(res: Response): Response {
  if (res.status === 401) notifyUnauthorized()
  return res
}
