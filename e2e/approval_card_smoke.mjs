// 결재 카드 — 편집 화면 오른쪽 패널 맨 위(사용자 결정 ㄱ).
//
// **가장 중요한 검사는 「저장이 제출보다 먼저 가는가」다.**
// 결재본은 화면에 보이는 것이 아니라 **서버에 저장된 문서**를 얼린다.
// 목록에서 낼 때는 나가면서 `flushSave()` 가 도는 덕에 우연히 맞았다 —
// 편집 화면에서 바로 내면 그 우연이 없다. 순서가 뒤집히면
// **방금 쓴 줄이 빠진 채로 얼어붙고**, 그건 화면 어디에도 안 보인다.
//
// 실행: node e2e/es_mock.mjs & node e2e/approval_card_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (n, c, x = '') => {
  console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? '  — ' + x : ''))
  if (!c) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1500, height: 950 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))
let native = 0
p.on('dialog', (d) => { native++; void d.dismiss() })

// **오간 순서를 그대로 적는다.** 「둘 다 갔다」가 아니라 「어느 쪽이 먼저였나」를 본다.
const calls = []
p.on('request', (r) => {
  const u = r.url(), m = r.method()
  if (m === 'PUT' && /\/api\/projects\//.test(u)) calls.push('저장')
  if (m === 'POST' && /\/api\/approvals\/request/.test(u)) calls.push('제출')
})

await p.goto(URL, { waitUntil: 'networkidle' })
await p.evaluate(() => fetch('/__submits/reset'))
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(800)

// ── 자리 ────────────────────────────────────
ok('(사전) 카드가 있다', await p.locator('.apc').count() === 1)
if (await p.locator('.apc').count() !== 1) { await b.close(); process.exit(1) }

const cardBox = await p.locator('.apc').boundingBox()
const tabsBox = await p.locator('.insp-tabs').boundingBox().catch(() => null)
ok('접힌 카드는 한 줄이다', cardBox.height <= 40, `${Math.round(cardBox.height)}px`)
ok('접힌 줄이 상태를 말한다', (await p.locator('.apc-st').innerText()).trim() === '작성 중',
   await p.locator('.apc-st').innerText())

// ── ㄱ 의 핵심: 무엇을 골라도 안 사라진다 ──────────
// 「아무것도 안 골랐을 때만」(ㄴ)을 안 고른 이유가 이것이다 —
// 다 쓴 사람은 대개 뭔가를 고른 채로 끝낸다.
const lb = await p.locator('.stage .freelayer').first().boundingBox()
await p.mouse.click(lb.x + 300, lb.y + 200)          // 표 하나를 고른다
await p.waitForTimeout(400)
ok('표를 골라도 카드가 그대로 있다', await p.locator('.apc').count() === 1)
const tabs2 = await p.locator('.insp-tabs').boundingBox().catch(() => null)
if (tabs2) ok('카드가 탭보다 **위**에 있다', cardBox.y < tabs2.y,
              `카드 ${Math.round(cardBox.y)} / 탭 ${Math.round(tabs2.y)}`)
else ok('(참고) 탭을 못 찾음 — 자리 비교는 건너뜀', true)

// ── 안 쓴 자리를 짚어 준다 ─────────────────────
await p.locator('.apc-hd').click()
await p.waitForTimeout(350)
const gaps = await p.locator('.apc-chk .no').count()
ok('안 쓴 자리를 짚는다', gaps >= 1, `${gaps}건`)
const body = await p.locator('.apc-body').innerText()
ok('로드맵의 **달 칸**은 빈 칸으로 안 센다 — 색으로 채우는 자리다',
   !/빈 칸 \d{2,}/.test(body), body.replace(/\n+/g, ' | ').slice(0, 120))

const go = p.locator('.apc-chk .go', { hasText: '그 칸으로' }).first()
if (await go.count()) {
  await go.click()
  await p.waitForTimeout(500)
  ok('「그 칸으로」가 표를 고르고 칸을 짚는다',
     await p.locator('.fel.table.sel, .fel.sel').count() >= 1)
}

// ── 저장 안 된 변경을 말한다 ────────────────────
//
// **저장을 막아 「저장 안 됨」을 확실히 만든다.** 그냥 두면 자동저장이 먼저 끝나서
// 볼 것이 사라진다 — 그러면 이 검사는 기계가 바쁜 날에만 통과한다.
await p.route('**/api/projects/**', (route) => {
  const m = route.request().method()
  return (m === 'PUT' || m === 'PATCH') ? route.abort() : route.continue()
})
await p.locator('.ax-tb .ib[title="표"]').first().click()
await p.mouse.click(lb.x + 140, lb.y + lb.height - 110)
await p.waitForTimeout(1200)
const chk = await p.locator('.apc-chk').innerText()
ok('저장 안 된 변경을 말한다', /저장 안 된 변경/.test(chk), chk.replace(/\n+/g, ' | ').slice(0, 90))

// 확인창도 같은 말을 한다 — 내기 직전에 한 번 더.
await p.locator('.apc-btn', { hasText: '결재 제출' }).first().click()
await p.waitForTimeout(450)
const warn = await p.locator('.ui-modal').first().innerText()
ok('저장 안 됐다는 것도 확인창이 말한다', /저장한 뒤에 냅니다/.test(warn),
   warn.replace(/\n+/g, ' | ').slice(0, 130))
await p.locator('.ui-modal-foot .ui-modal-cancel').first().click()
await p.waitForTimeout(300)

// 다시 저장이 되게 풀어 준다 — 아래는 **순서**를 보는 검사다.
await p.unroute('**/api/projects/**')
await p.waitForTimeout(1200)

// ── 본 검사: 저장이 제출보다 먼저 간다 ────────────
calls.length = 0
await p.locator('.apc-btn', { hasText: '결재 제출' }).first().click()
await p.waitForTimeout(500)
ok('확인창이 공용 껍데기로 뜬다', await p.locator('.ui-scrim').count() === 1)
ok('브라우저 기본 창이 아니다', native === 0, `${native}건`)
const dlg = await p.locator('.ui-modal').first().innerText()
ok('얼어붙는다는 말이 확인창에 있다', /얼어붙습니다/.test(dlg))
ok('안 쓴 자리도 알리되 **막지는 않는다**',
   /아직 안 쓴 자리가/.test(dlg) && !(await p.locator('.ui-modal-foot button', { hasText: '제출' }).first().isDisabled()),
   dlg.replace(/\n+/g, ' | ').slice(0, 130))

await p.locator('.ui-modal-foot button', { hasText: '제출' }).first().click()
await p.waitForTimeout(2200)

ok('제출이 갔다', calls.includes('제출'), JSON.stringify(calls))
ok('**저장이 제출보다 먼저 갔다**', calls.indexOf('저장') !== -1 && calls.indexOf('저장') < calls.indexOf('제출'),
   JSON.stringify(calls))
const sent = await p.evaluate(async () => (await (await fetch('/__submits')).json()).submits)
ok('제출은 한 번만 갔다', sent === 1, `${sent}번`)
ok('화면 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n✗ ${fail}건 실패` : '\n✓ 모두 통과')
process.exit(fail ? 1 : 0)
