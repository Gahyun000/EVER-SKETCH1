// 표준 양식의 표와 글상자를 **옮기고 크기를 바꿀 수 있는가** — 그리고 종이 밖으로는
// 못 나가는가.
//
// 왜 이 스위트가 생겼는가
//   양식 요소는 모두 `locked: true` 였다. 근거는 「잠그지 않으면 임원마다 레이아웃이
//   달라져 취합이 깨진다」였는데 사실이 아니었다 — 취합은 슬롯 이름과 칸 값을 읽지
//   x/y 를 읽지 않는다. 그동안 임원들은 내용이 자리에 안 들어가면 글자가 잘리는 것으로
//   대가를 치렀다. 2026-09-07 에 잠금을 풀었다.
//
//   푼 대신 새 사고가 생긴다: **끌다가 종이 밖으로 나가면 그 표는 아무에게도 안 보인다.**
//   작성자는 결재에 올린 뒤에야 안다. 그래서 화면이 가장자리에서 붙잡고(FreeLayer.penIn),
//   서버가 저장할 때 다시 본다(server/template_guard.py). 여기서는 앞의 것을 확인한다.
//
// 실행: node e2e/table_move_smoke.mjs
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
await p.waitForTimeout(600)

const layer = p.locator('.stage .freelayer').first()
const roadmap = p.locator('.stage .fel.table').first()
await roadmap.waitFor({ timeout: 10000 })

const drag = async (from, dx, dy, steps = 14) => {
  await p.mouse.move(from.x, from.y)
  await p.mouse.down()
  await p.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps })
  await p.mouse.move(from.x + dx, from.y + dy, { steps })
  await p.mouse.up()
  await p.waitForTimeout(250)
}
const clearSel = async () => {
  const lb = await layer.boundingBox()
  await p.mouse.click(lb.x + lb.width / 2, lb.y + lb.height - 8)
  await p.waitForTimeout(200)
}

// ── 1) 표를 옮길 수 있다 ────────────────────────────
await p.locator('.stage .feltd[data-r="3"][data-c="2"]').first().click()
await p.waitForTimeout(200)
const grip = p.locator('.stage .tbl-move').first()
ok('표를 고르면 이동 손잡이(⠿)가 나온다', await grip.count() === 1)

const before = await roadmap.boundingBox()
const gb = await grip.boundingBox()
await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 0, 60)
const after = await roadmap.boundingBox()
ok('표가 실제로 움직인다', Math.abs(after.y - before.y) > 20,
   `${Math.round(before.y)} → ${Math.round(after.y)}`)

// ── 2) 종이 밖으로는 못 나간다 ───────────────────────
{
  const g2 = await p.locator('.stage .tbl-move').first().boundingBox()
  await drag({ x: g2.x + g2.width / 2, y: g2.y + g2.height / 2 }, 0, 4000, 20)
  const lb = await layer.boundingBox()
  const t = await roadmap.boundingBox()
  ok('아래로 끝까지 끌어도 종이 안에 남는다',
     t.y + t.height <= lb.y + lb.height + 1.5,
     `표 끝 ${Math.round(t.y + t.height)} / 종이 끝 ${Math.round(lb.y + lb.height)}`)
  ok('종이 위로도 안 넘어간다', t.y >= lb.y - 1.5)
}

// ── 3) 머리글 글상자도 움직인다 ───────────────────────
// **크기 조절보다 먼저 한다.** 아래에서 로드맵을 종이 가득 늘려 버리면
// 그 표가 머리글을 덮어 버려서 글상자를 잡을 수가 없다.
await clearSel()
{
  const head = p.locator('.stage .fel.text').filter({ hasText: '임원회의' }).first()
  const hbx = await head.boundingBox()
  await drag({ x: hbx.x + 10, y: hbx.y + hbx.height / 2 }, 0, 70)
  const y1 = (await head.boundingBox()).y
  ok('머리글 글상자를 옮길 수 있다 (예전엔 잠겨 있었다)', Math.abs(y1 - hbx.y) > 20,
     `${Math.round(hbx.y)} → ${Math.round(y1)}`)
}

// ── 4) 크기를 바꿀 수 있고, 그것도 종이 안이다 ──────────
await clearSel()
await p.locator('.stage .feltd[data-r="3"][data-c="2"]').first().click()
await p.waitForTimeout(200)
await p.keyboard.press('Escape')          // 칸 선택을 풀어야 크기 손잡이가 나온다
await p.locator('.stage .fel.table').first().click({ position: { x: 5, y: 5 } })
await p.waitForTimeout(250)

const se = p.locator('.stage .rs-se, .rs-se').first()
if (await se.count() === 0) {
  ok('크기 손잡이가 보인다', false, '.rs-se 를 못 찾음')
} else {
  ok('크기 손잡이가 보인다', true)
  const h0 = (await roadmap.boundingBox()).height
  const hb = await se.boundingBox()
  await drag({ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, 0, 90)
  const h1 = (await roadmap.boundingBox()).height
  ok('세로 높이를 늘릴 수 있다', h1 - h0 > 30, `${Math.round(h0)} → ${Math.round(h1)}`)

  const hb2 = await p.locator('.rs-se').first().boundingBox()
  await drag({ x: hb2.x + hb2.width / 2, y: hb2.y + hb2.height / 2 }, 3000, 3000, 20)
  const lb = await layer.boundingBox()
  const t = await roadmap.boundingBox()
  ok('끝까지 늘려도 종이를 넘지 않는다',
     t.x + t.width <= lb.x + lb.width + 1.5 && t.y + t.height <= lb.y + lb.height + 1.5,
     `표 ${Math.round(t.x + t.width)}×${Math.round(t.y + t.height)} / 종이 ${Math.round(lb.x + lb.width)}×${Math.round(lb.y + lb.height)}`)
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 표 이동 · 크기 통과 ===')
process.exit(fail ? 1 : 0)
