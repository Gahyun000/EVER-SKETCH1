// 현행 UI 가져오기 스모크 — 업로드 → 덱 미리보기 → '메인 캔버스로 가기' → 페이지 커밋(로컬 editableDoc 파이프라인).
// 실행: PW_CHROME=<chrome> URL=http://127.0.0.1:8899/ node e2e/import_v2_smoke.mjs  (dev PC: npx playwright install)
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const URL = process.env.URL || 'http://127.0.0.1:8899/'
const PW = process.env.PW_CHROME || undefined
const F = '/tmp/imp.html'
writeFileSync(F, `<!doctype html><html lang="ko"><head><title>가져오기문서</title></head><body>
<h1>가져오기 표지</h1><p class="lede">리드 문장</p>
<h2>첫 번째 장</h2><p>첫 장 본문. IMPORT-MARK-A</p>
<h2>두 번째 장</h2><p>둘째 장 본문.</p>
<h2>세 번째 장</h2><p>셋째 장 본문. IMPORT-MARK-Z</p>
</body></html>`)
const b = await chromium.launch({ executablePath: PW })
const p = await b.newPage({ viewport:{width:1440,height:900} })
const errs=[]; p.on('pageerror',e=>errs.push(String(e.message)))
await p.goto(URL,{waitUntil:'networkidle'})
await p.waitForSelector('.axth',{timeout:15000})
const before = await p.locator('.axth').count()
await p.setInputFiles('input[type=file]', F)
await p.waitForSelector('.ax-tbtn.dark',{timeout:15000})
await p.locator('.ax-tbtn.dark',{hasText:'메인 캔버스로'}).click()
await p.waitForFunction((n)=>document.querySelectorAll('.axth').length > n, before, {timeout:15000})
const after = await p.locator('.axth').count()
const body = await p.locator('body').innerText()
const status = await p.locator('.bt-msg').innerText().catch(()=> '')
await b.close()
let fail=0; const ok=(n,c)=>{console.log((c?'  PASS ':'  FAIL ')+n); if(!c)fail++}
console.log('before=',before,'after=',after,'status=',JSON.stringify(status),'errs=',errs.length)
ok('가져오기 후 페이지 증가', after > before)
ok('본문 첫 마커(IMPORT-MARK-A) 렌더', body.includes('IMPORT-MARK-A'))
ok('본문 끝 마커(IMPORT-MARK-Z) 미유실', body.includes('IMPORT-MARK-Z'))
ok('상태 가져옴 표시', /가져옴/.test(status))
ok('페이지 오류 없음', errs.length===0)
console.log(fail?`\n=== FAIL (${fail}) ===`:'\n=== ALL PASS ===')
process.exit(fail?1:0)
