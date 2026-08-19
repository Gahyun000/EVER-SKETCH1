// 로그인 화면 비밀번호 보기/숨기기 — 진짜 브라우저에서 확인한다.
//
// 눈 버튼은 겉보기엔 사소하지만 조용히 틀리기 쉬운 자리가 셋 있다.
//   1) 버튼이 type="submit" 이면 눈을 누를 때 폼이 넘어간다(잘못된 비밀번호로 로그인 시도).
//   2) 눈을 누르는 순간 입력칸에서 포커스가 빠진다 — 그때 숨겨버리면 토글이 아예 안 먹는다.
//   3) 보임 상태가 어딘가 저장되면, 다음 사람이 그 PC 를 열었을 때 비밀번호가 보인 채로 뜬다.
// 셋 다 여기서 못 박는다.
//
// 실행: ANON=1 node e2e/es_mock.mjs & node e2e/login_password_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1200, height: 900 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))
// 눈 버튼이 폼을 넘기면 여기 잡힌다.
const logins = []
p.on('request', (r) => { if (r.url().endsWith('/api/auth/login')) logins.push(r.method()) })

await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForSelector('#es-pw', { timeout: 15000 })

const pw = p.locator('#es-pw')
const eye = p.locator('.es-pweye').first()
const type = () => pw.getAttribute('type')

// ── 1) 기본은 가려져 있다 ──
ok('처음에는 비밀번호가 가려져 있다', (await type()) === 'password')
ok('눈 버튼이 보인다', await eye.count() === 1)

await pw.fill('#13241324')

// ── 2) 눈을 누르면 보인다 ──
await eye.click()
await p.waitForTimeout(120)
ok('눈을 누르면 글자가 보인다', (await type()) === 'text')
ok('보이는 동안에도 값은 그대로다', (await pw.inputValue()) === '#13241324')
ok('눈 버튼이 폼을 넘기지 않는다(로그인 요청 0건)', logins.length === 0, `요청 ${logins.length}건`)
ok('눌린 상태가 보조기술에 전달된다', (await eye.getAttribute('aria-pressed')) === 'true')

// ── 3) 다시 누르면 가려진다 ──
await eye.click()
await p.waitForTimeout(120)
ok('다시 누르면 가려진다', (await type()) === 'password')

// ── 4) 칸을 벗어나면 저절로 가려진다 ──
await pw.click()
await eye.click()
await p.waitForTimeout(100)
ok('(사전조건) 다시 보이게 해 둔다', (await type()) === 'text')
await p.locator('#es-login-id').click()
await p.waitForTimeout(150)
ok('다른 칸으로 옮기면 저절로 가려진다', (await type()) === 'password')

// ── 5) 보임 상태를 저장하지 않는다 ──
const stored = await p.evaluate(() => {
  const dump = (s) => Object.keys(s).map((k) => k + '=' + s.getItem(k)).join('\n')
  return dump(localStorage) + '\n' + dump(sessionStorage)
})
ok('비밀번호가 브라우저 저장소에 남지 않는다', !stored.includes('13241324'))
ok('보임 상태를 저장하지 않는다', !/pw.?(shown|visible)/i.test(stored))

await p.reload({ waitUntil: 'networkidle' })
await p.waitForSelector('#es-pw')
ok('새로 열면 다시 가려져 있다', (await p.locator('#es-pw').getAttribute('type')) === 'password')

// ── 6) 아이디 기억하기는 아이디만 기억한다 ──
await p.locator('#es-login-id').fill('gahyun12')
await p.locator('#es-pw').fill('#13241324')
const check = p.locator('.es-check input[type="checkbox"]').first()
if (await check.count()) {
  await check.check()
  await p.waitForTimeout(120)
  const after = await p.evaluate(() =>
    Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'))
  ok('아이디 기억하기를 켜도 비밀번호는 저장되지 않는다', !after.includes('13241324'), after.slice(0, 120))
}

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
