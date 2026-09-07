// 화면 배율을 **사람이 바꿀 수 있는가**, 그리고 세로 이북이 창을 채우는가.
//
// 임원진 요청: 「화면 사이즈 확대/축소 기능 — 현재 세로 작업공간이 너무 좁음」.
//
// 여태 배율은 **보여만 주고** 바꿀 수단이 없었다. 그것도 100% 미만일 때만 떴다.
// 게다가 맞춤 계산에 상한이 박혀 있었다.
//
//     setScale(Math.min(1, avW / W, avH / H))
//
// 세로 이북은 논리 크기가 432×576 이라 넓은 창에서는 줄일 것도 없으니, 그냥 작은
// 종이가 뜨고 나머지는 회색으로 남았다. 「작업공간이 좁다」의 정체가 이 한 줄이다.
//
// 실행: node e2e/es_mock.mjs & node e2e/zoom_smoke.mjs
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
await p.waitForTimeout(800)

const pct = async () => Number((await p.locator('.pv-zoom .v').innerText()).replace('%', ''))
/** 실제로 그려진 크기 — 숫자가 아니라 **눈에 보이는 종이**를 잰다. */
const paper = async () => (await p.locator('.stage .freelayer').first().boundingBox()).width
const fitOn = async () => (await p.locator('.pv-zoom .fitb.on').count()) === 1
const plus = p.locator('.pv-zoom button', { hasText: '+' }).first()
const minus = p.locator('.pv-zoom button', { hasText: '−' }).first()

ok('(사전) 배율 조절이 화면에 있다', await p.locator('.pv-zoom').count() === 1)
ok('처음엔 「맞춤」이 켜져 있다', await fitOn())

const z0 = await pct(), w0 = await paper()

await plus.click()
await p.waitForTimeout(350)
const z1 = await pct(), w1 = await paper()
ok('+ 를 누르면 커진다', z1 > z0 && w1 > w0 + 20, `${z0}% ${Math.round(w0)}px → ${z1}% ${Math.round(w1)}px`)
ok('사람이 손대면 「맞춤」이 꺼진다', !(await fitOn()))

await minus.click()
await minus.click()
await p.waitForTimeout(350)
const z2 = await pct(), w2 = await paper()
ok('− 를 누르면 작아진다', z2 < z1 && w2 < w1 - 20, `${z1}% ${Math.round(w1)}px → ${z2}% ${Math.round(w2)}px`)

await p.locator('.pv-zoom .fitb').click()
await p.waitForTimeout(350)
ok('「맞춤」이 창에 맞춘 배율로 되돌린다', (await pct()) === z0 && await fitOn(),
   `${z2}% → ${await pct()}% (처음 ${z0}%)`)

// ── 단축키 ─────────────────────────────────────────
await p.keyboard.press('Control+Equal')
await p.waitForTimeout(300)
ok('⌘/Ctrl + 로도 커진다', (await pct()) > z0, `${await pct()}%`)
await p.keyboard.press('Control+Digit0')
await p.waitForTimeout(300)
ok('⌘/Ctrl 0 이 맞춤으로 되돌린다', (await pct()) === z0 && await fitOn())

// ── 맞춤이 100%를 넘을 수 있다 ─────────────────────────
// 세로 이북(432×576)은 넓은 창에서 100% 를 넘겨야 창을 채운다.
// 여기 고정자료는 가로(1040×720)라 맞춤이 100% 아래다 — 그래서 상한이 풀렸는지는
// **창을 크게 만들어** 확인한다. 상한이 남아 있으면 100 에서 멈춘다.
await p.setViewportSize({ width: 2200, height: 1400 })
await p.waitForTimeout(600)
ok('창을 키우면 맞춤 배율이 100%를 넘는다 (상한이 풀렸다)',
   (await pct()) > 100, `${await pct()}%`)

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 화면 배율 통과 ===')
process.exit(fail ? 1 : 0)
