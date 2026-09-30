// **표 안에서 나가는 길** — 밖을 누르지 않고도 편집이 풀리고, 그대로 끌면 범위가 잡힌다.
//
// 2026-09-17 화면 기록 + 사용자:
//   「표 클릭했을때 밖에 클릭해야 글씨 풀리는게 불편함」
//   「드래그 하려면 밖에 클릭해야해서 귀찮음」
//
// 소스 검사(table_edit_exit.test.mjs)는 **구조가 규칙에 맞다**까지만 말한다.
// 「정말로 한 번 눌러서 풀리는가」는 진짜 브라우저라야 안다 — 편집 중 칸은
// contentEditable 이고, 거기서 오는 pointerdown·focus·blur·캐럿 이동은
// React 상태와 브라우저 기본 동작이 같은 자리를 두고 다투는 지점이기 때문이다.
//
// 실행: node e2e/table_edit_exit_smoke.mjs   (모의 서버가 떠 있어야 한다)
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
await p.locator('text=임원회의').first().dblclick()   // 2026-09-17 이후 목록은 **두 번 눌러야** 연다
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })

// 같은 페이지가 왼쪽 필름스트립에도 그려진다 — 반드시 작업창(.stage)으로 좁힌다.
const cell = (r, c) => p.locator(`.stage .feltd[data-r="${r}"][data-c="${c}"]`).first()
await p.locator('.stage .fel.table').first().waitFor({ timeout: 10000 })
await p.waitForTimeout(400)

const editing = (r, c) => cell(r, c).evaluate((n) => n.getAttribute('contenteditable') === 'true')
const anyEditing = () => p.locator('.stage .feltd[contenteditable="true"]').count()
const selCount = () => p.locator('.stage .feltd.cellsel').count()
const box = async (r, c) => {
  const bb = await cell(r, c).boundingBox()
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
}

// 로드맵(SLOT-A)은 머리글이 2행이라 r=2 부터가 쓸 수 있는 칸이다.

// ── ① 편집 중 **다른 칸**을 누르면 그 자리에서 풀린다 ──────────────
await cell(2, 1).dblclick()
await p.waitForTimeout(250)
await p.keyboard.type('가')
await p.waitForTimeout(200)
ok('더블클릭하면 그 칸이 편집 상태다', await editing(2, 1))

await cell(3, 2).click()
await p.waitForTimeout(300)
ok('**다른 칸을 한 번 누르면 편집이 풀린다** — 밖을 누를 필요가 없다',
   (await anyEditing()) === 0, `편집 중인 칸 ${await anyEditing()}개`)
ok('누른 그 칸이 골라진다',
   (await cell(3, 2).getAttribute('class') || '').includes('cellsel'))
ok('앞 칸에 친 글자는 저장돼 있다', (await cell(2, 1).textContent()).includes('가'),
   JSON.stringify(await cell(2, 1).textContent()))

// ── ② 편집 중에 **끌면** 범위 선택이 이어진다 ────────────────────
await cell(2, 1).dblclick()
await p.waitForTimeout(250)
ok('다시 편집 상태로 들어간다', await editing(2, 1))

{
  const from = await box(3, 1), to = await box(3, 4)
  await p.mouse.move(from.x, from.y)
  await p.mouse.down()
  await p.mouse.move((from.x + to.x) / 2, to.y, { steps: 8 })
  await p.mouse.move(to.x, to.y, { steps: 8 })
  await p.mouse.up()
  await p.waitForTimeout(300)
  ok('끄는 동안 편집이 남아 있지 않다', (await anyEditing()) === 0)
  ok('**한 동작으로 범위가 잡힌다** — 「드래그하려면 밖을 클릭」이 없어진 지점',
     (await selCount()) >= 4, `고른 칸 ${await selCount()}개`)
}

// ── ③ **같은 칸**을 누른 것은 글자 사이로 커서를 옮기는 중이다 ──────
await cell(2, 3).dblclick()
await p.waitForTimeout(250)
await p.keyboard.type('다라')
await p.waitForTimeout(200)
{
  const c = await box(2, 3)
  await p.mouse.click(c.x, c.y)
  await p.waitForTimeout(250)
  ok('같은 칸을 다시 눌러도 편집이 유지된다 — 글자 가운데를 짚는 일이 살아 있다',
     await editing(2, 3))
}

// ── ④ 편집 중에도 표를 옮길 수 있다(⠿ 손잡이) ────────────────────
ok('편집 중에도 이동 손잡이가 보인다', (await p.locator('.stage .tbl-move').count()) === 1)

// ── ④-2 표를 옮기면 편집이 풀린다 — **테두리든 ⠿ 든 같다** (2026-09-21 · 시안 ㄷ) ──
// 전에는 테두리로 끌면 편집이 남아 이어 친 글자가 칸에 붙고, ⠿ 로 끌면 풀렸다.
{
  const tbl = p.locator('.stage .fel.table').first()
  const drag = async (x, y) => {
    await p.mouse.move(x, y); await p.mouse.down()
    await p.mouse.move(x + 30, y + 24, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300)
  }
  for (const how of ['테두리', '⠿ 손잡이']) {
    await cell(2, 4).dblclick(); await p.waitForTimeout(250)
    await p.keyboard.type('마'); await p.waitForTimeout(150)
    const before = await cell(2, 4).textContent()
    const b0 = await tbl.boundingBox()
    if (how === '테두리') await drag(b0.x + b0.width / 2, b0.y + 1)
    else { const g = await p.locator('.stage .tbl-move').boundingBox(); await drag(g.x + g.width / 2, g.y + g.height / 2) }
    const b1 = await tbl.boundingBox()
    ok(`${how}로 끌면 표가 움직인다`, Math.abs(b1.x - b0.x) + Math.abs(b1.y - b0.y) > 5, `(${Math.round(b0.x)},${Math.round(b0.y)}) → (${Math.round(b1.x)},${Math.round(b1.y)})`)
    ok(`${how}로 끌면 **편집이 풀린다**`, (await anyEditing()) === 0, `편집 중인 칸 ${await anyEditing()}개`)
    ok(`${how} — 친 글자는 저장돼 있다`, (await cell(2, 4).textContent()) === before, JSON.stringify(await cell(2, 4).textContent()))
    await p.keyboard.type('바'); await p.waitForTimeout(150)
    ok(`${how} — 이어 친 글자가 칸으로 새지 않는다`, !(await cell(2, 4).textContent()).includes('바'))
  }
  // 표가 골라진 채 남으므로 다시 칸 편집으로 들어가 Esc 검사를 이어 간다
  await cell(2, 3).dblclick(); await p.waitForTimeout(250)
}

// ── ⑤ Esc 로 나가는 길도 그대로 ──────────────────────────────────
await p.keyboard.press('Escape')
await p.waitForTimeout(250)
ok('Escape 로도 풀린다', (await anyEditing()) === 0)

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 표 편집 나가기 통과 ===')
process.exit(fail ? 1 : 0)
