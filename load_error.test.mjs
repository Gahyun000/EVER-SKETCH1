// **「못 받아 왔다」를 갈라 말하는가.**
//
// 2026-09-15 · 사용자가 「목록을 불러오지 못했어요」가 뜬 화면과 서버 로그를 함께
// 보내 줬다. 로그에는 `/api/projects` 줄이 **아예 없었다** — uvicorn 은 닿은 요청이면
// 500 이든 404 든 한 줄 찍으므로, 서버가 거절한 것이 아니라 **요청이 서버까지 못 간
// 것**이었다. 그런데 화면은 그 둘에 같은 말을 쓰고 있었고, 게다가 「잠깐 끊겼을 수
// 있어요」라는 다음 길이 글자로 박혀 있어서 500 을 받아도 그렇게 적혔다.
//
// 여기서 지키는 것.
//   · 닿지 못함 · 서버 거절 · 기다리다 끊음을 **가른다**
//   · 갈래마다 **무엇을 하면 되는지**가 다르다 — 한 문장으로 뭉치지 않는다
//   · 브라우저마다 다른 말(Failed to fetch · NetworkError · Load failed)을 다 알아본다
//   · 세 화면이 **같은 자를 쓴다**
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs load_error.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')

const { classifyLoad, loadFailureText, loadErrorText, statusOf } =
  await import('./src/persistence/loadError.ts')

const withStatus = (msg, status) => Object.assign(new Error(msg), { status })

// ── 갈래 ────────────────────────────────────────────
check(classifyLoad(new TypeError('Failed to fetch')) === 'unreachable',
  '크롬의 «Failed to fetch» — 닿지 못함')
check(classifyLoad(new TypeError('NetworkError when attempting to fetch resource.')) === 'unreachable',
  '파이어폭스의 «NetworkError» — 닿지 못함')
check(classifyLoad(new TypeError('Load failed')) === 'unreachable',
  '사파리의 «Load failed» — 닿지 못함')
// **TypeError 가 아니어도** 글자로 알아본다 — 감싸 던지는 자리가 생길 수 있다.
check(classifyLoad(new Error('Failed to fetch')) === 'unreachable',
  'TypeError 가 아니어도 글자로 알아본다')

check(classifyLoad(withStatus('API 500 Internal Server Error', 500)) === 'server',
  '500 — 서버가 거절')
check(classifyLoad(withStatus('권한이 없습니다.', 403)) === 'server',
  '403 도 서버가 거절 (전에는 글자에서 숫자가 지워져 「모름」이었다)')
check(classifyLoad(withStatus('없는 주소입니다.', 404)) === 'server', '404 — 서버가 거절')

check(classifyLoad(new Error('시간 초과 (8000ms)')) === 'timeout', '기다리다 끊음')
// **차례가 뜻이다.** 시간 초과에는 상태 코드도 fetch 오류도 없어서, 나중에 보면
// 「모름」으로 떨어진다.
check(classifyLoad(withStatus('시간 초과 (8000ms)', 500)) === 'timeout',
  '시간 초과를 먼저 본다')
// 상태 코드가 있으면 **서버가 답을 한 것**이다 — 못 닿았을 리가 없다.
check(classifyLoad(Object.assign(new TypeError('Failed to fetch'), { status: 500 })) === 'server',
  '상태 코드가 있으면 닿은 것이다')

check(classifyLoad(new Error('무슨 일인지 모름')) === 'unknown', '모르는 것은 모른다고 한다')
check(classifyLoad(null) === 'unknown' && classifyLoad(undefined) === 'unknown',
  '아무것도 안 던져도 안 터진다')
check(classifyLoad('Failed to fetch') === 'unreachable', '글자만 던져도 알아본다')

// ── statusOf ────────────────────────────────────────
check(statusOf(withStatus('x', 404)) === 404, '상태 코드를 꺼낸다')
check(statusOf(new Error('x')) === undefined, '없으면 undefined')
check(statusOf(null) === undefined, 'null 이어도 안 터진다')
check(statusOf(Object.assign(new Error('x'), { status: '500' })) === undefined,
  '숫자가 아닌 것은 안 믿는다')

// ── 글 ──────────────────────────────────────────────
// **무엇이 잘못됐는지 한 줄, 그래서 무엇을 하면 되는지 한 줄.**
for (const k of ['unreachable', 'server', 'timeout', 'unknown']) {
  const t = loadFailureText(k, '목록')
  check(t.split('\n').length === 2, `${k} — 두 줄이다`, JSON.stringify(t))
  check(t.split('\n')[1].includes('다시 시도'), `${k} — 다음 길을 말한다`)
}
// 갈래마다 **말이 달라야** 한다. 넷이 같으면 가른 보람이 없다.
{
  const all = ['unreachable', 'server', 'timeout', 'unknown'].map((k) => loadFailureText(k, '목록'))
  check(new Set(all).size === 4, '네 갈래의 글이 모두 다르다')
}
check(/서버에 닿지 못했어요/.test(loadFailureText('unreachable', '목록')),
  '닿지 못한 것은 그렇게 말한다')
check(!/잠깐 끊겼을 수 있어요/.test(loadFailureText('server', '목록', 500)),
  '서버가 거절했는데 「잠깐 끊겼을 수 있어요」라고 하지 않는다')
check(/\(500\)/.test(loadFailureText('server', '목록', 500)), '숫자를 그대로 보여 준다')
check(!/\(undefined\)|\(\)/.test(loadFailureText('server', '목록')), '숫자가 없으면 괄호도 없다')
check(/서버 로그/.test(loadFailureText('server', '목록', 500)),
  '서버가 거절했으면 **로그를 보라**고 말한다 — 거기 까닭이 남는다')
// 무엇을 못 받았는지는 화면이 말한다.
check(loadFailureText('unknown', '결재함').startsWith('결재함'), '화면의 말을 그대로 쓴다')
// **「을(를)」로 도망가지 않는다** — 그렇게 적히면 사람이 쓴 글로 안 읽힌다.
for (const [w, josa] of [['목록', '을'], ['결재함', '을'], ['팀 공유', '를'], ['자료', '를']]) {
  const t = loadFailureText('unknown', w)
  check(t.startsWith(w + josa), `「${w}${josa}」로 적는다`, t.slice(0, 12))
}
for (const k of ['unreachable', 'server', 'timeout', 'unknown']) {
  check(!/을\(를\)|이\(가\)|은\(는\)/.test(loadFailureText(k, '목록')),
    `${k} — 괄호로 도망간 조사가 없다`)
}
check(loadErrorText(withStatus('x', 503), '팀 공유').includes('팀 공유')
  && loadErrorText(withStatus('x', 503), '팀 공유').includes('(503)'),
  '갈래와 글을 한 번에 내주는 길도 같은 답을 준다')

// ── 세 화면이 같은 자를 쓰는가 ──────────────────────
{
  const store = read('./src/persistence/projects.ts')
  const ap = read('./src/approvals/ApprovalsPanel.tsx')
  const tl = read('./src/teamlib/TeamLibraryPanel.tsx')
  const lib = read('./src/persistence/LibraryScreen.tsx')
  const api = read('./src/persistence/projectApi.ts')

  check(/loadErrorText\(e, '목록'\)/.test(store), '자료 목록이 쓴다')
  check(/loadErrorText\(e, '결재함'\)/.test(ap), '결재함이 쓴다')
  check(/loadErrorText\(e, '팀 공유'\)/.test(tl), '팀 공유가 쓴다')
  // 서버가 준 말이 있으면 그것이 가장 정확하다 — 덮어쓰지 않는다.
  check(/e instanceof ApprovalApiError \? e\.message :/.test(ap)
    && /e instanceof TeamLibraryError \? e\.message :/.test(tl),
    '서버가 준 말이 있으면 그것을 먼저 쓴다')

  // 한 문장으로 뭉쳐 두던 옛 글이 안 남아 있다.
  check(!/'목록을 불러오지 못했어요\.'/.test(store),
    '스토어에 박아 둔 옛 문장이 없다')
  check(!/잠깐 끊겼을 수 있어요/.test(lib),
    '화면에 박아 둔 다음 길이 없다 (500 을 받아도 「끊겼다」고 적혔다)')
  // 두 줄이 두 줄로 서려면 그 칸이 줄바꿈을 살려야 한다.
  check(/\.lib-empty\{[^}]*white-space:pre-line/.test(
    read('./src/index.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')),
    '오류 칸이 줄바꿈을 살린다')

  // 상태 코드가 오류에 실려야 갈래를 가를 수 있다. 403 도 마찬가지다 —
  // 전에는 403 만 글자를 갈아치우면서 숫자를 통째로 버렸다.
  check(/err\.status = res\.status/.test(api), 'API 오류에 상태 코드를 붙인다')
  check(!/if \(res\.status === 403\) throw new Error/.test(api),
    '403 만 숫자를 버리고 던지던 길이 없다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
