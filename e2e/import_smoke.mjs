// 3차 P0 검증 스모크 — HTML 가져오기 게이트(업로드 → 페이지 N장 로드).
// 사용법:
//   npm run build && npm run preview   (별도 터미널)
//   node e2e/import_smoke.mjs docs/2차_핸드오버.html
// Mac 최초 1회: npx playwright install chromium
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4173/'
const sample = process.argv[2]

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'load' })
await page.waitForSelector('.fitem', { timeout: 15000 })
const before = await page.locator('.fitem').count()

await page.setInputFiles('input[type=file]', sample)
await page.waitForFunction((n) => document.querySelectorAll('.fitem').length !== n, before, { timeout: 15000 })

const after = await page.locator('.fitem').count()
const labels = (await page.locator('.fitem').allInnerTexts()).map((s) => s.replace(/[‹›✕]/g, ' ').replace(/\s+/g, ' ').trim())
const status = await page.locator('.tb-status').innerText().catch(() => '')
const bodyText = await page.locator('body').innerText()
console.log('seed pages =', before)
console.log('after import =', after)
console.log('labels =', JSON.stringify(labels, null, 0))
console.log('status =', status)
console.log('pageerrors =', errors.length ? errors : 'none')
await browser.close()

let fail = 0
const ok = (n, c) => { console.log((c ? '  PASS ' : '  FAIL ') + n); if (!c) fail++ }
ok('≥9 pages after import (cover+toc+7, 넘침 분할 시 증가)', after >= 9)
ok('page 1 = 표지', /표지/.test(labels[0] || ''))
ok('page 2 = 목차', /목차/.test(labels[1] || ''))
ok('page 3 = 빈 페이지(note)', /빈 페이지/.test(labels[2] || ''))
ok('no page errors', errors.length === 0)
ok('status shows 가져옴', /가져옴/.test(status))
ok('P1 clean title rendered (마일스톤 (2차))', bodyText.includes('마일스톤 (2차)'))
ok('P1 no decorative badge (0마일스톤)', !bodyText.includes('0마일스톤'))
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
