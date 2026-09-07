// **예전에 만든 자료**를 열었을 때도 표를 다룰 수 있는가.
//
// 2026-09-07 에 표준 양식에서 `locked: true` 를 뺐다. 그런데 그건 **앞으로 만들 자료**
// 에만 적용된다 — 이미 만들어진 자료의 state 에는 요소마다 그대로 적혀 있다.
// 그래서 사용자가 예전 자료를 열고 화면 녹화를 보내 왔다: 표를 골라도 크기 손잡이가
// 안 나온다. 「기능을 넣었다는데 내 화면에는 없다」로 보이는 종류의 사고다.
//
// **기본값을 바꾸는 변경은 이미 나간 자료를 어떻게 할지까지 정해야 끝난다.**
// 여기서는 그 나머지 절반을 브라우저에서 확인한다.
//
// 실행: LEGACY=1 node e2e/es_mock.mjs & node e2e/legacy_open_smoke.mjs
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

// 이 스위트가 뜻을 가지려면 **정말로 잠긴 자료**여야 한다. 먼저 그것부터 확인한다 —
// 안 그러면 늘 통과하는 검사가 된다.
ok('(사전) 모의 서버가 잠긴 옛 자료를 보냈다',
   process.env.LEGACY === '1', 'LEGACY=1 로 띄워야 합니다')

await p.locator('.stage .feltd[data-r="3"][data-c="2"]').first().click()
await p.waitForTimeout(350)

ok('옛 자료에서도 크기 손잡이가 나온다',
   await p.locator('.stage .rs-h').count() === 8,
   `${await p.locator('.stage .rs-h').count()}개`)
ok('열 경계선 손잡이도 나온다',
   await p.locator('.stage .trk-col').count() === 17,
   `${await p.locator('.stage .trk-col').count()}개`)
ok('이동 손잡이(⠿)도 나온다', await p.locator('.stage .tbl-move').count() === 1)
ok('잠김 표시가 남아 있지 않다',
   await p.locator('.stage .fel.locked').count() === 0,
   `${await p.locator('.stage .fel.locked').count()}개`)

// 실제로 움직이는지까지 본다. 손잡이만 나오고 안 움직이면 고친 게 아니다.
const t0 = await p.locator('.stage .fel.table').first().boundingBox()
const g = await p.locator('.stage .tbl-move').first().boundingBox()
await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await p.mouse.down()
await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 30, { steps: 8 })
await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 55, { steps: 8 })
await p.mouse.up()
await p.waitForTimeout(300)
const t1 = await p.locator('.stage .fel.table').first().boundingBox()
ok('옛 자료의 표도 실제로 움직인다', Math.abs(t1.y - t0.y) > 20,
   `${Math.round(t0.y)} → ${Math.round(t1.y)}`)

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 옛 자료 열기 통과 ===')
process.exit(fail ? 1 : 0)
