// **사용자 관리 — 마스터·디테일** (2026-09-21 · 시안 docs/화면시안_사용자관리_마스터디테일_v1.0.html 안 ㄴ)
//
// 왼쪽은 상태 칩 · 검색 · 사람 목록, 오른쪽은 고른 한 사람(정보 · 권한 · 계정).
// 승인하면 다음 대기자가 저절로 골라지는지, 관리자 부여·중지·초기화가 확인을 거치는지,
// 새로 내려오는 세 시각(가입 신청 · 승인 · 마지막 로그인)이 보이는지를 본다.
//
// 실행: ADMIN=1 USERS=1 node e2e/es_mock.mjs & node e2e/users_admin_smoke.mjs
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
await p.request.get(new globalThis.URL('/__users/reset', URL).href)
await p.goto(URL, { waitUntil: 'networkidle' })
await p.locator('.sh-nav', { hasText: '사용자 관리' }).click()
await p.waitForSelector('.um-side .um-item', { timeout: 15000 })
await p.waitForTimeout(300)

const names = async () => (await p.locator('.um-side .um-item .ap-item-name').allInnerTexts()).map((s) => s.trim())
const chip = (label) => p.locator('.um-chip', { hasText: label })
const chips = async () => (await p.locator('.um-chip').allInnerTexts()).map((s) => s.replace(/\s+/g, ''))
const dname = async () => (await p.locator('.um-d-name').innerText()).trim()
const dl = async () => (await p.locator('.um-dl').innerText()).replace(/\s+/g, ' ')

// ── 뼈대 ──
const sb = await p.locator('.um-side').boundingBox(), db = await p.locator('.um-detail').boundingBox()
ok('왼쪽 사람 목록 · 오른쪽 한 사람', sb && db && sb.x + sb.width <= db.x + 1)
ok('경계선 손잡이가 있다', (await p.locator('.md-grip').count()) === 1)
ok('여섯 칸 표는 없다', (await p.locator('.es-table').count()) === 0)
ok('상태 칩 넷과 숫자', JSON.stringify(await chips()) === JSON.stringify(['승인대기2', '사용중3', '중지1', '전체6']), JSON.stringify(await chips()))
ok('대기자가 있으면 칩 숫자가 주황', (await p.locator('.um-chip.hot').count()) === 1)
ok('처음엔 승인 대기 — 첫 사람이 저절로 골라진다', JSON.stringify(await names()) === JSON.stringify(['이순신', '박영희']) && (await dname()) === '이순신')
ok('오른쪽 — 신청한 권한 · 가입 신청 시각이 보인다', /신청한 권한 Lv2 작성자/.test(await dl()) && /가입 신청 \d{4}\. \d\d\. \d\d\. \d\d:\d\d/.test(await dl()), await dl())
ok('대기자는 비밀번호 초기화를 못 누른다', await p.locator('.um-sec .es-mini', { hasText: '비밀번호 초기화' }).isDisabled())

// ── 승인 → 다음 대기자 ──
await p.locator('.um-sec .es-mini.primary', { hasText: '승인' }).click()
await p.waitForTimeout(400)
ok('승인하면 목록에서 빠지고 **다음 대기자가 골라진다**', JSON.stringify(await names()) === JSON.stringify(['박영희']) && (await dname()) === '박영희')
ok('무엇을 했는지 글로 남긴다', (await p.locator('.md-top .es-msg').innerText()).includes('이순신 님을 승인했습니다'))
ok('칩 숫자가 바뀐다', JSON.stringify(await chips()) === JSON.stringify(['승인대기1', '사용중4', '중지1', '전체6']), JSON.stringify(await chips()))

// ── 관리자 부여는 확인을 거친다 ──
await chip('사용 중').click(); await p.waitForTimeout(200)
await p.locator('.um-item', { hasText: '곽두섭' }).click(); await p.waitForTimeout(150)
ok('소속 팀이 보인다(팀 목록에서 찾아 붙임)', /소속 팀 SI개발팀/.test(await dl()), await dl())
ok('로그인한 적 없으면 「아직 없음」', /마지막 로그인 아직 없음/.test(await dl()))
await p.selectOption('.um-row select', 'admin')
await p.locator('.um-sec .es-mini.primary', { hasText: '변경' }).click()
ok('관리자 부여는 한 번 더 묻는다', (await p.locator('.es-confirm').innerText()).includes('관리자 권한 부여'))
await p.locator('.es-confirm .es-mini', { hasText: '관리자로 지정' }).click(); await p.waitForTimeout(400)
ok('확인하면 권한이 바뀐다', /현재 권한 Lv1 관리자/.test(await dl()), await dl())

// ── 중지 ──
await p.locator('.um-item', { hasText: '홍길동' }).click(); await p.waitForTimeout(150)
await p.locator('.um-sec .es-mini.danger', { hasText: '계정 중지' }).click()
ok('중지도 한 번 더 묻고, 잃는 것을 글로 적는다', (await p.locator('.es-confirm').innerText()).includes('다시 로그인할 수 없'))
await p.locator('.es-confirm .es-mini.danger', { hasText: '중지' }).click(); await p.waitForTimeout(400)
ok('중지하면 「사용 중」에서 빠진다', !(await names()).includes('홍길동'))
await chip('중지').click(); await p.waitForTimeout(200)
ok('「중지」 칩에 들어가 있다', (await names()).includes('홍길동'))
await p.locator('.um-item', { hasText: '홍길동' }).click(); await p.waitForTimeout(150)
await p.locator('.um-sec .es-mini', { hasText: '재사용' }).click(); await p.waitForTimeout(400)
ok('재사용으로 되돌린다', !(await names()).includes('홍길동'))

// ── 비밀번호 초기화 ──
await chip('전체').click(); await p.waitForTimeout(200)
await p.locator('.um-item', { hasText: '홍길동' }).click(); await p.waitForTimeout(150)
await p.locator('.um-sec .es-mini', { hasText: '비밀번호 초기화' }).click()
await p.locator('.es-confirm .es-mini.primary', { hasText: '초기화' }).click(); await p.waitForTimeout(400)
ok('임시 비밀번호를 한 번 보여 준다', (await p.locator('.es-confirm').innerText()).includes('Tmp-7Kq2-xW9p'))
await p.keyboard.press('Escape'); await p.waitForTimeout(200)
ok('그 창은 Esc 로 안 닫힌다', (await p.locator('.es-confirm').count()) === 1)
await p.locator('.es-confirm button', { hasText: '닫기' }).click(); await p.waitForTimeout(200)

// ── 본인 ──
await p.locator('.um-item', { hasText: '김가현' }).click(); await p.waitForTimeout(150)
ok('본인은 권한 변경 · 중지 · 초기화가 막힌다',
  await p.locator('.um-sec .es-mini.primary').isDisabled() && await p.locator('.um-sec .es-mini.danger').isDisabled()
  && await p.locator('.um-sec .es-mini', { hasText: '비밀번호 초기화' }).isDisabled())

// ── 이름 고치기 ──
await p.locator('.um-item', { hasText: '곽두섭' }).click(); await p.waitForTimeout(150)
await p.locator('.um-d-head .es-rename-b').click()
await p.fill('.um-d-head .es-rename', '곽두섭2'); await p.press('.um-d-head .es-rename', 'Enter'); await p.waitForTimeout(400)
ok('이름을 이름 옆 ✎ 로 고친다 — 목록도 함께', (await dname()) === '곽두섭2' && (await names()).includes('곽두섭2'))

// ── 검색 ──
await p.fill('.um-side .adm-qbox input', 'PARK'); await p.press('.um-side .adm-qbox input', 'Enter'); await p.waitForTimeout(200)
ok('아이디로 걸린다(대소문자 무시) · 결과가 저절로 골라진다', JSON.stringify(await names()) === JSON.stringify(['박영희']) && (await dname()) === '박영희')
await p.fill('.um-side .adm-qbox input', '없는사람'); await p.press('.um-side .adm-qbox input', 'Enter'); await p.waitForTimeout(200)
ok('찾다가 없으면 그렇게 말한다', (await p.locator('.um-side .es-empty').innerText()).includes('찾는 사람이 없습니다'))
await p.locator('.um-side .adm-sbtn', { hasText: '초기화' }).click(); await p.waitForTimeout(200)
ok('초기화하면 다 보인다', (await names()).length === 6)

ok('페이지 오류가 없다', errs.length === 0, errs.join(' | '))
await b.close()
console.log(fail ? `\n=== ${fail}개 실패 ===` : '\n=== 사용자 관리 통과 ===')
process.exit(fail ? 1 : 0)
