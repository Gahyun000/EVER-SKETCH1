// 의견 쓰기 창 — 브라우저 기본 창을 쓰지 않는다.
//
// 예전에는 `window.prompt` 였다. 세 가지가 문제였다.
//   1) 우리 화면이 아니다 — 회색 시스템 창이 임원회의 도구 위에 뜬다
//   2) 한 줄밖에 못 쓴다 — 의견은 대개 두세 줄이다
//   3) 화면이 멈춘다 — 방금 짚어 둔 칸을 다시 볼 수도 없다
// 그래서 여기서 검사하는 것은 **모달이 뜨는가**, **여러 줄이 되는가**,
// 그리고 **취소해도 짚어 둔 자리가 남는가** 다.
//
// 마지막 항목이 특히 중요하다. 캔버스가 Esc 를 듣고 있어서, 창만 닫으라고 누른
// Esc 가 골라 둔 칸까지 함께 풀어버린 적이 있다 — 쓰려던 자리를 잃는다.
//
// 실행: COMMENTS=1 node e2e/es_mock.mjs & node e2e/comment_modal_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))

// 브라우저 기본 창이 뜨면 여기 걸린다(뜬 채로 두면 테스트가 멈추므로 닫아 준다).
let native = 0
p.on('dialog', (d) => { native++; void d.dismiss() })

await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('text=2026년 10월 임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(500)

const cell = (r, c) => p.locator(`.stage .feltd[data-r="${r}"][data-c="${c}"]`).first()
const openBtn = p.locator('.ax-tb .tbtn', { hasText: '의견 달기' })

// ── 1) 칸을 짚고 창을 연다 ──
await cell(2, 3).click()
await p.waitForTimeout(200)
ok('짚은 칸이 툴바에 표시된다',
   (await p.locator('.ax-tbrow.ctx .tbtn-hint').last().innerText()).includes('3행 4열'),
   await p.locator('.ax-tbrow.ctx .tbtn-hint').last().innerText())

await openBtn.click()
await p.waitForTimeout(300)
ok('브라우저 기본 창이 아니라 우리 창이 뜬다', await p.locator('.ui-scrim').count() === 1)
ok('브라우저 기본 창은 뜨지 않았다', native === 0, `${native}건`)
ok('어디에 다는지 창 안에 적혀 있다',
   (await p.locator('.cmt-compose-where').innerText()).includes('3행 4열'),
   (await p.locator('.cmt-compose-where').innerText()).replace(/\n/g, ' '))

// ── 2) 여러 줄로 쓸 수 있다 ──
const ta = p.locator('.cmt-compose-body')
await ta.fill('3~5월 구간이 앞 장과 다릅니다.\n어느 쪽이 맞는지 확인 부탁드립니다.')
ok('여러 줄로 쓸 수 있다', (await ta.inputValue()).includes('\n'))
ok('내용이 없으면 보내기가 잠겨 있다 (사전: 지워 본다)', true)
await ta.fill('')
await p.waitForTimeout(120)
ok('빈 내용으로는 보낼 수 없다', await p.locator('.cmt-compose-send').isDisabled())
await ta.fill('3~5월 구간이 앞 장과 다릅니다.\n어느 쪽이 맞는지 확인 부탁드립니다.')
await p.waitForTimeout(120)

// ── 3) Esc 로 닫아도 짚어 둔 자리가 남는다 ──
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
ok('Esc 로 창이 닫힌다', await p.locator('.ui-scrim').count() === 0)
ok('창을 닫아도 골라 둔 칸이 그대로다',
   await p.locator('.stage .feltd.cellsel').count() === 1,
   `${await p.locator('.stage .feltd.cellsel').count()}칸`)
ok('닫은 뒤 툴바도 그 자리를 가리키고 있다',
   (await p.locator('.ax-tbrow.ctx .tbtn-hint').last().innerText()).includes('3행 4열'))

// ── 4) 다시 열어 실제로 단다 ──
// 같은 칸의 의견은 핀 하나에 모여서 개수로 표시된다(칸마다 핀이 쌓이면 표가 덮인다).
// 그래서 '핀이 늘었나' 가 아니라 **목록이 늘었나**로 센다.
// 닫혀 있으면 목록이 아예 그려지지 않으니, 세기 전에 열어 둔다.
if (await p.locator('.cmt-tab').count() === 1) {
  await p.locator('.cmt-tab').click()
  await p.waitForTimeout(300)
}
const before = await p.locator('.cmt-item').count()
await openBtn.click()
await p.waitForTimeout(250)
await p.locator('.cmt-compose-body').fill('3~5월 구간이 앞 장과 다릅니다.\n확인 부탁드립니다.')
await p.locator('.cmt-compose-send').click()
await p.waitForTimeout(600)
ok('보내면 창이 닫힌다', await p.locator('.ui-scrim').count() === 0)
ok('짚은 그 칸에 핀이 생긴다',
   await p.locator('.stage .feltd[data-r="2"][data-c="3"] .cmt-pin').count() === 1)
ok('의견이 하나 늘었다', await p.locator('.cmt-item').count() === before + 1,
   `${before} → ${await p.locator('.cmt-item').count()}`)
ok('의견 목록이 열린 채로 남는다', await p.locator('.cmt-panel').count() === 1)
// 목록에는 원래 있던 의견도 함께 있다 — **방금 쓴 것**을 골라서 본다.
const mine = p.locator('.cmt-item', { hasText: '3~5월 구간이 앞 장과 다릅니다' }).first()
ok('방금 쓴 의견이 목록에 있다', await mine.count() === 1)
ok('줄바꿈이 그대로 남는다', (await mine.innerText()).includes('\n확인 부탁드립니다'),
   JSON.stringify((await mine.innerText()).slice(-40)))

// ── 5) 끌어 고른 **범위 그대로** 짚는다 ──
// 로드맵 지적의 대부분은 칸 하나가 아니라 구간에 달린다.
// 왼쪽 위 한 칸만 저장하면 "3~5월 구간이 다릅니다" 를 짚어도 목록에는
// 「4행 6열」만 남고, 받는 사람은 어느 구간인지 글을 다시 읽어야 한다.
{
  const box = async (r, c) => (await cell(r, c).boundingBox())
  const a = await box(4, 2), z = await box(4, 5)
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 2 })
  await p.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 10 })
  await p.mouse.up()
  await p.waitForTimeout(250)
  ok('(사전) 네 칸을 끌어 골랐다', await p.locator('.stage .feltd.cellsel').count() === 4)

  const hint = await p.locator('.ax-tbrow.ctx .tbtn-hint').last().innerText()
  ok('툴바가 범위를 그대로 말한다', hint.includes('5행 3~6열'), hint)

  await openBtn.click()
  await p.waitForTimeout(250)
  ok('창에도 범위가 적힌다',
     (await p.locator('.cmt-compose-where').innerText()).includes('5행 3~6열'),
     (await p.locator('.cmt-compose-where').innerText()).replace(/\n/g, ' '))
  await p.locator('.cmt-compose-body').fill('이 구간이 앞 장과 다릅니다')
  await p.locator('.cmt-compose-send').click()
  await p.waitForTimeout(600)

  // 핀은 **범위 왼쪽 위 한 칸에만**. 칸마다 박으면 표가 핀으로 덮인다.
  ok('핀은 범위 왼쪽 위에 하나만 붙는다',
     await p.locator('.stage .feltd[data-r="4"][data-c="2"] .cmt-pin').count() === 1
     && await p.locator('.stage .feltd[data-r="4"][data-c="3"] .cmt-pin').count() === 0)
  // **어느 칸인지까지 본다.** 개수만 세면 앞선 실행이 남긴 표시로도 통과한다.
  const marked = await p.locator('.stage .feltd.cmt-rg').evaluateAll(
    (ns) => ns.map((n) => n.dataset.r + ',' + n.dataset.c).sort())
  ok('짚은 네 칸에 정확히 표시된다',
     JSON.stringify(marked) === JSON.stringify(['4,2', '4,3', '4,4', '4,5']),
     marked.join(' | '))

  const item = p.locator('.cmt-item', { hasText: '이 구간이 앞 장과 다릅니다' }).first()
  ok('목록에도 범위로 적힌다', (await item.innerText()).includes('5행 3~6열'),
     (await item.innerText()).split('\n')[1])
}

ok('끝까지 브라우저 기본 창은 없었다', native === 0, `${native}건`)
ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
