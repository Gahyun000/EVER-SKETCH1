/**
 * 가입 화면의 검증 계산 — 순수 함수.
 *
 * 「중복 확인」 버튼 방식을 골랐다(2026-09-04). 이 방식의 **유일한 함정**은
 * **「확인은 했는데 그 뒤에 아이디를 고친」 상태**다. 그 상태를 무효로 되돌리지 않으면
 * 중복된 아이디로 가입 버튼이 켜지고, 서버가 막아 주긴 하지만 사용자가 보는 것은
 * "확인까지 했는데 왜 안 되지"가 된다.
 *
 * 그래서 화면은 「확인했다」는 **깃발**을 들지 않는다. **어떤 값으로 확인했는지**를 들고
 * 지금 값과 매번 비교한다. 깃발이면 지우는 걸 빠뜨릴 수 있지만, 비교는 빠뜨릴 자리가 없다.
 *
 * React 를 모른다 — 그래서 노드로 그냥 실행해서 검증할 수 있다(`signup_check.test.mjs`).
 */

// server/auth.py 와 같은 값. 한쪽만 바꾸면 화면은 통과시키고 서버가 막는다.
export const MIN_LOGIN_ID = 3
export const MAX_LOGIN_ID = 32
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 128

const LOGIN_ID_RE = /^[a-z0-9._-]+$/

/**
 * 서버의 `signup()` 이 하는 것과 **같은** 정규화(`strip().lower()`).
 * 다르면 "확인한 아이디"와 "실제로 가입되는 아이디"가 어긋난다.
 */
export function normalizeLoginId(v: string | null | undefined): string {
  return (v || '').trim().toLowerCase()
}

export interface FormatResult {
  ok: boolean
  /** 빈칸 — 틀린 게 아니라 아직 안 친 것이다. 빨갛게 두지 않는다. */
  quiet?: boolean
  message: string
}

export function loginIdFormat(raw: string | null | undefined): FormatResult {
  const v = normalizeLoginId(raw)
  if (!v) return { ok: false, quiet: true, message: `영문 소문자·숫자와 . _ - 만, ${MIN_LOGIN_ID}~${MAX_LOGIN_ID}자` }
  if (v.length < MIN_LOGIN_ID) return { ok: false, message: `아이디는 ${MIN_LOGIN_ID}자 이상이어야 합니다.` }
  if (v.length > MAX_LOGIN_ID) return { ok: false, message: `아이디는 ${MAX_LOGIN_ID}자 이하여야 합니다.` }
  if (!LOGIN_ID_RE.test(v)) return { ok: false, message: '아이디는 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.' }
  return { ok: true, message: '' }
}

export type IdCheckKind = 'idle' | 'format' | 'unchecked' | 'available' | 'taken'

export interface IdCheckState {
  kind: IdCheckKind
  message: string
  /** 확인한 뒤에 아이디가 바뀌었다 — 화면이 그 사실을 말해줘야 한다. */
  invalidated: boolean
}

/**
 * @param typed      지금 입력칸에 있는 값
 * @param checkedFor **어떤 값으로** 중복 확인을 했는가 (안 했으면 null)
 * @param available  그 확인의 결과 (안 했으면 null)
 */
export function idCheckState(
  typed: string | null | undefined,
  checkedFor: string | null,
  available: boolean | null,
): IdCheckState {
  const v = normalizeLoginId(typed)
  const fmt = loginIdFormat(v)
  const stale = checkedFor !== null && checkedFor !== v

  if (fmt.quiet) return { kind: 'idle', message: fmt.message, invalidated: false }
  // **형식이 확인 결과를 이긴다.** 확인해 둔 값이 있어도, 지금 값의 형식이 틀렸으면
  // 형식부터 말한다 — 아니면 "사용할 수 있습니다"와 틀린 형식이 함께 떠 있게 된다.
  if (!fmt.ok) return { kind: 'format', message: fmt.message, invalidated: stale }

  if (checkedFor !== v) {
    return {
      kind: 'unchecked',
      message: stale ? '아이디가 바뀌었습니다. 다시 확인해 주세요.' : '「중복 확인」을 눌러 주세요.',
      invalidated: stale,
    }
  }
  if (available) return { kind: 'available', message: '사용할 수 있는 아이디입니다.', invalidated: false }
  return { kind: 'taken', message: '이미 사용 중인 아이디입니다.', invalidated: false }
}

export type PwKind = 'idle' | 'short' | 'long' | 'ok'
export type ConfirmKind = 'idle' | 'mismatch' | 'match'

export function passwordState(password: string, confirm: string): {
  pw: PwKind; confirm: ConfirmKind; pwMessage: string; confirmMessage: string
} {
  let pw: PwKind = 'ok'
  let pwMessage = ''
  if (!password) { pw = 'idle'; pwMessage = `${MIN_PASSWORD}자 이상` }
  else if (password.length < MIN_PASSWORD) {
    pw = 'short'; pwMessage = `${MIN_PASSWORD}자 이상이어야 합니다. (지금 ${password.length}자)`
  } else if (password.length > MAX_PASSWORD) {
    pw = 'long'; pwMessage = `${MAX_PASSWORD}자 이하여야 합니다.`
  }

  // 확인칸이 비어 있으면 **아무 말도 하지 않는다.** 아직 안 친 것뿐인데 빨갛게 두면,
  // 사람은 자기가 뭔가 틀렸다고 읽는다.
  let cf: ConfirmKind = 'idle'
  let confirmMessage = ''
  if (confirm) {
    if (password === confirm) { cf = 'match'; confirmMessage = '일치합니다.' }
    else { cf = 'mismatch'; confirmMessage = '입력한 두 비밀번호가 다릅니다.' }
  }
  return { pw, confirm: cf, pwMessage, confirmMessage }
}

export interface SignupInput {
  typed: string
  checkedFor: string | null
  available: boolean | null
  password: string
  confirm: string
  name: string
}

/**
 * 가입 버튼을 막는 이유들. 빈 배열이면 누를 수 있다.
 *
 * "누를 수 있는가"를 boolean 하나로 돌려주지 않는 이유 — 화면이 **어디를** 가리켜야
 * 하는지 알아야 한다. 버튼만 회색이면 사용자는 무엇이 모자란지 모른 채 위아래를 훑는다.
 */
export function signupBlockers(input: SignupInput): ('id' | 'password' | 'name')[] {
  const out: ('id' | 'password' | 'name')[] = []
  if (idCheckState(input.typed, input.checkedFor, input.available).kind !== 'available') out.push('id')
  const ps = passwordState(input.password, input.confirm)
  if (ps.pw !== 'ok' || ps.confirm !== 'match') out.push('password')
  if (!input.name.trim()) out.push('name')
  return out
}
