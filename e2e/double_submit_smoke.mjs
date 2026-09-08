// 확인창의 확인 버튼을 두 번 누르면 요청이 두 번 가는가 (A①).
//
// **왜 이게 화면 문제인가.** 서버는 두 번째를 막는다 — `이미 결재 대기 중입니다`.
// 그러니 자료가 두 번 제출되지는 않는다. 문제는 **사람에게 보이는 것**이다:
// 첫 번째가 성공했는데도 확인창에는 빨간 글씨가 남고, 낸 사람은 **실패한 줄 안다.**
// 그리고 다시 누른다. 표준이 「중복 제출 방지」를 콕 집어 요구하는 이유다.
//
// **구멍은 응답을 기다리는 사이에만 열린다.** 그래서 mock 이 400ms 늦게 답한다 —
// 빠른 기계에서만 통과하는 검사는 검사가 아니다.
//
// 실행: node e2e/es_mock.mjs & node e2e/double_submit_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

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

// 화면이 실제로 보낸 횟수를 센다 — mock 이 세는 것과 따로 본다.
let sent = 0
p.on('request', (r) => {
  if (r.method() === 'POST' && r.url().includes('/api/approvals/request')) sent++
})

await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForTimeout(400)

// 앞 회차가 남긴 수를 지운다 — mock 을 살려 둔 채 두 번 돌려도 같은 결과가 나와야 한다.
await p.evaluate(() => fetch('/__submits/reset'))
await p.waitForTimeout(100)

// ── 사전 확인 ──────────────────────────────
// 여기가 무너지면 아래 검사는 **눌러 보지도 않고 조용히 통과한다.**
// 이 저장소에서 이미 두 번 그랬다(connect_points_smoke).
const submitBtn = p.locator('.lib-act[title="결재 제출"]').first()
ok('(사전) 목록에 제출 버튼이 있다', await submitBtn.count() > 0)
if (await submitBtn.count() === 0) { await b.close(); process.exit(1) }

await submitBtn.click()
await p.waitForTimeout(300)

const dlg = p.locator('.lib-confirm-box', { hasText: '결재 제출' }).first()
ok('(사전) 제출 확인창이 떴다', await dlg.count() > 0)
ok('(사전) 브라우저 기본 창이 아니다', native === 0, `${native}건`)

// **글자로 찾지 않는다.** 잠기면 라벨이 「제출 중…」으로 바뀌는 것이 이 고침의 일부라,
// `hasText: /^제출$/` 로 잡으면 잠긴 뒤 버튼을 놓치고 **검사가 조용히 통과한다.**
// 실제로 처음에 그렇게 썼고, 고쳐 놓고도 「안 잠긴다」고 나왔다.
const okBtn = dlg.locator('.lib-confirm-actions .lib-btn.dark').first()
ok('(사전) 확인 버튼이 있다', await okBtn.count() > 0)
ok('(사전) 처음 라벨은 「제출」이다', (await okBtn.innerText()).trim() === '제출',
   await okBtn.innerText())
if (await okBtn.count() === 0) { await b.close(); process.exit(1) }

// ── 본 검사 ────────────────────────────────
// 두 번 빠르게 누른다. 사람이 실제로 하는 짓이다 —
// 창이 안 닫히고 아무 반응이 없으면 누구나 한 번 더 누른다.
await okBtn.click({ force: true })
await p.waitForTimeout(60)
const lockedNow = await okBtn.isDisabled().catch(() => false)
const labelNow = (await okBtn.innerText().catch(() => '')).trim()
ok('두 번째 클릭 전에 확인 버튼이 잠긴다', lockedNow,
   lockedNow ? '' : '잠기지 않았다 — 그래서 한 번 더 눌린다')
ok('잠긴 동안 「보내는 중」이라고 말한다', labelNow === '제출 중…', labelNow)
ok('취소도 함께 잠긴다 — 절반만 보낸 채로 창이 사라지면 무엇이 참인지 알 수 없다',
   await dlg.locator('.lib-confirm-actions .lib-btn').first().isDisabled().catch(() => false))

await okBtn.click({ force: true }).catch(() => {})
await p.waitForTimeout(1200)

ok('제출 요청이 한 번만 갔다', sent === 1, `${sent}번 갔다`)

const mock = await p.evaluate(async () => (await (await fetch('/__submits')).json()).submits)
ok('서버에도 한 번만 닿았다', mock === 1, `${mock}번 닿았다`)

// ── 진짜 해로움은 여기서 드러난다 ──────────────
// 두 번 갔을 때, 늦게 온 거절은 **그 자리에서는 안 보인다.** 첫 응답이 창을 이미 닫았으니까.
// 대신 `aErr` 에 남아 **다음에 연 확인창에** 뜬다 — 아직 내지도 않은 자료를 열었는데
// 「이미 결재 대기 중입니다」가 붉게 적혀 있다. 이게 사람이 실제로 마주치는 화면이다.
await p.locator('.lib-act[title="결재 제출"]').first().click({ force: true, timeout: 5000 })
await p.waitForTimeout(400)
const again = await p.locator('.lib-confirm-box').first().innerText().catch(() => '')
ok('다시 연 확인창에 지난 오류가 안 남는다',
   !again.includes('이미 결재 대기 중'),
   '내지도 않은 자료에 「이미 결재 대기 중입니다」가 뜬다')

ok('화면 오류(pageerror)가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n✗ ${fail}건 실패` : '\n✓ 모두 통과')
process.exit(fail ? 1 : 0)
