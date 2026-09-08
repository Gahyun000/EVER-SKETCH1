// 옮긴 덮개가 실제로 뜨고, Esc 로 닫히고, 뒤 화면을 잠그는가.
// 이 다섯은 **검사가 하나도 없던** 자리다 — 옮기기 전에도 눈으로만 봤다.
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: process.env.PW_CHROME })
const p = await b.newPage({ viewport: { width: 1500, height: 950 } })
let fail = 0
const ok = (n, c, x = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? '  — ' + x : '')); if (!c) fail++ }
p.on('pageerror', (e) => { console.log('  ✗ pageerror: ' + e.message); fail++ })

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'networkidle' })
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(600)

async function trial(name, open, sel) {
  await open()
  await p.waitForTimeout(450)
  const shown = await p.locator(sel).count()
  ok(`${name} — 공용 껍데기로 뜬다`, shown === 1 && await p.locator('.ui-scrim').count() === 1,
     `${sel} ${shown}개`)
  if (!shown) return
  const locked = await p.evaluate(() => document.body.style.overflow)
  ok(`${name} — 뒤 화면이 잠긴다`, locked === 'hidden', locked || '(안 잠김)')
  const inside = await p.evaluate(() => !!document.activeElement?.closest('.ui-modal'))
  ok(`${name} — 포커스가 창 안으로 들어온다`, inside)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(350)
  ok(`${name} — Esc 로 닫힌다`, await p.locator(sel).count() === 0)
  ok(`${name} — 닫으면 배경 잠금이 풀린다`, (await p.evaluate(() => document.body.style.overflow)) !== 'hidden')
}

await trial('도움말', async () => {
  await p.locator('.ax-menu .m', { hasText: '보기' }).first().click()
  await p.waitForTimeout(200)
  await p.locator('.ax-mdrop .ax-mitem', { hasText: '도움말' }).first().click()
}, '.ui-modal.modal')

await trial('예시영상', async () => {
  await p.locator('.ax-menu .m', { hasText: '보기' }).first().click()
  await p.waitForTimeout(200)
  await p.locator('.ax-mdrop .ax-mitem', { hasText: '예시영상' }).first().click()
}, '.ui-modal.demo-modal')

await trial('삽입 고르기', async () => {
  await p.locator('.ax-tb .ib[title="이모지·아이콘"]').first().click().catch(async () => {
    await p.locator('.ax-tb .ib').filter({ hasText: '😀' }).first().click()
  })
}, '.ui-modal.ins-panel')

// 새 페이지 드롭다운 — 모달이 아니다. Esc 로 닫히는지만 본다.
await p.locator('.cardpick .add').first().click()
await p.waitForTimeout(300)
ok('새 페이지 — 드롭다운이 열린다', await p.locator('.cpk-pop').count() === 1)
ok('새 페이지 — 모달로 안 바뀌었다', await p.locator('.ui-scrim').count() === 0)
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
ok('새 페이지 — Esc 로 닫힌다 (예전에는 안 됐다)', await p.locator('.cpk-pop').count() === 0)

await b.close()
console.log(fail ? `\n✗ ${fail}건 실패` : '\n✓ 모두 통과')
process.exit(fail ? 1 : 0)
