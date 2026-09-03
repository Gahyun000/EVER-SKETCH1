// TODAY 마커가 어느 열에 서는가 — 노드 단독 실행.
//
// **왜 규칙을 따로 떼어 시험하는가.**
// 마커는 화면을 열어야 보이는 물건이지만, 틀렸을 때는 조용히 틀린다 —
// 9월에 만든 자료를 11월에 열었는데 마커가 9월에 서 있으면, 보는 사람은
// 그게 오늘이라고 믿는다. 눈으로는 잡히지 않는 종류의 오류다.
// 그래서 열 계산만 순수 함수로 떼어 여기서 시험한다.
//
// 실행: node --experimental-strip-types today_marker.test.mjs

import { ROADMAP_MONTH_COL0 as C0, todayColumn } from './src/template/slots.ts'

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

/** 2026년 로드맵. 만들 때 9월이었다. */
const roadmap2026 = { today: C0 + 8, todayMode: 'auto', todayYear: 2026 }

// KST 기준 시각 몇 개. UTC 로 적고 서울에서 몇 월인지 확인한다.
const KST_2026_09 = new Date('2026-09-03T05:00:00Z')   // 서울 14:00
const KST_2026_11 = new Date('2026-11-20T05:00:00Z')
const KST_2027_03 = new Date('2027-03-10T05:00:00Z')

// ── 자동: 실제 오늘을 따라간다 ──
check(todayColumn(roadmap2026, KST_2026_09) === C0 + 8, '자동 — 9월이면 9월 열')
check(todayColumn(roadmap2026, KST_2026_11) === C0 + 10,
  '자동 — 11월에 열면 저장된 9월이 아니라 11월 열로 옮겨간다')
check(todayColumn(roadmap2026, new Date('2026-01-15T05:00:00Z')) === C0, '자동 — 1월이면 첫 달 열')
check(todayColumn(roadmap2026, new Date('2026-12-15T05:00:00Z')) === C0 + 11, '자동 — 12월이면 마지막 달 열')

// ── 자동: 해가 바뀌면 그리지 않는다 ──
// 2027 년 자료는 2027 로드맵을 새로 만든다. 지난해 자료가 오늘을 주장하면 안 된다.
check(todayColumn(roadmap2026, KST_2027_03) === null, '자동 — 해가 바뀌면 지난해 자료엔 안 그린다')
check(todayColumn(roadmap2026, new Date('2025-06-10T05:00:00Z')) === null, '자동 — 아직 안 온 해에도 안 그린다')

// ── 시간대: UTC 가 아니라 서울 기준 ──
// 서울에서는 이미 1월 1일인데 UTC 로는 12월 31일인 순간이 있다.
check(todayColumn(roadmap2026, new Date('2025-12-31T20:00:00Z')) === C0,
  '자동 — 서울에서 새해가 되면 그 순간부터 1월 (UTC 로는 아직 작년)')
check(todayColumn({ ...roadmap2026, todayYear: 2025 }, new Date('2025-12-31T20:00:00Z')) === null,
  '자동 — 같은 순간에 2025 로드맵에서는 사라진다')

// ── 고정: 사람이 정한 자리에 선다 ──
const fixed = { today: C0 + 2, todayMode: 'fixed', todayYear: 2026 }
check(todayColumn(fixed, KST_2026_11) === C0 + 2, '고정 — 실제 날짜와 상관없이 정해 둔 열')
check(todayColumn(fixed, KST_2027_03) === C0 + 2, '고정 — 해가 바뀌어도 그대로')
check(todayColumn({ todayMode: 'fixed', todayYear: 2026 }, KST_2026_09) === null,
  '고정 — 정해 둔 열이 없으면 안 그린다')

// ── 끄기 ──
check(todayColumn({ ...roadmap2026, todayMode: 'off' }, KST_2026_09) === null, '끄기 — 아무 때도 안 그린다')
check(todayColumn({ ...fixed, todayMode: 'off' }, KST_2026_11) === null, '끄기 — 고정값이 있어도 안 그린다')

// ── 옛 문서(기준 연도가 없는) ──
// todayMode 가 생기기 전에 만들어진 자료다. 저장된 자리에 그대로 둔다 —
// 갑자기 마커가 사라지면 사용자는 자기가 지운 줄 안다.
check(todayColumn({ today: C0 + 8 }, KST_2026_11) === C0 + 8,
  '옛 문서 — 기준 연도를 모르면 저장된 열을 그대로 쓴다')
check(todayColumn({ today: C0 + 8 }, KST_2027_03) === C0 + 8, '옛 문서 — 해가 바뀌어도 그대로')

// 다만 옛 문서에도 머리글에는 연도가 적혀 있다. 거기서 읽어내면 자동이 곧바로 산다 —
// 이게 없으면 옛 자료에서 「오늘」을 눌러도 아무 일이 안 일어난다.
const legacyCells = [[ '', '', '2026년' ]]
check(todayColumn({ today: C0 + 8, cells: legacyCells }, KST_2026_11) === C0 + 10,
  '옛 문서 — 머리글의 연도를 읽어 자동으로 동작한다')
check(todayColumn({ today: C0 + 8, cells: legacyCells }, KST_2027_03) === null,
  '옛 문서 — 머리글 연도를 지나면 안 그린다')
check(todayColumn({ today: C0 + 8, cells: legacyCells, todayMode: 'fixed' }, KST_2026_11) === C0 + 8,
  '옛 문서 — 고정으로 바꾸면 머리글 연도와 무관하게 그 자리')
check(todayColumn({ today: C0 + 8, todayYear: 2026, cells: [['', '', '2099년']] }, KST_2026_11) === C0 + 10,
  'todayYear 가 있으면 머리글보다 우선한다')

// ── 마커가 없는 요소 ──
check(todayColumn({}, KST_2026_09) === null, '표에 마커 정보가 없으면 안 그린다')
check(todayColumn({ today: -1 }, KST_2026_09) === null, '음수 열은 안 그린다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
