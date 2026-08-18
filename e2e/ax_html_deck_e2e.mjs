// AX HTML → editable deck preview → canvas → export hotspot E2E.
// 실행 전: npm run build && python -m uvicorn server.app:app --host 127.0.0.1 --port 8830
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const URL = process.env.URL || 'http://127.0.0.1:8830/'
const SAMPLE = process.env.AX_HTML || '/Users/kimgahyun/Downloads/AX_전환_실행로드맵_v1.html'
const PW = process.env.PW_CHROME || undefined

if (!existsSync(SAMPLE)) {
  console.error(`sample missing: ${SAMPLE}`)
  process.exit(1)
}

const checks = []
function check(name, condition, detail = '') {
  const ok = Boolean(condition)
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
}
async function waitForBuildPayload(timeoutMs = 15000) {
  const started = Date.now()
  while (!buildPayload && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

const browser = await chromium.launch({ executablePath: PW })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const pageErrors = []
const consoleErrors = []
let buildPayload = null

page.on('pageerror', (err) => pageErrors.push(err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
await page.route('**/api/build', async (route) => {
  try { buildPayload = JSON.parse(route.request().postData() || '{}') } catch { buildPayload = null }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, id: 'ax-e2e', url: '/ebooks/ax-e2e/index.html' }),
  })
})

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForSelector('.ax-app', { timeout: 15000 })

  await page.locator('input[accept*=".html"]').setInputFiles(SAMPLE)
  await page.locator('.ax-tbtn.dark', { hasText: '메인 캔버스로' }).waitFor({ timeout: 120000 })
  await page.waitForTimeout(5000)

  const previewText = await page.locator('body').innerText()
  const previewGotoCount = await page.locator('[data-goto-seq]').count()
  await page.screenshot({ path: '/tmp/ax_html_deck_preview.png', fullPage: true })
  check('preview badge shows editable deck path', previewText.includes('편집·목차 그대로'))
  check('preview renders TOC rows with goto metadata', previewGotoCount >= 14, `count=${previewGotoCount}`)
  check('preview contains TOC title', previewText.includes('목차'))

  await page.locator('.ax-tbtn.dark', { hasText: '메인 캔버스로' }).click()
  await page.waitForFunction(() => document.querySelectorAll('[id^="export-page-"]').length >= 16, null, { timeout: 30000 })
  await page.waitForTimeout(1000)

  const exportPageCount = await page.locator('[id^="export-page-"]').count()
  const canvasGotoCount = await page.locator('[id^="export-page-"] [data-goto-seq]').count()
  check('canvas commit preserves all AX pages', exportPageCount >= 16, `count=${exportPageCount}`)
  check('export layer preserves TOC goto metadata', canvasGotoCount >= 14, `count=${canvasGotoCount}`)

  await page.getByTitle('이북 만들기').click()
  await waitForBuildPayload()

  const pages = buildPayload?.pages || []
  const hotspots = buildPayload?.hotspots || []
  const roles = pages.map((p) => p.role)
  check('export payload captured', !!buildPayload)
  check('export payload keeps cover role', roles[0] === 'cover', `roles[0]=${roles[0]}`)
  check('export payload keeps toc role', roles[1] === 'toc', `roles[1]=${roles[1]}`)
  check('export payload has AX content pages', roles.filter((r) => r === 'content').length >= 14, `content=${roles.filter((r) => r === 'content').length}`)
  check('export payload includes TOC hotspots', hotspots.length >= 14, `hotspots=${hotspots.length}`)
  check('hotspot seq starts at first content page', hotspots.some((h) => h.seq === 1), `seqs=${hotspots.slice(0, 5).map((h) => h.seq).join(',')}`)
  check('no browser page errors', pageErrors.length === 0, pageErrors.join(' | '))
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  if (checks.some((c) => !c.ok)) {
    await page.screenshot({ path: '/tmp/ax_html_deck_failure.png', fullPage: true }).catch(() => {})
  }
  await browser.close()
}

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n=== FAIL (${failed.length}) ${failed.map((c) => c.name).join(', ')} ===`)
  process.exit(1)
}
console.log(`\n=== ALL PASS (${checks.length}) ===`)
