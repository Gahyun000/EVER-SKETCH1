// 자유 캔버스 스모크(REQ-F-002) + FOLIO 배선(REQ-F-011) — 현행 UI.
// 실행: PW_CHROME=<chrome> URL=http://127.0.0.1:8899/ node e2e/canvas_smoke.mjs
import { chromium } from 'playwright'
const URL = process.env.URL || 'http://127.0.0.1:8899/'
const PW = process.env.PW_CHROME || undefined
const b=await chromium.launch({executablePath:PW}); const p=await b.newPage({viewport:{width:1440,height:900}})
const errs=[]; p.on('pageerror',e=>errs.push(String(e.message)))
await p.goto(URL,{waitUntil:'networkidle'})
await p.waitForSelector('.freelayer:not(.off)',{timeout:15000})
const layer = p.locator('.freelayer:not(.off)').first()
const fel = layer.locator('.fel')
const bb = await layer.boundingBox()
async function addShape(title, dx, dy){ await p.locator(`.ib[title="${title}"]`).first().click(); await p.mouse.click(bb.x+dx, bb.y+dy); await p.waitForTimeout(200) }
await addShape('사각형', 160, 130); const c1 = await fel.count()
await addShape('원', 340, 280);   const c2 = await fel.count()
await p.locator('.ib[title="화살표 연결"]').first().click()
await fel.nth(0).click({force:true}); await p.waitForTimeout(120)
await fel.nth(1).click({force:true}); await p.waitForTimeout(200)
const conns = await layer.locator('.freeconn path[marker-end]').count()
// FOLIO 배선(REQ-F-011)
const folioHref = await p.locator('.folio-chip').first().getAttribute('href').catch(()=>'')
await b.close()
let fail=0; const ok=(n,c)=>{console.log((c?'  PASS ':'  FAIL ')+n); if(!c)fail++}
console.log('fel box=',c1,'ellipse=',c2,'conns=',conns,'folio=',folioHref,'errs=',errs.length)
ok('사각형 추가(.fel ≥1)', c1>=1)
ok('원 추가(.fel ≥2)', c2>=2)
ok('연결선 생성(화살표 marker-end ≥1)', conns>=1)
ok('FOLIO 칩 배선(8811)', /:8811/.test(folioHref||''))
ok('페이지 오류 없음', errs.length===0)
console.log(fail?`\n=== FAIL (${fail}) ===`:'\n=== ALL PASS ===')
process.exit(fail?1:0)
