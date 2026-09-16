// **화면 부품을 다른 부품 **안에서** 선언하지 않는다.**
//
// 2026-09-16 · 사용자가 영상 둘로 신고했다 — 오른쪽 패널에서 값을 하나 바꾸면
// **스크롤이 맨 위로 튀고, 치던 숫자 칸에서 손이 떨어진다.** ▲를 두 번 연달아
// 못 누르고, 「크기·자리」의 높이 칸에 숫자를 치다가도 위로 끌려 올라간다.
//
// 원인은 `RightPanel` 안에 선언된 접이식 묶음(`Acc`) 하나였다. 컴포넌트 함수 안에서
// 부품을 만들면 **그릴 때마다 새 타입**이 되고, 리액트는 「자리는 같은데 부품이
// 바뀌었다」고 보아 고쳐 그리는 대신 **통째로 버리고 새로 만든다.** 그러면
//
//   · 내용이 잠깐 비어 브라우저가 scrollTop 을 0 으로 깎는다 → 맨 위로 튄다
//   · 입력 칸이 새 DOM 노드가 된다 → 포커스가 날아간다
//
// 재현해서 재 봤다: 값 한 번 올리는 것만으로 scrollTop 286 → 0, 묶음 머리와
// 입력 칸이 전부 새 노드. 같은 잘못이 `FreeLayer` 의 지적 핀(`Pin`)에도 있었다 —
// 제 상태가 없어 눈에 띄는 탈은 없었지만 같이 밖으로 옮겼다.
//
// **이 검사는 그 잘못이 돌아오는 것을 막는다.** 들여쓴 자리에서 대문자 이름을
// 매어 두고, 그 이름을 `<이름 …>` 으로 쓰는 파일을 찾는다 — 그게 곧
// 「부품을 안에서 선언했다」는 뜻이다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs inner_component.test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** 들여쓴 자리에서 선언된, **부품으로 쓰이는** 대문자 이름들. */
function innerComponents(src) {
  const hits = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    // 들여쓰기가 있어야 한다 — 맨 바깥(칸 없음) 선언은 괜찮다.
    const m = /^(\s+)(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/.exec(lines[i])
    if (!m) continue
    const name = m[2]
    // **부품으로 쓰이는가.** `<이름 ` 또는 `<이름/>` 또는 `<이름>` 으로 쓰였으면 부품이다.
    // 값(색 목록·이름표 사전 …)은 여기 안 걸린다 — 그건 `<…>` 로 안 쓴다.
    if (new RegExp('<' + name + '[\\s/>]').test(src)) hits.push({ name, line: i + 1 })
  }
  return hits
}

const files = walk('./src')
check(files.length > 30, `.tsx 파일을 훑었다 (${files.length}개)`)

const bad = []
for (const f of files) {
  for (const h of innerComponents(readFileSync(f, 'utf8'))) bad.push(`${f}:${h.line} ${h.name}`)
}
check(bad.length === 0, '**부품을 다른 부품 안에서 선언한 곳이 없다**',
  bad.length ? bad.join(' , ') : '')

// ── 검사 자신이 눈이 멀지 않았는지 ────────────────────
// 위 검사가 늘 통과하면 지키는 게 없는 것과 같다. 옛 모양을 그대로 넣어 보고
// **잡히는지** 확인한다.
{
  const oldShape = [
    'export default function Panel() {',
    '  const Acc = ({ t }: { t: string }) => (<button>{t}</button>)',
    '  return <div><Acc t="칸" /></div>',
    '}',
  ].join('\n')
  check(innerComponents(oldShape).length === 1, '옛 모양(안에서 선언)을 넣으면 잡는다')

  const okShape = [
    'function Acc({ t }: { t: string }) { return <button>{t}</button> }',
    'export default function Panel() {',
    '  const LABEL = { a: 1 }',
    '  return <div><Acc t="칸" /></div>',
    '}',
  ].join('\n')
  check(innerComponents(okShape).length === 0, '바깥에 선언한 것과 그냥 값은 안 잡는다')
}

// ── 고친 자리가 실제로 그 모양인지 ────────────────────
const rp = readFileSync('./src/builder/chrome/RightPanel.tsx', 'utf8')
check(/^function Acc\(/m.test(rp), '접이식 묶음이 **파일 맨 바깥**에 있다')
check(!/^\s+const Acc\s*=/m.test(rp), '안에 다시 선언해 두지 않았다')
// 바깥으로 나갔으니 접힘 여부와 여닫는 길은 **값으로** 받아야 한다.
check(/sec: Record<Tab, boolean>/.test(rp), '접힘 여부를 값으로 받는다')
check(/onToggle: \(k: Tab\) => void/.test(rp), '여닫는 길도 값으로 받는다')
{
  const calls = rp.match(/<Acc /g) || []
  const wired = rp.match(/<Acc [^>]*sec=\{openSec\} onToggle=\{toggle\}>/g) || []
  check(calls.length > 0 && calls.length === wired.length,
    `묶음 ${calls.length}곳에 빠짐없이 넘겼다`, `넘긴 곳 ${wired.length}`)
}

const fl = readFileSync('./src/canvas/FreeLayer.tsx', 'utf8')
check(/^function Pin\(/m.test(fl), '지적 핀도 **파일 맨 바깥**에 있다')
check(!/^\s+const Pin\s*=/m.test(fl), '핀을 안에 다시 선언해 두지 않았다')
{
  const calls = fl.match(/<Pin /g) || []
  const wired = fl.match(/<Pin [^>]*focusId=\{cmtFocusId\} onFocus=\{cmtFocus\}/g) || []
  check(calls.length > 0 && calls.length === wired.length,
    `핀 ${calls.length}곳에 빠짐없이 넘겼다`, `넘긴 곳 ${wired.length}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
