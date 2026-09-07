// 표 칸에 글을 쓰면 **한 번만** 찍힌다 — 진짜 브라우저에서 확인한다.
//
// 왜 브라우저까지 띄우는가:
// 이건 React 와 브라우저가 같은 DOM 자리를 두고 다투는 문제라, 소스를 읽는 검사로는
// 「구조가 규칙에 맞다」까지만 말할 수 있고 「실제로 한 번만 찍힌다」는 못 말한다.
// 2026-09-07 에 사용자가 화면 녹화로 알려 준 증상이 정확히 이것이었다 —
// 빈 칸에 처음 글을 쓸 때만 두 번 찍히고, 저장된 값은 멀쩡했다.
//
// 원인은 칸 안에 있던 의견 핀이었다. 자식이 둘이 되면 React 가 textContent 대신
// 마디를 하나씩 맞춰 넣는 방식으로 바뀌고, React 가 빈 값으로 만들어 둔 마디가
// 남은 채 브라우저가 타자용 마디를 새로 만든다. 커밋값이 되돌아오면 React 는
// 자기 마디만 채우므로 같은 글자가 두 번 보인다.
//
// 실행: node e2e/table_type_smoke.mjs
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
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })

// 같은 페이지가 왼쪽 필름스트립에도 그려진다 — 반드시 작업창(.stage)으로 좁힌다.
const cell = (r, c) => p.locator(`.stage .feltd[data-r="${r}"][data-c="${c}"]`).first()
await p.locator('.stage .fel.table').first().waitFor({ timeout: 10000 })

// 빈 곳을 눌러 선택을 푼다 — 종이 아래쪽 여백을 쓴다(표 병합 스위트와 같은 방법).
const clearSel = async () => {
  const lb = await p.locator('.stage .freelayer').first().boundingBox()
  await p.mouse.click(lb.x + lb.width / 2, lb.y + lb.height - 14)
  await p.waitForTimeout(200)
}

// 로드맵(SLOT-A)은 머리글이 2행이므로 r=2 부터가 쓸 수 있는 빈 칸이다.
const R = 2, C = 1
const target = cell(R, C)
await target.waitFor({ timeout: 10000 })
ok('고른 칸이 비어 있다(빈 칸에서만 나던 증상이다)',
   (await target.textContent()) === '', JSON.stringify(await target.textContent()))

// ── 타자 ────────────────────────────────────────────
await target.dblclick()
await p.waitForTimeout(250)
await p.keyboard.type('가나')
await p.waitForTimeout(250)

const during = await cell(R, C).evaluate((n) => ({
  nodes: [...n.childNodes].filter((x) => x.nodeType === 3).length,
  els: [...n.childNodes].filter((x) => x.nodeType === 1).map((x) => x.className),
  text: n.textContent,
}))
ok('타자 중 글자 마디가 하나뿐이다', during.nodes <= 1, `마디 ${during.nodes}개`)
ok('타자 중 칸 안에 다른 요소가 없다', during.els.length === 0, during.els.join(','))
ok('타자 중 보이는 글자가 「가나」다', during.text === '가나', JSON.stringify(during.text))

// ── 커밋(다른 곳을 눌러 blur) ─────────────────────────
await clearSel()
await p.waitForTimeout(350)

const after = await cell(R, C).evaluate((n) => ({
  nodes: [...n.childNodes].filter((x) => x.nodeType === 3).length,
  text: n.textContent,
}))
ok('커밋 뒤에도 「가나」 한 번이다 (「가나가나」가 아니다)',
   after.text === '가나', JSON.stringify(after.text))
ok('커밋 뒤 글자 마디도 하나다', after.nodes <= 1, `마디 ${after.nodes}개`)

// ── 다시 들어가도 값이 그대로다 ────────────────────────
await cell(R, C).dblclick()
await p.waitForTimeout(250)
const again = await cell(R, C).textContent()
ok('다시 열어도 값이 「가나」다', again === '가나', JSON.stringify(again))

// 두 번째 타자 — 이미 글자가 있는 칸에 이어 쓸 때도 안 겹친다.
await p.keyboard.press('End')
await p.keyboard.type('다')
await clearSel()
await p.waitForTimeout(350)
const third = await cell(R, C).textContent()
ok('이어 쓴 뒤에도 「가나다」다', third === '가나다', JSON.stringify(third))

// ── 표 전체에 겹쳐 찍힌 칸이 없다 ──────────────────────
// 머리글은 뺀다 — 월 이름 '11' 은 '1' 이 두 번 찍힌 게 아니라 십일월이다.
const doubled = await p.locator('.stage .feltd').evaluateAll((ns) =>
  ns.filter((n) => {
    if (Number(n.getAttribute('data-r')) < 2) return false
    const t = (n.textContent || '').trim()
    return t.length >= 2 && t.length % 2 === 0 && t.slice(0, t.length / 2) === t.slice(t.length / 2)
  }).map((n) => n.textContent))
ok('표 어느 칸에도 같은 글자가 두 번 이어 붙어 있지 않다',
   doubled.length === 0, doubled.join(' | '))

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 표 타자 통과 ===')
process.exit(fail ? 1 : 0)
