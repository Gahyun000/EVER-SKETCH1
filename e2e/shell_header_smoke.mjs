// **신원 표시(UserBar)는 하나이고, 오버레이로 되돌아가지 않는다.**
//
// 2026-09-21 에 `table_merge_smoke.mjs` ⑨ 에서 옮겨 왔다. 거기서 지키고 있던 것은
// **우연**이었다 — 같은 화면에 떠 있으니 김에 본 것뿐이고, 표 병합과는 상관이 없다.
// 그 사이 UserBar 가 편집 툴바(`.ax-title`)에서 **사이드바 맨 아래**로 옮겨졌고
// (2026-09-10 셸 도입), 표를 고치던 사람이 셸 때문에 멈췄다. 집을 옮긴 까닭이 그것이다.
//
// **옮기면서 계약 하나를 고쳐 적었다.**
//   옛: 「툴바의 다른 버튼과 겹치지 않는다」
//   새: 「전역 오버레이가 아니다」
// 겹침 사고의 원인은 사용자 칩이 `position:fixed` 전역 오버레이였다는 것이다. 지금은
// 사이드바의 평범한 흐름 자식이라 **겹칠 방법 자체가 없다** — 옛 문장을 그대로 옮겨
// 적으면 절대 안 깨지는 초록 검사가 된다. 지켜야 할 값은 겹침이 아니라 **오버레이로
// 돌아가지 않는 것**이다.
//
// 실행: node e2e/es_mock.mjs & node e2e/shell_header_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1600, height: 950 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))

await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForSelector('text=임원회의', { timeout: 15000 })

// 한 화면에서 볼 것을 한 함수로 모은다 — 목록과 편집 화면 **둘 다**에서 부른다.
// 셸은 두 화면에 걸쳐 있으므로 한쪽만 보면 반쪽이다(옛 검사가 편집 화면만 봤다).
async function check(where) {
  const n = await p.locator('.sh-acct').count()
  ok(`[${where}] 신원 표시는 화면에 하나뿐이다`, n === 1, `${n}개`)

  ok(`[${where}] 사이드바 안에 들어가 있다`,
     (await p.locator('aside .sh-acct').count()) === 1)

  // **여기가 이 스위트의 핵심이다.** 전역 오버레이로 되돌아가면 옛 겹침 사고가 재현된다.
  const pos = await p.locator('.sh-acct').first()
    .evaluate((el) => getComputedStyle(el).position)
  ok(`[${where}] 전역 오버레이가 아니다`, pos !== 'fixed', `position: ${pos}`)

  const initial = (await p.locator('.es-av').first().innerText()).trim()
  ok(`[${where}] 아바타가 로그인한 사람의 이름 첫 글자다`, initial === '홍', `표시: ${initial}`)
}

await check('목록')

// ── 편집 화면으로 ─────────────────────────────────────────
// 2026-09-17 이후 목록은 **두 번 눌러야** 연다.
await p.locator('text=임원회의').first().dblclick()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(400)

await check('편집')

// 옛 자리로 **되돌아가지 않았는지**도 같이 본다. 툴바에 글자가 '가' 로 박힌
// 초록 원이 따로 있던 때가 있었다(로그인한 사람과 무관한 하드코딩 아바타).
{
  const back = await p.locator('.ax-title .sh-acct, .ax-title .es-userbar, .ax-title .av').count()
  ok('편집 툴바에는 신원 표시가 없다 (옛 자리·옛 하드코딩 아바타 둘 다)', back === 0, `${back}개`)
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 셸 신원 표시 통과 ===')
process.exit(fail ? 1 : 0)
