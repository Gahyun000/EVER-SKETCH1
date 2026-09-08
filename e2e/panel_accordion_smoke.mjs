// 오른쪽 패널 — 탭 대신 **접이식**, 그리고 「무엇을 고치는 중인가」.
//
// 탭은 「지금 어느 탭인지」를 사람이 기억해야 하고, 찾는 것이 다른 탭에 있으면
// 네 번을 눌러 봐야 안다. 접이식은 **네 묶음이 늘 한 화면에** 있고,
// 접힌 줄에 지금 값이 적혀 있어 **열지 않아도 읽힌다** — 그게 이 교체의 값어치다.
// 열어야만 알 수 있으면 이름만 바뀐 탭이다. 그래서 그 줄을 검사한다.
//
// 실행: node e2e/es_mock.mjs & node e2e/panel_accordion_smoke.mjs
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

await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(800)

const lb = await p.locator('.stage .freelayer').first().boundingBox()
await p.mouse.click(lb.x + 300, lb.y + 200)      // 로드맵 표를 고른다
await p.waitForTimeout(600)

// ── 무엇을 고치는 중인가 ────────────────────────
ok('(사전) 표가 골라졌다', await p.locator('.insp-who').count() === 1)
const who = await p.locator('.insp-who').innerText()
ok('표준 양식 칸은 **문서 안의 이름표**로 부른다',
   who.includes('로드맵'), who.replace(/\n+/g, ' · '))

// ── 탭이 없다 · 네 묶음이 한 화면에 ──────────────
ok('탭 막대가 없다', await p.locator('.insp-tabs').count() === 0)
const accs = (await p.locator('.insp-acc').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
ok('네 묶음이 늘 보인다', accs.length === 4, JSON.stringify(accs))

// ── **접힌 줄이 지금 값을 말한다** ────────────────
// 여기가 이 교체의 값어치다. 이 검사가 없으면 「이름만 바뀐 탭」이 되어도 아무도 모른다.
const subOf = (name) => (accs.find((t) => t.includes(name)) || '').replace(name, '').trim()
ok('표 — 크기를 말한다', /\d+행 \d+열/.test(subOf('표')), subOf('표'))
ok('텍스트 — 글자 크기를 말한다', /\d+pt/.test(subOf('텍스트')), subOf('텍스트'))
ok('정렬 — 크기를 말한다', /\d+×\d+/.test(subOf('정렬')), subOf('정렬'))
ok('스타일 — 뭐라도 말한다', subOf('스타일').length > 0, subOf('스타일'))

// ── 여러 묶음을 함께 펴 둘 수 있다 ────────────────
// 표를 고치면서 글자도 만지는 일이 흔하다. 탭은 그걸 못 한다.
await p.locator('.insp-acc', { hasText: '텍스트' }).first().click()
await p.waitForTimeout(350)
const bodyNow = await p.locator('.insp-body').innerText()
ok('텍스트를 펴도 표가 접히지 않는다 — 함께 펴 둘 수 있다',
   /활성 셀/.test(bodyNow) && /서식 지우기/.test(bodyNow))

// ── 병합은 한 곳에만 ─────────────────────────
ok('패널에는 병합 버튼이 없다',
   await p.locator('.insp-body button', { hasText: '병합' }).count() === 0)
ok('대신 위 툴바에 있다', await p.locator('.ax-tb .tbtn', { hasText: '병합' }).count() >= 1)
ok('패널은 그 자리를 알려만 준다',
   /위 툴바의 표/.test(bodyNow), '길잡이 문장이 사라졌다')

// ── 결재 카드는 그 위에 그대로 ───────────────────
const card = await p.locator('.apc').boundingBox()
const firstAcc = await p.locator('.insp-acc').first().boundingBox()
ok('결재 카드가 묶음들보다 위에 있다', card.y < firstAcc.y,
   `카드 ${Math.round(card.y)} / 첫 묶음 ${Math.round(firstAcc.y)}`)

ok('화면 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n✗ ${fail}건 실패` : '\n✓ 모두 통과')
process.exit(fail ? 1 : 0)
