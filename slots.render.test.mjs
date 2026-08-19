// 슬롯 렌더 헬퍼 테스트 — 노드 단독 실행.
//
// src/template/slots.ts 의 순수 함수를 소스에서 읽어 같은 규칙으로 검증한다.
// 특히 **대비(contrast)** 는 눈으로 확인하기 전까지 틀린 줄 모르는 종류다 —
// 진한 파랑 위에 검은 글씨를 쓰면 임원 화면에서 글자가 안 보인다.
//
// 실행: node slots.render.test.mjs

import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('./src/template/slots.ts', import.meta.url), 'utf-8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

// ── 원본과 동일 구현 ──
const CBG = { done: '#2462EB', plan: '#EAF1FE', risk: '#D98A2A', hold: '#EEF0F4' }

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
function cellTextColor(bg) {
  if (!bg || bg.length !== 7 || bg[0] !== '#') return undefined
  return contrast(bg, '#ffffff') > contrast(bg, INK) ? '#ffffff' : undefined
}

const POLICY = {
  head: { edit: [] },
  foot: { edit: [] },
  'SLOT-A': { edit: ['cell', 'merge', 'row', 'align', 'cbg', 'format'], lockedRows: 2 },
  'SLOT-B': { edit: ['cell', 'row', 'format'], lockedRows: 1 },
  'SLOT-C': { edit: ['cell', 'row', 'format'], lockedRows: 1 },
  'SLOT-D': { edit: ['cell', 'row', 'format'], lockedRows: 1 },
}
const isSlotEl = (s) => !!s && s in POLICY
const slotAllows = (s, op) => { if (!s) return true; const p = POLICY[s]; return p ? p.edit.includes(op) : false }
const lockedRowCount = (s) => (s ? (POLICY[s]?.lockedRows ?? 0) : 0)
function cellEditable(slot, r, c) {
  if (!isSlotEl(slot)) return true
  if (!slotAllows(slot, 'cell')) return false
  if (r < lockedRowCount(slot)) return false
  if (c === 0 && (slot === 'SLOT-B' || slot === 'SLOT-C' || slot === 'SLOT-D')) return false
  return true
}

// ── 1) 글자 대비 ──
check(cellTextColor(CBG.done) === '#ffffff', '완료(진한 파랑) 위에는 흰 글씨')
check(cellTextColor(CBG.risk) === undefined, '지연(앰버) 위에는 어두운 글씨 — 흰 글씨는 대비 2.8:1 로 미달')
check(cellTextColor(CBG.plan) === undefined, '계획(연한 파랑) 위에는 기본(어두운) 글씨')
check(cellTextColor(CBG.hold) === undefined, '보류(회색) 위에는 기본 글씨')
check(cellTextColor(undefined) === undefined, '색이 없으면 글자색도 건드리지 않는다')
check(cellTextColor('red') === undefined, '알 수 없는 형식은 무시')

// 팔레트 전체가 대비를 만족하는지 — 색을 추가할 때 여기서 걸린다
for (const [name, hex] of Object.entries(CBG)) {
  const fg = cellTextColor(hex) || INK
  const ratio = contrast(hex, fg)
  check(ratio >= 4.5, `${name}: 대비 ${ratio.toFixed(1)}:1 (WCAG AA 4.5 이상)`)
}

// ── 2) 편집 가능 판정 ──
check(cellEditable(undefined, 0, 0) === true, '슬롯 없는 일반 표는 제약 없음')
check(cellEditable('SLOT-A', 0, 5) === false, '로드맵 연도 행(0)은 잠김')
check(cellEditable('SLOT-A', 1, 5) === false, '로드맵 월 행(1)도 잠김')
check(cellEditable('SLOT-A', 2, 5) === true, '로드맵 데이터 행(2)은 편집 가능')
check(cellEditable('SLOT-A', 2, 0) === true, '로드맵 구분 열은 편집 가능')
check(cellEditable('SLOT-B', 0, 1) === false, '목록 표 머리글 행은 잠김')
check(cellEditable('SLOT-B', 1, 0) === false, '목록 표 번호 열은 자동 채번이라 잠김')
check(cellEditable('SLOT-B', 1, 1) === true, '목록 표 본문은 편집 가능')
check(cellEditable('head', 0, 0) === false, '머리말은 편집 불가')
check(cellEditable('foot', 0, 0) === false, '꼬리말은 편집 불가')
check(cellEditable('SLOT-Z', 0, 0) === true, '모르는 슬롯은 슬롯이 아니므로 제약 없음(일반 요소 취급)')

// ── 3) 편집 허용 ──
check(slotAllows('SLOT-A', 'cbg') === true, '로드맵만 셀 색 허용')
check(slotAllows('SLOT-B', 'cbg') === false, '목록 표는 셀 색 불가')
check(slotAllows('SLOT-A', 'col') === false, '로드맵도 열 편집은 불가')
for (const s of Object.keys(POLICY)) {
  check(slotAllows(s, 'col') === false, `${s}: 열 편집 금지`)
}
check(slotAllows(undefined, 'col') === true, '슬롯 없는 표는 열 편집 가능')

// ── 4) 소스 계약 ──
check(SRC.includes('onWhite > onInk'), '대비를 실제로 계산해 글자색을 고른다(임계값 방식 아님)')
check(SRC.includes('repeating-linear-gradient'), '보류는 해칭으로 그린다(색맹 대응)')
check(SRC.includes('if (!p) return false'), 'slotAllows 가 모르는 슬롯을 거부한다')
{
  // 타입 정의(SlotOp)에는 'col' 이 있어도 된다 — 정책에 없어야 한다.
  const policyBlock = SRC.split('export const SLOT_POLICY')[1].split('export function')[0]
  check(!policyBlock.includes("'col'"), '정책 어디에도 열 편집이 없다')
}

console.log('')
console.log(fail === 0 ? `ALL PASS (${pass})` : `FAILED ${fail} / ${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
