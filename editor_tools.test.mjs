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
import { readFileSync, existsSync } from 'node:fs'

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
const cp = bare(read('./src/builder/chrome/ColorPicker.tsx'))

const { NO_FILL } = await import('./src/canvas/model.ts')
const { cellColors, CBG_FREE, cbgPalette } = await import('./src/template/slots.ts')
// JSX 가 든 파일은 검사 실행기가 못 읽는다 — 그래서 **말은 따로** 둔다.
const { ALIGN_LABEL, VALIGN_LABEL } = await import('./src/ui/alignLabels.ts')

// ── ① 채우기·테두리가 도구줄에 ────────────────────
//
// **2026-09-16(둘째) · `FillTools` 라는 이름이 없어졌다.** 사용자가 「파워포인트는
// 채우기·테두리·글씨 색이 나눠져 있다」고 해서, 한 묶음에 들어 있던 것을 **이름 붙은 셋**
// 으로 쪼갰다(`InkTools` / `InkBtn`). 이 검사는 옛 이름을 그대로 박아 두어 깨졌으므로
// **지우지 않고 새 모양으로 고쳐 쓴다** — 지키려던 것(도구줄에서 채우기·테두리를
// 바꿀 수 있고, 속 없는 갈래에는 안 뜬다)은 그대로 본다. 자세한 것은 toolbar_ink.test.mjs.
check(/function InkTools/.test(tb), '도구줄에 채우기·테두리 묶음이 있다')
check(/<InkTools \/>/.test(tb), '그 묶음이 실제로 그려진다')
{
  const ft = tb.slice(tb.indexOf('function InkTools'))
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
check(/t=\{palette \? '진행 표시 · 채우기' : '채우기'\}/.test(rp),
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

// ── ⑤ 표 채우기도 도구줄에서 ────────────────────
//
// 2026-09-16 · ②를 하고 나서 사용자가 「표도 상단에서 가능하게」라고 했다. 맞는 말이다:
// 도형은 도구줄에서 바로 칠하는데 표만 오른쪽 패널을 열어야 하면, 같은 일을 하는 길이
// 둘로 갈라진다. 표는 요소 하나가 아니라 **고른 칸 범위**에 칠하므로 채우기(`NO_FILL`)
// 옆이 아니라 **표 도구 옆** — 병합과 같은 「고른 칸에 하는 일」 자리에 둔다.
//
// 그다음 사용자가 또 물었다 — 「표는 채우기가 아니라 칸 색으로 따로 뺀 거냐」.
// 이름이 갈려 있으니 나온 물음이다. **이름을 「채우기」로 맞췄다.** 그림만 표 칸 모양으로
// 남긴다 — 무엇에 칠하는지는 그림이 말한다.
//
// **「칸을 안 골랐으면 표 전체」는 넣지 않기로 했다**(사용자 판단). 한 번 그렇게 가기로
// 했다가 물렀다: 칠하는 규칙은 「끌어 고른 데를 칠한다」 하나로 족하고, 표 전체는 왼쪽
// 위에서 오른쪽 아래까지 끌면 된다. 규칙을 하나 더 만들면 「머리글도 덮나」가 딸려 온다.
{
  const tt = tb.slice(tb.indexOf('function TableTools'), tb.indexOf('export default function EditToolbar'))
  check(tt.length > 100, '표 도구 묶음을 찾았다')
  check(/<span className="lab">채우기<\/span>/.test(tt), '도구줄 표 묶음 이름이 「채우기」다')
  check(!/className="lab">칸 색/.test(tt), '옛 이름 「칸 색」이 도구줄에 안 남아 있다')
  // **있다고만 보면 안 된다** — 2026-09-16, 묶음을 `{false ? (` 로 꺼 보니
  // 이 검사가 그대로 통과했다. 글자는 파일에 남아 있는데 화면엔 안 나온다.
  // 그래서 **실제로 그려지는 자리**를 본다: `canCbg` 로 갈라진 바로 그 안이어야 한다.
  check(/\{canCbg \? \([\s\S]{0,400}채우기/.test(tt), '그 묶음이 실제로 그려진다')
  check(/setCellBgRange\(table,/.test(tt), '고른 칸 범위에 칠한다')
  // 마찬가지로, 범위를 한 칸으로 줄여 보니 통과했다 — **지우는 줄**이 대신 걸렸던 것이다.
  // 칠하는 줄(`, c)`)과 지우는 줄(`, null)`)을 따로 못 박는다.
  check(/setCellBgRange\(table, ts\.r0, ts\.c0, ts\.r1, ts\.c1, c\)/.test(tt),
    '한 칸이 아니라 끌어 고른 범위 전체를 칠한다')
  // **칠하는 길과 지우는 길은 짝이다.** 칸 채우기는 「없음」이 정상 상태라, 지우는 길이
  // 없으면 한 번 칠한 칸을 되돌릴 수 없다.
  check(/onClear=/.test(tt), '지우는 길이 같이 있다')
  check(/setCellBgRange\(table, ts\.r0, ts\.c0, ts\.r1, ts\.c1, null\)/.test(tt),
    '지우기도 고른 범위 전체를 null 로 지운다')
  // 칸을 안 고르면 칠할 대상이 없다 — 막되, **감추지 않는다**.
  check(/disabled=\{!ts\}/.test(tt), '칸을 안 골랐으면 못 누른다')
  check(/cbgWhy/.test(tt), '왜 못 누르는지 말해 준다')
  // 판단을 두 번 적지 않는다: 쓸 수 있는지도, 색 목록도 슬롯 정책 한 곳에서 온다.
  check(/slotAllows\(table\.slot, 'cbg'\)/.test(tt), '양식이 막은 표에서는 안 뜬다')
  check(/cellColors\(table\.slot\)/.test(tt), '색 목록을 제 손으로 적지 않는다')
  check(!/#[0-9A-Fa-f]{6}/.test(tt), '색을 도구줄에 직접 박아 두지 않았다')
  // 양식 표의 앞 색은 **뜻**이다. 그 이름이 고르개에 같이 가야 한다.
  check(/titles: CBG_LABEL/.test(tt), '양식 색 이름을 같이 보낸다')
  check(/진행 표시 · 채우기/.test(tt), '양식 표에서는 「진행 표시 · 채우기」로 읽힌다')
  // **칸을 안 골랐을 때 표 전체로 번지지 않는다.** 규칙은 「끌어 고른 데를 칠한다」 하나다.
  check(/disabled=\{!ts\}/.test(tt) && !/표 전체/.test(tt),
    '칸을 안 골랐으면 잠긴다 — 표 전체로 번지는 길이 없다')
}
// 패널과 도구줄이 **같은 함수**를 쓴다 — 한쪽만 고쳐지는 일을 막는다.
check(/setCellBgRange/.test(rp) && /setCellBgRange/.test(tb), '패널과 도구줄이 같은 길로 칠한다')
check(/cellColors\(/.test(rp) && /cellColors\(/.test(tb), '색 목록도 같은 데서 온다')

// 고르개가 「이 자리에서 쓰는 색」을 맨 위에 따로 깐다 — 일반 팔레트는 그대로 남는다.
check(/head\?:/.test(cp), '고르개가 앞줄을 받는다')
check(/head\.colors\.map/.test(cp), '그 색들을 그린다')
check(/head\.titles/.test(cp), '이름도 같이 보여 준다')
check(/팔레트/.test(cp), '일반 팔레트를 없애지 않았다')
check(/onClear/.test(cp) && /색 지우기/.test(cp), '지우는 단추가 있다')
check(/disabled=\{disabled\}/.test(cp), '못 쓰는 상태를 받는다')
{
  // 앞줄이 팔레트보다 **위**에 있어야 한다. 아래로 밀리면 약속된 색이 안 보인다.
  const iHead = cp.indexOf('head.colors.map')
  const iPal = cp.indexOf('PALETTE.map')
  check(iHead > 0 && iPal > 0 && iHead < iPal, '앞줄이 일반 팔레트보다 위에 있다')
}

// ── ⑤ 「도움말」 메뉴를 걷어낸 자리 ──────────────────────
//
// 2026-09-17 · 사용자 지시로 메뉴바의 **도움말 메뉴**를 지웠다. 두 항목뿐이었고
// 하나는 보기 메뉴·F1 에 이미 있었다. 다른 하나(30초 시연)는 여기가 유일한 입구라
// 함께 걷어냈다.
//
// **지우는 일에는 두 가지 사고가 따라붙는다.** 이 칸은 그 둘을 본다.
//   ① **너무 많이 지우기** — 도움말 창까지 못 열게 되는 것. 보기 ▸ 도움말 과 F1 이
//      살아 있어야 한다. 지울 때 남겨야 할 것을 적어 두지 않으면 다음 사람이 마저 지운다.
//   ② **덜 지우기** — 화면에서만 빼고 코드·CSS·prop 을 남겨 두는 것. 아무 오류도
//      안 나고, 다음 사람은 그게 살아 있는 기능인 줄 안다.
{
  const lay = bare(read('./src/builder/Layout.tsx'))
  const hk = bare(read('./src/builder/Hotkeys.tsx'))
  const css = read('./src/index.css')

  // ① 남겨야 할 길 — 여기가 무너지면 도움말을 **아예 못 연다**.
  check(/\{ label: '도움말', run: onHelp \}/.test(menu),
    '**보기 메뉴의 「도움말」은 남아 있다** — 도움말 창으로 가는 길이 이것과 F1 뿐이다')
  check(/'F1'[\s\S]{0,60}onHelp\(\)/.test(hk), '**F1 도 그대로 연다**')
  check(/<Help open=\{help\}/.test(lay), '도움말 창 자체는 살아 있다')

  // ② 지운 것이 **정말로** 지워졌나
  check(!/\{ label: '도움말', items: \[/.test(menu),
    '메뉴바에 **「도움말」 메뉴가 없다**(항목이 아니라 메뉴)')
  check(!/30초 시연/.test(menu), '「▶ 튜토리얼 (30초 시연)」 항목이 없다')
  check(!/onTutorial/.test(menu) && !/onTutorial/.test(lay),
    '**넘기던 prop 도 같이 걷었다** — 남겨 두면 안 불리는 손잡이가 신호처럼 보인다')
  check(!/TutorialPlayer/.test(lay) && !existsSync('./src/builder/TutorialPlayer.tsx'),
    '시연 컴포넌트가 **파일째** 없다 — 화면에서만 빼면 다음 사람은 살아 있는 줄 안다')
  check(!/^\.tutp/m.test(css), '그 컴포넌트만 쓰던 CSS(.tutp*)도 없다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
