import { chromium } from 'playwright'

const checks = []
function check(name, condition, detail = '') {
  const ok = Boolean(condition)
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  await page.goto('http://127.0.0.1:8899/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.ax-app', { timeout: 8000 })
  await page.waitForSelector('.axth', { timeout: 8000 })

  check('app shell renders', await page.locator('.ax-app').count() === 1)
  check('starts with one blank slide', await page.locator('.axth').count() === 1)

  await page.locator('.ax-film .add').click()
  check('filmstrip add creates slide', await page.locator('.axth').count() === 2)

  const stage = page.locator('.stage .freelayer').first()
  await page.getByTitle('사각형').click()
  await stage.click({ position: { x: 170, y: 170 } })
  await page.getByTitle('원').click()
  await stage.click({ position: { x: 360, y: 300 } })
  await page.waitForTimeout(100)

  const elements = page.locator('.stage .fel')
  check('shape tools add canvas elements', await elements.count() >= 2)

  await page.getByTitle('화살표 연결').click()
  await elements.nth(0).click()
  await elements.nth(1).click()
  await page.waitForTimeout(100)
  check('connect tool creates arrow path', await page.locator('.stage .freeconn path').count() >= 1)

  await page.getByTitle('펜').click()
  const box = await stage.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 120, box.y + 420)
    await page.mouse.down()
    await page.mouse.move(box.x + 180, box.y + 455)
    await page.mouse.move(box.x + 240, box.y + 430)
    await page.mouse.up()
  }
  await page.waitForTimeout(100)
  check('pen tool creates stroke path', await page.locator('.stage .freeconn path').count() >= 2)

  await page.locator('.ax-iconcol button', { hasText: '슬라이드' }).click()
  const beforeDuplicate = await page.locator('.axth').count()
  await page.locator('.ax-pill.gs', { hasText: '복제' }).first().click()
  await page.waitForTimeout(100)
  check('slide duplicate creates a copied slide', await page.locator('.axth').count() === beforeDuplicate + 1)
  check('duplicated slide keeps canvas content', await page.locator('.stage .fel').count() >= 2)

  await page.getByTitle('이북 만들기').click()
  await page.waitForSelector('.build-toast', { timeout: 8000 })
  await page.waitForFunction(() => document.querySelector('.build-toast')?.textContent?.includes('완료'), null, { timeout: 8000 })
  check('ebook build shows success toast', (await page.locator('.build-toast').innerText()).includes('완료'))

  await page.getByTitle('구글 슬라이드식 슬라이드쇼').click()
  await page.waitForSelector('.present', { timeout: 8000 })
  check('slideshow opens', await page.locator('.present').count() === 1)
  await page.keyboard.press('Escape')

  check('no browser page errors', pageErrors.length === 0, pageErrors.join(' | '))
} finally {
  await browser.close()
}

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`smoke failed: ${failed.map((c) => c.name).join(', ')}`)
  process.exit(1)
}
console.log(`smoke passed: ${checks.length}/${checks.length}`)
