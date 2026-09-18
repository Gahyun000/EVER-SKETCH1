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

/**
 * **끊긴 것을 아는 시점을 미룬다**(2026-09-18 · 사용자 지시).
 *
 * 관리자가 **제 비밀번호를 초기화**하면 그 순간 제 세션이 끊긴다. 그대로 두면
 * 다음 요청의 401 이 곧바로 로그인 화면으로 밀어내고, **한 번만 보이는 임시 비밀번호
 * 창이 그것과 함께 사라진다.** 사용자가 되물은 대로 — 「모달이 뜨고 닫기를 누르면
 * 로그인 화면으로 가게 설정하면 되잖아」 — **튕기는 시점은 화면이 정하면 된다.**
 *
 * 그래서 잡아 두는 동안 온 401 은 **버리지 않고 기억**했다가 풀 때 한 번에 알린다.
 * 버리면 「세션이 끊겼는데 아무 일도 안 일어나는」 화면이 되고, 그건 처음에 이 배선을
 * 만든 이유(「저장이 안 되는데 이유를 모르는 상태」)로 그대로 돌아가는 것이다.
 *
 * **잡아 두는 자리는 한 곳뿐이어야 한다.** 여러 곳에서 잡으면 누가 풀어 줄 차례인지
 * 아무도 모른다 — 그래서 세는 것이 아니라 켜고 끄는 한 값이다.
 */
let held = false
let pending = false

export function holdUnauthorized(on: boolean): void {
  held = on
  if (!on && pending) { pending = false; if (handler) handler() }
}

export function notifyUnauthorized(): void {
  if (held) { pending = true; return }
  if (handler) handler()
}

/** 시험에서 쓰는 되돌리기. 잡아 둔 채로 다음 시험이 시작되면 그 시험이 조용히 이상해진다. */
export function _resetHold(): void { held = false; pending = false }

/** fetch 응답을 보고 401 이면 세션 만료를 알린다. 응답 자체는 그대로 돌려준다. */
export function checkAuth(res: Response): Response {
  if (res.status === 401) notifyUnauthorized()
  return res
}
