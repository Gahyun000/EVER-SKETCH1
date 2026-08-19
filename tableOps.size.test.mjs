// 표 열너비(colw)·행높이(rowh) 테스트 — 노드 단독 실행.
//
// 왜 이 파일이 필요한가:
// 임원회의 로드맵 표는 18열이다. 균등 분할이면 '구분' 열이 월 칸과 같은 폭이 되어
// 사업명이 세 줄로 접히고 표가 못 읽게 된다. 그래서 열마다 비율을 갖는다.
// 비율 배열은 **열 수와 길이가 같아야만** 뜻이 맞는다 — 열을 하나 추가하고 배열을
// 그대로 두면 열 수와 길이가 어긋나 그 순간부터 표 전체 폭이 밀린다.
//
// 실행: node --experimental-strip-types tableOps.size.test.mjs
//
// 이 테스트는 (재구현이 아니라) **원본 TS 모듈을 그대로 불러** 검증한다.
// 같은 규칙을 두 번 적어두면 원본만 틀렸을 때 테스트는 통과해 버린다.

import { addCol, addRow, delCol, delRow, sizeTracks } from './src/canvas/tableOps.ts'

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// 3열 2행 표 — 첫 열이 3배 넓다(로드맵의 '구분' 열을 축소한 모양).
const base = () => ({
  id: 1, type: 'table', x: 0, y: 0, w: 300, h: 60, text: '', color: 'transparent', fs: 12,
  rows: 2, cols: 3,
  cells: [['구분', '1', '2'], ['가', '', '']],
  colw: [3, 1, 1], rowh: [1, 2],
})

// ── 1) 트랙 문자열 ──
check(sizeTracks([3, 1, 1], 3) === '3fr 1fr 1fr', 'sizeTracks: 비율을 fr 트랙으로 편다')
check(sizeTracks(undefined, 4) === 'repeat(4, 1fr)', 'sizeTracks: 없으면 균등 분할')
check(sizeTracks([3, 1], 3) === 'repeat(3, 1fr)', 'sizeTracks: 길이가 어긋나면 균등 분할로 되돌린다')
check(sizeTracks([3, 0, 1], 3) === 'repeat(3, 1fr)', 'sizeTracks: 0·음수는 균등 분할로 되돌린다')
check(sizeTracks([3, NaN, 1], 3) === 'repeat(3, 1fr)', 'sizeTracks: NaN 은 균등 분할로 되돌린다')

// ── 2) 열 추가/삭제가 colw 를 함께 옮긴다 ──
{
  const p = addCol(base(), 1)
  check(p.cols === 4, 'addCol: 열 수 +1')
  check(p.colw.length === 4, 'addCol: colw 길이도 +1 (길이가 어긋나면 표 전체 폭이 밀린다)')
  check(eq(p.colw, [3, 1, 1, 1]), 'addCol: 새 열은 그 자리 열과 같은 너비')
}
{
  const p = addCol(base(), 0)          // 넓은 열 앞에 삽입
  check(eq(p.colw, [3, 3, 1, 1]), 'addCol(0): 맨 앞도 옆 열과 같은 너비')
}
{
  const p = addCol(base(), 3)          // 맨 뒤에 붙이기
  check(eq(p.colw, [3, 1, 1, 1]), 'addCol(끝): 마지막 열과 같은 너비')
}
{
  const p = delCol(base(), 0)          // 넓은 열 삭제
  check(p.cols === 2 && eq(p.colw, [1, 1]), 'delCol: 지운 열의 너비가 함께 빠진다')
}

// ── 3) 행 추가/삭제가 rowh 를 함께 옮긴다 ──
{
  const p = addRow(base(), 1)
  check(p.rows === 3 && eq(p.rowh, [1, 2, 2]), 'addRow: rowh 도 +1, 그 자리 행과 같은 높이')
}
{
  const p = delRow(base(), 1)
  check(p.rows === 1 && eq(p.rowh, [1]), 'delRow: 지운 행의 높이가 함께 빠진다')
}

// ── 4) 축이 다른 조작은 건드리지 않는다 ──
{
  const p = addRow(base(), 0)
  check(p.colw === undefined, 'addRow 는 colw 를 반환하지 않는다(열은 그대로)')
  const q = addCol(base(), 0)
  check(q.rowh === undefined, 'addCol 은 rowh 를 반환하지 않는다(행은 그대로)')
}

// ── 5) 길이가 이미 어긋난 문서는 스스로 균등 분할로 되돌아간다 ──
{
  const bad = { ...base(), colw: [3, 1] }        // cols=3 인데 길이 2
  const p = addCol(bad, 1)
  check(p.colw === undefined, '어긋난 colw 는 유지하지 않고 버린다(균등 분할로 복구)')
}

// ── 6) 마지막 한 칸까지 지우면 배열을 버린다 ──
{
  const one = { ...base(), rows: 1, cols: 1, cells: [['x']], colw: [1], rowh: [1] }
  check(delCol(one, 0).colw === undefined || delCol(one, 0).cols === undefined,
        'delCol: 마지막 열은 지우지 않는다(빈 표 방지)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
