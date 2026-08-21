// 배부 무르기 확인창 — 진짜 브라우저에서 확인한다.
//
// 이 조작은 되돌릴 수 없다. 그래서 확인창이 하는 일이 곧 안전장치다.
//   - **무엇을 못 하고 무엇을 하는지** 먼저 말하는가
//     (「회수」로 읽히면 '이미 봤는데 무슨 소용이냐' 가 되고, 그러면 기능
//      자체가 쓸모없어 보인다. 실제로 하는 일은 담당에서 빼고 접근을 끊는 것이다)
//   - 무엇이 사라지는지(몇 칸을 썼는지, **의견이 몇 건 달렸는지**) 보여주는가
//   - 작성분이 있으면 체크 전까지 버튼이 **잠겨 있는가**  ← 조용히 풀리기 쉬운 자리
//   - 서버에는 confirm:true 가 붙어 나가는가(안전핀)
//   - 개인별 무르기는 그 한 명만 보내는가
//
// 실행: ADMIN=1 node e2e/es_mock.mjs & node e2e/revoke_smoke.mjs
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

// 앞선 실행의 흔적을 지운다 — 안 지우면 '아무것도 안 보냈다' 검사가 늘 통과한다.
await (await p.request.get(URL + '__resetRevoke')).json()

await p.goto(URL, { waitUntil: 'networkidle' })

// 라이브러리 → 회차 화면
await p.locator('button', { hasText: '회차' }).first().click()
await p.waitForSelector('.cy-screen', { timeout: 15000 })
await p.waitForSelector('.cy-table', { timeout: 15000 })

const dialog = p.locator('.cy-modal')
const confirmBtn = p.locator('.cy-btn.danger-solid')
const agree = p.locator('.cy-rv-agree input[type="checkbox"]')

// ── 1) 회차 전체 취소 ──
await p.locator('.cy-dbtns .cy-btn', { hasText: '배부 무르기' }).first().click()
await dialog.waitFor({ timeout: 10000 })
// 목록은 서버에서 세어 오므로 한 박자 뒤에 채워진다 — 다 그려진 뒤에 읽는다.
await p.locator('.cy-rv-list').waitFor({ timeout: 10000 })
ok('배부 무르기를 누르면 확인창이 뜬다', await dialog.count() === 1)

// **이 창의 핵심 한 줄.** 오해를 먼저 걷어낸다.
const what = await p.locator('.cy-rv-what').innerText()
ok('못 하는 것을 먼저 말한다', what.includes('없던 일로 만들지는 못합니다'), what.replace(/\n/g, ' '))
ok('하는 것도 말한다', what.includes('담당에서 빼고'))

const body = await dialog.innerText()
ok('사라지는 건수를 보여준다', body.includes('2건'), body.split('\n')[1])
ok('작성된 칸 수를 보여준다', body.includes('12칸'))
ok('되돌릴 수 없다고 말한다', body.includes('되돌릴 수 없습니다'))
ok('누구 것인지 이름으로 보여준다', body.includes('홍길동') && body.includes('이순신'))
ok('이미 제출한 사람을 따로 경고한다', body.includes('이미 제출'))
ok('빈 배부본은 비어 있다고 표시한다', body.includes('비어 있음'))
// 무르면 리뷰어가 쓴 지적도 함께 사라진다. 안 적어 두면 아무 말 없이 없어진다.
ok('사라질 의견 건수를 보여준다', body.includes('의견 3건'), body.replace(/\n/g, ' ').slice(0, 120))

// ── 2) 확인 체크 전에는 잠겨 있다 ──
ok('작성분이 있으면 무르기 버튼이 잠겨 있다', await confirmBtn.isDisabled())
ok('확인 체크박스가 있다', await agree.count() === 1)
const agreeText = await p.locator('.cy-rv-agree').innerText()
ok('누구의 내용이 사라지는지 체크박스에 적혀 있다',
   agreeText.includes('홍길동') && !agreeText.includes('이순신'), agreeText.slice(0, 60))
ok('의견도 함께 사라진다고 체크박스에 적혀 있다', agreeText.includes('의견 3건'), agreeText)

await agree.check()
await p.waitForTimeout(120)
ok('체크하면 무르기 버튼이 열린다', await confirmBtn.isEnabled())

// ── 3) 그만두기로 닫힌다 ──
await p.locator('.cy-modal-btns .cy-btn', { hasText: '그만두기' }).click()
await p.waitForTimeout(200)
ok('그만두기를 누르면 아무 일도 일어나지 않는다', await dialog.count() === 0)
let sent = await (await p.request.get(URL + '__lastRevoke')).json()
ok('그만뒀으면 서버에 아무것도 안 보낸다', Object.keys(sent).length === 0, JSON.stringify(sent))

// ── 4) 개인별 무르기는 그 한 명만 ──
await p.locator('.cy-acts .cy-mini', { hasText: '배부 무르기' }).first().click()
await dialog.waitFor({ timeout: 10000 })
await p.locator('.cy-rv-list').waitFor({ timeout: 10000 })
const oneBody = await dialog.innerText()
ok('개인별 무르기는 그 사람만 목록에 올린다',
   oneBody.includes('홍길동') && !oneBody.includes('이순신'))
ok('개인별 무르기는 1건이라고 말한다', oneBody.includes('1건'))

await p.locator('.cy-rv-agree input').check()
await confirmBtn.click()
await p.waitForTimeout(400)

sent = await (await p.request.get(URL + '__lastRevoke')).json()
ok('서버에 confirm:true 가 붙어 나간다', sent.confirm === true, JSON.stringify(sent))
ok('개인별 무르기는 그 한 건만 보낸다',
   Array.isArray(sent.project_ids) && sent.project_ids.length === 1
   && sent.project_ids[0] === 'p_test', JSON.stringify(sent.project_ids))

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
