// 동료의 자료를 열었을 때 — 보이되 고쳐지지 않는다.
//
// 같은 회의를 준비하는 사람끼리 서로의 장을 볼 수 있게 열었다.
// "3~5월 구간이 앞 장과 다릅니다" 는 앞 장을 볼 수 없으면 할 수 없는 말이고,
// 막아두면 결국 캡처를 메신저로 주고받게 된다 — 그게 훨씬 위험하다.
//
// 대신 **고치는 것은 끝까지 본인 것만**이다. 그리고 잠갔으면 잠긴 이유를
// 화면에서 말해야 한다. 회색으로만 만들어 두면 '왜 안 되지' 로 끝난다.
//
// 검사하는 것
//   1) 남의 장은 편집이 잠긴다 (그리고 왜 잠겼는지 보인다)
//   2) 잠긴 자료에서는 자동저장이 아예 돌지 않는다 (돌면 403 이 반복된다)
//   3) 작성 중에는 남의 장에 의견을 달 수 없다 — 그 이유도 말해 준다
//   4) 검토 단계로 넘어가면 의견은 열린다 (편집은 그대로 잠김)
//
// 실행: PEER=writing node e2e/es_mock.mjs & node e2e/peer_readonly_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined
const STAGE = process.env.PEER || 'writing'

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))

// 저장 요청이 나가는지 지켜본다. 읽기 전용인데 나가면 매번 403 이고,
// 사용자는 자기가 뭔가 망가뜨린 줄 안다.
let saves = 0
p.on('request', (r) => {
  if (/\/api\/projects\/p_test/.test(r.url()) && (r.method() === 'PUT' || r.method() === 'PATCH')) saves++
})

await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('text=2026년 10월 임원회의').first().click()
await p.waitForSelector('.stage', { timeout: 15000 })
await p.waitForTimeout(600)

// ── 1) 잠겼고, 이유가 보인다 ──
ok('편집 층이 잠겨 있다', await p.locator('.stage .freelayer.off').count() === 1,
   `off ${await p.locator('.stage .freelayer.off').count()} / 전체 ${await p.locator('.stage .freelayer').count()}`)
const head = await p.locator('.pv-h').innerText()
ok('읽기 전용이라고 말한다', head.includes('읽기 전용'), head.replace(/\n/g, ' '))
ok('왜 잠겼는지도 말한다', head.includes('동료의 자료'), head.replace(/\n/g, ' ').slice(0, 70))

// ── 2) 눌러도 고쳐지지 않는다 ──
const cell = p.locator('.stage .feltd').first()
await cell.click({ force: true })
await p.waitForTimeout(200)
ok('칸을 눌러도 선택되지 않는다', await p.locator('.stage .feltd.cellsel').count() === 0)

// **캔버스만 잠그는 것으로는 부족하다.**
// 오른쪽 패널의 종이·방향 같은 설정은 캔버스를 거치지 않고 문서를 바꾼다.
// 그것까지 막지 않으면, 남의 장을 열어 놓고 방향을 한 번 누르는 것만으로
// 자동저장이 돌고 매번 403 이 뜬다 — 사용자는 자기가 망가뜨린 줄 안다.
await p.locator('.insp-row.seg button', { hasText: '세로' }).click()
await p.waitForTimeout(1600)          // 자동저장 debounce(800ms)보다 길게
ok('설정을 바꿔도 저장 요청이 나가지 않는다', saves === 0, `저장 요청 ${saves}건`)
ok('저장 상태를 「저장 안 됨」으로 만들지 않는다',
   !(await p.locator('.save-lab').innerText()).includes('저장 안 됨'),
   await p.locator('.save-lab').innerText())

// ── 3·4) 의견은 회차 단계에 따라 ──
const btn = p.locator('.ax-tb .tbtn', { hasText: '의견 달기' })
if (STAGE === 'review') {
  ok('검토 단계에서는 의견을 달 수 있다', await btn.isEnabled())
  await btn.click()
  await p.waitForTimeout(300)
  ok('의견 쓰기 창이 열린다', await p.locator('.ui-scrim').count() === 1)
  await p.keyboard.press('Escape')
} else {
  ok('작성 중에는 의견 버튼이 잠겨 있다', await btn.isDisabled())
  ok('언제부터 되는지 알려준다',
     (await p.locator('.ax-tbrow.ctx .tbtn-hint').last().innerText()).includes('검토 단계부터'),
     await p.locator('.ax-tbrow.ctx .tbtn-hint').last().innerText())
  await p.locator('.cmt-tab').click()
  await p.waitForTimeout(300)
  const locked = await p.locator('.cmt-locked').innerText()
  ok('의견 목록에서도 이유를 말한다', locked.includes('검토 단계'), locked.replace(/\n/g, ' '))
  ok('그동안 입력칸은 잠겨 있다', await p.locator('.cmt-new textarea').isDisabled())
}

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
