// 「고른 것」을 **어떻게 보여 주는가** — 한 화면 안에서 한 가지 방식으로.
//
// **왜 생겼나.** 2026-09-14, 「가로·세로가 반대로 움직이는 것 같다」는 말을 들었다.
// 녹화를 프레임으로 뜯어 보니 **동작은 처음부터 맞았다** — 세로를 고르면 세로 종이(432×576),
// 가로를 고르면 가로 종이(1040×720)가 나왔다. 틀린 것은 **표시**였다.
//
//   .insp-row.seg button      { background:#fff }         ← 안 고른 것
//   .insp-row.seg button.on   { background: 연한 파랑 }    ← 고른 것
//
// 한 테두리 안에 단추가 붙어 있고 그중 하나가 **흰 알약**으로 남으면,
// 아이폰·맥 분절 단추가 전부 「흰 알약 = 고른 것」이라 사람은 **정확히 반대로** 읽는다.
// 바로 위 줄(「전환」)은 같은 「고름」을 **테두리**로 그리고 있었다 —
// **한 화면이 같은 뜻을 두 방식으로** 말하고 있었던 셈이다.
//
// 그래서 전환 쪽으로 맞췄다. 이 검사는 **다시 채움만으로 돌아가지 않게** 못박는다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs seg_choice.test.mjs

import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const css = bare(read('./src/builder/chrome.css'))
const rp = bare(read('./src/builder/chrome/RightPanel.tsx'))

/** 규칙 하나를 한 덩어리로 꺼낸다. */
function rule(sel) {
  const i = css.indexOf(sel + '{')
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
}

// ── 1. 고른 것은 테두리로 가른다 ────────────────
{
  const on = rule('.insp-row.seg button.on')
  check(!!on, '`.insp-row.seg button.on` 규칙이 있다')
  check(/border-color:\s*var\(--ax-blue\)/.test(on),
    '**고른 것에 파란 테두리가 붙는다** — 채움만으로 가르지 않는다', on)

  // 채움만 바꾸던 옛 방식으로 돌아가면 여기서 걸린다.
  check(/box-shadow|font-weight/.test(on),
    '테두리 말고도 표시가 하나 더 있다 (테두리 1px 은 색맹인 사람에게 약하다)')
}

// ── 2. 안 고른 것이 「흰 알약」으로 안 남는다 ────
//
// 이게 거꾸로 읽히게 만든 진짜 원인이다. 단추들이 **한 테두리 안에 붙어** 있으면
// 그 안의 흰 것이 튀어나온 알약으로 보인다. 떨어뜨려 놓으면 그 착시가 없어진다.
{
  const wrap = rule('.insp-row.seg')
  check(/border:\s*0/.test(wrap),
    '묶음에 **테두리가 없다** — 단추가 한 테두리 안에 갇혀 있지 않다', wrap)
  check(/gap:\s*[1-9]/.test(wrap), '단추가 떨어져 있다 (전환 줄과 같은 모양)', wrap)

  const btn = rule('.insp-row.seg button')
  check(/border:\s*1px/.test(btn), '단추마다 제 테두리를 갖는다', btn)
}

// ── 3. 전환과 **같은 말**을 한다 ────────────────
//
// 두 줄이 나란히 있는데 고름 표시가 다르면, 사람은 둘 중 하나를 잘못 읽는다.
{
  const pillOn = rule('.insp-pill.on')
  const segOn = rule('.insp-row.seg button.on')
  for (const k of ['background', 'border-color', 'color']) {
    const a = (pillOn.match(new RegExp(k + ':\\s*([^;}]+)')) || [])[1]
    const b = (segOn.match(new RegExp(k + ':\\s*([^;}]+)')) || [])[1]
    check(!!a && a.trim() === (b || '').trim(),
      `전환(.insp-pill.on)과 ${k} 가 같다`, `${a} / ${b}`)
  }
}

// ── 4. 여섯 군데가 실제로 이 규칙을 쓴다 ─────────
//
// 규칙만 고치고 어느 한 곳이 제 스타일을 따로 들고 있으면 거기만 옛 모습으로 남는다.
{
  const segs = (rp.match(/insp-row seg/g) || []).length
  check(segs >= 8, '오른쪽 패널이 이 묶음을 여덟 자리에서 쓴다', segs + '곳')

  // 고름 표시가 필요한 여섯 — 이름으로 확인한다.
  for (const t of ['방향', '배경', '종류', '화살촉']) {
    check(rp.includes('insp-sec">' + t + '<'), `「${t}」 줄이 있다`)
  }
  const alignSegs = (rp.match(/insp-sec">정렬<\/div>\s*<div className="insp-row seg">/g) || []).length
  check(alignSegs >= 2, '「정렬」이 둘(글상자·도형) 다 이 묶음을 쓴다', alignSegs + '곳')

  // 아무도 제 배경색을 따로 박아 두지 않았다.
  check(!/insp-row seg[^>]*style=\{\{[^}]*background/.test(rp),
    '어느 한 곳이 제 배경색을 따로 들고 있지 않다')
}

// ── 5. 셀 정렬은 해당 없음 ─────────────────────
//
// 표의 셀 정렬은 **누르면 바로 먹는 동작**이라 「고른 상태」가 없다.
// 여기에 `.on` 이 생기면 그건 「지금 이 정렬이다」라는 거짓말이 된다 —
// 여러 칸을 골랐을 때 칸마다 정렬이 다를 수 있기 때문이다.
{
  const cell = rp.slice(rp.indexOf('셀 정렬'), rp.indexOf('셀 글자 크기'))
  check(!/' on'/.test(cell), '셀 정렬에는 고름 표시가 없다 — 누르면 바로 먹는 동작이다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
