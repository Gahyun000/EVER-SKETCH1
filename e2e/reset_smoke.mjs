// 「처음부터 다시」 — 내가 망쳤을 때 혼자 해결하는 길.
//
// 왜 '지우기' 가 아니라 '되돌리기' 인가:
// 배부본을 지우면 그 사람이 회차 목록에서 사라진다. 관리자 화면에는
// "3명 중 2명" 으로 보이고, 누가 빠졌는지도 알 수 없다. 혼자 해결하려던
// 일이 오히려 관리자를 거쳐야 하는 일이 된다.
//
// 검사하는 것
//   1) 되돌릴 수 없는 조작이니 **무엇이 사라지는지** 먼저 보여준다
//   2) 쓴 것이 있으면 한 번 더 확인받는다
//   3) 의견을 어떻게 할지 고르게 하고, **기본은 남기는 쪽**이다
//   4) 제출한 뒤에는 잠긴다 — 관리자가 보고 있는 자료가 발밑에서 비워지면 안 된다
//
// 실행: WRITER_ROW=draft COMMENTS=1 node e2e/es_mock.mjs & node e2e/reset_smoke.mjs
//       (제출 뒤 검사는 WRITER_ROW=submitted CYCLE_STATUS=review 로 띄운다)
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined
const ROW = process.env.WRITER_ROW || 'draft'

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1500, height: 950 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))
let native = 0
p.on('dialog', (d) => { native++; void d.dismiss() })

await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('button', { hasText: '회차' }).first().click()
await p.waitForSelector('.cy-detail', { timeout: 15000 })
await p.waitForTimeout(400)

const mineRow = p.locator('.cy-table tbody tr').first()

if (ROW === 'submitted') {
  // ── 제출한 뒤 ──
  const acts = await mineRow.locator('.cy-mini').allInnerTexts()
  ok('제출한 뒤에는 「처음부터 다시」가 없다', !acts.some((t) => t.includes('처음부터')),
     acts.join(' | '))
  // 회차가 '검토 중' 이면 관리자가 그 자료를 기준으로 일하고 있다.
  ok('제출 취소 버튼은 이유와 함께 잠겨 있다',
     await mineRow.locator('.cy-mini', { hasText: '제출 취소' }).isDisabled())
  const tip = await mineRow.locator('.cy-mini', { hasText: '제출 취소' }).getAttribute('title')
  ok('무엇을 해야 하는지 말해 준다', (tip || '').includes('반려'), tip)
} else {
  // ── 아직 작성 중 ──
  ok('내 행에 「처음부터 다시」가 있다',
     await mineRow.locator('.cy-mini', { hasText: '처음부터 다시' }).count() === 1)

  await mineRow.locator('.cy-mini', { hasText: '처음부터 다시' }).click()
  await p.waitForTimeout(500)
  ok('브라우저 기본 창이 아니다', native === 0 && await p.locator('.ui-scrim').count() === 1)

  const body = await p.locator('.cy-modal').innerText()
  ok('무엇이 사라지는지 숫자로 보여준다', body.includes('12'), body.replace(/\n/g, ' ').slice(0, 90))
  ok('되살릴 수 없다고 말한다', body.includes('되살릴 수 없습니다'))
  ok('달린 의견 수도 함께 보여준다', body.includes('의견'))

  // 쓴 것이 있으면 한 번 더 확인받는다.
  const go = p.locator('.cy-modal-btns .cy-btn.danger-solid')
  ok('확인 전에는 버튼이 잠겨 있다', await go.isDisabled())
  ok('의견을 어떻게 할지 고르게 한다', await p.locator('.cy-rs-opt input').count() === 2)
  ok('기본은 의견을 남기는 쪽이다',
     await p.locator('.cy-rs-opt input').first().isChecked(),
     '검토 이력이 조용히 사라지는 것이 제일 나쁘다')

  await p.locator('.cy-rv-agree input').check()
  await p.waitForTimeout(150)
  ok('확인하면 버튼이 열린다', await go.isEnabled())

  await go.click()
  await p.waitForTimeout(600)
  const sent = await (await p.request.get(URL.replace(/\/$/, '') + '/__lastReset')).json()
  ok('서버에 confirm 이 붙어 나간다', sent.confirm === true, JSON.stringify(sent))
  ok('의견은 남기라고 보낸다', sent.keep_comments === true, JSON.stringify(sent))
  ok('끝나면 창이 닫힌다', await p.locator('.ui-scrim').count() === 0)
  ok('무엇을 했는지 화면에 남는다',
     (await p.locator('.cy-msg.ok').innerText()).includes('되돌렸습니다'),
     await p.locator('.cy-msg.ok').innerText())
}

ok('브라우저 기본 창은 끝까지 없었다', native === 0, `${native}건`)
ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
