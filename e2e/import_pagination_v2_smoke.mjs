// 넘침 분할 스모크(현행 UI) — 긴 섹션 1개 업로드 → 미리보기 커밋 → 여러 페이지 분할, 내용 미유실.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const URL = process.env.URL || 'http://127.0.0.1:8899/'
const PW = process.env.PW_CHROME || undefined
const F='/tmp/long2.html'
let ps=''; for(let i=1;i<=40;i++){ ps+=`<p>문단 ${i}: 카드 높이를 넘기기 위한 충분히 긴 본문 문장입니다. 현장 데이터로 품질을 바꾸는 AX 사업 세부.${i===40?' END-MARKER-Z':''}</p>` }
writeFileSync(F, `<!doctype html><html lang="ko"><head><title>긴문서</title></head><body><h1>긴 문서 표지</h1><p class="lede">넘침</p><h2>긴 장</h2>${ps}<h2>짧은 장</h2><p>짧은 문단.</p></body></html>`)
const b=await chromium.launch({executablePath:PW}); const p=await b.newPage({viewport:{width:1440,height:900}})
const errs=[]; p.on('pageerror',e=>errs.push(String(e.message)))
await p.goto(URL,{waitUntil:'networkidle'})
await p.waitForSelector('.axth',{timeout:15000}); const before=await p.locator('.axth').count()
await p.setInputFiles('input[type=file]', F)
await p.waitForSelector('.ax-tbtn.dark',{timeout:15000})
await p.locator('.ax-tbtn.dark',{hasText:'메인 캔버스로'}).click()
await p.waitForFunction((n)=>document.querySelectorAll('.axth').length>n, before, {timeout:15000})
const after=await p.locator('.axth').count(); const body=await p.locator('body').innerText()
await b.close()
let fail=0; const ok=(n,c)=>{console.log((c?'  PASS ':'  FAIL ')+n); if(!c)fail++}
console.log('before=',before,'after=',after,'errs=',errs.length)
ok('긴 장이 여러 페이지로 분할(≥5장)', after>=5)
ok('마지막 문단 미유실(END-MARKER-Z)', body.includes('END-MARKER-Z'))
ok('분할 표기 존재(장 (2))', /\(2\)/.test(body))
ok('페이지 오류 없음', errs.length===0)
console.log(fail?`\n=== FAIL (${fail}) ===`:'\n=== ALL PASS ===')
process.exit(fail?1:0)
