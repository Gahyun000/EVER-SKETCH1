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
await p.locator('text=임원회의').first().click()
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

// ── 2-b) **내가 답해야 할 것**을 눈에 띄는 곳에서 알려준다 ──
// 오른쪽 가장자리의 작은 탭 하나로는, 자기 장을 고치고 있는 사람 눈에
// 들어오지 않는다. 그 사이 지적은 아무도 안 본 채로 남는다.
{
  const todo = p.locator('.pv-todo')
  ok('확인할 의견이 있다고 미리보기 머리에 뜬다', await todo.count() === 1)
  ok('몇 건인지 적혀 있다', (await todo.innerText()).includes('1건'),
     (await todo.innerText()).replace(/\n/g, ' '))
  ok('탭도 내 몫이라고 표시한다',
     ((await tab.getAttribute('class')) || '').includes('tome'),
     await tab.getAttribute('class'))
  await todo.click()
  await p.waitForTimeout(400)
  ok('누르면 의견 목록이 열린다', await p.locator('.cmt-panel').count() === 1)
  ok('그 지적이 「나에게」로 표시된다',
     await p.locator('.cmt-item.tome .cmt-tome').count() === 1)
  ok('열고 나면 알림은 사라진다', await p.locator('.pv-todo').count() === 0)
  await p.locator('.cmt-x').click()
  await p.waitForTimeout(300)
}

// ── 3) 핀을 누르면 목록이 그 지적으로 간다 ──
await pin.click()
await p.waitForTimeout(400)
ok('핀을 누르면 의견 목록이 열린다', await p.locator('.cmt-panel').count() === 1)
const item = p.locator('.cmt-item').first()
ok('그 지적이 골라진 상태로 보인다', (await item.getAttribute('class') || '').includes('on'))
const itemText = await item.innerText()
ok('어디를 가리키는지 목록에도 적혀 있다', itemText.includes('4행 · 4월'), itemText.split('\n')[1])
ok('내용이 그대로 보인다', itemText.includes('5월 진행 구간'))

// ── 4) 답글 ──
await p.locator('.cmt-mini', { hasText: '답글' }).first().click()
await p.locator('.cmt-new textarea').fill('확인해서 고쳤습니다')
await p.locator('.cmt-send').click()
await p.waitForTimeout(500)
ok('답글이 같은 스레드에 달린다', await p.locator('.cmt-reply').count() === 1)
ok('답글을 달아도 스레드는 하나다', await p.locator('.cmt-item').count() === 1)

// ── 5) 「고쳤습니다」 → 해결, 두 손으로 나뉜다 ──
// 담당자가 스스로 닫게 두면 "고쳤다" 와 "정말 고쳤다" 가 구분되지 않는다.
// 그러면 발행 직전의 '미해결 0건' 이 아무것도 보장하지 못한다.
{
  const acts = await p.locator('.cmt-item').first().locator('.cmt-mini').allInnerTexts()
  ok('지적받은 쪽에는 「해결」이 없다', !acts.includes('해결'), acts.join(' | '))
  ok('대신 「고쳤습니다」가 있다', acts.includes('고쳤습니다'), acts.join(' | '))

  await p.locator('.cmt-mini', { hasText: '고쳤습니다' }).first().click()
  await p.waitForTimeout(600)
  ok('고쳤다고 알려도 아직 닫히지 않는다', await p.locator('.cmt-item').count() === 1)
  ok('고침 표시가 붙는다', await p.locator('.cmt-fixed').count() === 1)
  ok('답글이 한 줄 자동으로 달린다',
     (await p.locator('.cmt-reply').last().innerText()).includes('고쳤습니다'),
     (await p.locator('.cmt-reply').last().innerText()).replace(/\n/g, ' '))
  ok('문서 위 핀도 아직 남아 있다', await p.locator('.stage .cmt-pin').count() === 1)
  ok('이제 내 차례가 아니다(알림이 사라진다)', await p.locator('.pv-todo').count() === 0)

  // 되돌릴 수 있다 — 잘못 눌렀을 때 관리자를 부르지 않아도 되게.
  await p.locator('.cmt-mini', { hasText: '고침 취소' }).first().click()
  await p.waitForTimeout(500)
  ok('고침을 되돌릴 수 있다', await p.locator('.cmt-fixed').count() === 0)
}

// 닫는 것은 지적한 사람 몫이다. 여기서는 화면 검사를 위해 서버를 거치지 않고
// 모의 서버에 직접 요청한다(권한 판정은 server/test_comments.py 가 지킨다).
await p.request.post(URL.replace(/\/$/, '') + '/api/comments/cm1/resolve',
                     { data: { resolved: true } })
await p.reload({ waitUntil: 'networkidle' })
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(600)
await p.locator('.cmt-tab').click()
await p.waitForTimeout(400)
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
