// 마인드맵이 **옮기고 크기를 바꿀 수 있는 요소들로** 들어오는가.
//
// 임원진 신고: 「위치 이동 및 사이즈 조정 안됨」. 고장이 아니라 설계가 그랬다 —
// 마인드맵은 필드에서 **SVG 그림 한 덩어리**를 만들어 냈고, 「로그아웃」이나
// 「생존의 법칙」은 각각의 물건이 아니라 그림의 일부였다. 잡을 게 없었다.
//
// 이제 **넣는 순간 요소로 펼친다.** 그러면 자리의 주인이 캔버스 하나가 되어,
// 「필드를 고치면 옮겨 둔 자리가 어떻게 되나」 같은 질문이 아예 생기지 않는다.
// (오늘 표 높이·표 잠금에서 같은 문제를 두 번 겪었고 두 번 다 역할을 갈라서 풀렸다.)
//
// 실행: node e2e/es_mock.mjs & node e2e/mindmap_smoke.mjs
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
await p.waitForTimeout(700)

await p.locator('button', { hasText: '새 페이지' }).first().click()
await p.waitForTimeout(400)
const pick = p.locator('button', { hasText: '마인드맵' }).first()
ok('(사전) 새 페이지 목록에 마인드맵이 있다', await pick.count() === 1)
await pick.click()
await p.waitForTimeout(300)

// **2026-09-14 부터 마인드맵은 넣기 전에 가지 수(3~8)를 한 번 더 묻는다**(8c7c812, 사용자 결정 ㄱ).
// 이 스위트는 그 전에 쓰여서 「마인드맵」을 누르자마자 요소를 셌고, 화면은 아직 숫자를
// 고르라고 기다리는 중이라 **0개**가 나왔다 — 기능은 멀쩡했고 검사가 한 걸음을 빼먹었다.
// (e2e 가 돌지 않던 동안 쌓인 것이라 2026-09-21 맥 전체 실행에서야 드러났다.)
// 기본값(.def)을 누른다: 기본이 3 이어야 아래 「중심 + 가지 셋 = 4개」가 성립한다.
{
  const def = p.locator('.cpk-br.def').first()
  const n = (await def.count()) ? (await def.innerText()).trim() : ''
  ok('(사전) 넣기 전에 가지 수를 묻는다 — 기본은 3', n === '3', `기본값: ${n || '없음'}`)
  await def.click()
  await p.waitForTimeout(700)
}

const rounds = p.locator('.stage .fel.round')
ok('중심 + 가지가 **각각의 요소**로 들어온다 (예전엔 그림 한 덩어리였다)',
   await rounds.count() === 4, `${await rounds.count()}개`)
const texts = (await rounds.allInnerTexts()).map((t) => t.trim())
ok('중심 자리에 글자가 들어 있다', texts.some((t) => t.includes('중심')), texts.join(' | '))
ok('가지도 셋 들어 있다', texts.filter((t) => t.includes('가지')).length === 3, texts.join(' | '))
ok('중심과 가지를 잇는 선이 그려진다',
   await p.locator('.stage svg').count() >= 1)

// ── 옮길 수 있다 ────────────────────────────────────
const br = rounds.nth(1)
const b0 = await br.boundingBox()
await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2)
await p.mouse.down()
await p.mouse.move(b0.x + b0.width / 2 + 30, b0.y + b0.height / 2 + 20, { steps: 8 })
await p.mouse.move(b0.x + b0.width / 2 + 60, b0.y + b0.height / 2 + 40, { steps: 8 })
await p.mouse.up()
await p.waitForTimeout(300)
const b1 = await br.boundingBox()
ok('가지를 끌면 움직인다', Math.abs(b1.x - b0.x) > 30 && Math.abs(b1.y - b0.y) > 20,
   `(${Math.round(b0.x)},${Math.round(b0.y)}) → (${Math.round(b1.x)},${Math.round(b1.y)})`)

// ── 크기를 바꿀 수 있다 ──────────────────────────────
await p.waitForTimeout(200)
ok('고르면 크기 손잡이가 나온다', await p.locator('.stage .rs-h').count() === 8,
   `${await p.locator('.stage .rs-h').count()}개`)
{
  const se = p.locator('.stage .rs-se').first()
  const w0 = (await br.boundingBox()).width
  const h = await se.boundingBox()
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await p.mouse.down()
  await p.mouse.move(h.x + h.width / 2 + 50, h.y + h.height / 2 + 20, { steps: 10 })
  await p.mouse.up()
  await p.waitForTimeout(300)
  ok('가지 크기를 바꿀 수 있다', (await br.boundingBox()).width > w0 + 25,
     `${Math.round(w0)} → ${Math.round((await br.boundingBox()).width)}`)
}

// ── 글자를 고칠 수 있다 ──────────────────────────────
{
  await br.dblclick()
  await p.waitForTimeout(300)
  // 맥에서 Ctrl+A 는 「전체 선택」이 아니라 「줄 앞으로」다(이맥스 키). 리눅스에서만 통과하던 까닭.
  await p.keyboard.press('ControlOrMeta+a')
  await p.keyboard.type('품질')
  await p.waitForTimeout(200)
  const lb = await p.locator('.stage .freelayer').first().boundingBox()
  await p.mouse.click(lb.x + lb.width - 20, lb.y + lb.height - 20)
  await p.waitForTimeout(350)
  ok('가지 글자를 캔버스에서 고칠 수 있다',
     (await p.locator('.stage .fel.round').allInnerTexts()).some((t) => t.trim() === '품질'),
     (await p.locator('.stage .fel.round').allInnerTexts()).join(' | '))
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 마인드맵 통과 ===')
process.exit(fail ? 1 : 0)
