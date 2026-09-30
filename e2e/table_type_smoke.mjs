// 글자 입력 — 표 칸과 머리글. 진짜 브라우저에서 확인한다.
//
// 두 가지를 본다.
//   1) 표 칸에 글을 쓰면 **한 번만** 찍힌다 (아래 긴 설명)
//   2) 표준 양식의 **머리글 문구를 고칠 수 있다** — 「표준 양식이라도 글씨 정도는
//      바꿀 수 있는 거 아닌가」라는 물음에 대한 답이 코드에 남아 있게 한다.
//      머리글 글상자는 locked:true 지만 그건 **자리**를 잠근 것이지 글자를 잠근 게
//      아니다. 정책에 `head: {edit: []}` 라고 적혀 있어서 「다 잠겼다」로 읽혔는데,
//      edit 는 표 동작 목록이라 글상자에는 애초에 걸리지 않았다. 사실이 그렇다면
//      브라우저가 그렇다고 말해 두는 편이 낫다 — 다음에 누가 막아 버리면 여기서 걸린다.
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
await p.locator('text=임원회의').first().dblclick()   // 2026-09-17 이후 목록은 **두 번 눌러야** 연다
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

// ── 정본은 두 장이다 ───────────────────────────────────
// 「1인 1장」을 「1인 1세트」로 바꾸면서 양식이 두 장이 됐다(2026-09-07).
// 한 장일 때 로드맵과 아래 두 블록은 같은 108px 여백을 나눠 썼다 —
// 로드맵을 두 행 늘리면 아래 목록은 한 행도 못 늘렸다.
{
  ok('쪽 목록에 두 장이 있다', await p.locator('.axth-mini').count() === 2,
     `${await p.locator('.axth-mini').count()}장`)
  ok('1쪽에는 표가 로드맵 하나뿐이다',
     await p.locator('.stage .fel.table').count() === 1,
     `${await p.locator('.stage .fel.table').count()}개`)
  const cols = await p.locator('.stage .fel.table').first()
    .evaluate((n) => n.querySelectorAll('.feltd[data-r="2"]').length)
  ok('그 표가 18열 로드맵이다', cols === 18, `${cols}열`)

  // 2쪽으로 넘어가 본다 — 나눈 결과가 실제로 그렇게 그려지는지.
  await p.locator('.axth-mini').nth(1).click()
  await p.waitForTimeout(400)
  ok('2쪽에는 표가 둘이다(진행현황 · 이슈)',
     await p.locator('.stage .fel.table').count() === 2,
     `${await p.locator('.stage .fel.table').count()}개`)
  const txt = await p.locator('.stage').first().innerText()
  ok('2쪽에 진행 현황과 이슈가 있다',
     txt.includes('진행 현황') && txt.includes('이슈'), txt.slice(0, 60).replace(/\n/g, ' '))
  ok('2쪽에도 머리글이 있다 — 여기만 열어 본 사람도 누구 것인지 안다',
     txt.includes('임원회의'))

  await p.locator('.axth-mini').nth(0).click()   // 1쪽으로 되돌려 놓는다
  await p.waitForTimeout(400)
}

// ── 머리글 문구는 고칠 수 있다 ─────────────────────────
{
  const title = p.locator('.stage .fel').filter({ hasText: '임원회의' }).first()
  // 2026-09-07 에 자리 잠금도 풀었다 — 이제 머리글은 옮기고 고칠 수 있는
  // 보통 글상자다. (움직이는지는 table_move_smoke.mjs 가 본다.)
  ok('머리글 글상자는 더 이상 잠겨 있지 않다',
     !((await title.getAttribute('class')) || '').includes('locked'),
     await title.getAttribute('class'))

  const before = (await title.textContent()) || ''
  await title.dblclick()
  await p.waitForTimeout(250)
  ok('더블클릭하면 편집칸이 열린다',
     await p.locator('.stage .feltext[contenteditable="true"]').count() === 1)
  await p.keyboard.type(' (수정)')
  await clearSel()
  await p.waitForTimeout(350)
  const after = (await p.locator('.stage .fel').filter({ hasText: '임원회의' }).first().textContent()) || ''
  ok('고친 문구가 남는다', after === before + ' (수정)', JSON.stringify(after))
  ok('머리글도 두 번 찍히지 않는다', !after.includes('(수정) (수정)'), JSON.stringify(after))
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 표 타자 통과 ===')
process.exit(fail ? 1 : 0)
