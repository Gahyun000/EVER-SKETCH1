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

import { addCol, addRow, delCol, delRow, dragTrack, rowChangedHeight, sizeTracks, trackSizes } from './src/canvas/tableOps.ts'

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


// ── 행을 넣으면 **표가 커진다** (2026-09-07) ─────────────────
//
// 예전에는 행을 추가해도 h 를 안 건드렸다. 표는 고정 높이 격자이고 gridTemplateRows 가
// fr 이라, 행이 늘면 **남아 있던 행들이 대신 납작해졌다.** 실측으로 로드맵에 6행을 넣으면
// 34.2px → 18.4px 가 됐다. 진행 구간 라벨('설계·구축')이 한 줄에 안 들어가 잘리는 크기다.
// 사용자 눈에는 「행을 넣었더니 표가 뭉개졌다」로 보인다.
//
// 규칙: **행 높이는 사람이 정하고, 표 높이는 행 수를 따라간다.**

const uni = (rows, h) => ({
  id: 9, type: 'table', x: 0, y: 0, w: 300, h, text: '', color: 'transparent', fs: 12,
  rows, cols: 2, cells: Array.from({ length: rows }, () => ['', '']),
  merges: [], calign: {},
})

{
  const el = uni(4, 120)                       // 행 높이 30px
  const got = addRow(el, 4)
  check(got.rows === 5, '행을 넣으면 행 수가 는다')
  check(got.h === 150, '표 높이가 한 행만큼 커진다 (120 → 150)')
  check(got.h / got.rows === el.h / el.rows, '남는 행들의 높이가 그대로다 (30px)')
}

{
  const el = uni(5, 150)
  const got = delRow(el, 2)
  check(got.h === 120, '행을 빼면 그만큼 작아진다 (150 → 120)')
  check(got.h / got.rows === 30, '이때도 행 높이는 그대로다')
}

{
  // 넣었다 뺐다 해도 부풀지 않는다 — 한쪽만 움직이면 쓰는 동안 표가 계속 커진다.
  let el = uni(4, 120)
  for (let i = 0; i < 5; i++) {
    el = { ...el, ...addRow(el, el.rows) }
    el = { ...el, ...delRow(el, el.rows - 1) }
  }
  check(el.h === 120 && el.rows === 4, '넣었다 빼기를 되풀이해도 처음 크기로 돌아온다')
}

{
  // rowh 가 있으면 **그 자리 행과 같은 크기**로 넣는다 — insertSize 와 같은 규칙이어야
  // 표 높이와 행 높이가 서로 맞는다.
  const el = { ...uni(3, 120), rowh: [2, 1, 1] }     // 60 / 30 / 30
  const got = addRow(el, 0)                          // 첫 행(2fr) 자리에 넣는다
  check(eq(got.rowh, [2, 2, 1, 1]), '새 행은 그 자리 행과 같은 크기다')
  check(got.h === 180, '표 높이도 그 크기만큼 커진다 (120 + 60)')
}

{
  const el = { ...uni(3, 120), rowh: [2, 1, 1] }
  const got = delRow(el, 0)
  check(got.h === 60, '큰 행을 빼면 그 크기만큼 작아진다 (120 - 60)')
}

{
  // 높이를 모르는 표(옛 자료)는 건드리지 않는다 — 0 이나 NaN 을 만들면 표가 사라진다.
  const noH = { ...uni(3, 0) }
  check(rowChangedHeight(noH, 0, 1) === undefined, '높이가 없으면 손대지 않는다')
  const one = uni(1, 40)
  check(rowChangedHeight(one, 0, -1) === undefined, '마지막 한 행을 빼는 계산은 하지 않는다')
}

// ── 열 너비 · 행 높이 끌기 (2026-09-07) ────────────────
//
// colw/rowh 는 오랫동안 **읽기만 하고 아무도 쓰지 않았다.** 그리는 코드와, 행·열을
// 넣고 뺄 때 배열 길이를 맞추는 코드뿐이었다. 그래서 로드맵의 '사업그룹' 열이 좁으면
// 사업명이 세 줄로 접히는데 넓힐 방법이 없었다.
//
// 규칙: **합을 그대로 둔다.** 한쪽이 넓어지면 옆이 그만큼 좁아진다 — 표 전체 크기는
// 안 변한다. 표를 키우는 것은 모서리 손잡이가 할 일이고, 둘을 한 동작에 섞으면
// 열 하나 넓히려다 표가 종이 밖으로 나간다.

check(eq(trackSizes(undefined, 3), [1, 1, 1]), 'trackSizes: 없으면 균등')
check(eq(trackSizes([2, 1], 3), [1, 1, 1]), 'trackSizes: 길이가 어긋나면 균등으로 되돌린다')
check(eq(trackSizes([2, 1, 1], 3), [2, 1, 1]), 'trackSizes: 멀쩡하면 그대로')

{
  // 폭 400px, 균등 4칸 = 칸마다 100px. 첫 경계선을 오른쪽으로 50px.
  const got = dragTrack([1, 1, 1, 1], 0, 50, 400)
  check(Math.abs(got[0] - 1.5) < 1e-9 && Math.abs(got[1] - 0.5) < 1e-9,
        '경계선을 끌면 한쪽이 넓어지고 옆이 그만큼 좁아진다')
  check(Math.abs(got.reduce((a, b) => a + b, 0) - 4) < 1e-9,
        '합이 그대로다 — 표 전체 폭은 안 변한다')
  check(got[2] === 1 && got[3] === 1, '건드리지 않은 칸은 그대로다')
}

{
  // 왼쪽으로 끄는 것도 대칭이다.
  const got = dragTrack([1, 1], 0, -25, 200)      // 100px 짜리 두 칸
  check(Math.abs(got[0] - 0.75) < 1e-9 && Math.abs(got[1] - 1.25) < 1e-9,
        '반대로 끌면 반대로 움직인다')
}

{
  // 0 으로 만들면 그 열은 다시 잡을 수 없다. 12px 은 남긴다.
  const got = dragTrack([1, 1], 0, -1000, 200)
  check(Math.abs(got[0] - 12 / 100) < 1e-6, '아무리 끌어도 최소 12px 은 남는다')
  check(Math.abs(got.reduce((a, b) => a + b, 0) - 2) < 1e-9, '최소에 걸려도 합은 그대로다')
}

{
  const got = dragTrack([1, 1], 0, 1000, 200)
  check(Math.abs(got[1] - 12 / 100) < 1e-6, '옆 칸도 최소 12px 은 남는다')
}

{
  // 못 만지는 경우들 — 조용히 원본을 돌려준다(예외를 던지면 끌던 중에 화면이 죽는다).
  check(eq(dragTrack([1, 1], 1, 10, 200), [1, 1]), '마지막 칸 뒤에는 경계선이 없다')
  check(eq(dragTrack([1, 1], -1, 10, 200), [1, 1]), '음수 경계선은 무시한다')
  check(eq(dragTrack([1, 1], 0, 10, 0), [1, 1]), '표 크기를 모르면 손대지 않는다')
}

{
  // 실제 로드맵 비율에서 '사업그룹' 열을 넓혀 본다 — 이 기능이 필요했던 그 자리.
  const road = [2.74, 3.21, ...Array(12).fill(1), 1.48, 1.48, 1.48, 1.48]
  const got = dragTrack(road, 0, 40, 992)
  check(got[0] > road[0] && got[1] < road[1], '사업그룹 열을 넓히면 프로젝트 열이 좁아진다')
  check(Math.abs(got.reduce((a, b) => a + b, 0) - road.reduce((a, b) => a + b, 0)) < 1e-9,
        '18열 표에서도 합은 그대로다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
