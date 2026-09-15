// 고른 자료 상세 칸 — 있고 없고, 무엇이 들어가고, 어디로 가는가.
//
// 2026-09-15 · 사용자 결정 ②③④.
//   ② 안 골랐으면 **칸이 아예 없다**(노션식). 늘 붙어 있는 칸으로 두면 들어올 때마다
//      빈 칸을 한 번 보고, 넓게 훑고 싶을 때 되찾을 방법이 없다.
//   ③ 속성 · 이력 최근 3줄 · 의견은 숫자 한 줄 · 단추. **첫 장 미리보기는 뺐다.**
//   ④ 미리보기가 없으니 편집기로 가는 길은 「열기」 단추다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs lib_detail.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const lib = read('./src/persistence/LibraryScreen.tsx')
const css = read('./src/index.css')
const api = read('./src/approvals/approvalApi.ts')

// ── ② 안 골랐으면 없다 ──────────────────────────────
check(/\{sel && \(\s*\n\s*<aside className="lib-detail"/.test(lib),
  '고른 것이 있을 때만 칸을 그린다 — 빈 칸을 보여 주지 않는다')
check(/\.lib-wrap\{flex:1;min-height:0;display:flex\}/.test(css)
   && /\.lib-wrap>\.lib-screen\{flex:1;min-width:0\}/.test(css),
  '칸이 생기면 목록이 그만큼 좁아지고, 닫으면 폭을 되찾는다')
check(/onClick=\{\(\) => setSel\(null\)\}/.test(lib), '닫는 길이 있다')
check(!/\.lib-detail\{[^}]*position:\s*absolute/.test(css),
  '덮지 않고 **민다** — 덮으면 목록의 그 줄이 가려진다')

// ── 한 번 누르면 고른다(②④) ─────────────────────────
check(/onClick=\{\(\) => setSel\(p\)\}/.test(lib), '목록 줄을 한 번 누르면 고른다')
check(!/onClick=\{\(\) => void openProject\(p\.id\)\}/.test(lib),
  '목록 줄이 바로 편집기로 가지 않는다 — 한 번 누르기는 이제 상세를 연다')
check((lib.match(/void openProject\(sel\.id\)/g) || []).length === 1,
  '편집기로 가는 길은 **상세의 「열기」 하나**다 (④)')
check(/className={sel\?\.id === p\.id \? 'on' : undefined}/.test(lib)
   && /\(sel\?\.id === p\.id \? ' on' : ''\)/.test(lib),
  '표에서도 줄 목록에서도 고른 줄이 표시된다')
check(/\.lib-tbl tbody tr\.on td\{background:#EAF1FE\}/.test(css), '그 표시에 색이 있다')

// ── ③ 무엇이 들어가나 ───────────────────────────────
check(!/미리보기/.test(lib.slice(lib.indexOf('lib-detail'))),
  '첫 장 미리보기가 없다 — 빼기로 했다')
check(/<div className="lib-d-h">속성<\/div>/.test(lib), '속성 줄이 있다')
check(/histEvents\.slice\(0, 3\)/.test(lib),
  '이력은 **최근 3줄**만 — 회차가 쌓이면 이력만으로 칸이 찬다')
// 한 회차에 제출과 결정이 **둘 다** 들어 있다. 줄 단위로 그리면 제출이 사라지고
// 결정만 남아서, 누가 냈는지가 안 보인다.
check(/selRows\.flatMap/.test(lib) && /t: a2\.created_at/.test(lib) && /t: a2\.decided_at/.test(lib),
  '이력을 **일어난 일 단위**로 편다 — 제출과 결정이 각각 한 줄이다')
check(/\.sort\(\(x, y\) => y\.t - x\.t\)/.test(lib), '최근 것이 위로 온다')
check(/kind === 'revision'/.test(lib) && /'허락'/.test(lib) && /'거절'/.test(lib),
  '수정 요청은 「제출·승인」이 아니라 「수정 요청·허락」이다 — 결재함과 같은 말을 쓴다')
check(/histEvents\.length > 3/.test(lib) && /그 앞으로 \{histEvents\.length - 3\}건/.test(lib),
  '잘린 것이 있으면 **몇 건인지** 말한다 — 조용히 자르면 이력이 셋뿐인 줄 안다')

// 폴더 칸은 **그 자료가 든 폴더**다. 검색은 하위까지 훑으므로(D27) 지금 서 있는
// 자리와 다를 수 있다.
check(/folderPathOf\(sel\.folder_id\)/.test(lib), '폴더 칸은 그 자료가 든 폴더를 말한다')
check(!/<dt>폴더<\/dt><dd>\{scopeLabel\(path\)\}/.test(lib),
  '검색 범위 문구(「…에서」)를 폴더 이름 자리에 쓰지 않는다')
check(/names\.unshift\(f\.name\)/.test(lib) && /names\.join\(' › '\)/.test(lib),
  '위 폴더까지 이어 붙인다 — 「2026」만으로는 어느 2026 인지 모른다')
check(/const seen = new Set<string>\(\)/.test(lib.slice(lib.indexOf('folderPathOf'))),
  '부모 링크가 깨져 고리가 되어도 멈춘다')
check(/lib-d-cmt/.test(lib) && /의견 \{selRows\.reduce/.test(lib),
  '의견은 **숫자 한 줄**이다')
check(!/textarea/.test(lib.slice(lib.indexOf('lib-detail'))),
  '의견 입력칸이 없다 — 같은 대화가 두 곳에 생기면 규칙도 두 벌이 된다')
check((lib.match(/go\('inbox'\)/g) || []).length >= 1,
  '결재함으로 가는 길이 있다 — 대화는 거기서 한다')

// ── 잠긴 자료 ───────────────────────────────────────
check(/disabled=\{!!selChip\?\.locked\}/.test(lib), '잠겨 있으면 「열기」가 꺼진다')
check(/lib-d-lock/.test(lib) && /고치려면 「수정 요청」을 내세요/.test(lib),
  '**왜** 잠겼는지 그 자리에서 말한다 — 눌러 보고 알게 두면 고장으로 읽힌다')

// ── 받아 오는 방식 ──────────────────────────────────
check(/apiListApprovals\('', sel\.id\)/.test(lib),
  '고른 자료의 이력만 받아 온다')
check(/projectId\?: string/.test(api) && /qs\.set\('project_id', projectId\)/.test(api),
  '그 길이 API 에 있다 — 서버는 처음부터 받던 값이다')
check(/if \(!sel\) \{ setSelRows\(\[\]\); return \}/.test(lib),
  '닫으면 앞 자료의 이력이 안 남는다')
check(/catch\(\(\) => \{ if \(live\) setSelRows\(\[\]\) \}\)/.test(lib),
  '못 받아 와도 조용히 지나간다 — 이력은 부가 정보다')

// **목록이 바뀌면 고른 것도 따라간다.** 지운 자료의 상세가 남으면 「열기」가 404 를 받는다.
check(/const now = list\.find\(\(p\) => p\.id === sel\.id\)/.test(lib)
   && /if \(!now\) setSel\(null\)/.test(lib),
  '지워진 자료의 상세는 저절로 닫힌다')
check(/else if \(now !== sel\) setSel\(now\)/.test(lib),
  '이름을 바꾸면 상세의 제목도 따라 바뀐다')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
