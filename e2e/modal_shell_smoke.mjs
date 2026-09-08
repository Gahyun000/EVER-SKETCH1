// 대화상자 껍데기가 하나인지 — 저장 확인창으로 확인한다.
//
// 저장 확인·배부·회수·의견이 각자 스크림과 상자를 그리던 때에는 폭도 모서리도
// 조금씩 달랐고, 셋 다 **Esc 로 닫히지 않았다.** 새 창을 만들 때마다 잊는 종류의
// 일이라 껍데기를 ui/Modal 하나로 모았다.
//
// 여기서는 그중 자동 검사가 없던 저장 확인창을 본다 —
// 같은 껍데기(.ui-scrim)로 뜨는가, Esc 로 닫히는가, 기본 창이 아닌가.
//
// 실행: node e2e/es_mock.mjs & node e2e/modal_shell_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1500, height: 950 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))
let native = 0
p.on('dialog', (d) => { native++; void d.dismiss() })

// 저장을 막아 **'저장 안 됨' 상태를 확실히 만든다.**
// 그냥 두면 자동저장이 먼저 끝나서, 확인창이 뜰 이유가 사라진다 —
// 그러면 테스트는 기계가 바쁜 날에만 실패한다(원인을 짚기 가장 어려운 종류다).
await p.route('**/api/projects/**', (route) => {
  const m = route.request().method()
  return (m === 'PUT' || m === 'PATCH') ? route.abort() : route.continue()
})
await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(500)

// 저장 안 된 변경을 만든다 — 표 하나를 새로 놓는다.
const lb = await p.locator('.stage .freelayer').first().boundingBox()
await p.locator('.ax-tb .ib[title="표"]').first().click()
await p.mouse.click(lb.x + 120, lb.y + lb.height - 90)
await p.waitForTimeout(500)
const lab = await p.locator('.save-lab').getAttribute('class') || ''
ok('(사전) 저장되지 않은 변경이 생겼다',
   lab.includes('state-dirty') || lab.includes('state-error') || lab.includes('state-saving'),
   await p.locator('.save-lab').innerText())

// 저장하지 않고 나가려 하면 확인창이 뜬다.
await p.locator('.ax-menu .m', { hasText: '파일' }).first().click()
await p.waitForTimeout(200)
await p.locator('.ax-mdrop .ax-mitem', { hasText: 'HTML 가져오기' }).first().click()
await p.waitForTimeout(500)

const tablesAfter = await p.locator('.stage .fel.table').count()
ok('저장 확인창이 공용 껍데기로 뜬다', await p.locator('.ui-scrim').count() === 1)
ok('브라우저 기본 창이 아니다', native === 0, `${native}건`)
const txt = (await p.locator('.save-modal').innerText()).replace(/\n+/g, ' | ')
ok('무엇을 묻는지 제목에 있다', txt.includes('저장하고 계속할까요'), txt.slice(0, 60))
ok('왜 묻는지도 적혀 있다', txt.includes('현재 작업 화면이 바뀔 수 있습니다'))
ok('세 갈래를 모두 준다',
   txt.includes('저장하지 않고 계속') && txt.includes('취소') && txt.includes('저장하고 계속'))
// 2026-09-08 사용자 결정 — **닫기 ✕ 를 없앴다.** 모든 창에 「취소」가 있어서,
// 나가는 길이 둘이면 어느 쪽이 「그만두기」인지 한 번 생각하게 된다.
// 대신 **나가는 길이 하나도 없는 창**을 못 만들도록 footer 를 필수로 받는다.
ok('닫기 ✕ 는 없다', await p.locator('.save-modal .ui-modal-x').count() === 0)
ok('대신 나가는 길이 버튼으로 있다', await p.locator('.save-modal .ui-modal-foot button').count() >= 1)

// **Esc 로 닫힌다.** 예전에는 이 창만 Esc 가 통하지 않았다 —
// 창마다 껍데기를 따로 만들면 이런 게 하나씩 빠진다.
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
ok('Esc 로 닫힌다', await p.locator('.ui-scrim').count() === 0)
// 저장 상태로 보지 않는다 — 자동 저장이 그 사이에 끝나면 'dirty' 가 아니게 된다.
// 여기서 확인할 것은 **작업물이 남아 있는가**다.
ok('닫아도 방금 만든 표가 남아 있다', await p.locator('.stage .fel.table').count() === tablesAfter,
   `${tablesAfter}개`)

ok('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(fail ? `\n=== FAIL (${fail}) ===` : '\n=== ALL PASS ===')
process.exit(fail ? 1 : 0)
