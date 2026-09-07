// 마인드맵이 **옮길 수 있는 요소들로** 펼쳐지는가.
//
// 임원진 신고: 「위치 이동 및 사이즈 조정 안됨」. 고장이 아니라 설계가 그랬다 —
// 마인드맵은 필드(중심 주제 · 가지 1~5)에서 **SVG 그림 한 덩어리**를 만들어 냈고,
// 「로그아웃」이나 「생존의 법칙」은 각각의 물건이 아니라 그림의 일부였다. 잡을 게 없었다.
//
// 「한 번만 펼친다」를 고른 이유: 요소로 그리는 순간 **자리라는 값이 생기고**, 필드와
// 자리 중 누가 주인인지 정해야 한다. 계속 맞추는 쪽을 고르면 「가지 3을 지웠다 다시
// 넣으면 자리가 초기화되나」가 끝없이 따라온다. 오늘 표 높이와 표 잠금에서 같은 문제를
// 두 번 겪었고 두 번 다 **역할을 갈라서** 풀렸다. 여기서는 아예 주인을 하나로 만든다.
//
// 실행: node --experimental-strip-types mindmap_els.test.mjs
import { BRANCH_KEYS, mindmapParts } from './src/cards/mindmapEls.ts'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const W = 432, H = 576                     // 세로 이북
const LW = 1040, LH = 720                  // 가로 덱
const ids = () => { let n = 1000; return () => ++n }
const F = {
  title: 'AX 추진 영역', center: '유니에버 AX',
  b1: '품질', b2: '생산', b3: '물류', b4: '경영정보', b5: '',
}

{
  const { els, conns } = mindmapParts(F, W, H, ids())
  const texts = els.map((e) => e.text)
  check(texts.includes('AX 추진 영역'), '제목이 요소로 들어간다')
  check(texts.includes('유니에버 AX'), '중심 주제가 요소로 들어간다')
  check(['품질', '생산', '물류', '경영정보'].every((t) => texts.includes(t)),
        '채운 가지가 전부 요소가 된다')
  check(!texts.includes(''), '빈 가지(b5)는 요소를 만들지 않는다')
  check(els.length === 1 + 1 + 4, '요소는 제목 1 + 중심 1 + 가지 4', String(els.length))
  check(conns.length === 4, '선은 가지 수만큼', String(conns.length))
}

{
  // **선이 중심과 가지를 실제로 잇는가.** 번호가 어긋나면 화면에는 선이 엉뚱한 데
  // 붙거나 아예 안 보인다 — 요소 번호는 캔버스 것을 그대로 받아 써야 한다.
  const { els, conns } = mindmapParts(F, W, H, ids())
  const byId = new Map(els.map((e) => [e.id, e]))
  const centerId = els.find((e) => e.text === '유니에버 AX').id
  check(conns.every((c) => c.from === centerId), '모든 선이 중심에서 나간다')
  check(conns.every((c) => byId.has(c.to)), '모든 선의 끝이 실제 요소를 가리킨다')
  check(new Set(conns.map((c) => c.to)).size === conns.length, '가지 하나에 선 하나')
  check(conns.every((c) => c.arrow === 'none'),
        '화살표가 아니라 선이다 — 마인드맵 가지에 방향은 없다')
  check(new Set(els.map((e) => e.id)).size === els.length, '요소 번호가 겹치지 않는다')
}

{
  // 요소 번호는 **밖에서 받는다.** 여기서 새로 세면 이미 있는 요소와 겹쳐
  // 선이 엉뚱한 도형에 붙는다.
  let n = 500
  const { els } = mindmapParts(F, W, H, () => ++n)
  check(els.every((e) => e.id > 500), '넘겨준 번호 매기기를 쓴다', els.map((e) => e.id).join(','))
}

{
  // 종이 밖으로 나가면 아무도 못 본다.
  for (const [w, h] of [[W, H], [LW, LH]]) {
    const { els } = mindmapParts({ ...F, b5: '보안' }, w, h, ids())
    const out = els.filter((e) => e.x < 0 || e.y < 0 || e.x + e.w > w || e.y + e.h > h)
    check(out.length === 0, `${w}×${h} 에서 모든 요소가 종이 안에 있다`,
          out.map((e) => `${e.text}(${e.x},${e.y})`).join(' '))
  }
}

{
  // 가지를 하나도 안 채워도 쓸 수 있는 그림이 나와야 한다 — 빈 종이를 주면
  // 사람은 무엇을 해야 할지 모른다.
  const { els, conns } = mindmapParts({}, W, H, ids())
  check(els.length >= 4 && conns.length === 3, '아무것도 안 채워도 뼈대는 나온다',
        `요소 ${els.length} 선 ${conns.length}`)
  check(els.some((e) => e.text === '중심 주제'), '중심 자리에 안내 글이 들어간다')
}

{
  // 제목이 없으면 제목 상자를 만들지 않는다 — 빈 글상자가 남으면 지우는 일이 생긴다.
  const { els } = mindmapParts({ ...F, title: '' }, W, H, ids())
  check(els.length === 1 + 4, '제목이 비면 제목 상자를 안 만든다', String(els.length))
}

{
  // 첫 가지는 12시. 예전 SVG 와 같은 배치여야 「내가 알던 그 그림」이 된다.
  const { els } = mindmapParts(F, W, H, ids())
  const center = els.find((e) => e.text === '유니에버 AX')
  const first = els.find((e) => e.text === '품질')
  const cy = center.y + center.h / 2, fy = first.y + first.h / 2
  const cx = center.x + center.w / 2, fx = first.x + first.w / 2
  check(fy < cy - 40, '첫 가지가 중심 위에 있다 (12시)', `${fy} vs ${cy}`)
  check(Math.abs(fx - cx) < 8, '첫 가지가 중심과 같은 세로줄에 있다', `${fx} vs ${cx}`)
}

check(BRANCH_KEYS.length === 5, '가지는 다섯 개까지다 (카드 정의와 같다)')

console.log('\n' + pass + ' 통과, ' + fail + ' 실패')
if (fail) process.exit(1)
