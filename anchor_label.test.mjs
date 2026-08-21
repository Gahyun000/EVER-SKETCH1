// 짚은 자리를 사람 말로 — **실제로 배부되는 표**로 검사한다.
//
// 이 검사가 손으로 만든 표를 쓰지 않는 이유:
// 앞서 한 번 크게 헛디뎠다. 정본 양식만 보고 만들었더니, 정작 실물 PPT 를
// 변환한 표에서는 `headRow: false` 라 머리글이 0행이 되고 **이 기능이 조용히
// 아무 일도 하지 않았다**(번호로만 나와서, 고치기 전과 똑같아 보였다).
// 그래서 여기서는 두 가지를 나란히 검사한다 —
//   1) 관리자가 배부하는 정본 양식 (SLOT-A)
//   2) 임원이 올린 실물 PPT 를 변환한 표 (e2e/fixture_real_slide3.json)
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs anchor_label.test.mjs

import { readFileSync } from 'node:fs'
import { tableAnchorLabel } from './src/comments/anchorLabel.ts'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  if (got === want) { pass++; console.log(`✓ ${label} — ${got}`) }
  else { fail++; console.log(`✗ ${label}\n    받은 값: ${got}\n    기대값: ${want}`) }
}

const load = (path) => {
  const d = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'))
  const pages = d.pages || d
  return pages[0].els.filter((e) => e.type === 'table')
}

// ── 1) 실물 PPT 변환본 ──────────────────────────────
// 18열 로드맵: 0=구분 1=프로젝트 2~13=월 14=2027년 15=계획 M/M 16=투입 M/M 17=비고
const real = load('./e2e/fixture_real_slide3.json').find((t) => t.cols === 18)
console.log('\n── 실물 PPT 변환본 (headRow:false, slot 없음) ──')
eq(tableAnchorLabel(real, '2_4'), 'AI Agent · 03월', '칸 하나')
eq(tableAnchorLabel(real, '2_4:2_6'), 'AI Agent · 03월~05월', '한 줄 안의 구간')
eq(tableAnchorLabel(real, '2_15'), 'AI Agent · 계획 M/M', '월이 아닌 열')
eq(tableAnchorLabel(real, '2_4:3_6'), 'AI Agent~지능형 실행 가이드보드 · 03월~05월', '여러 줄 × 여러 열')
eq(tableAnchorLabel(real, '4_2'), '에이전트 · 1월', '병합된 설명 칸도 행 이름을 찾는다')

// ── 2) 정본 양식 (SLOT-A) ────────────────────────────
// 월 머리글이 그냥 「3」이다. 위 칸의 「2026년」을 보고 월을 붙인다.
const tpl = load('./e2e/fixture_template_state.json').find((t) => t.slot === 'SLOT-A')
console.log('\n── 정본 양식 (SLOT-A) ──')
eq(tableAnchorLabel(tpl, '0_4'), '3월', '머리글만 짚으면 열 이름만')
eq(tableAnchorLabel(tpl, '0_4:0_6'), '3월~5월', '머리글 구간')
eq(tableAnchorLabel(tpl, '2_4:2_6'), '3행 · 3월~5월', '아직 비어 있는 행 — 어느 줄인지는 번호로')
eq(tableAnchorLabel(tpl, '2_1'), '3행 · Project', '이름표 열은 머리글 이름으로 (병합을 따라간다)')

// ── 3) 되돌아갈 곳 ───────────────────────────────────
console.log('\n── 이름을 못 찾으면 번호로 ──')
const bare = { type: 'table', rows: 3, cols: 3, headRow: false, cells: [[], [], []] }
eq(tableAnchorLabel(bare, '1_1'), '2행 2열', '머리글도 이름표도 없는 표')
eq(tableAnchorLabel(bare, '1_1:2_2'), '2~3행 2~3열', '그 경우의 범위')
eq(tableAnchorLabel(undefined, '1_1'), '2행 2열', '표를 못 찾았을 때')
eq(tableAnchorLabel(real, null), '', '앵커가 없으면 빈 문자열')

console.log(`\n${fail ? '=== FAIL' : '=== ALL PASS'} (통과 ${pass} / 실패 ${fail}) ===`)
process.exit(fail ? 1 : 0)
