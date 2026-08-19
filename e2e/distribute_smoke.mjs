// 배부 창구 통합 + 배부 전 미리보기 — 진짜 브라우저에서 확인한다.
//
// 고치려던 문제: '표준 양식 배부'(파란 버튼)와 'PPT 올리기'(아래 패널)가 따로 있어서,
// 실물 PPT 를 배부하려던 사람이 눈에 먼저 띄는 파란 버튼을 눌러 빈 양식을 배부했다.
// 그래서 검사하는 것은 **버튼이 하나뿐인가**, 그리고 **누르기 전에 나갈 장이 보이는가**다.
//
// 실행: ADMIN=1 DECK=1 node e2e/es_mock.mjs & node e2e/distribute_smoke.mjs
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

await (await p.request.get(URL + '__resetDistribute')).json()
await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('button', { hasText: '회차' }).first().click()
await p.waitForSelector('.cy-detail', { timeout: 15000 })  // 아직 배부 전이라 목록 표는 없다

// ── 1) 배부 입구가 하나다 ──
const headBtns = await p.locator('.cy-dbtns .cy-btn').allInnerTexts()
const distEntries = headBtns.filter((t) => t.includes('배부') && !t.includes('취소'))
ok('배부 버튼이 하나뿐이다', distEntries.length === 1, headBtns.join(' | '))
ok('예전 표준 양식 버튼이 사라졌다', !headBtns.some((t) => t.includes('표준 양식')))
ok('회차 화면 본문에 별도 업로드 패널이 없다', await p.locator('.cy-deck').count() === 0)

// ── 2) 방식 고르기 ──
await p.locator('.cy-dbtns .cy-btn', { hasText: '배부하기' }).click()
const dialog = p.locator('.cy-modal')
await dialog.waitFor({ timeout: 10000 })
await p.locator('.cy-pick').waitFor({ timeout: 10000 })
const cards = await p.locator('.cy-pickcard').allInnerTexts()
ok('두 갈래를 나란히 보여준다', cards.length === 2, cards.map((c) => c.split('\n')[0]).join(' / '))
ok('실물 PPT 쪽이 권장으로 표시된다',
   cards[0].includes('실물 PPT') && cards[0].includes('권장'))
ok('이미 올린 파일을 알려준다', cards[0].includes('수행전략회의_2026.pptx'))

// ── 3) 표준 양식 — 대상자 + 미리보기 ──
await p.locator('.cy-pickcard', { hasText: '표준 양식' }).click()
await p.locator('.cy-prev').waitFor({ timeout: 10000 })
let bodyText = await dialog.innerText()
ok('받는 사람을 이름으로 보여준다',
   bodyText.includes('홍길동') && bodyText.includes('이순신'))
ok('배부 전에 실제로 나갈 장이 보인다', await p.locator('.cy-prev .fel').count() > 0,
   `요소 ${await p.locator('.cy-prev .fel').count()}개`)
ok('미리보기가 표를 표로 그린다', await p.locator('.cy-prev .feltd').count() > 20)
ok('미리보기는 편집이 잠겨 있다', await p.locator('.cy-prev .freelayer.off').count() === 1)
ok('배부 버튼에 인원수가 적혀 있다',
   (await p.locator('.cy-modal-btns .cy-btn.primary').innerText()).includes('2명'))

// ── 4) 뒤로 → 실물 PPT ──
await p.locator('.cy-modal-btns .cy-btn', { hasText: '뒤로' }).click()
await p.locator('.cy-pick').waitFor()
await p.locator('.cy-pickcard', { hasText: '실물 PPT' }).click()
await p.locator('.cy-slides').waitFor({ timeout: 10000 })
ok('슬라이드 목록이 곧 배정표다', await p.locator('.cy-slides tbody tr').count() === 3)
await p.locator('.cy-prev').waitFor({ timeout: 10000 })
ok('첫 장 미리보기가 자동으로 뜬다', await p.locator('.cy-prev .fel').count() > 0)

// 다른 장을 고르면 미리보기가 따라 바뀐다
await p.locator('.cy-slides tbody tr').nth(2).click()
await p.waitForTimeout(400)
ok('다른 장을 고르면 미리보기가 그 장으로 바뀐다',
   (await p.locator('.cy-prevhead').innerText()).includes('3번 슬라이드'),
   await p.locator('.cy-prevhead').innerText())

// ── 5) 담당자를 지정해야 배부된다 ──
const sendBtn = p.locator('.cy-modal-btns .cy-btn.primary')
ok('담당자를 아무도 안 정하면 배부 버튼이 잠겨 있다', await sendBtn.isDisabled())

await p.locator('.cy-slides tbody tr').nth(1).locator('select').selectOption({ index: 1 })
await p.locator('.cy-slides tbody tr').nth(2).locator('select').selectOption({ index: 2 })
await p.waitForTimeout(150)
ok('지정하면 버튼이 열리고 인원수가 뜬다',
   (await sendBtn.isEnabled()) && (await sendBtn.innerText()).includes('2명'),
   await sendBtn.innerText())

// 공통 장은 담당자 지정 대상에서 빠지고, '모두에게' 로 표시된다
ok('공통 전에는 각자 1장이다',
   (await p.locator('.cy-plan').innerText()).includes('1장'),
   (await p.locator('.cy-plan').innerText()).replace(/\n/g, ' ').slice(0, 90))

await p.locator('.cy-slides tbody tr').nth(0).locator('input[type="checkbox"]').check()
await p.waitForTimeout(200)
ok('공통으로 표시하면 담당자 칸이 「모두에게」가 된다',
   (await p.locator('.cy-slides tbody tr').nth(0).locator('.cy-allto').count()) === 1)

// **이게 핵심** — 공통을 체크했는데 장 수가 안 늘면, 표지가 빠진 채로 나간다.
// 실제로 그렇게 나가서 '공통이 안 됐다' 는 신고를 받았다.
const plan = (await p.locator('.cy-plan').innerText()).replace(/\n/g, ' ')
ok('공통을 체크하면 받는 장 수가 늘어난다', plan.includes('= 2장'), plan.slice(0, 110))
ok('공통 장 수를 따로 보여준다', plan.includes('공통 1장'), plan.slice(0, 110))

await sendBtn.click()
await p.waitForTimeout(500)
const sent = await (await p.request.get(URL + '__lastDistribute')).json()
ok('슬라이드별 배부로 나간다', Array.isArray(sent.assignments), JSON.stringify(sent).slice(0, 120))
ok('담당자를 지정한 2장만 보낸다', sent.assignments?.length === 2)
ok('공통 장을 함께 보낸다', Array.isArray(sent.common) && sent.common.includes(0))
ok('공통 장은 담당 배정에 중복해 넣지 않는다',
   !sent.assignments?.some((a) => a.slide === 0))


// ── 6) 이미 배부된 회차: 원본만 잠기고 추가 배부는 열려 있어야 한다 ──
// 예전에는 하나라도 배부됐으면 창 전체가 잠겼다. 표준 양식 한 장이 나간 회차에서
// PPT 담당자 칸까지 회색이 됐고, '모두에게 보내는 게 잠긴 거냐' 는 질문을 받았다.
await (await p.request.get(URL + '__setDistributed?n=1')).json()
await p.reload({ waitUntil: 'networkidle' })
await p.locator('button', { hasText: '회차' }).first().click()
await p.waitForSelector('.cy-detail', { timeout: 15000 })
await p.locator('.cy-dbtns .cy-btn', { hasText: '배부하기' }).click()
await p.locator('.cy-pick').waitFor()
await p.locator('.cy-pickcard', { hasText: '실물 PPT' }).click()
await p.locator('.cy-slides').waitFor({ timeout: 10000 })

const lockMsg = await p.locator('.cy-msg.warn').allInnerTexts()
ok('이미 배부한 회차라고 알려준다', lockMsg.some((t) => t.includes('이미 배부한 회차')),
   lockMsg.join(' | ').slice(0, 80))
ok('무엇이 잠겼는지 말한다', lockMsg.some((t) => t.includes('원본')))
ok('무엇은 되는지도 말한다', lockMsg.some((t) => t.includes('추가 배부는 그대로')))
ok('푸는 방법을 알려준다', lockMsg.some((t) => t.includes('배부 취소')))

ok('원본 다시 올리기는 잠긴다',
   await p.locator('.cy-mini', { hasText: '다시 올리기' }).isDisabled())
ok('담당자 지정은 잠기지 않는다',
   await p.locator('.cy-slides tbody tr').nth(1).locator('select').isEnabled())
await p.locator('.cy-slides tbody tr').nth(1).locator('select').selectOption({ index: 1 })
await p.waitForTimeout(150)
ok('배부된 회차에서도 추가 배부 버튼이 열린다',
   await p.locator('.cy-modal-btns .cy-btn.primary').isEnabled())

// 공통 체크는 잠금이 아니라 '모두에게' 로 보인다
await p.locator('.cy-slides tbody tr').nth(0).locator('input[type="checkbox"]').check()
await p.waitForTimeout(150)
ok('공통으로 표시하면 담당자 칸이 「모두에게」로 바뀐다',
   (await p.locator('.cy-slides tbody tr').nth(0).locator('.cy-allto').count()) === 1)
ok('공통 행에는 잠긴 입력칸이 남지 않는다',
   (await p.locator('.cy-slides tbody tr').nth(0).locator('select').count()) === 0)

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
