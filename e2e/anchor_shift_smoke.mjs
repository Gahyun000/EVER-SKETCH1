// 표가 바뀔 때 지적이 가리키는 칸도 따라 움직인다.
//
// **조용히 틀리는 종류다.** 담당자가 로드맵에 행을 하나 추가하면 그 아래 칸들이
// 전부 한 칸씩 밀린다. 앵커를 그대로 두면 「B프로젝트 · 3월」이 가리키던 자리가
// 다른 줄이 되고, 지적은 그대로인데 **엉뚱한 곳을 가리킨다.** 아무도 모른 채
// 회의에 들어간다.
//
// 검사하는 것
//   1) 행을 추가하면 **묻지 않고** 앵커가 따라 내려간다
//      (추가할 때까지 물으면 사람들은 읽지 않고 누르게 되고,
//       그러면 정작 지워질 때의 경고까지 흘려보낸다)
//   2) 짚어 둔 줄을 지우려 하면 **묻는다** — 무엇이 사라지는지 보여주고
//   3) 「그대로 두기」를 고르면 아무 일도 일어나지 않는다
//   4) 「의견은 남기고」가 기본 — 지적은 남고 「가리키던 칸이 없어짐」이 된다
//
// 실행: COMMENTS=1 node e2e/es_mock.mjs & node e2e/anchor_shift_smoke.mjs
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
let native = 0
p.on('dialog', (d) => { native++; void d.dismiss() })

const anchorOf = async () => {
  const r = await p.request.get(URL.replace(/\/$/, '') + '/api/projects/p_test/comments')
  const c = (await r.json()).comments[0]
  return { cell: c.cell, lost: !!c.lost_at }
}

await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(600)

// 씨앗 지적은 3행 5열(0부터)에 달려 있다.
ok('(사전) 지적이 3_5 를 가리킨다', (await anchorOf()).cell === '3_5')

const cell = (r, c) => p.locator(`.stage .feltd[data-r="${r}"][data-c="${c}"]`).first()
const addAbove = p.locator('.insp-pill', { hasText: '위에 추가' })
const delRow = p.locator('.insp-pill', { hasText: '행 삭제' })

// ── 1) 행 추가 — 묻지 않고 따라 내려간다 ──
await cell(2, 2).click()
await p.waitForTimeout(250)
await addAbove.click()
await p.waitForTimeout(700)
ok('행을 추가할 때는 묻지 않는다', await p.locator('.ui-scrim').count() === 0)
ok('앵커가 한 줄 따라 내려간다', (await anchorOf()).cell === '4_5', (await anchorOf()).cell)

// ── 2) 짚어 둔 줄을 지우려 하면 묻는다 ──
await cell(4, 2).click()
await p.waitForTimeout(250)
await delRow.click()
await p.waitForTimeout(500)
ok('짚어 둔 줄을 지울 때는 묻는다', await p.locator('.ui-scrim').count() === 1)
ok('브라우저 기본 창이 아니다', native === 0)
const dlg = await p.locator('.cy-modal').innerText()
ok('몇 건인지 제목에 있다', dlg.includes('1건'), dlg.split('\n')[0])
ok('어느 지적인지 보여준다', dlg.includes('5월 진행 구간'), dlg.replace(/\n/g, ' ').slice(0, 100))
const btns = await p.locator('.cy-modal-btns .cy-btn').allInnerTexts()
ok('선택지가 셋이다', btns.length === 3, btns.join(' | '))

// ── 3) 「그대로 두기」 ──
await p.locator('.cy-modal-btns .cy-btn', { hasText: '그대로 두기' }).click()
await p.waitForTimeout(400)
ok('그만두면 창이 닫힌다', await p.locator('.ui-scrim').count() === 0)
ok('그만두면 앵커도 그대로다', (await anchorOf()).cell === '4_5')
ok('그만두면 행도 지워지지 않는다',
   await p.locator('.stage .feltd[data-r="4"][data-c="5"]').count() === 1)

// ── 4) 「의견은 남기고 바꾸기」 ──
await cell(4, 2).click()
await p.waitForTimeout(250)
await delRow.click()
await p.waitForTimeout(500)
await p.locator('.cy-modal-btns .cy-btn', { hasText: '의견은 남기고' }).click()
await p.waitForTimeout(800)

const after = await anchorOf()
ok('지적은 지워지지 않는다', after.lost === true, JSON.stringify(after))
ok('문서 위 핀은 사라진다 — 엉뚱한 칸을 가리키느니 안 그리는 게 낫다',
   await p.locator('.stage .cmt-pin').count() === 0)

await p.locator('.cmt-tab').click()
await p.waitForTimeout(400)
ok('목록에는 남고, 그 사실을 말해 준다', await p.locator('.cmt-lost').count() === 1,
   await p.locator('.cmt-item').first().innerText().catch(() => ''))

ok('브라우저 기본 창은 끝까지 없었다', native === 0, `${native}건`)
ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
