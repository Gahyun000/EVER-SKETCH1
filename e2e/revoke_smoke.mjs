// 배부 회수 확인창 — 진짜 브라우저에서 확인한다.
//
// 이 조작은 되돌릴 수 없다. 그래서 확인창이 하는 일이 곧 안전장치다.
//   - 무엇이 사라지는지(누가 몇 칸을 썼는지) 실제로 보여주는가
//   - 작성분이 있으면 체크 전까지 회수 버튼이 **잠겨 있는가**  ← 조용히 풀리기 쉬운 자리
//   - 서버에는 confirm:true 가 붙어 나가는가(안전핀)
//   - 개인별 회수는 그 한 명만 보내는가
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
await p.locator('.cy-dbtns .cy-btn', { hasText: '배부 취소' }).first().click()
await dialog.waitFor({ timeout: 10000 })
// 목록은 서버에서 세어 오므로 한 박자 뒤에 채워진다 — 다 그려진 뒤에 읽는다.
await p.locator('.cy-rv-list').waitFor({ timeout: 10000 })
ok('배부 취소를 누르면 확인창이 뜬다', await dialog.count() === 1)

const body = await dialog.innerText()
ok('사라지는 건수를 보여준다', body.includes('2건'), body.split('\n')[1])
ok('작성된 칸 수를 보여준다', body.includes('12칸'))
ok('되돌릴 수 없다고 말한다', body.includes('되돌릴 수 없습니다'))
ok('누구 것인지 이름으로 보여준다', body.includes('홍길동') && body.includes('이순신'))
ok('이미 제출한 사람을 따로 경고한다', body.includes('이미 제출'))
ok('빈 배부본은 비어 있다고 표시한다', body.includes('비어 있음'))

// ── 2) 확인 체크 전에는 잠겨 있다 ──
ok('작성분이 있으면 회수 버튼이 잠겨 있다', await confirmBtn.isDisabled())
ok('확인 체크박스가 있다', await agree.count() === 1)
const agreeText = await p.locator('.cy-rv-agree').innerText()
ok('누구의 내용이 사라지는지 체크박스에 적혀 있다',
   agreeText.includes('홍길동') && !agreeText.includes('이순신'), agreeText.slice(0, 60))

await agree.check()
await p.waitForTimeout(120)
ok('체크하면 회수 버튼이 열린다', await confirmBtn.isEnabled())

// ── 3) 그만두기로 닫힌다 ──
await p.locator('.cy-modal-btns .cy-btn', { hasText: '그만두기' }).click()
await p.waitForTimeout(200)
ok('그만두기를 누르면 아무 일도 일어나지 않는다', await dialog.count() === 0)
let sent = await (await p.request.get(URL + '__lastRevoke')).json()
ok('그만뒀으면 서버에 아무것도 안 보낸다', Object.keys(sent).length === 0, JSON.stringify(sent))

// ── 4) 개인별 회수는 그 한 명만 ──
await p.locator('.cy-acts .cy-mini', { hasText: '회수' }).first().click()
await dialog.waitFor({ timeout: 10000 })
await p.locator('.cy-rv-list').waitFor({ timeout: 10000 })
const oneBody = await dialog.innerText()
ok('개인별 회수는 그 사람만 목록에 올린다',
   oneBody.includes('홍길동') && !oneBody.includes('이순신'))
ok('개인별 회수는 1건이라고 말한다', oneBody.includes('1건'))

await p.locator('.cy-rv-agree input').check()
await confirmBtn.click()
await p.waitForTimeout(400)

sent = await (await p.request.get(URL + '__lastRevoke')).json()
ok('서버에 confirm:true 가 붙어 나간다', sent.confirm === true, JSON.stringify(sent))
ok('개인별 회수는 그 한 건만 보낸다',
   Array.isArray(sent.project_ids) && sent.project_ids.length === 1
   && sent.project_ids[0] === 'p_test', JSON.stringify(sent.project_ids))

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
