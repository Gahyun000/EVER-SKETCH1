// 표 셀 배경색(cbg) 좌표 리맵 테스트 — 노드 단독 실행.
//
// 왜 이 파일이 따로 있는가:
// tableOps 의 addRow/delRow/addCol/delCol 은 좌표를 키로 쓰는 맵을 전부 다시 매핑해야 한다.
// calign 만 리맵하고 cbg 를 빠뜨리면, **행을 하나 추가하는 순간 로드맵의 진행 셀 색이
// 한 칸씩 아래로 밀린다.** 화면에서는 "5월 완료"가 "6월 완료"로 보이는 형태다.
// 조용히 틀리는 종류의 버그라 테스트로 못 박는다.
//
// 실행: node tableOps.cbg.test.mjs

import { readFileSync } from 'node:fs'

// TS 파일을 그대로 못 읽으므로 순수 함수만 발췌해 동일 구현으로 검증한다.
// (원본이 바뀌면 아래 SOURCE 검사가 먼저 실패해 알려준다.)
const SRC = readFileSync(new URL('./src/canvas/tableOps.ts', import.meta.url), 'utf-8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

// ── 1) 소스 계약: 네 함수가 모두 cbg 를 리맵하는가 ──
//
// 2026-08-27 ebook_html 이식으로 셀 맵이 넷(calign·cvalign·cfs·cbg)으로 늘면서,
// 함수마다 따로 리맵하던 것을 remapCellStyles 한 곳으로 모았다. 계약도 그에 맞춘다:
//   (a) 네 함수는 반드시 remapCellStyles 를 거쳐 결과를 펼친다
//   (b) remapCellStyles 는 네 맵을 빠짐없이 리맵한다
// 이렇게 하면 셀 맵이 또 늘어도 (b) 한 줄만 보면 되고, 빠뜨림은 여기서 걸린다.
const styles = SRC.split('function remapCellStyles(')[1]?.split('\n}')[0] ?? ''
for (const fn of ['addRow', 'delRow', 'addCol', 'delCol']) {
  const body = SRC.split(`export function ${fn}(`)[1]?.split('\nexport ')[0] ?? ''
  check(body.includes('remapCellStyles(el,'), `${fn}: 셀 서식 맵을 리맵한다`)
  check(body.includes('...st'), `${fn}: 반환값에 리맵 결과를 담는다`)
}
for (const m of ['calign', 'cvalign', 'cfs', 'cbg']) {
  check(styles.includes(`remapCells<`) && styles.includes(`(el.${m}, fn)`), `remapCellStyles: ${m} 를 리맵한다`)
}
check(!SRC.includes('remapCalign'), '구형 remapCalign 이 남아 있지 않다')

// ── 2) 동작 검증: 원본과 같은 규칙을 구현해 좌표 이동을 확인 ──
const key = (r, c) => r + '_' + c
function remapCells(map, fn) {
  const out = {}
  if (map) for (const k of Object.keys(map)) {
    const [r, c] = k.split('_').map(Number)
    const nk = fn(r, c)
    if (nk) out[key(nk[0], nk[1])] = map[k]
  }
  return out
}
const addRowMove = (at) => (r, c) => [r >= at ? r + 1 : r, c]
const delRowMove = (at) => (r, c) => (r === at ? null : [r > at ? r - 1 : r, c])
const addColMove = (at) => (r, c) => [r, c >= at ? c + 1 : c]
const delColMove = (at) => (r, c) => (c === at ? null : [r, c > at ? c - 1 : c])

// 로드맵을 흉내낸 배치: 2행 헤더 + 데이터 2행, 5월(열5)·6월(열6) 완료 표시
const cbg = { '2_5': '#2462EB', '2_6': '#2462EB', '3_5': '#EAF1FE' }

{ // 데이터 첫 행 위에 행 추가 → 아래쪽 색이 한 칸 내려가야 한다
  const out = remapCells(cbg, addRowMove(2))
  check(out['3_5'] === '#2462EB', 'addRow: 삽입 지점 아래 색이 함께 내려간다')
  check(out['4_5'] === '#EAF1FE', 'addRow: 그 아래 행도 정확히 한 칸')
  check(out['2_5'] === undefined, 'addRow: 원래 자리는 비워진다')
}
{ // 헤더 위(0행)에 추가 → 전부 한 칸씩
  const out = remapCells(cbg, addRowMove(0))
  check(out['3_5'] === '#2462EB' && out['4_5'] === '#EAF1FE', 'addRow(맨 위): 전체가 한 칸 내려간다')
}
{ // 색칠된 행 자체를 삭제 → 그 행 색은 사라지고 아래는 올라온다
  const out = remapCells(cbg, delRowMove(2))
  check(out['2_5'] === '#EAF1FE', 'delRow: 아래 행이 올라오며 색을 가져온다')
  check(Object.keys(out).length === 1, 'delRow: 삭제된 행의 색은 남지 않는다')
}
{ // 열 추가 — 1월 앞에 열이 생기면 5월 색이 6월 자리로
  const out = remapCells(cbg, addColMove(1))
  check(out['2_6'] === '#2462EB' && out['2_7'] === '#2462EB', 'addCol: 오른쪽 색이 함께 밀린다')
}
{ // 열 삭제
  const out = remapCells(cbg, delColMove(5))
  check(out['2_5'] === '#2462EB', 'delCol: 삭제 열 오른쪽이 당겨진다')
  check(out['3_5'] === undefined, 'delCol: 삭제된 열의 색은 사라진다')
}
{ // 삽입 지점보다 위/왼쪽은 그대로
  const out = remapCells({ '0_0': '#EEF0F4', '5_9': '#D98A2A' }, addRowMove(3))
  check(out['0_0'] === '#EEF0F4', 'addRow: 삽입 지점 위는 그대로')
  check(out['6_9'] === '#D98A2A', 'addRow: 아래는 이동')
}

// ── 3) 팔레트 계약 ──
check(SRC.includes("done: '#2462EB'"), '팔레트: 완료 = 브랜드 파랑')
check(SRC.includes("plan: '#EAF1FE'"), '팔레트: 계획 = 연한 파랑')
check(SRC.includes("risk: '#D98A2A'"), '팔레트: 지연 = 앰버')
check(SRC.includes("hold: '#EEF0F4'"), '팔레트: 보류 = 회색')
check(SRC.includes('export function setCellBgRange'), 'setCellBgRange 가 있다')
check(SRC.includes('delete cbg[key(r, c)]'), 'null 을 주면 색을 지운다(빈 문자열로 남기지 않는다)')

console.log('')
console.log(fail === 0 ? `ALL PASS (${pass})` : `FAILED ${fail} / ${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
