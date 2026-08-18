// P2 검증 스모크 — 넘침 이어짐(긴 섹션이 '제목 (2)(3)'으로 분할, 내용 미유실).
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:4173/'
const LONG = '/tmp/long.html'

// 긴 섹션 1개(문단 40) + 짧은 섹션 1개 를 가진 문서 생성
let ps = ''
for (let i = 1; i <= 40; i++) {
  ps += `<p>문단 ${i}: 이것은 카드 높이를 넘기기 위한 충분히 긴 본문 문장입니다. 현장 데이터로 품질을 바꾸는 AX 사업의 세부 내용을 여러 줄에 걸쳐 설명합니다.${i === 40 ? ' END-MARKER-Z' : ''}</p>`
}
const html = `<!doctype html><html lang="ko"><head><title>긴문서</title></head><body>
<h1>긴 문서 표지</h1><p class="lede">넘침 분할 테스트</p>
<h2>긴 장</h2>${ps}
<h2>짧은 장</h2><p>짧은 문단 하나.</p>
</body></html>`
writeFileSync(LONG, html)

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'load' })
await page.waitForSelector('.fitem', { timeout: 15000 })
const before = await page.locator('.fitem').count()
await page.setInputFiles('input[type=file]', LONG)
await page.waitForFunction((n) => document.querySelectorAll('.fitem').length !== n, before, { timeout: 15000 })
const after = await page.locator('.fitem').count()
const status = await page.locator('.tb-status').innerText().catch(() => '')
const bodyText = await page.locator('body').innerText()
console.log('after import =', after)
console.log('status =', status)
console.log('pageerrors =', errors.length ? errors : 'none')
await browser.close()

let fail = 0
const ok = (n, c) => { console.log((c ? '  PASS ' : '  FAIL ') + n); if (!c) fail++ }
ok('긴 장이 분할됨 (긴 장 (2) 생성)', bodyText.includes('긴 장 (2)'))
ok('마지막 문단 미유실 (END-MARKER-Z 존재)', bodyText.includes('END-MARKER-Z'))
ok('짧은 장은 분할 안 됨', !bodyText.includes('짧은 장 (2)'))
ok('총 페이지 ≥ 5 (표지+목차+긴장 여러장+짧은장)', after >= 5)
ok('페이지 오류 없음', errors.length === 0)
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
