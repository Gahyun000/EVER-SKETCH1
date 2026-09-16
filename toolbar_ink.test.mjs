// **도구줄의 색 — 글자 색 · 채우기 · 테두리를 이름 붙여 나눈다.**
//
// 2026-09-16 · 사용자: 「보통 파워포인트 보면 채우기, 테두리, 글씨 색상 나눠져 있고…」
// 맞는 말이었다. 여기는 글자 색이 **이름 없는 점 여섯**이라 그 여섯 말고 다른 색은
// 오른쪽 패널을 열어야 했고, 채우기·테두리는 「색」 하나에 묶여 눌러 봐야 어느 쪽인지
// 알았다. 테두리 두께는 아예 패널에만 있었다.
//
// 파워포인트를 그대로 따른다.
//   · 셋이 각각 **이름 붙은 단추**이고, 단추 밑에 지금 색이 **띠**로 보인다
//   · 그냥 누르면 **띠에 보이는 그 색**이 칠해지고, ▾ 를 눌러야 팔레트가 열린다
//     — 색을 새로 고르는 일보다 **같은 색을 여러 번 쓰는 일**이 훨씬 잦아서다
//   · 그래서 색은 **역할마다 하나씩 기억**한다(inkText · inkFill · inkBorder)
//
// 함께: 표 테두리에 「없음」(도형은 되는데 표만 안 됐다), 좁으면 이름표 접기.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs toolbar_ink.test.mjs
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
const cp = bare(read('./src/builder/chrome/ColorPicker.tsx'))
const ui = bare(read('./src/state/canvasUI.ts'))
const css = read('./src/builder/chrome.css')

// ── ① 셋으로 나뉘고 이름이 붙었다 ────────────────────
for (const name of ['글자 색', '채우기', '테두리']) {
  check(new RegExp('<InkBtn label="' + name + '"').test(tb), `도구줄에 「${name}」 단추가 있다`)
}
check(/function InkBtn\(/.test(tb), '색 단추가 한 곳에서 만들어진다 — 셋이 같은 모양이다')
check(/<InkTools \/>/.test(tb) && /<FontTools \/>/.test(tb), '글자 도구와 색 도구가 따로 그려진다')
// **묶음이 각자 제 상자다.** 하나에 뭉쳐 두면 이름을 붙여도 어디까지가 무엇인지 안 보인다.
{
  const ink = tb.slice(tb.indexOf('function InkBtn'))
  check(/className="ax-grp gs"/.test(ink.slice(0, 900)), '색 단추마다 제 묶음을 갖는다')
  check(/className="lab"/.test(ink.slice(0, 900)), '묶음에 이름표가 붙는다')
}

// ── ② 띠 + 한 번 눌러 칠하기 ─────────────────────────
check(/className="ax-inkbar"/.test(tb), '단추 밑에 지금 색 띠가 있다')
check(/\.ax-inkbar\s*\{/.test(css), '그 띠에 모양이 있다')
{
  const ink = tb.slice(tb.indexOf('function InkTools'))
  // 그냥 누르면 **기억한 색**을 칠한다. 고른 것의 색을 다시 칠하면 아무 일도 안 일어난다.
  check(/onApply=\{\(\) => patch\(\{ tcolor: inkText \}\)\}/.test(ink), '글자 색: 눌러서 기억한 색을 칠한다')
  check(/onApply=\{\(\) => patch\(\{ color: inkFill \}\)\}/.test(ink), '채우기: 눌러서 기억한 색을 칠한다')
  check(/onApply=\{\(\) => patch\(\{ borderColor: inkBorder \}\)\}/.test(ink), '테두리: 눌러서 기억한 색을 칠한다')
  // 고르개로 고르면 **칠하고 기억도 바꾼다.** 하나만 하면 다음에 누를 때 옛 색이 나온다.
  for (const [role, field] of [['text', 'tcolor'], ['fill', 'color'], ['border', 'borderColor']]) {
    check(new RegExp("setInk\\('" + role + "', c\\); patch\\(\\{ " + field + ": c \\}\\)").test(ink),
      `${role}: 고르면 칠하고 기억도 바꾼다`)
  }
}
check(/inkText: string/.test(ui) && /inkFill: string/.test(ui) && /inkBorder: string/.test(ui),
  '기억하는 자리가 셋이다')
check(/setInk: \(role: InkRole, c: string\) => void/.test(ui), '역할을 받아 기억한다')
check(/role === 'text' \? \{ inkText: c \} : role === 'fill' \? \{ inkFill: c \} : \{ inkBorder: c \}/.test(ui),
  '세 자리가 서로 안 섞인다')

// ── ③ ▾ 는 고르개만 연다 ─────────────────────────────
check(/caret\?: boolean/.test(cp), '고르개가 ▾ 모양을 받는다')
check(/cp-trig cp-caret/.test(cp), '▾ 단추를 따로 그린다')
check(/caret title=/.test(tb) || /caret /.test(tb), '도구줄이 그 모양으로 쓴다')
check(/\.cp-trig\.cp-caret\s*\{/.test(css), '▾ 에 모양이 있다')

// ── ④ 테두리 두께가 도구줄에 ─────────────────────────
{
  const ink = tb.slice(tb.indexOf('function InkTools'))
  check(/title="테두리 두께"/.test(ink), '두께 고르개가 도구줄에 있다')
  for (const w of ['없음', '얇게', '보통', '굵게']) {
    check(new RegExp('>' + w + '</option>').test(ink), `두께 「${w}」`)
  }
}

// ── ⑤ 표 테두리에도 「없음」 ──────────────────────────
{
  const i = rp.indexOf('patchTable({ borderWidth')
  const blk = rp.slice(Math.max(0, i - 200), i + 400)
  check(/<option value=\{0\}>없음<\/option>/.test(blk), '표 테두리에 「없음」이 있다')
  check(/<option value=\{0.5\}>얇게/.test(blk), '얇게·보통·굵게는 그대로다')
}

// ── ⑥ 좁으면 이름표만 접는다 ─────────────────────────
//
// **자바스크립트로 「넘치면」을 재지 않는다.** 이름을 숨기면 폭이 줄어 다시 들어가고,
// 들어가면 이름을 도로 띄우다가 또 넘친다 — 껐다 켰다가 멈추지 않는다.
// 컨테이너 질의는 줄 자신의 폭만 보므로 그런 진동이 없다.
check(/\.ax-tbrow\s*\{\s*container-type:\s*inline-size/.test(css), '도구줄이 제 폭을 잰다')
check(/@container \(max-width: \d+px\)/.test(css), '좁아지는 자리를 CSS 가 안다')
{
  const i = css.indexOf('@container (max-width')
  const blk = css.slice(i, i + 200)
  check(/\.lab \{ display: none/.test(blk), '좁으면 이름표를 숨긴다')
  check(!/\.ib|button/.test(blk), '단추는 안 숨긴다 — 쓸 수 있는 도구가 줄면 안 된다')
}
check(!/ResizeObserver/.test(tb), '재서 껐다 켜지 않는다 (진동이 안 생긴다)')
// 이름표를 숨겨도 **이름은 남아야** 한다 — 올려 보면 뜬다.
check(/<span className="ax-grp gs" title=\{label\}>/.test(tb), '숨겨도 올려 보면 이름이 뜬다')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
