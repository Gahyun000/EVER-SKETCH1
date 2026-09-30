// **더블클릭 = 띄어쓰기 기준 낱말** — 캔버스 글자·표 칸, 켤 때와 편집 중 모두. (2026-09-21)
//
// 사용자: 「기본 글자 상관없이 띄어쓰기를 기준으로 더블클릭했을 때 선택. 머메이드뿐만
// 아니라 텍스트 전체가 적용이 안 돼 있네.」 참고 화면은 스프레드시트에서 「성번02_. SAMPLE」 을
// 더블클릭하면 「성번02_.」 가 골라지는 모습이었다. 경계 규칙은 word_select.test.mjs 가 잰다.
// 여기서는 **진짜 브라우저에서 그 선택이 실제로 서는지** 본다 — 편집 켜기·포커스·rAF 가
// 얽힌 자리라, 소스만 봐서는 「결국 커서만 남는다」를 못 잡는다(이번 신고가 그것이었다).
//
// 실행: node e2e/es_mock.mjs & node e2e/word_select_smoke.mjs
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
await p.locator('text=임원회의').first().dblclick()   // 목록은 두 번 눌러야 연다(2026-09-17)
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(600)

const selected = () => p.evaluate(() => (window.getSelection()?.toString() || ''))

/** 요소 안에서 `word` 가 그려진 자리의 한가운데 좌표. 글자 마디 안의 범위로 잰다. */
async function wordPoint(loc, word, nth = 0) {
  return loc.evaluate((el, [w, k]) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let seen = 0
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      let i = -1
      while ((i = n.data.indexOf(w, i + 1)) >= 0) {
        if (seen++ < k) continue
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length)
        const b = r.getBoundingClientRect()
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
      }
    }
    return null
  }, [word, nth])
}
async function dblAt(pt) { await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(350) }

// ── ① 글상자(머리글) — 편집을 켜는 더블클릭 ─────────────────
{
  const head = p.locator('.stage .fel.text', { hasText: '임원회의' }).first()
  const pt = await wordPoint(head, '임원회의')
  ok('(사전) 머리글 글상자에서 「임원회의」 자리를 찾았다', !!pt)
  if (pt) {
    await dblAt(pt)
    const s = await selected()
    ok('[글상자 · 켤 때] 더블클릭하면 그 낱말만 골라진다', s === '임원회의', JSON.stringify(s))
    // 편집 중에 다른 낱말을 더블클릭
    const pt2 = await wordPoint(head, '진행보고')
    if (pt2) { await dblAt(pt2); ok('[글상자 · 편집 중] 다른 낱말을 더블클릭하면 그 낱말', (await selected()) === '진행보고', JSON.stringify(await selected())) }
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
  // 글줄 **끝 뒤 빈 곳** — 낱말이 아니라 커서. 여기서 마지막 낱말을 고르면
  // 이어 쓰려던 글자가 그 낱말을 지운다(table_type_smoke 의 머리글 검사가 그렇게 떨어졌다).
  {
    // 글자가 끝난 자리에서 40px 오른쪽 — 도형 가장자리는 **크기 손잡이 자리**라 피한다
    // (처음엔 오른쪽 끝을 눌렀다가 손잡이를 잡아 엉뚱한 결과가 나왔다).
    const hb = await head.boundingBox()
    const endX = await head.evaluate((el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, last
      while ((n = w.nextNode())) last = n
      const r = document.createRange(); r.selectNodeContents(last); return r.getBoundingClientRect().right
    })
    await p.mouse.dblclick(Math.min(endX + 40, hb.x + hb.width - 30), hb.y + hb.height / 2); await p.waitForTimeout(350)
    const st = await p.evaluate(() => { const s = getSelection(); return { c: !!s && s.isCollapsed, t: s ? s.toString() : '' } })
    ok('[글상자] 글줄 끝 뒤 빈 곳을 더블클릭하면 낱말이 아니라 커서', st.c, JSON.stringify(st.t))
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
}

// ── ② 표 칸 — 참고 화면의 그 글자 그대로 ─────────────────────
const cell = (r, c) => p.locator(`.stage .feltd[data-r="${r}"][data-c="${c}"]`).first()
{
  await cell(2, 1).dblclick(); await p.waitForTimeout(250)
  await p.keyboard.type('성번02_. SAMPLE'); await p.waitForTimeout(150)
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)   // 값 저장, 편집 끔
  ok('(사전) 칸에 「성번02_. SAMPLE」 이 들어갔다', (await cell(2, 1).textContent()).includes('성번02_. SAMPLE'))

  const a = await wordPoint(cell(2, 1), '성번')
  await dblAt(a)
  let s = await selected()
  ok('[표 칸 · 켤 때] 「성번02_.」 가 통째로 — 밑줄·마침표에서 안 쪼개진다', s === '성번02_.', JSON.stringify(s))

  const bpt = await wordPoint(cell(2, 1), 'SAMPLE')
  await dblAt(bpt)
  s = await selected()
  ok('[표 칸 · 편집 중] 뒤 낱말 「SAMPLE」', s === 'SAMPLE', JSON.stringify(s))

  // 세 번 누르면 전체 — 브라우저 기본값에 맡긴 것이 살아 있는지
  await p.mouse.click(bpt.x, bpt.y, { clickCount: 3 }); await p.waitForTimeout(300)
  s = (await selected()).trim()
  ok('[표 칸] 세 번 누르면 칸 전체', s === '성번02_. SAMPLE', JSON.stringify(s))

  // 골라진 채로 치면 그 낱말만 바뀐다 — 선택이 「보이기만」 하는 게 아니라 진짜라는 증거
  await dblAt(await wordPoint(cell(2, 1), 'SAMPLE'))
  await p.keyboard.type('TEST'); await p.waitForTimeout(150)
  ok('[표 칸] 고른 낱말만 바뀐다', (await cell(2, 1).textContent()).trim() === '성번02_. TEST', JSON.stringify(await cell(2, 1).textContent()))
  await p.keyboard.press('Escape'); await p.waitForTimeout(250)
}

// ── ③ 마인드맵 가지 — 신고의 출발점 ─────────────────────────
{
  await p.locator('button', { hasText: '새 페이지' }).first().click(); await p.waitForTimeout(400)
  await p.locator('button', { hasText: '마인드맵' }).first().click(); await p.waitForTimeout(300)
  await p.locator('.cpk-br.def').first().click(); await p.waitForTimeout(700)
  const br = p.locator('.stage .fel.round', { hasText: '가지 2' }).first()
  ok('(사전) 가지가 있다', (await br.count()) === 1)

  await dblAt(await wordPoint(br, '가지'))
  ok('[가지 · 켤 때] 「가지」 만', (await selected()) === '가지', JSON.stringify(await selected()))
  await dblAt(await wordPoint(br, '2'))
  ok('[가지 · 편집 중] 「2」 만', (await selected()) === '2', JSON.stringify(await selected()))
  // 편집 중 글자를 **끌어** 고르면 글자가 골라지고 도형은 그대로다.
  // (전에는 누름이 바깥 도형까지 올라가 도형 끌기가 시작됐다.)
  {
    const b0 = await br.boundingBox()
    const s0 = await wordPoint(br, '가'), s1 = await wordPoint(br, '2')
    await p.mouse.move(s0.x - 3, s0.y); await p.mouse.down()
    await p.mouse.move(s1.x + 3, s1.y, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250)
    const b1 = await br.boundingBox()
    ok('[가지 · 편집 중] 끌면 글자가 골라지고 도형은 안 움직인다',
       (await selected()).trim().length >= 3 && Math.abs(b1.x - b0.x) < 2 && Math.abs(b1.y - b0.y) < 2,
       `선택 ${JSON.stringify(await selected())} · 이동 ${Math.round(b1.x - b0.x)},${Math.round(b1.y - b0.y)}`)
  }
  const pt = await wordPoint(br, '2')
  await p.mouse.click(pt.x, pt.y, { clickCount: 3 }); await p.waitForTimeout(300)
  ok('[가지] 세 번 누르면 「가지 2」 전체', (await selected()).trim() === '가지 2', JSON.stringify(await selected()))
  await p.keyboard.type('품질'); await p.waitForTimeout(150)
  const lb = await p.locator('.stage .freelayer').first().boundingBox()
  await p.mouse.click(lb.x + lb.width - 20, lb.y + lb.height - 20); await p.waitForTimeout(300)
  ok('[가지] 전체를 고른 뒤 치면 통째로 바뀐다', (await p.locator('.stage .fel.round').allInnerTexts()).some((t) => t.trim() === '품질'))
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 낱말 고르기 통과 ===')
process.exit(fail ? 1 : 0)
