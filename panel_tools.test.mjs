// 시안 3종 착수 — B 잔여 셋 · C-1 · C-2 를 못박는다.
//
// **왜 이 검사가 필요한가.** 여기서 하는 일은 대부분 「자리를 옮기고 붙이는」 것이라
// 타입이 안 잡아 준다. 버튼 하나가 조용히 사라져도 `tsc` 는 초록이다.
//
// 그리고 착수계획이 위험 하나를 미리 적어 뒀다:
//   「C-3 재편이 도구를 잃는다 — 재배치 전에 **지금 있는 도구를 전부 세는 검사**를 먼저 만든다」
// C-3 은 아직 정해지지 않았지만, **세는 일은 지금 해 둔다.**
// 옮기고 나서 세면 무엇이 있었는지 이미 모른다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs panel_tools.test.mjs

import { readFileSync } from 'node:fs'
import { openSections } from './src/persistence/prefs.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
// 주석을 걷어 낸 소스 — 안 그러면 주석에 적힌 글자가 검사를 거짓으로 통과시킨다.
const bare = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const readBare = (p) => bare(read(p))

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const card = readBare('./src/builder/chrome/ApprovalCard.tsx')
const tb = readBare('./src/builder/chrome/EditToolbar.tsx')
const rp = readBare('./src/builder/chrome/RightPanel.tsx')

// ── B-1. 반려 사유를 그 자리에서 읽는다 ─────────────
//
// `/status-map` 은 사유를 안 준다 — `decision_message` 는 결재 상세에만 있다.
// 서버를 안 고치는 대신 **반려일 때만** 상세를 한 번 더 부른다(사용자 결정 ㄱ).
{
  check(/apiGetApproval\(/.test(card), 'B-1 · 상세를 부른다 (사유가 거기에만 있다)')
  check(/detail\?\.decision_message/.test(card), 'B-1 · 사유를 카드에 그린다')
  check(/'반려됐습니다\. 고쳐서 다시 낼 수 있습니다\.'/.test(card),
    'B-1 · 사유가 없으면 일반 문구로 — 빈 따옴표를 그리지 않는다')

  // **여기가 이 검사에서 제일 중요한 줄이다.**
  // 상세에는 `snapshot`(문서 한 벌)이 딸려 온다. 사유 한 줄 때문에 늘 끌고 다니면
  // 반려된 자료를 열 때마다 문서가 두 벌씩 내려온다. 그래서 **펼쳤을 때만** 부른다.
  check(/if \(open && chip\?\.state === 'rejected'/.test(card),
    'B-1 · **펼쳤을 때만** 부른다 — 상세에는 문서 한 벌이 딸려 온다')
}

// ── B-2. 낸 것 보기 · 승인본 보기 ──────────────────
{
  check(/snapBtn\('낸 것 보기'\)/.test(card), 'B-2 · 대기 중에는 「낸 것 보기」')
  check(/snapBtn\('승인본 보기'\)/.test(card), 'B-2 · 승인 뒤에는 「승인본 보기」')
  check(/<SlideViewer snap=\{detail\.snapshot\}/.test(card),
    'B-2 · 결재함과 **같은 뷰어**로 그린다 — 두 벌로 갈리면 한쪽만 고쳐진다')
  // 수정 요청에는 얼린 문서가 없다(문서가 아니라 허락 요청이라 얼릴 것이 없다).
  // 빈 뷰어를 띄우면 「고장 났다」로 읽힌다.
  check(/chip\.kind === 'revision'\) return null/.test(card),
    'B-2 · 수정 요청에는 버튼을 아예 안 그린다 — 얼린 문서가 없다')
  check(/낸 문서를 찾을 수 없습니다/.test(card), 'B-2 · 그래도 없으면 말로 알린다')
}

// ── B-3. 수정 그만두기 ────────────────────────────
{
  check(/apiEndRevision\(/.test(card), 'B-3 · 그만두기를 실제로 부른다')
  check(/수정 그만두기/.test(card), 'B-3 · 버튼이 있다')
  check(/apiEndRevision\(chip\?\.approval_id/.test(card),
    'B-3 · **자료가 아니라 그 요청**에 하는 일이라 결재 건 id 로 부른다')
  check(/고친 내용은 지워지지 않습니다/.test(card),
    'B-3 · 확인창이 **무엇이 안 지워지는지**를 말한다')
  check(/ask !== 'end' &&/.test(card), 'B-3 · 그만두기에는 전달할 말 칸이 없다 — 아무에게도 안 간다')
}

// ── C-1. 툴바 둘째 줄이 고른 것을 따라간다 ───────────
{
  check(/ctx === 'text' \? <TextTools \/> : ctx === 'conn' \? <ConnTools \/> : <TableTools \/>/.test(tb),
    'C-1 · 고른 것에 따라 갈린다 (표 · 글자 · 연결선)')
  check(/function TextTools\(/.test(tb) && /function ConnTools\(/.test(tb),
    'C-1 · 글자 도구와 연결선 도구가 실제로 있다')

  // **첫째 줄은 안 건드린다.** 시안 그림은 한 줄이지만, 이 코드가 두 줄로 나눈 데에는
  // 이유가 있다 — 줄이 생겼다 없어지면 툴바 높이가 변하고 그만큼 문서가 움직인다.
  // 칸을 끌던 사람이 한 줄 아래를 고르게 된다. 그래서 자리는 고정, 내용만 바뀐다.
  check(/<div className="ax-tbrow ctx">/.test(tb),
    'C-1 · 자리는 고정 — 둘째 줄이 사라지지 않는다(높이가 변하면 문서가 움직인다)')
  check(/ctx: 'table' \| 'text' \| 'conn' = el && el\.type === 'table' \? 'table'/.test(tb),
    'C-1 · **표가 먼저다** — 표의 병합은 툴바에만 있다')
}

// ── C-2. 접고 편 상태를 기억한다 ────────────────────
{
  check(/openSections\(SECS,/.test(rp), 'C-2 · 펴 둔 묶음을 읽어서 시작한다')
  check(/rememberOpenSections\(next\)/.test(rp), 'C-2 · 접거나 펼 때 기억한다')

  // **여기가 C-2 의 진짜 자물쇠다.** 기억해 놓고도 선택이 바뀔 때 넷을 다 닫아 버리면
  // 기억은 한 번도 화면에 못 나온다 — 실제로 그랬다(2026-09-08, 진짜 서버에서 잡았다).
  check(/setOpenSec\(\(o\) => \(o\[k\] \? o : \{ \.\.\.o, \[k\]: true \}\)\)/.test(rp),
    'C-2 · 선택이 바뀌어도 **나머지는 안 건드린다** — 그 묶음만 펴 준다')
  check(!/setOpenSec\(\{ table: false, style: false/.test(rp),
    'C-2 · 넷을 다 닫는 옛 방식이 남아 있지 않다')

  // 순수 함수라 여기서 바로 시험한다.
  const KNOWN = ['table', 'style', 'text', 'arrange']
  const FB = { table: true, style: false, text: false, arrange: false }
  let threw = null
  let got = null
  try { got = openSections(KNOWN, FB) } catch (e) { threw = e }
  check(threw === null, 'C-2 · 저장이 막힌 데서도 안 터진다(node 에는 localStorage 가 없다)',
    threw ? threw.message : '')
  check(got && got.table === true && got.arrange === false,
    'C-2 · 못 읽으면 기본값 그대로', JSON.stringify(got))
  check(got !== FB, 'C-2 · 기본값 객체를 그대로 돌려주지 않는다 — 돌려주면 부르는 쪽이 그걸 고친다')
}

// ── 옮기기 전에 세어 둔다 (C-3 대비) ─────────────────
//
// 착수계획의 위험 넷째: 「C-3 재편이 도구를 잃는다」.
// C-3 은 아직 정해지지 않았다. 그래도 **지금 있는 것을 세는 일은 지금 한다** —
// 옮기고 나서 세면 무엇이 있었는지 이미 모른다.
//
// 이 숫자가 줄면 검사가 실패한다. **늘어나는 것은 막지 않는다**(도구를 더한 것뿐이니).
// 재편할 때는 이 숫자를 옮긴 뒤에도 맞춰 놓고, 그때 이 줄을 갱신한다.
{
  const labels = [...rp.matchAll(/'insp-acc'[\s\S]{0,260}?className="t">([^<]+)</g)]
    .map((m) => m[1].trim())
  const pills = (rp.match(/insp-pill/g) || []).length
  // 숫자 칸은 두 길로 그려진다 — `numRow(...)` 도우미와 `<NumInput>` 직접 쓰기.
  // 둘을 합쳐 센다. 한쪽만 세면 재편이 다른 쪽으로 옮기면서 「안 줄었다」로 보인다.
  const nums = (rp.match(/numRow\(/g) || []).length + (rp.match(/<NumInput/g) || []).length

  check(labels.length >= 4, 'C-3 대비 · 접이식 묶음 수를 센다', labels.length + '개: ' + labels.join(' · '))
  check(pills >= 26, 'C-3 대비 · 패널 버튼 수를 센다 (줄면 도구를 잃은 것이다)', pills + '개')
  check(nums >= 8, 'C-3 대비 · 숫자 입력 칸 수를 센다', nums + '개')
  console.log(`   ↳ 지금 값: 묶음 ${labels.length} · 버튼 ${pills} · 숫자칸 ${nums}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
