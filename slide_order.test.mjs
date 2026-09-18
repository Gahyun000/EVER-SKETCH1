// **새 슬라이드는 「고른 것 바로 뒤」에 들어간다.**
//
// 2026-09-18 · 사용자가 파워포인트 영상을 보내며 물었다. 재 보니 우리는 **늘 맨 끝**이었다 —
// 3장짜리에서 가운데(2번째)를 골라 놓고 「＋ 슬라이드」를 눌러도 **4번째**로 갔다.
// 만들고 나서 손으로 끌어 올려야 했다. 파워포인트·키노트는 고른 것 바로 뒤에 넣는다.
//
// **슬라이드만 그렇게 한다**(사용자 결정). 마인드맵·트리 같은 다른 「새 페이지」는
// 한 장을 통째로 펼치는 것이라 성격이 달라서 맨 끝 그대로다.
//
// 이 파일은 **셈을 글자로 재지 않고 실제로 돌려서** 잰다. 자르고 붙이는 계산은
// 눈으로 읽으면 맞아 보이는데 경계에서 틀린다(고른 것이 없을 때 · 맨 끝일 때 · 첫 장일 때).
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs slide_order.test.mjs
import { readFileSync } from 'node:fs'
// **스토어가 실제로 쓰는 셈을 그대로 부른다.** 여기에 같은 셈을 베껴 쓰면
// 베낀 것이 맞는지를 재는 꼴이 되어, 정작 스토어가 달라져도 모른다.
import { slideSpot } from './src/state/pageOrder.ts'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const src = readFileSync('./src/state/store.ts', 'utf8')

// ── ① 코드가 그렇게 적혀 있나 ──────────────────────────
{
  const i = src.indexOf("if (cardKey === 'slide') {")
  const body = i < 0 ? '' : src.slice(i, src.indexOf("if (cardKey === 'mindmap')", i))
  check(i > 0, '슬라이드 갈래가 있다')
  check(/const next = slideSpot\(s\.pages, s\.selectedPageId\)/.test(body),
    '**자리는 slideSpot 한 곳**이 정한다 — 스토어 안에 베껴 두면 가드가 복사본을 재게 된다')
  check(/s\.pages\.slice\(0, next\), sp, \.\.\.s\.pages\.slice\(next\)/.test(body),
    '그 다음 자리에 끼운다 — 맨 끝에 붙이지 않는다')
  const po = readFileSync('./src/state/pageOrder.ts', 'utf8')
  check(/at < 0 \? pages\.length : at \+ 1/.test(po),
    '**고른 쪽이 없으면 맨 끝**이다 — -1 을 그냥 쓰면 맨 앞에 끼어든다')
  check(/selectedPageId: sp\.id/.test(body), '만든 쪽으로 옮겨 간다')
}

// ── ② 다른 「새 페이지」는 그대로 맨 끝인가 ───────────────
// 슬라이드만 바꾸기로 했다. 같이 바꿨다가 마인드맵이 보고서 한가운데 끼는 일이 없어야 한다.
{
  for (const key of ['mindmap', 'tree']) {
    const i = src.indexOf(`if (cardKey === '${key}')`)
    const body = i < 0 ? '' : src.slice(i, i + 1400)
    check(i > 0 && /pages: \[\.\.\.s\.pages, /.test(body),
      `${key} 는 그대로 맨 끝에 붙는다 — 한 장을 통째로 펼치는 것이라 성격이 다르다`)
  }
}

// ── ③ **셈을 돌려서** 잰다 ─────────────────────────────
// 위 ①은 「그렇게 적혀 있나」만 본다. 경계에서 맞는지는 돌려 봐야 안다 —
// 고른 것이 없을 때 · 맨 끝일 때 · 첫 장일 때 · 한 장도 없을 때.
{
  const P = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const put = (pages, sel) => {
    const at = slideSpot(pages, sel)
    return [...pages.slice(0, at), { id: 99 }, ...pages.slice(at)].map((p) => p.id).join(',')
  }
  check(put(P, 2) === '1,2,99,3', '가운데(2번)를 고른 채 만들면 **그 바로 뒤**다', put(P, 2))
  check(put(P, 1) === '1,99,2,3', '첫 장을 고르면 둘째 자리', put(P, 1))
  check(put(P, 3) === '1,2,3,99', '맨 끝을 고르면 맨 끝', put(P, 3))
  check(put(P, null) === '1,2,3,99', '**고른 것이 없으면 맨 끝**', put(P, null))
  check(put(P, 77) === '1,2,3,99', '없는 쪽을 가리켜도 맨 끝 — -1 을 그냥 쓰면 맨 앞에 끼어든다', put(P, 77))
  check(put([], 7) === '99', '한 장도 없을 때도 터지지 않는다', put([], 7))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
