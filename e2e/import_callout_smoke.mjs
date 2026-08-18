// P3 검증 스모크 — 콜아웃 렌더(tone별) + 표지 네이비 배경.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:4173/'
const F = '/tmp/callout.html'
writeFileSync(F, `<!doctype html><html lang="ko"><head><title>콜아웃문서</title></head><body>
<h1>콜아웃 표지</h1><p class="lede">콜아웃·표지 테스트</p>
<h2>강조 장</h2>
<p>본문 문단입니다.</p>
<div class="q">파란 정보 박스</div>
<div class="ok-box">초록 핵심 박스</div>
<div class="warn">주황 주의 박스</div>
</body></html>`)

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'load' })
await page.waitForSelector('.fitem', { timeout: 15000 })
await page.setInputFiles('input[type=file]', F)
await page.waitForSelector('[data-tone]', { timeout: 15000 })

const tones = await page.evaluate(() => [...document.querySelectorAll('[data-tone]')].map((e) => e.getAttribute('data-tone')))
const keyBg = await page.evaluate(() => {
  const el = document.querySelector('[data-tone="key"]')
  return el ? getComputedStyle(el).backgroundColor : ''
})
const hasNavyCover = await page.evaluate(() => [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).backgroundColor === 'rgb(15, 27, 61)'))
const bodyText = await page.locator('body').innerText()
console.log('tones =', JSON.stringify(tones))
console.log('key callout bg =', keyBg)
console.log('has navy cover bg =', hasNavyCover)
console.log('pageerrors =', errors.length ? errors : 'none')
await browser.close()

let fail = 0
const ok = (n, c) => { console.log((c ? '  PASS ' : '  FAIL ') + n); if (!c) fail++ }
ok('콜아웃 3개 렌더(data-tone)', tones.length >= 3)
ok('info 톤 존재', tones.includes('info'))
ok('key 톤 존재', tones.includes('key'))
ok('warn 톤 존재', tones.includes('warn'))
ok('key 콜아웃 배경 = 초록 틴트(#E9F5EF)', keyBg === 'rgb(233, 245, 239)')
ok('표지 네이비 배경(#0F1B3D) 렌더', hasNavyCover)
ok('콜아웃 본문 텍스트 존재', bodyText.includes('초록 핵심 박스'))
ok('페이지 오류 없음', errors.length === 0)
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
