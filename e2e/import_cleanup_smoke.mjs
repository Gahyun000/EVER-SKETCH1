// P4 검증 스모크 — 'AI로 정리' 제안→수락(문구 다듬기·KPI 카드 전환).
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:4173/'
const F = '/tmp/cleanup.html'
writeFileSync(F, `<!doctype html><html lang="ko"><head><title>정리문서</title></head><body>
<h1>정리 표지</h1><p class="lede">부제  입니다  ·</p>
<h2>기대 성과</h2><p>불량률: -30%</p><p>검사시간: -40%</p><p>ROI: 14개월</p>
<h2>개요</h2><p>지표 요약 ·</p>
</body></html>`)

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'load' })
await page.waitForSelector('.fitem', { timeout: 15000 })
const before = await page.locator('.fitem').count()
await page.setInputFiles('input[type=file]', F)
await page.waitForFunction((n) => document.querySelectorAll('.fitem').length !== n, before, { timeout: 15000 })

await page.locator('button:has-text("AI로 정리")').click()
await page.waitForSelector('.ai-modal', { timeout: 8000 })
const hasPolish = await page.locator('[data-sug="polish"]').count()
const hasKpi = await page.locator('[data-sug="kpi"]').count()
const junkBefore = await page.evaluate(() => document.body.innerText.includes('요약 ·'))

await page.locator('[data-sug="polish"] .ai-apply').click()
await page.waitForFunction(() => !document.body.innerText.includes('요약 ·'), null, { timeout: 8000 })
const junkAfter = await page.evaluate(() => document.body.innerText.includes('요약 ·'))

await page.locator('[data-sug="kpi"] .ai-apply').click()
await page.waitForFunction(() => document.body.innerText.includes('성과·KPI'), null, { timeout: 8000 })
const kpiLabel = await page.evaluate(() => document.body.innerText.includes('성과·KPI'))

console.log('suggestions polish/kpi =', hasPolish, hasKpi)
console.log('junk before/after polish =', junkBefore, junkAfter)
console.log('kpi label after convert =', kpiLabel)
console.log('pageerrors =', errors.length ? errors : 'none')
await browser.close()

let fail = 0
const ok = (n, c) => { console.log((c ? '  PASS ' : '  FAIL ') + n); if (!c) fail++ }
ok('제안 패널: 문구 다듬기 제안 표시', hasPolish === 1)
ok('제안 패널: KPI 제안 표시', hasKpi === 1)
ok('적용 전 다듬기 대상 존재(요약 ·)', junkBefore === true)
ok('문구 다듬기 적용 후 정리됨', junkAfter === false)
ok('KPI 적용 후 카드타입 = 성과·KPI', kpiLabel === true)
ok('페이지 오류 없음', errors.length === 0)
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
