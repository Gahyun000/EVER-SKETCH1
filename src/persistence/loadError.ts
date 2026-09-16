/**
 * **「못 받아 왔다」를 갈라 말한다.** (2026-09-16)
 *
 * 2026-09-15 에 사용자가 「목록을 불러오지 못했어요」가 뜬 화면과 서버 로그를 함께
 * 보내 줬다. 로그에는 `/api/projects` 줄이 **아예 없었다** — uvicorn 은 닿은 요청이면
 * 500 이든 404 든 한 줄 찍으므로, 그것은 서버가 거절한 것이 아니라 **요청이 서버까지
 * 못 간 것**이었다(`Failed to fetch`). 그런데 화면은 그 둘에 같은 말을 쓰고 있었다.
 *
 * 둘은 **사람이 할 일이 다르다.**
 *   · 닿지 못함 — 서버가 안 떠 있거나 뜨는 중이다. 기다렸다 다시 하면 된다.
 *   · 서버가 거절 — 서버는 살아 있고 까닭이 로그에 남아 있다. 로그를 봐야 한다.
 *   · 기다리다 끊음 — 서버가 느리거나 멈춰 있다. 요청 자체는 갔을 수 있다.
 * 한 문장으로 뭉치면 화면을 보고도 무엇을 해야 할지 모르고, **고치는 사람도**
 * 로그를 뒤져야 안다(실제로 그랬다).
 *
 * 여기는 순수하다 — 던져진 것을 보고 갈래와 글만 정한다.
 */

export type LoadFailure = 'unreachable' | 'server' | 'timeout' | 'unknown'

/** 서버가 준 상태 코드. `j()` 가 오류에 붙여 준다. 없으면 undefined. */
export function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : undefined
}

const MSG = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : ''

/**
 * 무엇이 잘못됐는가.
 *
 * **차례가 뜻이다.** 시간 초과를 먼저 본다 — `withTimeout` 이 만든 것이라 상태 코드도
 * 없고 fetch 오류도 아니어서, 나중에 보면 「모름」으로 떨어진다.
 * 그 다음이 상태 코드다: 코드가 있으면 **서버가 답을 한 것**이고, 그러면 못 닿았을
 * 리가 없다.
 *
 * 닿지 못한 것은 브라우저마다 말이 다르다 — 크롬 `Failed to fetch`,
 * 파이어폭스 `NetworkError when attempting to fetch resource`, 사파리 `Load failed`.
 * 셋 다 `TypeError` 라 그것이 첫 단서이고, 글자는 거드는 데까지만 쓴다.
 */
export function classifyLoad(e: unknown): LoadFailure {
  const m = MSG(e)
  if (/시간 초과/.test(m)) return 'timeout'
  if (statusOf(e) !== undefined) return 'server'
  if (e instanceof TypeError) return 'unreachable'
  if (/failed to fetch|networkerror|load failed|네트워크/i.test(m)) return 'unreachable'
  return 'unknown'
}

/**
 * 화면에 적을 글. **무엇이 잘못됐는지 한 줄, 그래서 무엇을 하면 되는지 한 줄.**
 * 줄바꿈으로 잇는다 — 오류 칸이 `white-space: pre-line` 이라 그대로 두 줄로 선다.
 *
 * `what` 은 **그 화면의 말**로 받는다(「목록」·「결재함」·「팀 공유」). 같은 글을
 * 세 화면이 나눠 쓰되, 무엇을 못 받았는지는 화면이 안다.
 */
/**
 * 「을」인가 「를」인가. **괄호로 둘 다 적고 도망가지 않는다** — 화면에 그렇게 적히면
 * 사람이 쓴 글이 아니라 기계가 낸 글로 읽힌다.
 * 한글 음절은 (코드 − 0xAC00) % 28 이 0 이 아니면 받침이 있다.
 * 한글이 아닌 글자로 끝나면 받침을 알 수 없으니 「를」로 둔다(「PDF를」처럼 읽힌다).
 */
function eul(word: string): string {
  const w = word.trim()
  const c = w.charCodeAt(w.length - 1)
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return '를'
  return (c - 0xac00) % 28 !== 0 ? '을' : '를'
}

export function loadFailureText(kind: LoadFailure, what: string, status?: number): string {
  switch (kind) {
    case 'unreachable':
      return `서버에 닿지 못했어요.\n서버가 꺼져 있거나 아직 뜨는 중일 수 있어요. 잠시 뒤 다시 시도해 주세요.`
    case 'server':
      return `서버가 ${what}${eul(what)} 주지 못했어요${status ? ` (${status})` : ''}.\n`
        + `잠시 뒤 다시 시도해 주세요. 계속 그러면 서버 로그에 까닭이 남아 있습니다.`
    case 'timeout':
      return `${what}${eul(what)} 받는 데 너무 오래 걸려 기다리기를 그만뒀어요.\n`
        + `서버가 느리거나 멈춰 있을 수 있어요. 다시 시도해 주세요.`
    default:
      return `${what}${eul(what)} 불러오지 못했어요.\n잠깐 끊겼을 수 있어요. 다시 시도해 보세요.`
  }
}

/** 갈래를 따지고 글까지 한 번에. 부르는 쪽이 둘을 따로 부르다 어긋나지 않게. */
export function loadErrorText(e: unknown, what: string): string {
  return loadFailureText(classifyLoad(e), what, statusOf(e))
}
