// 신원 표시(UserBar)는 **자리를 나눠서** 놓는다 — 소스 검사.
//
// 이 검사가 따로 있는 이유:
// UserBar 는 원래 `position: fixed; top:0; right:0` 전역 오버레이였다. 툴바가 없는
// 화면에서는 멀쩡했지만, 편집 화면에서는 툴바 버튼과 **같은 자리를 두고 서로 모른 채**
// 포개졌다. 그때는 편집 화면만 `inline` 으로 빼서 넘어갔는데, 라이브러리 화면은
// 오버레이인 채로 남았다 — 버튼이 세 개일 때는 우연히 안 닿았을 뿐이다.
//
// 2026-09-04, P3 에서 「팀 관리」 버튼이 하나 늘자 막대가 넓어져 라이브러리 화면의
// 「＋ 새 이북」 위에 그대로 포개졌다. **같은 사고가 다른 화면에서 다시 났다.**
// 겹침은 z-index 로 덮어 가릴 수 있을 뿐 사라지지 않는다 — 자리를 나눠야 한다.
//
// 그래서 오버레이를 없앴다. 화면마다 자기 머리줄 안에 UserBar 를 놓는다.
// 버튼이 또 늘어도 머리줄 안에서 밀릴 뿐 남의 버튼 위에 올라가지 않는다.
//
// 실행: node userbar_placement.test.mjs

import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

// ── 오버레이가 없다 ──
const css = read('./src/auth/auth.css')
const bar = css.slice(css.indexOf('.es-userbar'), css.indexOf('.es-av'))
check(!/position:\s*fixed/.test(bar),
  'UserBar 는 fixed 오버레이로 뜨지 않는다 — 남의 버튼 위에 올라갈 자리가 없다')
check(!/z-index:\s*\d/.test(bar),
  'z-index 로 겹침을 덮어 가리지 않는다 — 덮어 가리면 겹침은 그대로 있다')

// ── AuthGate 는 띄우지 않는다 ──
const gate = read('./src/auth/AuthGate.tsx')
check(!/<UserBar/.test(gate),
  'AuthGate 는 UserBar 를 직접 띄우지 않는다 — 화면 밖에서 띄우면 화면은 그게 있는 줄 모른다')

// ── **한 곳뿐이다 — 셸 머리줄** ──
//
// 2026-09-10 · 셸(머리줄 + 사이드바)이 생겼다. 그 전에는 화면마다 자기 머리줄이 있어서
// **화면마다 하나씩** 두는 것이 맞았다. 셸이 생기자 그 규칙이 정확히 반대로 뒤집혔다 —
// 셸 머리줄에도 신원이 있으니 자료 목록에서는 **이름표가 위아래로 두 번** 나왔다.
// 겹침이 아니라 중복이고, 로그아웃 버튼이 화면마다 다른 자리에 있으면
// 「방금 그거 어디 있었지」가 된다.
//
// 그래서 셸로 모았다. 규칙은 이제 이렇다: **UserBar 는 앱에 한 번, 셸 머리줄에.**
// (위의 「오버레이로 안 띄운다」는 그대로다 — 그건 자리 다툼 이야기고 여전히 참이다.)
const shell = read('./src/shell/AppShell.tsx')
check((shell.match(/<UserBar\b/g) || []).length === 1,
  '셸 머리줄이 UserBar 를 **정확히 한 번** 놓는다')
check(/import UserBar from/.test(shell), '셸이 UserBar 를 직접 들여온다')
check(shell.indexOf('<UserBar') > shell.indexOf('sh-head') &&
      shell.indexOf('<UserBar') < shell.indexOf('sh-body'),
  '머리줄 안에 둔다 — 본문에 두면 화면 내용과 자리를 다툰다')

// 그리고 **다른 어디에도 없다.** 하나라도 남으면 그 화면에서만 두 번 나온다.
for (const [name, path] of [
  ['라이브러리', './src/persistence/LibraryScreen.tsx'],
  ['편집 화면(TitleBar)', './src/builder/chrome/TitleBar.tsx'],
]) {
  const src = read(path)
  check(!/<UserBar\b/.test(src), `${name} 에는 UserBar 가 없다 — 셸의 것과 두 번 나온다`)
}

// 로고도 같은 이유로 셸에만 있다. 자료 목록·편집 제목줄에 각각 있었고, 셸이 생기면서
// 「EVER-SKETCH」가 한 화면에 두 번 적혔다.
check(!/lib-brand/.test(read('./src/persistence/LibraryScreen.tsx')),
  '자료 목록에 브랜드가 두 번 적히지 않는다')
check(!/className="logo"/.test(read('./src/builder/chrome/TitleBar.tsx')),
  '편집 제목줄에 로고가 두 번 적히지 않는다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
