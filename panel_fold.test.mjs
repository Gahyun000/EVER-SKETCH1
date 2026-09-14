// ⑤ 좁은 창에서 **곁의 패널을 접어 종이에게 자리를 내준다** (사용자 결정 ㄱ).
//
// **잰 것부터.** 필름(212)과 오른쪽 패널(336)은 창이 좁아져도 안 줄고, 맞춤 배율에는
// 바닥이 없다. 1024 창에서 종이가 37% — 왼쪽 필름 썸네일(212)의 두 배도 안 된다.
// 손으로 둘 다 접으면 **37% → 72%** 로 완전히 돌아오는 것까지 실물에서 확인했다.
// 그러니 새로 만들 것은 「접는 기능」이 아니라 **「접을 때를 아는 것」**뿐이다.
//
// 이 검사가 지키는 셋:
//   ㉠ 좁으면 접고 넓으면 편다 — 그리고 **그 경계에서 떨지 않는다**
//   ㉡ 필름이 먼저, 오른쪽 패널이 나중 (값을 바꾸는 곳을 마지막까지 남긴다)
//   ㉢ **사람이 손댄 쪽은 자동이 못 건드린다**
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs panel_fold.test.mjs

import { readFileSync } from 'node:fs'
import { autoFold } from './src/builder/panelFold.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const LAND = { pageW: 1040, pageH: 720 }
const PORT = { pageW: 432, pageH: 576 }
const BASE = { leftW: 212, rightW: 336, stageH: 650, leftOpen: true, rightOpen: true }

/** 창 너비 → .ax-body 폭. 셸 사이드바(접힘 60px)를 뺀 값. */
const body = (win, shell = 60) => win - shell
/** 그 결과로 보이는 종이 배율. */
const scale = (bodyW, r, { pageW, pageH }, stageH = 650, leftW = 212, rightW = 336) => {
  const w = (bodyW - (r.leftOpen ? leftW : 0) - (r.rightOpen ? rightW : 0) - 32) / pageW
  return Math.min(w, (stageH - 32) / pageH)
}
/** 처음 여는 상태(둘 다 펴짐)에서 한 번 판단. */
const at = (win, page = LAND, extra = {}) =>
  autoFold({ ...BASE, ...page, ...extra, bodyW: body(win) })

// ── 1. 넓으면 그대로 둔다 ─────────────────────────
{
  for (const w of [1920, 1600, 1440]) {
    const r = at(w)
    check(r.leftOpen && r.rightOpen, `${w} — 넉넉하다. 아무것도 안 접는다`, JSON.stringify(r))
  }
}

// ── 2. 좁아지면 필름부터 접는다 ───────────────────
//
// 쪽 목록은 **보기만** 하는 곳이다. 오른쪽 패널은 값을 바꾸는 곳이라 마지막까지 남긴다.
{
  const r = at(1024)
  check(!r.leftOpen, '1024 — 필름을 접는다', JSON.stringify(r))
  check(r.rightOpen, '1024 — 오른쪽 패널은 **남긴다** (값을 바꾸는 곳이다)')
  const s = scale(body(1024), r, LAND)
  check(s > 0.55, `1024 — 종이가 37% → ${Math.round(s * 100)}% 로 돌아온다`, String(s))
}
{
  const r = at(880)
  check(!r.leftOpen && !r.rightOpen, '880 — 그래도 좁으면 오른쪽까지 접는다', JSON.stringify(r))
  const s = scale(body(880), r, LAND)
  check(s > 0.68, `880 — 종이 ${Math.round(s * 100)}%`, String(s))
}

// ── 3. 경계에서 **떨지 않는다** ───────────────────
//
// 창을 1px 끌 때마다 패널이 열렸다 닫혔다 하면 못 쓴다. 막는 길은 둘이다.
//   ㉠ **재는 값이 접기와 무관하다** — 늘 「둘 다 폈다면」을 기준으로 잰다.
//      무대 폭을 재면 접는 순간 넓어져서 다시 펴고, 펴면 좁아져서 다시 접는다.
//   ㉡ 접는 문턱과 펴는 문턱을 **떨어뜨려 둔다**(죽은 띠).
//      폭을 재는 자리(leftW)가 창 크기에 따라 따로 줄어들기 때문에 ㉠만으로는 부족하다.
{
  // ㉡ 죽은 띠가 **실제로 있다** — 같은 폭인데 들어온 상태에 따라 답이 갈린다.
  let band = 0
  for (let w = 900; w <= 1500; w += 2) {
    const a = autoFold({ ...BASE, ...LAND, bodyW: body(w), leftOpen: true })
    const b = autoFold({ ...BASE, ...LAND, bodyW: body(w), leftOpen: false })
    if (a.leftOpen !== b.leftOpen) band += 2
  }
  check(band >= 60,
    '접는 문턱과 펴는 문턱 사이에 **죽은 띠**가 있다 (문턱이 같으면 0 이 된다)',
    band + 'px')
}
{
  // 그 결과: 왕복해도 상태가 몇 번 안 바뀐다.
  let changes = 0
  let st = { leftOpen: true, rightOpen: true }
  const sweep = (from, to, step) => {
    for (let w = from; step > 0 ? w <= to : w >= to; w += step) {
      const r = autoFold({ ...BASE, ...LAND, bodyW: body(w), ...st })
      if (r.leftOpen !== st.leftOpen || r.rightOpen !== st.rightOpen) changes++
      st = r
    }
  }
  sweep(1600, 800, -4)
  sweep(800, 1600, 4)
  check(changes <= 4, '천천히 좁혔다 넓혀도 상태가 네 번만 바뀐다', changes + '번')
  check(st.leftOpen && st.rightOpen, '넓히면 **원래대로 다 펴진다**', JSON.stringify(st))
}
{
  // 한 지점에서 여러 번 물어도 답이 안 바뀐다.
  let st = { leftOpen: true, rightOpen: true }
  for (let i = 0; i < 5; i++) st = autoFold({ ...BASE, ...LAND, bodyW: body(1024), ...st })
  const again = autoFold({ ...BASE, ...LAND, bodyW: body(1024), ...st })
  check(again.leftOpen === st.leftOpen && again.rightOpen === st.rightOpen,
    '같은 폭에서 몇 번을 물어도 답이 같다')
}

// ── 4. 세로 종이는 안 건드린다 ────────────────────
//
// 세로(432×576)는 논리 폭이 작아서 1024 에서도 89% 가 나온다. 접을 이유가 없다.
{
  const r = at(1024, PORT)
  check(r.leftOpen && r.rightOpen, '세로 종이는 1024 에서도 안 접는다', JSON.stringify(r))
  const r2 = at(760, PORT)
  check(!r2.leftOpen, '세로도 정말 좁아지면(760) 접기는 한다', JSON.stringify(r2))
}

// ── 5. **높이가 발목을 잡으면 접어도 소용없다** ───
//
// 납작한 창에서는 폭을 넓혀 봐야 종이가 안 커진다. 자리만 뺏는 셈이다.
{
  // 높이가 허락하는 배율 (280-32)/720 = 0.34. 폭은 0.37 이라 **폭이 발목이 아니다.**
  const flat = at(1024, LAND, { stageH: 280 })
  check(flat.leftOpen && flat.rightOpen,
    '납작한 창에서는 **안 접는다** — 접어도 종이가 안 커지니 자리만 뺏는 셈이다',
    JSON.stringify(flat))
  // 그 판단이 옳았음을 숫자로 확인한다: 접어 봐야 배율이 그대로다.
  const s0 = scale(body(1024), { leftOpen: true, rightOpen: true }, LAND, 280)
  const s1 = scale(body(1024), { leftOpen: false, rightOpen: false }, LAND, 280)
  check(Math.abs(s1 - s0) < 0.005,
    '실제로 둘 다 접어 봐도 배율이 그대로다 (안 접은 판단이 옳다)',
    `${s0.toFixed(3)} → ${s1.toFixed(3)}`)
  // 반대로 키가 넉넉하면 같은 폭에서 접는다 — 높이만 보고 포기하는 게 아니다.
  const tall = at(1024, LAND, { stageH: 650 })
  check(!tall.leftOpen, '키가 넉넉한 같은 폭에서는 접는다 (높이만 보고 포기하지 않는다)')
}

// ── 6. 아직 안 그려졌으면 아무것도 정하지 않는다 ──
{
  const r = autoFold({ ...BASE, ...LAND, bodyW: 0 })
  check(r.leftOpen && r.rightOpen, '폭이 0 이면(첫 그림) 지금 상태를 그대로 둔다')
  const r2 = autoFold({ ...BASE, ...LAND, bodyW: 900, leftOpen: false, rightOpen: false })
  check(r2.leftOpen === false || r2.rightOpen === false, '접힌 상태로 시작해도 안 터진다')
}

// ── 7. 사람이 손댄 쪽은 자동이 못 건드린다 ────────
//
// 이건 함수 밖의 약속이라 **화면 코드에서 확인한다.**
{
  const ly = bare(read('./src/builder/Layout.tsx'))
  check(/touched\.current\.left = true/.test(ly) && /touched\.current\.right = true/.test(ly),
    '손잡이를 누르면 그 패널에 **손댐 표시**가 붙는다')
  check(/if \(!touched\.current\.left\) setLeftOpen/.test(ly)
     && /if \(!touched\.current\.right\) setRightOpen/.test(ly),
    '자동은 **손 안 댄 쪽만** 움직인다')

  // 되먹임 방지 — 접어도 안 변하는 값을 재야 한다.
  check(/bodyW: body\.getBoundingClientRect\(\)\.width/.test(ly),
    '무대가 아니라 `.ax-body` 의 폭을 잰다 — 접어도 안 변하는 값이라 되먹임이 없다')
  check(/ro\.observe\(body\); ro\.observe\(stage\)/.test(ly), '창이 바뀌면 다시 판단한다')
  check(/return \(\) => ro\.disconnect\(\)/.test(ly), '떠날 때 관찰을 끊는다')

  // 갱신 함수 안에서 다른 상태를 건드리지 않는다.
  check(!/setLeftOpen\(\([a-z]+\) => \{[\s\S]{0,200}setRightOpen/.test(ly),
    '갱신 함수 안에서 다른 상태를 건드리지 않는다 (두 번 불려도 같아야 한다)')

  // 접혔을 때 이름을 보여 준다 — 저절로 접히는 이상 이게 없으면 「어디 갔지」가 된다.
  check(/쪽 목록<\/em>/.test(ly) && /속성<\/em>/.test(ly),
    '접힌 손잡이가 **무엇이 접혔는지 이름을 보여 준다**')
  const css = bare(read('./src/builder/chrome.css'))
  check(/\.ax-edge\.named/.test(css), '그 탭의 모양이 있다')
  check(/writing-mode:vertical-rl/.test(css), '가장자리라 글자를 세워 쓴다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
