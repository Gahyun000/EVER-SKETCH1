// **칸 크기 조절 — 이미 되고 있었다. 안 보였을 뿐이다.**
//
// 2026-09-16 · 사용자: 「셀들은 사이즈 조정 가능하게」. 제가 시안에 「슬롯 정책에 막혀
// 있습니다」라고 적었는데 **틀린 말이었다.** 실제로 재 보니
//
//     ① 로드맵    열 손잡이 17 · 행 손잡이 6 → 끌면 너비가 바뀐다
//     ② 진행현황  열 손잡이 1(2열이라 경계가 하나) · 행 4 → 바뀐다
//     ③ 이슈      열 손잡이 0(1열이라 경계가 없다) · 행 4
//
// 손잡이를 그리는 자리는 `slotAllows` 를 **보지도 않는다.** 표준 양식에서도 막힌 적이 없다.
// 진짜 문제는 그 띠가 **3px 짜리 옅은 선**으로 표 밖 14px 에 서 있어 아무도 못 찾는 것이었다.
//
// 그래서 고친 것은 **보이게** 한 것뿐이다. 이 검사는 그와 함께, 되던 것이
// **조용히 막히는 일**을 막는다 — 나중에 누가 「슬롯이면 크기도 잠그자」를 넣으면 잡는다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs cell_resize.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const fl = bare(read('./src/canvas/FreeLayer.tsx'))
const css = read('./src/index.css')
const { dragTrack, trackSizes } = await import('./src/canvas/tableOps.ts')

// ── ① 손잡이가 표준 양식에서도 나온다 ────────────────
{
  const i = fl.indexOf('const cw = trackSizes(se.colw, C)')
  check(i > 0, '열·행 손잡이를 그리는 자리를 찾았다')
  const blk = fl.slice(Math.max(0, i - 1500), i + 1200)
  check(/trk-grip trk-col/.test(blk) && /trk-grip trk-row/.test(blk), '열과 행 둘 다 그린다')
  // **슬롯을 보지 않는다.** 여기서 슬롯을 따지기 시작하면 표준 양식만 조용히 막힌다.
  check(!/slotAllows/.test(blk), '슬롯 정책을 보지 않는다 — 표준 양식도 크기를 바꾼다')
  check(!/isSlotEl/.test(blk), '슬롯인지도 따지지 않는다')
}

// ── ② 크기만 바꾸고 **열 수는 안 바꾼다** ─────────────
{
  const i = fl.indexOf('function onTrackDown')
  const blk = fl.slice(i, i + 900)
  check(/\{ colw: next \} : \{ rowh: next \}/.test(blk), '너비·높이만 고친다')
  check(!/cols:/.test(blk) && !/rows:/.test(blk), '**열·행 수는 안 건드린다** — 그게 취합을 깨뜨리는 것이다')
  check(/if \(!did\) \{ snap\(\); did = true \}/.test(blk),
    '한 번 끄는 동안 되돌릴 자리는 **한 번만** 찍는다')
}

// ── ③ 끌어도 표 전체 너비는 그대로 ──────────────────
// 옆 칸에서 덜어 이 칸에 준다. 전체가 늘면 표가 종이 밖으로 나간다.
{
  const base = trackSizes(undefined, 4)
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const before = sum(base)
  for (const d of [30, -30, 500, -500]) {
    const out = dragTrack(base, 1, d, 400)
    check(Math.abs(sum(out) - before) < 1e-9, `${d}px 끌어도 전체 너비가 그대로다`,
      before + ' → ' + sum(out))
    check(out.length === base.length, `${d}px 끌어도 칸 수가 그대로다`)
    check(out.every((v) => v > 0), `${d}px 끌어도 0 이하로 찌그러지는 칸이 없다`)
  }
  // 경계가 아닌 자리는 건드리지 않는다(마지막 칸 오른쪽에는 경계가 없다).
  check(dragTrack(base, 3, 30, 400) === base, '없는 경계를 끌면 아무 일도 없다')
  check(dragTrack(base, -1, 30, 400) === base, '앞쪽 밖도 마찬가지다')
}

// ── ④ 보이게 했다 ──────────────────────────────────
{
  const i = css.indexOf('.trk-grip::before')
  const blk = css.slice(i, i + 260)
  const m = /opacity:([.\d]+)/.exec(blk)
  check(!!m && parseFloat(m[1]) >= 0.5, '평소에도 **쥘 수 있게** 보인다', m ? m[1] : '못 찾음')
  check(/box-shadow:0 0 0 1px rgba\(255,255,255/.test(blk),
    '흰 테를 둘러 노란 머리글 위에서도 보인다')
  check(/\.trk-grip:hover::before\{opacity:1\}/.test(css), '올리면 또렷해진다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
