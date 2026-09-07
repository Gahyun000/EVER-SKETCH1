// 글자 크기 칸이 **치는 도중에 값을 깎지 않는가** — 진짜 브라우저에서.
//
// 임원진이 보내 온 증상 셋이 전부 원인 하나였다.
//   · 60 을 입력하고 50 으로 고치면 6 이 박힌다
//   · 그 상태에서 칸을 비울 수가 없다
//   · 위·아래 화살표 중 위만 동작한다
//
// 예전 칸은 `Math.max(6, Number(값) || 6)` 을 **한 글자마다** 걸었다. 60 을 지우고
// 5 를 치는 순간 6 으로 깎여 박히고, 뒤에 0 을 칠 자리가 사라진다. 칸을 비우면
// `Number("") || 6` 이라 또 6 이다. 그렇게 6(최솟값)에 갇히면 아래 화살표는 내려갈
// 데가 없으니 「위만 된다」로 보인다 — **아래 버튼은 고장난 적이 없었다.**
//
// 규칙은 num_input.test.mjs 가 따로 지킨다. 여기서는 **사람이 치는 그 순서 그대로**
// 밟아 본다 — 규칙이 맞아도 칸에 안 붙어 있으면 아무 소용이 없다.
//
// 실행: node e2e/es_mock.mjs & node e2e/num_input_smoke.mjs
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
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(700)

const head = () => p.locator('.stage .fel.text').filter({ hasText: '임원회의' }).first()
await head().click()
await p.waitForTimeout(400)
const tab = p.locator('button', { hasText: '텍스트' }).first()
if (await tab.count()) { await tab.click(); await p.waitForTimeout(300) }

const size = p.locator('input[aria-label="글자 크기"]')
ok('(사전) 글자 크기 칸을 찾았다', await size.count() === 1)

/** 실제로 그려진 글자 크기 — 칸의 숫자가 아니라 **문서에 먹은 값**을 본다. */
const drawn = async () => await head().evaluate(
  (n) => getComputedStyle(n.querySelector('.feltext') || n).fontSize)

// ── 임원진이 밟은 그 길 ──────────────────────────────
await size.click({ clickCount: 3 })
await p.keyboard.type('60')
await p.waitForTimeout(250)
ok('60 을 치면 60 이 된다', (await size.inputValue()) === '60' && (await drawn()) === '60px',
   `${await size.inputValue()} / ${await drawn()}`)

await size.click({ clickCount: 3 })
await p.keyboard.type('5')
await p.waitForTimeout(220)
ok('5 만 친 순간에도 5 로 남는다 (예전엔 6 이 박혔다)',
   (await size.inputValue()) === '5', await size.inputValue())

await p.keyboard.type('0')
await p.waitForTimeout(250)
ok('0 을 더 치면 50 이 된다', (await size.inputValue()) === '50' && (await drawn()) === '50px',
   `${await size.inputValue()} / ${await drawn()}`)

await size.press('Enter')
await p.waitForTimeout(250)
ok('Enter 로 확정해도 50 이다', (await drawn()) === '50px', await drawn())

// ── 칸을 비울 수 있어야 새 숫자를 처음부터 친다 ──────────
await size.click({ clickCount: 3 })
await p.keyboard.press('Backspace')
await p.waitForTimeout(220)
ok('칸을 비울 수 있다 (예전엔 6 이 채워졌다)',
   (await size.inputValue()) === '', JSON.stringify(await size.inputValue()))

await size.press('Tab')
await p.waitForTimeout(350)
ok('비운 채 떠나면 **원래 값으로 되돌아간다** (0 이나 6 으로 채우지 않는다)',
   (await drawn()) === '50px', await drawn())

// ── 아래 화살표도 산다 ───────────────────────────────
// 예전에 「위만 된다」로 보였던 것은 값이 최솟값에 갇혀 있었기 때문이다.
{
  await size.click({ clickCount: 3 })
  await p.keyboard.type('40')
  await p.waitForTimeout(220)
  await size.press('ArrowDown')
  await p.waitForTimeout(220)
  const down = await size.inputValue()
  await size.press('ArrowUp')
  await size.press('ArrowUp')
  await p.waitForTimeout(220)
  const up = await size.inputValue()
  ok('아래 화살표가 값을 내린다', Number(down) === 39, down)
  ok('위 화살표가 값을 올린다', Number(up) === 41, up)
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 숫자 칸 통과 ===')
process.exit(fail ? 1 : 0)
