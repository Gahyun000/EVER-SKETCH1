// **오려 만든 도형에도 테두리가 보인다.**
//
// 2026-09-16 · 마름모·삼각형 같은 모양은 네모 상자를 clip-path 로 **오려서** 만들었다.
// 그런데 오릴 때 **테두리도 같이 잘린다** — 색과 두께를 줘도 빗변에는 선이 안 생기고
// 꼭짓점에 자국만 남는다. 눈으로 확인한 뒤 한동안은 「아직 안 그려져요」라고 적어 뒀다.
//
// 이제 그린다. 방법은 하나다.
//   · 꼭짓점을 **글로 옮긴다**(shapePaths.ts) — 백분율 한 벌
//   · 같은 숫자로 **상자를 오리고**(polyClip), 그 위에 **선을 그린다**(polyPoints → SVG)
//   · 선은 **굵기를 두 배**로 그린다. 바깥 절반이 오리는 규칙에 잘려 딱 제 굵기만 남고,
//     선이 모양 안쪽에 정확히 붙는다 (SVG 에는 「안쪽 선」이 따로 없다)
//   · 상자 테두리는 **끈다** — 안 끄면 꼭짓점 자국이 그대로 남는다
//
// 꼭짓점이 **두 벌**이 되면 모양과 선이 서로 다른 데를 가리킨다. 그래서 CSS 의 옛 규칙은
// 뺐고, 화면도 갤러리 미리보기도 같은 곳에서 읽는다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs shape_outline.test.mjs
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
const tb = bare(read('./src/builder/chrome/EditToolbar.tsx'))
const model = read('./src/canvas/model.ts')
const { SHAPE_POLY, CLIPPED, SHAPE_RADIUS, polyClip, polyPoints, dashArray }
  = await import('./src/canvas/shapePaths.ts')

// ── ① 꼭짓점이 한 벌이다 ────────────────────────────
check(Object.keys(SHAPE_POLY).length === 14, '갈래가 열넷이다', String(Object.keys(SHAPE_POLY).length))
check(CLIPPED.join() === Object.keys(SHAPE_POLY).join(), '목록을 따로 적지 않는다 — 꼭짓점에서 나온다')
check(/export \{ CLIPPED \} from '\.\/shapePaths'/.test(model), 'model 은 그것을 그대로 내보낸다')
for (const [k, p] of Object.entries(SHAPE_POLY)) {
  check(p.length >= 3, `${k}: 꼭짓점이 셋 이상이다`)
  check(p.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100), `${k}: 상자 안에 있다`)
}

// ── ② 오리기와 그리기가 **같은 숫자**를 쓴다 ───────────
check(polyClip('diamond') === 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)', '오리는 규칙을 만든다')
check(polyClip('없는갈래') === undefined, '모르는 갈래는 안 오린다')
// 백분율을 px 로 환산한다 — **가로세로 비가 달라도 선 굵기가 같아야** 하기 때문이다.
check(polyPoints('diamond', 200, 100) === '100,0 200,50 100,100 0,50', '상자 크기로 환산한다')
check(polyPoints('diamond', 100, 100) === '50,0 100,50 50,100 0,50', '정사각형에서도 맞는다')
{
  // 같은 꼭짓점을 쓰는지 **직접 맞대 본다.** 하나를 고치면 다른 하나도 같이 움직여야 한다.
  const w = 300, h = 140
  for (const k of CLIPPED) {
    const fromClip = polyClip(k).slice(8, -1).split(',')
      .map((s) => s.trim().split(/\s+/).map((v) => parseFloat(v)))
    const fromPts = polyPoints(k, w, h).split(' ').map((s) => s.split(',').map(Number))
    const same = fromClip.length === fromPts.length && fromClip.every(([x, y], i) =>
      Math.abs(x * w / 100 - fromPts[i][0]) < 1e-9 && Math.abs(y * h / 100 - fromPts[i][1]) < 1e-9)
    check(same, `${k}: 오리는 자리와 그리는 자리가 같다`)
  }
}
check(SHAPE_RADIUS.callout === 8, '말풍선만 모서리를 둥글게 남긴다')

// ── ③ 선 모양은 굵기에 맞춰 끊는다 ───────────────────
check(dashArray('solid', 2) === undefined, '실선은 안 끊는다')
check(dashArray(undefined, 2) === undefined, '안 적혀 있어도 실선이다')
{
  const a = dashArray('dashed', 1), b = dashArray('dashed', 3)
  check(a !== b, '굵기가 다르면 끊는 길이도 다르다', a + ' / ' + b)
  check(parseFloat(b) > parseFloat(a), '굵을수록 길게 끊는다')
  check(dashArray('dotted', 2) !== dashArray('dashed', 2), '점선과 파선이 다르다')
}

// ── ④ 화면이 그대로 한다 ────────────────────────────
check(/style\.clipPath = polyClip\(el\.type\)/.test(fl), '상자를 그 규칙으로 오린다')
check(/style\.borderWidth = 0/.test(fl), '상자 테두리를 끈다 — 안 끄면 꼭짓점 자국이 남는다')
check(/style\.borderRadius = SHAPE_RADIUS\[el\.type\] \?\? 0/.test(fl), '남길 둥글기도 같은 곳에서 온다')
check(/className="fel-outline"/.test(fl), '그 위에 선을 얹는다')
check(/polyPoints\(el\.type, el\.w, el\.h\)/.test(fl), '선도 같은 꼭짓점으로 그린다')
// **굵기 두 배**가 이 방법의 핵심이다. 한 배로 그리면 바깥 절반이 잘려 선이 반만 남는다.
check(/strokeWidth=\{\(el\.borderWidth \?\? 1\.5\) \* 2\}/.test(fl), '굵기를 두 배로 그린다(바깥 절반은 잘린다)')
check(/strokeDasharray=\{dashArray\(el\.borderDash/.test(fl), '선 모양도 따라간다')
check(/\(el\.borderWidth \?\? 1\.5\) > 0 \?/.test(fl), '두께가 「없음」이면 선을 안 그린다')

// ── ⑤ 갤러리 미리보기도 같은 곳에서 읽는다 ─────────────
check(/clipPath: polyClip\(sh\.t\)/.test(tb), '미리보기도 같은 규칙으로 오린다')
check(/borderRadius: SHAPE_RADIUS\[sh\.t\]/.test(tb), '둥글기도 같이 읽는다')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
