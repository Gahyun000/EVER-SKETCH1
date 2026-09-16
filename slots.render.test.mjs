// 슬롯 렌더 헬퍼 테스트 — 노드 단독 실행.
//
// **원본 TS 모듈을 그대로 불러** 검증한다(node 의 타입 스트리핑).
// 예전에는 같은 규칙을 이 파일에 다시 구현해 두었는데, 그러면 원본만 틀렸을 때
// 테스트가 통과해 버린다 — 정확히 이 파일이 잡아야 할 상황을 놓친다.
//
// 특히 **대비(contrast)** 는 눈으로 보기 전까지 틀린 줄 모르는 종류다.
//
// 실행: node --experimental-strip-types slots.render.test.mjs

import { readFileSync } from 'node:fs'

import {
  CBG_LABEL, HEADER_BG, SLOT_POLICY, STAGE_COLORS,
  cbgPalette, cellBackground, cellEditable, cellTextColor, headerEditable, isSlotEl,
  lockedRowCount, slotAllows,
} from './src/template/slots.ts'

const SRC = readFileSync(new URL('./src/template/slots.ts', import.meta.url), 'utf-8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

const INK = '#1c2433'
function relLuminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function contrast(a, b) {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── 1) 글자 대비 ──
check(cellTextColor(undefined) === undefined, '색이 없으면 글자색도 건드리지 않는다')
check(cellTextColor('red') === undefined, '알 수 없는 형식은 무시')
check(cellTextColor('#000000') === '#ffffff', '검정 위에는 흰 글씨')

// 팔레트 전체 + 머리글 색이 대비를 만족하는지 — 색을 추가/교체할 때 여기서 걸린다.
for (const hex of [...STAGE_COLORS, HEADER_BG]) {
  const fg = cellTextColor(hex) || INK
  const ratio = contrast(hex, fg)
  check(ratio >= 4.5, `${hex} (${CBG_LABEL[hex] || '머리글'}): 대비 ${ratio.toFixed(1)}:1 (WCAG AA 4.5 이상)`)
}

// ── 2) 팔레트 ──
check(STAGE_COLORS.length === 5, '진행 구간 색은 실물과 같은 5종')
check(STAGE_COLORS.every((c) => CBG_LABEL[c]), '모든 팔레트 색에 이름이 있다(색 고르는 칩의 툴팁)')
check(JSON.stringify(cbgPalette('SLOT-A')) === JSON.stringify([...STAGE_COLORS]),
      '로드맵 팔레트 = 실물 5색')
check(cbgPalette('SLOT-B') === undefined, '목록 표에는 팔레트가 없다')

// ── 3) 셀 배경 ──
check(cellBackground('#FFFF00') === '#FFFF00', '실물 색을 그대로 그린다')
check(cellBackground(undefined) === undefined, '색이 없으면 배경도 없다')
check(!SRC.includes('repeating-linear-gradient'),
      '해칭 대체 렌더가 남아 있지 않다 — 실물과 다르게 그리면 자기 자료를 못 알아본다')

// ── 4) 편집 가능 판정 ──
check(cellEditable(undefined, 0, 0) === true, '슬롯 없는 일반 표는 제약 없음')
// 2026-09-07: 머리글 **글자**를 열었다(headerEdit). 예전에는 lockedRows 하나가
// 「머리글이 몇 행인가」와 「고칠 수 있는가」를 겸해서, 「진행 현황」이나 「사업그룹」을
// 자기 부서 말로 바꿀 방법이 없었다.
// 열어도 취합은 안 깨진다 — 취합이 표를 잇는 근거는 **열 번호**지 열 이름이 아니다.
// 열 **수**는 여전히 못 바꾸고(server/template_guard.py), 머리글 **행 자체를 지우는 것**도
// 계속 막는다(RightPanel 의 headRowSelected).
check(cellEditable('SLOT-A', 0, 5) === true, '로드맵 연도 행(0)도 글자는 고칠 수 있다')
check(cellEditable('SLOT-A', 1, 5) === true, '로드맵 월 행(1)도 마찬가지')
check(cellEditable('SLOT-A', 2, 5) === true, '로드맵 데이터 행(2)은 편집 가능')
check(cellEditable('SLOT-A', 2, 0) === true, '로드맵 사업그룹 열은 편집 가능')
check(cellEditable('SLOT-B', 0, 1) === true, '진행현황 표 머리글 글자도 고칠 수 있다')
check(headerEditable('head') === false, '머리글 편집 여부는 표에만 해당한다(글상자는 headerEdit 없음)')
check(cellEditable('SLOT-B', 1, 0) === true, '진행현황 표 첫 열도 편집 가능(번호 열이 없다)')
check(cellEditable('SLOT-C', 1, 0) === true, '이슈 표 본문은 편집 가능')
check(cellEditable('head', 0, 0) === false, '머리말은 편집 불가')
check(cellEditable('foot', 0, 0) === false, '꼬리말은 편집 불가')
check(cellEditable('SLOT-Z', 0, 0) === true, '모르는 슬롯은 슬롯이 아니므로 제약 없음(일반 요소 취급)')

// ── 5) 편집 허용 ──
check(slotAllows('SLOT-A', 'cbg') === true, '로드맵만 셀 색 허용')
check(slotAllows('SLOT-A', 'merge') === true, '로드맵은 병합이 필수 — 진행 구간이 병합으로 그려진다')
// **2026-09-16 · ②③ 도 열었다.** 사용자가 「로드맵은 병합이 되는데 왜 여기는 안 되냐」고
// 물었고, 막아 둘 까닭이 없었다 — 병합은 열 수를 바꾸지 않고, 서버가 거부하는 것은 열 수다.
// 이 검사는 「막혀 있다」를 못 박던 것이라 깨졌다. **지우지 않고 뒤집어 쓴다.**
check(slotAllows('SLOT-B', 'cbg') === true, '목록 표도 셀 색이 된다')
check(slotAllows('SLOT-B', 'merge') === true, '목록 표도 병합이 된다')
check(slotAllows('SLOT-B', 'align') === true, '목록 표도 칸 정렬이 된다')
check(slotAllows('SLOT-C', 'merge') === true, '이슈 표도 병합이 된다')
check(slotAllows('SLOT-C', 'cbg') === true, '이슈 표도 셀 색이 된다')
// **열 다루기는 계속 막는다.** 여는 것과 안 여는 것을 가른 선이 여기다 —
// 열을 더하거나 지우면 취합이 표를 못 잇는다(서버도 그것만 거부한다).
check(slotAllows('SLOT-B', 'col') === false, '열을 더하고 지우는 것은 그대로 막는다')
check(slotAllows('SLOT-C', 'col') === false, '이슈 표도 열은 그대로 막는다')
check(slotAllows('SLOT-A', 'col') === false, '로드맵도 열은 원래 막혀 있다')
// 팔레트는 **여전히 없다**. 로드맵 색은 상태를 가리키는 약속이지만 ②③ 색은 그냥 색이다.
check(cbgPalette('SLOT-C') === undefined, '이슈 표에도 팔레트는 없다 — 색에 뜻을 심지 않는다')
for (const s of Object.keys(SLOT_POLICY)) {
  check(slotAllows(s, 'col') === false, `${s}: 열 편집 금지`)
}
check(slotAllows(undefined, 'col') === true, '슬롯 없는 표는 열 편집 가능')

// ── 6) 슬롯 구성 ──
check(isSlotEl('SLOT-A') && isSlotEl('SLOT-B') && isSlotEl('SLOT-C'), '표 슬롯 3종')
check(!isSlotEl('SLOT-D'), 'v2.0 에서 SLOT-D 는 없어졌다(진행현황·향후계획이 한 표로 합쳐짐)')
check(lockedRowCount('SLOT-A') === 2, '로드맵 머리글은 2행')
check(lockedRowCount('SLOT-B') === 1 && lockedRowCount('SLOT-C') === 1, '목록 표 머리글은 1행')

// ── 7) 소스 계약 ──
check(SRC.includes('onWhite > onInk'), '대비를 실제로 계산해 글자색을 고른다(임계값 방식 아님)')
check(SRC.includes('if (!p) return false'), 'slotAllows 가 모르는 슬롯을 거부한다')
{
  // 타입 정의(SlotOp)에는 'col' 이 있어도 된다 — 정책에 없어야 한다.
  const policyBlock = SRC.split('export const SLOT_POLICY')[1].split('export function')[0]
  check(!policyBlock.includes("'col'"), '정책 어디에도 열 편집이 없다')
}

console.log('')
console.log(fail === 0 ? `ALL PASS (${pass})` : `FAILED ${fail} / ${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
