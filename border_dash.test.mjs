// **테두리 선 모양 — 실선 · 파선 · 점선.**
//
// 2026-09-16 · 사용자: 「테두리는 점선 실선 이런 거 가능」. 여기는 늘 실선이었다.
// 점선은 **연결선에만** 있었고(패널의 체크상자), 도형과 표에는 없었다.
//
// 2차를 쪼개 **쉬운 것부터** 한다 — 사각형·둥근 사각형·표는 상자에 테두리를 그리므로
// `border-style` 한 줄이면 된다. 오려 만든 갈래(마름모·삼각형 …)는 **테두리 자체가
// 안 그려진다** — 오릴 때 테두리도 같이 잘린다. 그건 SVG 로 다시 그려야 하는 일이라
// 따로 두되, **말이라도 해 준다**: 조용히 안 먹는 것보다 낫다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs border_dash.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const tb = bare(read('./src/builder/chrome/EditToolbar.tsx'))
const rp = bare(read('./src/builder/chrome/RightPanel.tsx'))
const fl = bare(read('./src/canvas/FreeLayer.tsx'))
const store = read('./src/state/store.ts')
const indexCss = read('./src/index.css')
const { CLIPPED, NO_FILL } = await import('./src/canvas/model.ts')

// ── ① 자료에 자리가 있다 ─────────────────────────────
check(/borderDash\?: 'solid' \| 'dashed' \| 'dotted'/.test(store), '요소에 선 모양 자리가 있다')
// 연결선은 예전부터 `dash` 를 켜고 끄는 두 갈래다. 도형은 셋이라 **이름을 따로 둔다** —
// 같은 이름으로 합치면 한쪽을 고칠 때 다른 쪽이 딸려 온다.
check(/dash\?: boolean/.test(store), '연결선의 켜고 끄기는 그대로 둔다')

// ── ② 화면이 그린다 ─────────────────────────────────
check(/if \(el\.borderDash\) style\.borderStyle = el\.borderDash/.test(fl), '도형에 선 모양을 입힌다')
check(/\(el\.borderDash \|\| 'solid'\)/.test(fl), '표 칸에도 입힌다')
// **안 적혀 있으면 실선.** 옛 자료가 그대로 보여야 한다.
check(/borderDash \|\| 'solid'/.test(fl), '안 적혀 있으면 실선이다')

// ── ③ 도구줄에서 고른다 ─────────────────────────────
{
  const ink = tb.slice(tb.indexOf('function InkTools'))
  check(/\['solid', 'dashed', 'dotted'\] as const/.test(ink), '세 갈래를 고를 수 있다')
  check(/patch\(\{ borderDash: d \}\)/.test(ink), '고르면 그 값이 들어간다')
  check(/<DashIcon kind=\{d\} \/>/.test(ink), '글자가 아니라 **그림**으로 보여 준다')
  check(/DASH_LABEL\[d\]/.test(ink), '이름은 한 곳에서 온다')
}
check(/solid: '실선', dashed: '파선', dotted: '점선'/.test(tb), '실선 · 파선 · 점선')
// 그림이 진짜 다른 모양이어야 한다 — 셋 다 같은 선이면 고를 이유가 없다.
check(/dashed: '5 3', dotted: '1.5 2.5'/.test(tb), '파선과 점선이 서로 다른 그림이다')
check(/solid: undefined/.test(tb), '실선은 끊지 않는다')

// ── ④ 패널에서도 고른다 — 도형도 표도 ────────────────
{
  const n = (rp.match(/borderDash: e\.target\.value as 'solid' \| 'dashed' \| 'dotted'/g) || []).length
  check(n === 2, '패널에도 두 자리(도형 · 표)에 있다', n + '곳')
  check(/patchTable\(\{ borderDash/.test(rp), '표는 표 고치는 길로 들어간다')
}

// ── ⑤ 오려 만든 갈래도 이제 그린다 ────────────────────
//
// **2026-09-16(셋째) · 안내 문구를 지웠다.** 「이 도형은 아직 테두리가 안 그려져요」는
// 못 하는 동안만 옳은 말이었다. 꼭짓점을 shapePaths.ts 로 옮겨 상자를 오리고 그 위에
// 선을 그리게 하면서 **되게 됐으므로**, 그 말을 남겨 두면 그게 거짓말이 된다.
// 이 검사도 「안내가 있다」를 보던 것이라 **지우지 않고 뒤집어 쓴다** —
// 이제는 「선을 그린다」와 「거짓말이 안 남아 있다」를 본다. (자세한 것은 shape_outline.test.mjs)
check(Array.isArray(CLIPPED) && CLIPPED.length === 14, '오려 만든 갈래가 열넷이다', String(CLIPPED.length))
check(/className="fel-outline"/.test(fl), '오려 만든 갈래 **위에 선을 그린다**')
check(/CLIPPED\.includes\(el\.type\)/.test(fl), '화면이 그 목록을 보고 가른다')
check(!/테두리가 안 그려져요|테두리가 아직 안 그려집니다/.test(tb + rp),
  '못 한다던 안내가 안 남아 있다 — 이제 그려진다')

// ── ⑥ 오리는 규칙이 **한 벌만** 있는가 ──────────────────
//
// 전에는 index.css 가 오리고 목록은 따로 있어서, 둘이 어긋나면 「안 그려지는데
// 안 그려진다고 말도 안 하는」 도형이 생겼다. 지금은 꼭짓점 한 곳에서 **오리고 또 그린다** —
// CSS 에 옛 규칙이 남아 있으면 모양과 선이 서로 다른 데를 가리킨다.
{
  const inCss = [...indexCss.matchAll(/\.([A-Za-z0-9]+)\s*\{\s*clip-path/g)].map((m) => m[1])
  const left = [...new Set(inCss)].filter((k) => CLIPPED.includes(k))
  check(left.length === 0, '**CSS 에 옛 오리는 규칙이 안 남아 있다**', left.join(' '))
  check(/\.fel-outline\{/.test(indexCss), '선을 얹을 자리는 CSS 에 있다')
}
// 글상자는 원래 테두리를 투명으로 두는 갈래라 여기 끼면 안 된다 — 성질이 다르다.
check(!CLIPPED.includes('text'), '글상자는 오려 만드는 갈래가 아니다')
check(NO_FILL.includes('text'), '글상자는 채우기 대상이 아니다 (전과 같다)')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
