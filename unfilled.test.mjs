// 「아직 안 쓴 자리」 세기 — 결재 카드가 내기 전에 띄우는 값.
//
// **가장 중요한 것은 「세지 않는 것」이다.** ① 로드맵은 18열인데 그중 12열이 달(月)이고,
// 그 칸은 글이 아니라 **색으로** 채운다. 빈 칸을 곧이곧대로 세면 아무도 안 틀렸는데
// 「빈 칸 132개」가 뜨고, 그 순간 이 알림은 아무도 안 보는 잔소리가 된다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs unfilled.test.mjs

import { unfilled, unfilledOf, textCols, unfilledText } from './src/template/unfilled.ts'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const grid = (r, c, fillFn) =>
  Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (fillFn ? fillFn(i, j) : '')))

// ── 로드맵: 달 칸은 세지 않는다 ─────────────────────
check(JSON.stringify(textCols('SLOT-A', 18)) === '[0,1]',
  '로드맵은 **글을 쓰는 두 열만** 본다 — 달 칸은 색으로 채우니까')
check(textCols('SLOT-B', 2).length === 2, '나머지 표는 모든 열을 본다')

{
  // 머리글 2행 + 본문 1행. 본문에 사업그룹·과제명을 다 썼고 달 칸은 전부 비었다.
  const cells = grid(3, 18)
  cells[2][0] = 'AI팩토리'; cells[2][1] = '품질 예측 모델'
  const el = { id: 1, type: 'table', slot: 'SLOT-A', cols: 18, cells }
  check(unfilledOf(el) === null,
    '달 칸이 다 비어 있어도 **아무 말도 하지 않는다** (색으로 채우는 자리다)')
}

// ── 아직 안 쓴 표 ─────────────────────────────
{
  const el = { id: 2, type: 'table', slot: 'SLOT-B', cols: 2, cells: grid(4, 2) }
  const u = unfilledOf(el, '② 진행 현황')
  check(u && u.kind === 'empty', '한 줄도 안 썼으면 「아직 안 쓰셨습니다」', JSON.stringify(u))
  check(u && u.cell && u.cell.r === 1, '데려다 줄 자리는 머리글 **다음** 줄이다', JSON.stringify(u && u.cell))
  check(unfilledText(u) === '② 진행 현황 — 아직 안 쓰셨습니다', '적는 말', unfilledText(u))
}

// ── 쓰다 만 줄 ───────────────────────────────
{
  const cells = grid(5, 2)
  cells[1][0] = '설계 완료'; cells[1][1] = '개발 착수'      // 다 썼다
  cells[2][0] = '시험 진행'                                  // 향후 계획이 비었다
  cells[3][1] = '보고서 작성'                                // 진행 현황이 비었다
  const el = { id: 3, type: 'table', slot: 'SLOT-B', cols: 2, cells }
  const u = unfilledOf(el, '② 진행 현황')
  check(u && u.kind === 'partial' && u.rows === 2, '쓰다 만 줄만 센다', JSON.stringify(u))
  check(u && u.cell && u.cell.r === 2 && u.cell.c === 1, '첫 빈 칸으로 데려다 준다', JSON.stringify(u && u.cell))
}
{
  // **안 건드린 줄은 세지 않는다.** 표는 넉넉히 나오고, 남는 줄은 정상이다.
  const cells = grid(16, 1)
  cells[1][0] = '이슈 하나'
  const el = { id: 4, type: 'table', slot: 'SLOT-C', cols: 1, cells }
  check(unfilledOf(el) === null, '남는 빈 줄은 흠이 아니다 — 안 건드린 줄은 안 센다')
}

// ── 문서 전체 ────────────────────────────────
{
  const roadmapCells = grid(3, 18); roadmapCells[2][0] = 'A'; roadmapCells[2][1] = 'B'
  const pages = [{ els: [
    { id: 10, type: 'text', slot: 'SLOT-A', text: '① 로드맵 / 마일스톤' },
    { id: 11, type: 'table', slot: 'SLOT-A', cols: 18, cells: roadmapCells },
    { id: 20, type: 'text', slot: 'SLOT-B', text: '② 진행 현황 / 향후 계획' },
    { id: 21, type: 'table', slot: 'SLOT-B', cols: 2, cells: grid(4, 2) },
    { id: 30, type: 'text', slot: 'SLOT-C', text: '③ 이슈 리스트' },
    { id: 31, type: 'table', slot: 'SLOT-C', cols: 1, cells: grid(4, 1) },
    { id: 99, type: 'table', cols: 3, cells: grid(3, 3) },        // 표준 양식이 아닌 표
  ] }]
  const out = unfilled(pages)
  check(out.length === 2, '다 쓴 슬롯은 안 나온다 (①은 썼다)', JSON.stringify(out.map((u) => u.slot)))
  check(out[0].slot === 'SLOT-B' && out[1].slot === 'SLOT-C', '문서에 놓인 순서대로 나온다')
  check(out[0].label === '② 진행 현황 / 향후 계획',
    '이름은 **문서 안의 이름표**를 그대로 쓴다 — 코드에 또 적어 두면 둘이 어긋난다', out[0].label)
  check(unfilled([{ els: [{ id: 99, type: 'table', cols: 3, cells: grid(3, 3) }] }]).length === 0,
    '자유 이북(표준 양식이 아닌 표)에는 아무 말도 안 한다 — 칸에 이름이 없다')
}

// ── 넘쳐서 이어진 표 ───────────────────────────
{
  // 표가 넘쳐 다음 장으로 이어지면 같은 슬롯의 표가 둘이 된다.
  // 앞 조각에 이미 썼으면 **그 슬롯은 빈 것이 아니다.**
  const head = grid(4, 1); head[1][0] = '이슈 하나'
  const pages = [{ els: [{ id: 1, type: 'table', slot: 'SLOT-C', cols: 1, cells: head }] },
                 { els: [{ id: 2, type: 'table', slot: 'SLOT-C', cols: 1, cells: grid(4, 1), contFrom: 3 }] }]
  check(unfilled(pages).length === 0,
    '이어진 조각은 한 표로 본다 — 따로 세면 「③이 비었다」가 두 번 뜬다',
    JSON.stringify(unfilled(pages)))
}

// ── 망가진 자료가 들어와도 안 죽는다 ───────────────
{
  let threw = null
  try {
    unfilled([{ els: [{ id: 1, type: 'table', slot: 'SLOT-B' }] },   // cells 가 없다
              { }, null])                                            // els 가 없다 · 페이지가 null
  } catch (e) { threw = e }
  check(threw === null, '칸도 페이지도 없는 자료에 안 터진다 — 결재 카드가 화면 맨 위에 있다',
    threw ? threw.message : '')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
