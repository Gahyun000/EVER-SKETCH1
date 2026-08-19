// 표 셀 드래그 선택 · 병합 — 진짜 브라우저에서 확인한다.
//
// 왜 브라우저까지 띄우는가:
// 이 기능은 순수 함수 테스트로는 못 잡힌다. mergeRange 는 처음부터 잘 동작했고,
// 실제로 없던 것은 **거기까지 가는 길**이었다 — 드래그 핸들러가 아예 없었고,
// 병합 버튼은 닫혀 있는 오른쪽 패널 안에만 있었다.
// 사용자가 "병합 기능이 없는 것 같다"고 한 게 정확했다.
// 그래서 손가락이 지나가는 경로 그대로를 테스트한다.
//
// 실행: node e2e/table_merge_smoke.mjs
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

// 라이브러리 → 편집 화면
await p.waitForSelector('text=임원회의', { timeout: 15000 })
await p.locator('text=2026년 10월 임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })

// 로드맵 표(SLOT-A) 의 칸을 좌표로 짚는다.
// 같은 페이지가 왼쪽 필름스트립에도 그려진다 — 반드시 작업창(.stage)으로 좁힌다.
const cell = (r, c) => p.locator(`.stage .feltd[data-r="${r}"][data-c="${c}"]`).first()
const roadmap = p.locator('.stage .fel.table').first()
await roadmap.waitFor({ timeout: 10000 })

const cellCountBefore = await p.locator('.stage .feltd').count()
ok('표가 칸으로 그려진다(이미지가 아니다)', cellCountBefore > 50, `${cellCountBefore}칸`)

// ── 1) 첫 클릭이 표를 고르고 그 칸에 커서를 놓는다 ──
await cell(2, 2).click()
await p.waitForTimeout(120)
ok('첫 클릭으로 표가 선택된다', await p.locator('.stage .fel.sel').count() === 1)
ok('첫 클릭이 그 칸을 고른다(엑셀처럼)',
   await p.locator('.stage .feltd.cellsel').count() === 1)

// ── 1-b) **선택하지 않은 표에서 곧바로 끌어도 칸이 선택된다** ──
// 예전에는 첫 누름을 표 고르는 데만 쓰고 흘려보내서, 누르자마자 끄는 사람에게는
// 표가 통째로 움직였다(실측 126px). 칸을 고르려던 사람 눈에는 '드래그가 안 되는' 것이었다.
// 빈 곳을 눌러 선택 해제 — 종이 아래쪽 여백(요소가 없는 자리)을 쓴다.
const clearSel = async () => {
  const lb = await p.locator('.stage .freelayer').first().boundingBox()
  await p.mouse.click(lb.x + lb.width / 2, lb.y + lb.height - 14)
  await p.waitForTimeout(150)
}
await clearSel()
{
  // **툴바 높이는 변하면 안 된다.** 표를 고르는 순간 병합 도구가 새로 생기면
  // 툴바가 그만큼 높아지고, 아래 문서가 통째로 내려간다(실측 37px = 표 한 줄).
  // 손가락은 가만히 있는데 문서가 내려오니 한 줄 아래까지 골라진다.
  // 위의 '표가 움직이지 않는다' 로도 잡히지만, 원인을 여기서 이름으로 말해 둔다.
  const tbH = async () => (await p.locator('.ax-tb').first().boundingBox()).height
  const hIdle = await tbH()
  await cell(3, 2).click()
  await p.waitForTimeout(150)
  const hSel = await tbH()
  ok('표를 골라도 툴바 높이가 그대로다', Math.abs(hSel - hIdle) < 2, `${hIdle} → ${hSel}`)
  await clearSel()
}
{
  const t0 = await p.locator('.stage .fel.table').first().boundingBox()
  const a0 = await cell(3, 2).boundingBox()
  const z0 = await cell(3, 5).boundingBox()
  await p.mouse.move(a0.x + a0.width / 2, a0.y + a0.height / 2)
  await p.mouse.down()
  await p.mouse.move(a0.x + a0.width / 2 + 10, a0.y + a0.height / 2 + 3, { steps: 3 })
  await p.mouse.move(z0.x + z0.width / 2, z0.y + z0.height / 2, { steps: 12 })
  await p.mouse.up()
  await p.waitForTimeout(200)
  const t1 = await p.locator('.stage .fel.table').first().boundingBox()
  ok('한 번에 누르고 끌어도 칸이 선택된다',
     await p.locator('.stage .feltd.cellsel').count() === 4,
     `${await p.locator('.stage .feltd.cellsel').count()}칸`)
  ok('그때 표가 움직이지 않는다', Math.abs(t1.x - t0.x) < 2 && Math.abs(t1.y - t0.y) < 2,
     `이동 ${Math.round(t1.x - t0.x)},${Math.round(t1.y - t0.y)}`)
}
// ── 2) 드래그로 칸 범위 선택 ──
// 앞 단계의 선택이 남아 있으면 시작점이 달라져 엉뚱한 범위가 잡힌다.
// 검사 하나가 앞 검사의 뒷정리에 기대면, 실패했을 때 어디가 원인인지 알 수 없다.
await clearSel()
const a = await cell(2, 2).boundingBox()
const z = await cell(2, 5).boundingBox()
await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
await p.mouse.down()
await p.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 2 })
await p.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 12 })
await p.mouse.up()
await p.waitForTimeout(150)

const selCount = await p.locator('.stage .feltd.cellsel').count()
ok('드래그로 칸 4개가 선택된다', selCount === 4, `${selCount}칸 선택됨`)

// ── 2-b) 빈 로드맵에는 사용법이 뜬다 ──
// 정본에서 진행 구간은 '가로 병합 + 단계 이름' 인데, 빈 표만 보고는 그걸
// 어떻게 만드는지 알 길이 없다. 배부받고 처음 여는 사람이 가장 막히는 지점이다.
{
  await clearSel()
  await cell(4, 3).click()
  await p.waitForTimeout(200)
  const teach = await p.locator('.ax-tb .tbtn-hint').first().innerText()
  ok('빈 로드맵에서 만드는 법을 알려준다', teach.includes('병합') && teach.includes('단계 이름'),
     teach)
  ok('안내가 눈에 띄게 표시된다',
     await p.locator('.ax-tb .tbtn-hint.teach').count() === 1)
}
await clearSel()
await cell(2, 2).click()
await p.waitForTimeout(120)

// ── 3) 툴바에 병합 버튼이 보인다 ──
{
  const a2 = await cell(2, 2).boundingBox()
  const z2 = await cell(2, 5).boundingBox()
  await p.mouse.move(a2.x + a2.width / 2, a2.y + a2.height / 2)
  await p.mouse.down()
  await p.mouse.move(a2.x + a2.width / 2 + 8, a2.y + a2.height / 2, { steps: 2 })
  await p.mouse.move(z2.x + z2.width / 2, z2.y + z2.height / 2, { steps: 12 })
  await p.mouse.up()
  await p.waitForTimeout(200)
}
const mergeBtn = p.locator('.ax-tb .tbtn', { hasText: '병합' }).first()
ok('상단 툴바에 병합 버튼이 있다(오른쪽 패널을 열지 않아도)', await mergeBtn.count() === 1)
ok('병합 버튼이 눌리는 상태다', await mergeBtn.isEnabled())
const hint = await p.locator('.ax-tb .tbtn-hint').first().textContent()
ok('선택 범위를 숫자로 보여준다', (hint || '').includes('1×4'), `표시: ${hint}`)

// ── 4) 병합 ──
await mergeBtn.click()
await p.waitForTimeout(200)
const spanned = await cell(2, 2).evaluate((n) => getComputedStyle(n).gridColumnEnd)
ok('병합된 칸이 4열을 차지한다', /span 4/.test(spanned), `grid-column-end: ${spanned}`)
ok('덮인 칸은 사라진다', await cell(2, 3).count() === 0)
const cellCountAfter = await p.locator('.stage .feltd').count()
ok('덮인 칸 3개만큼 줄었다', cellCountBefore - cellCountAfter === 3,
   `${cellCountBefore} → ${cellCountAfter}`)

// ── 5) 병합한 칸에 글자를 쓸 수 있다(진행 구간 이름) ──
await cell(2, 2).dblclick()
await p.waitForTimeout(150)
await p.keyboard.type('요건정의')
await p.evaluate(() => { const n = document.activeElement; if (n && 'blur' in n) (n).blur?.() })
await p.waitForTimeout(200)
const txt = await cell(2, 2).textContent()
ok('병합한 칸에 단계 이름을 쓸 수 있다', (txt || '').includes('요건정의'), `내용: ${txt}`)

// ── 6) 해제 ──
await cell(2, 2).click()
await p.waitForTimeout(120)
const unmergeBtn = p.locator('.ax-tb .tbtn', { hasText: '해제' }).first()
ok('병합된 칸을 고르면 해제 버튼이 살아난다', await unmergeBtn.isEnabled())
await unmergeBtn.click()
await p.waitForTimeout(200)
ok('해제하면 덮였던 칸이 돌아온다', await cell(2, 3).count() === 1)

// ── 7) 머리글은 여전히 잠겨 있다 ──
await cell(0, 2).dblclick()
await p.waitForTimeout(150)
const headEditable = await cell(0, 2).getAttribute('contenteditable')
ok('머리글 칸은 편집 잠금이 유지된다', headEditable !== 'true', `contenteditable=${headEditable}`)


// ── 8) 새로 만든(잠기지 않은) 표는 손잡이로 옮길 수 있다 ──
// 표가 선택되면 셀 클릭이 드래그 선택으로 바뀐다. 그러면 셀을 잡고 표를 옮길 수
// 없으므로 잡을 곳을 따로 만들었다. 잠긴 표준 양식 표에는 띄우지 않는다.
ok('잠긴 표준 양식 표에는 이동 손잡이가 없다', await p.locator('.stage .tbl-move').count() === 0)

const layerBox = await p.locator('.stage .freelayer').first().boundingBox()
await p.locator('.ib[title="표"]').first().click()
await p.mouse.click(layerBox.x + 120, layerBox.y + layerBox.height - 90)
await p.waitForTimeout(250)
const newTable = p.locator('.stage .fel.table').last()
await newTable.click({ position: { x: 8, y: 8 } })
await p.waitForTimeout(150)
const handle = p.locator('.stage .tbl-move').first()
ok('새 표에는 이동 손잡이가 생긴다', await handle.count() === 1)

const before = await newTable.boundingBox()
const hb = await handle.boundingBox()
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
await p.mouse.down()
await p.mouse.move(hb.x + hb.width / 2 + 90, hb.y + hb.height / 2 - 40, { steps: 10 })
await p.mouse.up()
await p.waitForTimeout(200)
const after = await newTable.boundingBox()
ok('손잡이를 끌면 표가 따라 움직인다', Math.abs(after.x - before.x) > 40,
   `x ${Math.round(before.x)} → ${Math.round(after.x)}`)


// ── 9) 상단 헤더: 겹치지 않고, 신원 표시는 하나뿐이다 ──
// 예전에는 사용자 칩이 position:fixed 전역 오버레이라 툴바 버튼과 같은 자리를 두고
// 겹쳤고, 툴바에는 글자가 '가' 로 박힌 초록 원이 따로 있었다(로그인한 사람과 무관).
{
  const bars = await p.locator('.es-userbar').count()
  ok('사용자 표시는 화면에 하나뿐이다', bars === 1, `${bars}개`)
  ok('편집 화면에서는 툴바 안에 들어간다',
     await p.locator('.ax-title .es-userbar.inline').count() === 1)
  ok('옛 하드코딩 아바타가 사라졌다', await p.locator('.ax-title .av').count() === 0)

  const initial = (await p.locator('.es-av').first().innerText()).trim()
  ok('아바타가 로그인한 사람의 이름 첫 글자다', initial === '홍', `표시: ${initial}`)

  // 겹침은 눈으로 못 보고 지나간다 — 사각형이 실제로 겹치는지 재서 확인한다.
  const overlap = await p.evaluate(() => {
    const bar = document.querySelector('.ax-title .es-userbar')
    const others = [...document.querySelectorAll('.ax-title .rbtn, .ax-title .folio-chip')]
    const a = bar.getBoundingClientRect()
    return others.filter((o) => {
      const b = o.getBoundingClientRect()
      return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    }).map((o) => o.textContent.trim().slice(0, 12))
  })
  ok('툴바의 다른 버튼과 겹치지 않는다', overlap.length === 0, overlap.join(', '))
}

// ── 10) 작성자에게는 쓸 수 없는 메뉴가 보이지 않는다 ──
// 눌러도 403 인 버튼을 띄워두면 사용자는 '고장 났다' 고 이해한다.
{
  await p.locator('.ax-menu .m', { hasText: '파일' }).first().click()
  await p.waitForTimeout(200)
  const items = await p.locator('.ax-mdrop .ax-mitem').allInnerTexts()
  ok('작성자에게 환경설정이 보이지 않는다', !items.some((t) => t.includes('환경설정')),
     items.join(' | ').slice(0, 90))
  ok('작성자에게 이북 만들기(발행)가 보이지 않는다',
     !items.some((t) => t.includes('이북(웹) 만들기')))
  ok('작성자가 쓸 수 있는 항목은 그대로다', items.some((t) => t.includes('저장')))
  await p.keyboard.press('Escape')
  await p.locator('.ax-title').click({ position: { x: 4, y: 4 } })
  await p.waitForTimeout(150)
}

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
