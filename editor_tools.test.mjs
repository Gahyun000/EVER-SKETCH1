// **편집기 도구가 제자리에 있는가.**
//
// 2026-09-16 · 사용자가 「EVER-SKETCH 기획·설계 사상」 12쪽을 손으로 만들 수 있는지
// 물었다. 재료는 다 넣을 수 있었다 — 막히는 것은 「그 색을 어디서 바꾸나」였다.
// 그 문서를 세어 보니 **채우기 56개 · 테두리 색 16개 · 칸 색 1개**를 쓰는데,
// 위 도구줄에는 **글자 색밖에** 없었다.
//
// 넷을 고쳤다.
//   ① 채우기·테두리를 도구줄로 — 하루에 수십 번 하는 일이 두 번째로 깊은 자리에 있었다
//   ② 보통 표에도 칸 색 — 기능이 없던 게 아니라 **가려져** 있었다
//   ③ 정렬 아이콘을 파워포인트·한글 그림으로 — 전에는 유니코드 **글자**였다
//   ④ 메뉴의 「삽입 → 도형」이 도형 팝업을 열게 — 사각형 하나만 넣고 있었다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs editor_tools.test.mjs
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
const menu = bare(read('./src/builder/chrome/MenuBar.tsx'))
const model = bare(read('./src/canvas/model.ts'))
const free = bare(read('./src/canvas/FreeLayer.tsx'))
const slots = bare(read('./src/template/slots.ts'))
const icons = bare(read('./src/ui/alignIcons.tsx'))

const { NO_FILL } = await import('./src/canvas/model.ts')
const { cellColors, CBG_FREE, cbgPalette } = await import('./src/template/slots.ts')
// JSX 가 든 파일은 검사 실행기가 못 읽는다 — 그래서 **말은 따로** 둔다.
const { ALIGN_LABEL, VALIGN_LABEL } = await import('./src/ui/alignLabels.ts')

// ── ① 채우기·테두리가 도구줄에 ────────────────────
check(/function FillTools/.test(tb), '도구줄에 채우기·테두리 묶음이 있다')
check(/<FillTools \/>/.test(tb), '그 묶음이 실제로 그려진다')
{
  const ft = tb.slice(tb.indexOf('function FillTools'))
  check(/patch\(\{ color: c \}\)/.test(ft), '채우기를 바꾼다')
  check(/patch\(\{ borderColor: c \}\)/.test(ft), '테두리 색을 바꾼다')
  check(/allowTransparent/.test(ft), '채우기는 **없앨 수도** 있다')
  check(/NO_FILL\.includes\(el\.type\)/.test(ft),
    '속이 없는 갈래에는 안 띄운다 — 그 판단을 제 손으로 안 한다')
}
// **목록이 한 벌이어야 한다.** 캔버스와 도구줄이 각자 들면 한쪽에서만 칠해지는 갈래가 생긴다.
check(/export const NO_FILL/.test(model), 'NO_FILL 을 한 군데서 정한다')
check(!/const NO_FILL = \[/.test(free), '캔버스가 제 목록을 따로 안 든다')
check(NO_FILL.includes('table') && NO_FILL.includes('text'),
  '표와 글상자는 채우기 대상이 아니다 (표는 칸마다 색이 따로다)')

// ── ② 보통 표에도 칸 색 ───────────────────────────
check(cellColors(undefined).length > 0, '양식 없는 표에도 쓸 색이 있다')
check(cellColors(undefined) === CBG_FREE || cellColors(undefined).join() === CBG_FREE.join(),
  '양식이 없으면 자유 색만')
{
  // 양식 표는 **양식 색이 먼저** 온다 — 앞의 몇은 상태를 가리키는 약속이라 자리가 뜻이다.
  const slot = Object.keys(JSON.parse(JSON.stringify({}))).length ? '' : 'SLOT-A'
  const p = cbgPalette(slot)
  if (p && p.length) {
    const all = cellColors(slot)
    check(all.slice(0, p.length).join() === p.join(), '양식 표는 양식 색이 앞에 선다')
    check(all.length > p.length, '그 뒤에 자유 색이 덧붙는다')
    check(new Set(all).size === all.length, '같은 색이 두 번 안 나온다')
  } else {
    check(false, 'SLOT-A 의 색 목록을 못 찾음')
  }
}
check(/cellColors\(slot\)/.test(rp), '화면이 그 답을 쓴다 — 제 손으로 안 가른다')
check(!/canCbg && palette \?/.test(rp),
  '양식이 없다고 묶음이 통째로 사라지지 않는다 (그게 「길이 없던」 까닭이다)')
check(/es-cbg-more/.test(rp), '목록에 없는 색도 고를 수 있다')
check(/t=\{palette \? '진행 표시 · 칸 색' : '칸 색'\}/.test(rp),
  '이름이 표에 따라 다르다 — 양식 표의 앞 색들은 **상태를 가리키는 약속**이다')

// ── ③ 정렬은 글자가 아니라 그림 ───────────────────
check(/export function AlignIcon/.test(icons) && /export function VAlignIcon/.test(icons),
  '정렬 아이콘이 그림이다')
check(/<svg/.test(icons) && /<rect/.test(icons), '실제로 SVG 를 그린다')
for (const [where, src] of [['도구줄', tb], ['표 패널', rp]]) {
  check(/AlignIcon/.test(src), `${where}: 그 그림을 쓴다`)
  check(!/['"`]⇤['"`]|['"`]⇔['"`]|['"`]⇥['"`]|['"`]⤒['"`]|['"`]⇕['"`]|['"`]⤓['"`]/.test(src),
    `${where}: 유니코드 글자가 안 남아 있다`)
}
// **말도 맞춘다.** 「세로 가운데」는 한글·파워포인트에서 「가운데 맞춤」이다.
check(VALIGN_LABEL.middle === '가운데 맞춤', '「세로 가운데」가 아니라 「가운데 맞춤」')
check(ALIGN_LABEL.center === '가운데 맞춤', '가로도 같은 말을 쓴다')
check(!/세로 가운데/.test(rp), '옛 말이 안 남아 있다')

// ── ④ 삽입 메뉴가 도형 팝업을 연다 ────────────────
check(/emit\('ebook:pick-shape'\)/.test(menu), '메뉴가 팝업을 부른다')
check(!/tool\('box'\)/.test(menu), '사각형 하나만 넣던 길이 없다')
check(/'ebook:pick-shape'/.test(tb) && /addEventListener\('ebook:pick-shape'/.test(tb),
  '도구줄이 그 부름을 받는다')
check(/removeEventListener\('ebook:pick-shape'/.test(tb), '떠날 때 귀를 닫는다')
// 목록을 메뉴에 복사하지 않는다 — 두 벌이 되면 도형을 하나 더할 때 한쪽만 는다.
check(!/diamond|hexagon|parallelogram/.test(menu), '도형 목록이 메뉴에 복사돼 있지 않다')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
