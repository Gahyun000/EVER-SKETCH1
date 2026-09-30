// **팀 관리 — 마스터·디테일** (2026-09-21 · 시안 docs/화면시안_팀관리_마스터디테일_v1.0.html)
//
// 왼쪽은 팀 목록(맨 위에 늘 열린 새 팀 입력칸), 오른쪽은 고른 팀의 팀원 표.
// 예전 한 표 화면의 두 불편 — 구석의 「＋ 새 팀」, 팀 줄 인원이 권한 칸에 걸쳐 열이 어긋남 —
// 이 사라졌는지와, 만들기 · 넣기 · 이름 변경 · 옮기기 · 삭제가 실제로 도는지를 본다.
//
// 실행: ADMIN=1 TEAMS=1 node e2e/es_mock.mjs & node e2e/team_admin_smoke.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://127.0.0.1:8899/'
const EXEC = process.env.PW_CHROME || undefined

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''))
  if (!cond) fail++
}

const b = await chromium.launch({ executablePath: EXEC })
const p = await b.newPage({ viewport: { width: 1500, height: 900 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message)))
await p.request.get(new globalThis.URL('/__teams/reset', URL).href)
await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('.sh-nav', { hasText: '팀 관리' }).click()
await p.waitForSelector('.tm-side .tm-item', { timeout: 15000 })
await p.waitForTimeout(300)

const side = async () => (await p.locator('.tm-side .tm-item').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
const item = (name) => p.locator('.tm-side .tm-item', { has: p.locator('.ap-item-name', { hasText: new RegExp(`^${name}$`) }) })
const title = async () => (await p.locator('.tm-detail .tm-d-name, .tm-detail .tm-rename').first().innerText()).trim()
const names = async () => p.locator('.tm-detail .tm-table tbody .tm-who').allInnerTexts()

// ── 뼈대 ──
const sb = await p.locator('.tm-side').boundingBox(), db = await p.locator('.tm-detail').boundingBox()
ok('왼쪽 팀 목록 · 오른쪽 팀원 표로 나뉜다', sb && db && sb.x + sb.width <= db.x + 1, `side ${Math.round(sb.x)}–${Math.round(sb.x + sb.width)} / detail ${Math.round(db.x)}`)
ok('사이에 끌어 맞추는 손잡이가 있다(결재함·팀 공유와 같은 것)', (await p.locator('.md-grip').count()) === 1)
ok('구석의 흰 「＋ 새 팀」 단추는 없다', (await p.locator('.adm-left').count()) === 0)
const ab = await p.locator('.tm-add').boundingBox(), fb = await p.locator('.tm-side .tm-item').first().boundingBox()
ok('새 팀 입력칸이 목록 맨 위에 늘 열려 있다', ab && fb && ab.y < fb.y && await p.locator('.tm-add input').isVisible())
ok('목록 — 전체 · 팀(가나다) · 팀 미배정', JSON.stringify(await side()) === JSON.stringify(['전체 3', '11 0', 'SI개발팀 2', '팀 미배정 1']), JSON.stringify(await side()))
ok('미배정이 있으면 주황 배지로 알린다', (await item('팀 미배정').locator('.tm-n.warn').count()) === 1)
ok('처음엔 「전체」 — 미배정이 맨 위 줄', (await title()) === '전체' && (await names())[0] === '이순신', (await names()).join(','))
ok('표에는 사람 줄만 — 팀 줄이 섞이지 않는다(열 어긋남의 원인)', (await p.locator('.tm-table .tm-grp').count()) === 0)
ok('개수 줄은 표 위', (await p.locator('.tm-detail .adm-pager').boundingBox()).y < (await p.locator('.tm-detail .tm-table').boundingBox()).y)

// ── 새 팀 ──
await p.fill('.tm-add input', 'SI개발팀')
ok('같은 이름이면 막고 까닭을 말한다', (await p.locator('.tm-mkerr').innerText()).includes('이미 있는 팀 이름') && await p.locator('.tm-add .es-mini').isDisabled())
await p.fill('.tm-add input', '영업1팀')
await p.press('.tm-add input', 'Enter')
await p.waitForTimeout(400)
ok('Enter 로 만들면 목록에 생기고 **곧바로 골라진다**', (await item('영업1팀').getAttribute('class')).includes(' on') && (await title()) === '영업1팀')
ok('입력칸은 비고 그대로 열려 있다', (await p.inputValue('.tm-add input')) === '')
ok('빈 팀은 「＋ 팀원 넣기」로 채우라고 안내한다', (await p.locator('.tm-empty-team').innerText()).includes('팀원 넣기'))
ok('팀원이 없으면 팀 삭제가 된다', await p.locator('.tm-d-act .es-mini.danger').isEnabled())

// ── 팀원 넣기 ──
await p.selectOption('.tm-addm', 'u_lee')
await p.waitForTimeout(400)
ok('「＋ 팀원 넣기」로 넣으면 표에 생긴다', JSON.stringify(await names()) === JSON.stringify(['이순신']))
ok('왼쪽 인원이 바로 바뀐다 · 미배정 0 이면 주황이 꺼진다', (await side()).includes('영업1팀 1') && (await side()).includes('팀 미배정 0') && (await item('팀 미배정').locator('.tm-n.warn').count()) === 0, JSON.stringify(await side()))
ok('팀원이 있으면 팀 삭제는 막힌다', await p.locator('.tm-d-act .es-mini.danger').isDisabled())

// ── 이름 변경 ──
await p.locator('.tm-d-act .es-mini', { hasText: '이름 변경' }).click()
await p.fill('.tm-rename', '영업팀')
await p.press('.tm-rename', 'Enter')
await p.waitForTimeout(400)
ok('이름 변경 — 머리와 목록이 함께 바뀐다', (await title()) === '영업팀' && (await side()).includes('영업팀 1'), JSON.stringify(await side()))

// ── 옮기기 (표 줄의 두 칸) ──
await item('SI개발팀').click()
await p.waitForTimeout(250)
const row = p.locator('.tm-table tbody tr', { hasText: '홍길동' })
await row.locator('select').selectOption({ label: '영업팀' })
ok('버튼 글자가 고른 것을 따라간다(옮기기)', (await row.locator('.tm-b .es-mini').innerText()).trim() === '옮기기')
await row.locator('.tm-b .es-mini').click()
await p.waitForTimeout(400)
ok('옮기면 이 팀에서 빠지고 인원이 바뀐다', (await side()).includes('SI개발팀 1') && (await side()).includes('영업팀 2'), JSON.stringify(await side()))
ok('무엇을 했는지 글로 남긴다', (await p.locator('.md-top .es-msg').innerText()).includes('옮겼습니다'))

// ── 빈 팀 삭제 ──
await item('11').click()
await p.waitForTimeout(250)
await p.locator('.tm-d-act .es-mini.danger').click()
await p.locator('.es-confirm .es-mini.danger', { hasText: '지우기' }).click()
await p.waitForTimeout(400)
ok('빈 팀은 확인을 거쳐 지워지고 「전체」로 돌아간다', !(await side()).some((s) => s.startsWith('11 ')) && (await title()) === '전체', JSON.stringify(await side()))

// ── 검색 ──
await p.fill('.tm-detail .adm-qbox input', '곽')
await p.press('.tm-detail .adm-qbox input', 'Enter')
await p.waitForTimeout(200)
ok('「조회」 — 이름으로 걸린다', JSON.stringify(await names()) === JSON.stringify(['곽두섭']))
ok('걸린 글자를 칠한다', (await p.locator('.tm-table .tm-mark').count()) >= 1)
await p.fill('.tm-detail .adm-qbox input', '영업팀')
await p.press('.tm-detail .adm-qbox input', 'Enter')
await p.waitForTimeout(200)
ok('「전체」에서는 팀 이름으로도 걸린다(그 팀 전원)', (await names()).length === 2, (await names()).join(','))
await p.locator('.tm-detail .adm-sbtn', { hasText: '초기화' }).click()
ok('초기화하면 다 보인다', (await names()).length === 3)

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))
await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 팀 관리 통과 ===')
process.exit(fail ? 1 : 0)
