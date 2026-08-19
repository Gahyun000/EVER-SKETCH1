// 앵커 메모(검토 의견) — 진짜 브라우저에서 확인한다.
//
// 이 기능의 값어치는 **가리키는 곳과 함께 있다**는 것 하나다.
// 목록에만 남으면 "3번째 줄 진행 구간이 다릅니다" 가 되고, 받는 사람은 그 줄을
// 찾는 일부터 해야 한다. 그래서 검사하는 것은:
//   - 지적이 문서 위 그 자리에 핀으로 보이는가
//   - 핀을 누르면 목록이 그 지적으로 이동하는가
//   - 해결하면 핀이 사라지는가(해결된 지적까지 뜨면 화면이 덮인다)
//
// 실행: COMMENTS=1 node e2e/es_mock.mjs & node e2e/comments_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))

await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('text=2026년 10월 임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(600)

// ── 1) 지적이 문서 위 그 자리에 보인다 ──
const pin = p.locator('.stage .cmt-pin').first()
ok('지적이 문서 위에 핀으로 보인다', await p.locator('.stage .cmt-pin').count() === 1,
   `${await p.locator('.stage .cmt-pin').count()}개`)
ok('핀이 지적한 그 칸에 붙어 있다',
   await p.locator('.stage .feltd[data-r="3"][data-c="5"] .cmt-pin').count() === 1)
ok('핀에 마우스를 올리면 내용이 보인다',
   ((await pin.getAttribute('title')) || '').includes('5월 진행 구간'))

// ── 2) 닫혀 있어도 미해결 건수를 알려준다 ──
const tab = p.locator('.cmt-tab')
ok('의견 탭이 미해결 건수를 보여준다', (await tab.innerText()).includes('1'),
   (await tab.innerText()).replace(/\n/g, ' '))

// ── 3) 핀을 누르면 목록이 그 지적으로 간다 ──
await pin.click()
await p.waitForTimeout(400)
ok('핀을 누르면 의견 목록이 열린다', await p.locator('.cmt-panel').count() === 1)
const item = p.locator('.cmt-item').first()
ok('그 지적이 골라진 상태로 보인다', (await item.getAttribute('class') || '').includes('on'))
const itemText = await item.innerText()
ok('어디를 가리키는지 목록에도 적혀 있다', itemText.includes('4행 6열'), itemText.split('\n')[1])
ok('내용이 그대로 보인다', itemText.includes('5월 진행 구간'))

// ── 4) 답글 ──
await p.locator('.cmt-mini', { hasText: '답글' }).first().click()
await p.locator('.cmt-new textarea').fill('확인해서 고쳤습니다')
await p.locator('.cmt-send').click()
await p.waitForTimeout(500)
ok('답글이 같은 스레드에 달린다', await p.locator('.cmt-reply').count() === 1)
ok('답글을 달아도 스레드는 하나다', await p.locator('.cmt-item').count() === 1)

// ── 5) 해결하면 핀이 사라진다 ──
await p.locator('.cmt-mini', { hasText: '해결' }).first().click()
await p.waitForTimeout(500)
ok('해결하면 문서 위 핀이 사라진다', await p.locator('.stage .cmt-pin').count() === 0)
ok('해결하면 목록에서도 빠진다', await p.locator('.cmt-item').count() === 0)
ok('모두 해결됐다고 알려준다',
   (await p.locator('.cmt-head').innerText()).includes('모두 해결'))

// ── 6) 해결된 것도 다시 볼 수 있다 ──
await p.locator('.cmt-toggle input').check()
await p.waitForTimeout(400)
ok('해결된 것도 보기를 켜면 다시 나온다', await p.locator('.cmt-item.done').count() === 1)
ok('그때는 핀도 초록으로 돌아온다', await p.locator('.stage .cmt-pin.done').count() === 1)

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
