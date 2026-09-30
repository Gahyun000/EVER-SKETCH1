// **내 자료: 폴더·자료 합쳐 10줄, 쪽 막대는 늘 화면 맨 아래.** (2026-09-21 · 시안 ㄱㄱㄱㄱ)
//
// 신고(화면 기록 11.04): 1쪽은 폴더 1 + 자료 12 = 13줄, 2쪽은 1줄. 쪽 번호가 목록 바로 밑을
// 따라다녀서 2쪽으로 넘기면 번호가 화면 위로 360px 튀었다 — 방금 누른 자리에서 「1」을 못 누른다.
// 1쪽뿐이면 막대가 아예 사라졌다.
//
// 모의 서버를 두 가지로 띄워 본다(run_all 이 해 준다):
//   LIST=13 FOLDERS=1 — 지금 화면과 같은 모양(폴더 1 + 자료 13 = 14줄 → 10 · 4)
//   (기본)            — 자료 1건뿐(1쪽) — 그래도 막대가 그 자리에 있는가
//
// 실행: LIST=13 FOLDERS=1 node e2e/es_mock.mjs & LIST=13 FOLDERS=1 node e2e/lib_pager_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined
const LIST = Number(process.env.LIST || 1), FOLDERS = Number(process.env.FOLDERS || 0)
const ALL = LIST + FOLDERS

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
await p.waitForSelector('.lib-pagebar', { timeout: 15000 })
await p.waitForTimeout(500)

const rows = () => p.locator('.lib-tbl tbody tr:not(.lib-trempty)').count()
const bar = async () => {
  const bb = await p.locator('.lib-pagebar').boundingBox()
  const sc = await p.locator('.lib-screen').boundingBox()
  return { top: Math.round(bb.y), gap: Math.round(sc.y + sc.height - (bb.y + bb.height)) }
}
const countText = async () => (await p.locator('.lib-pager .lib-count').innerText()).trim()
// 개수 줄은 목록 **위**(개수줄 ㄴ) — 표 머리보다 위에 있어야 한다
const countAbove = async () => (await p.locator('.lib-pager').boundingBox()).y < (await p.locator('.lib-list').boundingBox()).y

if (ALL > 10) {
  // ── 지금 화면과 같은 모양 — 14줄 ─────────────────────────
  const r1 = await rows(), b1 = await bar(), c1 = await countText()
  ok('1쪽은 폴더 포함 **10줄**', r1 === 10, `${r1}줄`)
  ok('폴더가 맨 앞 줄이다', (await p.locator('.lib-tbl tbody tr').first().innerText()).includes('폴더'))
  ok('개수 줄 — 폴더·자료·전체·페이지·쪽 크기', c1.includes(`폴더 ${FOLDERS}개`) && c1.includes(`자료 ${LIST}개`) && c1.includes(`전체 ${ALL}개`) && c1.includes('1/2 페이지') && c1.includes('10개씩'), c1)
  ok('개수 줄은 목록 위에 있다(원래 자리)', await countAbove())
  ok('아래 막대에는 개수 글자가 없다 — 번호만', (await p.locator('.lib-pagebar .lib-count').count()) === 0)
  ok('막대가 화면 바닥에 붙어 있다', b1.gap <= 2, `바닥과 ${b1.gap}px`)

  await p.locator('.lib-pagebar .lib-pg', { hasText: /^2$/ }).click()
  await p.waitForTimeout(350)
  const r2 = await rows(), b2 = await bar(), c2 = await countText()
  ok('2쪽은 나머지', r2 === ALL - 10, `${r2}줄`)
  ok('**2쪽으로 넘겨도 막대가 같은 자리다** — 신고된 그 증상', Math.abs(b2.top - b1.top) <= 1, `y ${b1.top} → ${b2.top}`)
  ok('개수 줄이 2페이지로 바뀐다', c2.includes('2/2 페이지'), c2)
  ok('2쪽에는 폴더가 없다(1쪽에 다 들어갔다)', !(await p.locator('.lib-tbl tbody tr').first().innerText()).includes('폴더'))

  // 창이 낮아도 막대는 보인다 — 목록만 넘어간다
  await p.setViewportSize({ width: 1600, height: 520 })
  await p.locator('.lib-pagebar .lib-pg', { hasText: /^1$/ }).click()
  await p.waitForTimeout(350)
  const lo = await p.locator('.lib-pagebar').boundingBox()
  ok('창이 낮아도 막대는 화면 안에 있다', lo.y + lo.height <= 520 + 1, `막대 바닥 ${Math.round(lo.y + lo.height)} / 창 520`)
} else {
  // ── 1쪽뿐 — 그래도 막대는 그 자리 ──────────────────────
  const b1 = await bar(), c1 = await countText()
  ok('1쪽뿐이어도 쪽 막대가 있다 — 나타났다 사라지면 자리가 변한다', (await p.locator('.lib-pagebar').count()) === 1)
  ok('「1」이 서 있고 ‹ › 는 흐리다', (await p.locator('.lib-pagebar .lib-pg.on').innerText()).trim() === '1'
     && (await p.locator('.lib-pagebar .lib-pg[disabled]').count()) === 2)
  ok('막대가 화면 바닥에 붙어 있다 — 목록이 한 줄이어도', b1.gap <= 2, `바닥과 ${b1.gap}px`)
  ok('개수 문구', c1.includes(`전체 ${ALL}개`) && c1.includes('1/1 페이지'), c1)
  ok('개수 줄은 목록 위에 있다(원래 자리)', await countAbove())
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))
await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 쪽 막대 통과 ===')
process.exit(fail ? 1 : 0)
