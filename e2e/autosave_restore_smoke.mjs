import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const PW = process.env.PW_CHROME || undefined
const browser = await chromium.launch({ executablePath: PW })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))

try {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    await indexedDB.deleteDatabase('ebook_html_workspace')
    localStorage.clear()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.ax-app', { timeout: 15000 })

  await page.locator('.ttl').fill('자동저장 테스트 문서')
  await page.locator('.ax-film .add').click()
  await page.waitForFunction(() => document.querySelectorAll('.axth').length >= 1, null, { timeout: 8000 })
  await page.waitForFunction(() => document.querySelector('.ax-title .save')?.textContent?.includes('저장됨'), null, { timeout: 10000 })
  const savedDraft = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ebook_html_workspace', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly')
      const req = tx.objectStore('drafts').get('current')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  })

  const before = await page.locator('.axth').count()
  await page.reload({ waitUntil: 'networkidle' })
  const modalVisible = await page.waitForSelector('.save-modal', { timeout: 10000 }).then(() => true).catch(() => false)
  const modalText = modalVisible ? await page.locator('.save-modal').innerText() : ''
  if (modalVisible) {
    await page.locator('.save-modal button', { hasText: '복구하기' }).click()
    await page.waitForFunction((n) => document.querySelectorAll('.axth').length >= n, before, { timeout: 8000 })
  }

  const after = await page.locator('.axth').count()
  const title = await page.locator('.ttl').inputValue()
  await page.locator('.ttl').fill('저장확인 테스트 문서')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ebook:import')))
  await page.waitForSelector('.save-modal', { timeout: 5000 })
  const confirmText = await page.locator('.save-modal').innerText()
  let fail = 0
  const ok = (name, cond) => { console.log((cond ? '  PASS ' : '  FAIL ') + name); if (!cond) fail++ }
  console.log('before=', before, 'after=', after, 'savedDraft=', !!savedDraft, 'modal=', JSON.stringify(modalText), 'confirm=', JSON.stringify(confirmText), 'errors=', errors.length)
  ok('IndexedDB draft 저장', !!savedDraft)
  ok('복구 모달 표시', modalText.includes('이전에 작업하던 문서'))
  ok('페이지 수 복원', after >= before && after >= 1)
  ok('문서 제목 복원', title === '자동저장 테스트 문서')
  ok('저장 확인 모달 표시', confirmText.includes('저장하고 계속') && confirmText.includes('취소'))
  ok('페이지 오류 없음', errors.length === 0)
  console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
  process.exitCode = fail ? 1 : 0
} finally {
  await browser.close()
}
