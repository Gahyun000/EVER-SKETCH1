// 뜬창은 `.ax-app` **밖**에 뜬다 — 색 이름이 거기까지 닿는지 지킨다.
//
// **왜 생겼나.** 2026-09-14, 사용자가 「펼치기 (5개) 선택이 어디있어」라고 물었다.
// 단추는 DOM 에 **있었다.** 눈에만 안 보였다.
//
//   `.cpk-pop` 은 `createPortal(..., document.body)` 로 나간다 → `.ax-app` 의 자손이 아니다
//   → `.ax-app{--ax-blue:…}` 를 물려받지 못한다
//   → `.cpk-mmgo{background:var(--ax-blue); color:#fff}` 에서 `var()` 가 빈값
//   → **그 줄 하나가 아니라 `background` 선언 전체가 무효**(invalid at computed-value time)
//   → 배경 없음 + 흰 글씨 = 안 보임. 그런데 **자리는 그대로 차지**해서
//      옆의 「← 카드 고르기로」가 가운데로 밀려 보였다. 그게 화면의 증상이었다.
//
// 테두리(`border:1px solid var(--ax-line)`)도 같은 이유로 통째로 사라진다 —
// 글쓰기 칸에 테두리가 없던 것도 같은 한 가지 원인이었다.
//
// **그래서 무엇을 지키나.** 「`.cpk-*` 를 고쳐라」가 아니다. 그건 증상이다.
// 지킬 규칙은 **색 이름은 `:root` 에 산다**는 것 하나다. 뜬창이 앞으로 더 생겨도,
// 새 `var(--ax-…)` 를 써도 자동으로 안전하다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs portal_tokens.test.mjs

import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const nocmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; return }
  fail++
  console.log('  X ' + label + (extra ? '  — ' + extra : ''))
}

const css = nocmt(read('./src/builder/chrome.css'))

// ── 1. 어떤 파일이 뜬창을 `document.body` 로 내보내나 ────────────
const PORTALS = ['./src/builder/CardPicker.tsx', './src/builder/chrome/EditToolbar.tsx']
for (const f of PORTALS) {
  check(/createPortal\s*\(/.test(read(f)), `${f} 는 createPortal 을 쓴다`,
    '이 목록이 낡았으면 아래 검사가 헛돈다')
}

// ── 2. `--ax-*` 는 `:root` 에 모여 있어야 한다 ───────────────────
const RULES = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim(), body: m[2] }))

const declared = new Map()   // 이름 → 선언한 선택자들
for (const r of RULES) {
  for (const d of r.body.matchAll(/(--ax-[a-z0-9-]+)\s*:/g)) {
    if (!declared.has(d[1])) declared.set(d[1], [])
    declared.get(d[1]).push(r.sel)
  }
}

check(declared.size > 0, '`--ax-*` 이름을 하나라도 찾았다', `찾은 개수 ${declared.size}`)

const atRoot = (sels) => sels.some((s) => s.split(',').map((x) => x.trim()).includes(':root'))
for (const [name, sels] of declared) {
  check(atRoot(sels), `${name} 은 :root 에서 선언된다`,
    `지금 선언 위치: ${sels.join(' / ')} — 뜬창은 여기를 물려받지 못한다`)
}

// `.ax-app` 에만 사는 이름이 하나라도 있으면 그게 바로 이번 버그다.
const onlyApp = [...declared].filter(([, sels]) => !atRoot(sels))
check(onlyApp.length === 0, '`.ax-app` 안에만 사는 색 이름이 없다',
  onlyApp.map(([n]) => n).join(', '))

// ── 3. 쓰는 이름은 전부 선언돼 있어야 한다 ──────────────────────
// 빈 `var()` 는 **조용히** 선언 전체를 죽이므로 콘솔에도 안 남는다. 여기서 잡는다.
// 단, `var(--ax-sub,#5b6270)` 처럼 **예비값이 붙은 것은 세지 않는다** — 비어도 안 죽는다.
const used = new Set([...css.matchAll(/var\(\s*(--ax-[a-z0-9-]+)\s*\)/g)].map((m) => m[1]))
check(used.size > 0, 'chrome.css 가 `var(--ax-…)` 를 쓴다', `쓰인 개수 ${used.size}`)
for (const name of used) {
  check(declared.has(name), `${name} 은 어딘가에서 선언돼 있다`, '빈 var() 는 선언을 통째로 죽인다')
}

// ── 4. 뜬창 규칙이 실제로 이 이름들에 기대고 있다 ────────────────
// (기대는 게 없으면 위 검사는 참이지만 무의미하다 — 살아 있는 검사인지 확인한다)
const popRules = RULES.filter((r) => /\.(cpk|shp)-/.test(r.sel))
const popVars = new Set()
for (const r of popRules) for (const m of r.body.matchAll(/var\(\s*(--ax-[a-z0-9-]+)/g)) popVars.add(m[1])
check(popVars.size >= 4, '뜬창 규칙이 `var(--ax-…)` 에 기대고 있다',
  `기대는 이름 ${popVars.size}개: ${[...popVars].join(', ')}`)
check(popVars.has('--ax-blue'), '「펼치기」 단추의 `--ax-blue` 가 그 안에 있다')

// ── 5. 안 보이던 그 단추가 정말 있는지 ──────────────────────────
const picker = read('./src/builder/CardPicker.tsx')
check(/className="cpk-mmgo"/.test(picker), '「펼치기」 단추가 CardPicker 에 있다')
check(/펼치기/.test(picker), '「펼치기」 글자가 있다')
// 배경은 var, 글씨는 흰색 — 이 짝이 바로 「자리는 있고 안 보임」의 조건이다.
const mmgo = RULES.find((r) => r.sel === '.cpk-mmgo')
check(!!mmgo, '`.cpk-mmgo` 규칙이 있다')
if (mmgo) {
  const bgVar = /background:\s*var\(--ax-/.test(mmgo.body)
  const white = /color:\s*#fff/i.test(mmgo.body)
  check(!(bgVar && white) || atRoot(declared.get('--ax-blue') || []),
    '흰 글씨 + var 배경이면 그 이름은 :root 에 있어야 한다',
    '이 짝은 var 가 비는 순간 투명 배경 + 흰 글씨가 된다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
