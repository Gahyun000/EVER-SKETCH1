// 연결점(도형에 마우스를 올리면 나오는 파란 점 4개)이 **어디에 나오고 어디에 안 나오는가**.
//
// 왜 이 스위트가 생겼는가
//   연결점은 `locked` 요소에는 안 떴다. 2026-09-07 에 표준 양식의 자리 잠금을 풀면서
//   **표 3개에 연결점이 새로 생겼고**, 임원이 칸을 잡으려다 선을 긋는 일이 실제로
//   일어났다(화면 녹화). 선은 conns 에 저장되어 **결재 스냅샷까지 따라간다** —
//   그은 사람은 그은 줄도 모르는데.
//
//   그렇다고 기능을 없앨 수는 없다. 마인드맵·프로세스 카드가 이 위에 서 있다.
//   그래서 **자리를 좁혔다**:
//     · 표에는 안 띄운다(NO_CPT)            — 자유 이북에서도
//     · 표준 양식 자료에서는 아예 안 띄운다  — 도구모음의 「→」 버튼도 감춘다
//   잇는 길이 없어지는 게 아니라, **의도하지 않은 길 하나**가 없어지는 것이다.
//
// 실행: node e2e/es_mock.mjs & node e2e/connect_points_smoke.mjs
//       FREE=1 을 주면 자유 이북으로 띄운다(모의 서버와 테스트 양쪽에).
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined
const FREE = !!process.env.FREE

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1600, height: 950 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))

await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForSelector('text=임원회의', { timeout: 15000 })
await p.locator('text=임원회의').first().click()
await p.waitForSelector('.freelayer:not(.off)', { timeout: 15000 })
await p.waitForTimeout(700)

const layer = p.locator('.stage .freelayer').first()
const cpt = () => p.locator('.stage .cpt').count()
const connBtn = p.locator('.ax-tb [title="화살표 연결"], [title="화살표 연결"]')

// ── 표 위에 마우스를 올려 본다 ──
{
  const t = await p.locator('.stage .fel.table').first().boundingBox()
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await p.waitForTimeout(350)
  ok('표에는 연결점이 안 나온다', await cpt() === 0, `${await cpt()}개`)
}

// ── 도형을 하나 놓고 그 위에 올려 본다 ──
// **이게 이 스위트의 핵심 검사다.** 표만 보면 「표라서 안 나오는 것」과
// 「표준 양식이라 안 나오는 것」을 못 가른다. 도형은 둘을 가른다 —
// 자유 이북에서는 나오고 표준 양식에서는 안 나와야 한다.
{
  const lb = await layer.boundingBox()
  await p.locator('.shp-btn').first().click()          // 도형 갤러리 열기
  await p.waitForTimeout(250)
  const cellBtn = p.locator('.shp-cell').first()
  ok('(사전) 도형 갤러리를 열었다', await cellBtn.count() >= 1,
     `${await p.locator('.shp-cell').count()}개`)
  await cellBtn.click()
  await p.waitForTimeout(250)
  await p.mouse.click(lb.x + 120, lb.y + lb.height - 70)
  await p.waitForTimeout(400)

  const shape = p.locator('.stage .fel').filter({ hasNot: p.locator('table') }).last()
  const made = await p.locator('.stage .fel:not(.table):not(.text)').count()
  ok('(사전) 도형이 하나 놓였다', made >= 1, `${made}개`)

  const bb = await p.locator('.stage .fel:not(.table):not(.text)').first().boundingBox()
  // **선택을 먼저 푼다.** 방금 놓은 도형은 골라진 상태이고, 연결점은 골라진 요소에는
  // 안 뜬다(골라져 있으면 크기 손잡이가 그 자리를 쓴다). 안 풀면 자유 이북에서도
  // 0개가 나와서 「기능이 죽었다」로 잘못 읽힌다.
  await p.mouse.click(lb.x + lb.width - 30, lb.y + lb.height - 15)
  await p.waitForTimeout(250)
  ok('(사전) 선택이 풀렸다', await p.locator('.stage .fel.sel').count() === 0,
     `${await p.locator('.stage .fel.sel').count()}개 골라져 있음`)
  await p.mouse.move(lb.x + lb.width - 30, lb.y + 15)       // 일단 떨어뜨렸다가
  await p.waitForTimeout(250)
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await p.waitForTimeout(400)
  void shape
  if (FREE) {
    ok('자유 이북에서는 도형에 연결점이 나온다 (기능이 살아 있다)',
       await cpt() === 4, `${await cpt()}개`)
  } else {
    ok('표준 양식에서는 도형에도 연결점이 안 나온다',
       await cpt() === 0, `${await cpt()}개`)
  }
}

// ── 요소 도구막대에는 연결 단추가 없다 (모든 문서에서) ──
// 여기에도 「→ 연결(화살표)」가 있었다. 잇는 길이 셋이었던 셈이고, 표준 양식에서
// 앞의 둘만 감춰 놓으니 이것만 열린 채 남았다. 조건을 하나 더 다는 대신 단추를 없앴다.
{
  const el = p.locator('.stage .fel:not(.table)').first()
  await el.click()
  await p.waitForTimeout(350)
  ok('(사전) 요소 도구막대가 떴다', await p.locator('.stage .ctxbar').count() === 1)
  ok('도구막대에 연결 단추가 없다',
     await p.locator('.stage [title="연결(화살표)"]').count() === 0,
     (await p.locator('.stage .ctxbar button').allTextContents()).join(' '))
}

// ── 도구모음의 연결 버튼 ──
if (FREE) {
  ok('자유 이북에는 「→ 화살표 연결」 도구가 있다', await connBtn.count() >= 1)
} else {
  ok('표준 양식에는 「→ 화살표 연결」 도구가 없다', await connBtn.count() === 0,
     `${await connBtn.count()}개`)
}

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))

await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 연결점 자리 통과 ===')
process.exit(fail ? 1 : 0)
