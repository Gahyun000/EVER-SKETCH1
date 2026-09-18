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

/** a 와 b 사이를 잘라 준다. **자리를 좁혀서 봐야** 「파일 어딘가에 있으면 통과」가 안 된다. */
function cut(t, a, b) {
  const i = t.indexOf(a)
  if (i < 0) return ''
  const j = b ? t.indexOf(b, i + a.length) : -1
  return j < 0 ? t.slice(i) : t.slice(i, j)
}

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

// ── **한 곳뿐이다 — 셸이 놓는다** ──
//
// 2026-09-10 · 셸(머리줄 + 사이드바)이 생겼다. 그 전에는 화면마다 자기 머리줄이 있어서
// **화면마다 하나씩** 두는 것이 맞았다. 셸이 생기자 그 규칙이 정확히 반대로 뒤집혔다 —
// 셸 머리줄에도 신원이 있으니 자료 목록에서는 **이름표가 위아래로 두 번** 나왔다.
// 겹침이 아니라 중복이고, 로그아웃 버튼이 화면마다 다른 자리에 있으면
// 「방금 그거 어디 있었지」가 된다. 그래서 셸로 모았다.
//
// **2026-09-15 · 자리가 한 번 더 바뀌었다.** 머리줄 오른쪽 끝에 이름 + 사용자 관리 +
// 팀 관리 + 비밀번호 변경 + 로그아웃 다섯이 늘어서 있었다. 앞의 둘은 왼쪽 메뉴
// 「관리」에 이미 있어 **같은 길이 두 벌**이었고, 나머지는 하루에 한 번 쓸까 말까 한
// 것이 늘 자리를 차지했다. 이제 **사이드바 맨 아래**에 이름 한 줄이다.
//
// 안 바뀐 것 둘: **오버레이로 안 띄운다**(자리 다툼 이야기고 여전히 참이다),
// **앱에 한 번뿐이다**(중복 이야기고 역시 참이다). 바뀐 것은 어느 칸이냐뿐이다.
const shell = read('./src/shell/AppShell.tsx')
check((shell.match(/<UserBar\b/g) || []).length === 1,
  '셸이 UserBar 를 **정확히 한 번** 놓는다')
check(/import UserBar from/.test(shell), '셸이 UserBar 를 직접 들여온다')
// **안에 있는지를 본다.** 처음 이 검사는 「</nav> 뒤」만 봤는데, `.sh-side` 자체가
// `<nav>` 이던 시절에는 그게 곧 **사이드바 밖**이었다 — 계정 줄이 격자 칸으로 빠져
// 화면 맨 위에 붙었고 검사는 통과했다(2026-09-15, 진짜 서버에서 잡았다).
const aside = shell.indexOf('<aside className="sh-side">')
const asideEnd = shell.indexOf('</aside>', aside)
const ub = shell.indexOf('<UserBar')
check(aside > 0 && ub > aside && ub < asideEnd,
  '사이드바 **안**에 둔다 — 밖에 두면 격자 칸으로 빠져 엉뚱한 자리에 붙는다')
check(ub > shell.indexOf('</nav>', aside),
  '갈 곳 목록(nav) **밖**에 둔다 — 매일 누르는 메뉴와 같은 줄에 서면 안 된다')
check(/\.sh-navs \{[^}]*overflow: auto/.test(read('./src/shell/shell.css')),
  '메뉴가 길어지면 **그 안에서만** 구른다 — 계정 줄이 아래로 밀려나지 않는다')
check(shell.indexOf('<UserBar') > shell.indexOf('sh-head'),
  '머리줄에는 없다 — 하루에 한 번 쓰는 것이 늘 자리를 차지하지 않는다')

// ── **신호는 링크를 따라가지 않는다** ──
//
// 머리줄의 「사용자 관리」 링크에는 **승인 대기 N명** 배지가 붙어 있었다. 링크를 빼면서
// 그 배지까지 같이 사라질 뻔했다 — 관리자가 가입 승인을 놓치면 그게 곧 병목이다.
// 배지는 링크가 아니라 **그 일을 하는 자리**를 따라간다: 사이드바의 「사용자 관리」 메뉴.
const bar2 = read('./src/auth/UserBar.tsx')
check(!/사용자 관리/.test(bar2.split('*/').pop()) && !/팀 관리/.test(bar2.split('*/').pop()),
  '계정 줄에 「사용자 관리·팀 관리」가 없다 — 왼쪽 메뉴 「관리」와 같은 길이 두 벌이었다')
check(/apiListUsers\('pending'\)/.test(shell) && /setSignups/.test(shell),
  '승인 대기 인원을 셸이 센다')
check(/t: '사용자 관리', ic: 'team', badge: signups/.test(shell),
  '그 숫자가 사이드바 「사용자 관리」에 배지로 붙는다 — **신호가 사라지지 않았다**')
check(/if \(!admin\) \{ setSignups\(0\); return \}/.test(shell),
  '관리자가 아니면 세지 않는다 — 볼 수 없는 숫자를 묻지 않는다')

// 계정 줄이 여는 것.
check(/ChangePasswordDialog/.test(bar2) && /logout\(\)/.test(bar2),
  '비밀번호 변경과 로그아웃은 그 줄 안에 있다')
check(/bottom: calc\(100% - 4px\)/.test(read('./src/shell/shell.css')),
  '**위로 열린다** — 맨 아래 줄이라 아래로 열면 화면 밖으로 나간다')
check(/mousedown/.test(bar2) && /e\.key === 'Escape'/.test(bar2),
  '바깥을 누르거나 Esc 로 닫힌다 — 사이드바 맨 아래라 열어 둔 채로 두면 화면을 가린다')

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

// ── 사이드바 경계선: **끄는 띠 + 누르는 손잡이** ──
//
// 2026-09-14 · 처음에는 머리줄 ☰ 였고, 다음 시안에서 사이드바 맨 아래로 갔다가,
// 마지막에 **경계선 위**로 왔다. 세로 자리를 안 쓰고, 움직이는 그 경계에 붙어 있어
// 「이 선이 왼쪽으로 간다」가 모양으로 읽힌다. 그 자리는 그대로다.
//
// **2026-09-18 · 이 덩어리를 다시 썼다**(사용자 지시 「커서 안 올려도 계속 뜨고
// 눈에 띄게」 → 시안 ㄷ + 파란 강조). 지우지 않고 고쳐 쓴다 — 옛 규칙이 왜 있었는지가
// 새 규칙의 근거라서다. 무엇이 어떻게 바뀌었는지 아래에 하나씩 적는다.
{
  const shell = read('./src/shell/AppShell.tsx')
  const css = read('./src/shell/shell.css')

  check(/className="sh-edge"/.test(shell), '경계선 위 손잡이가 있다')
  check(!/sh-burger/.test(shell), '머리줄 ☰ 는 없다 — 같은 일을 하는 단추가 둘이 되지 않는다')

  // 옛 규칙: 「한 자리에 한 물건 — 누르면 접히고 끌면 넓어진다」(손잡이 하나가 둘을 겸함).
  // **왜 바꿨나.** 겸하게 두니 누르려다 4px 만 흔들려도 접기가 안 먹었다 — 아래
  // 「끌고 난 click 버리기」가 그 흔들림까지 같이 버렸기 때문이다. 이제 일이 갈렸다:
  // 끄는 것은 경계선 **전체**(.sh-rail), 누르는 것은 손잡이.
  // 장치가 둘로 는 것이 아니라 **한 경계 안에서 일이 갈린 것**이라, 둘 다 같은 값을 따라간다.
  check(/<div className="sh-rail"[\s\S]{0,120}onPointerDown=\{onDragStart\}/.test(shell),
    '**끄는 일은 띠가 맡는다** — 경계선 전체가 잡힌다')
  const EDGE = cut(shell, '<button className="sh-edge"', '</button>')
  check(EDGE.length > 60, '손잡이 태그를 찾았다', `${EDGE.length}자`)
  check(/fold\(!shut\)/.test(EDGE), '**누르는 일은 손잡이가 맡는다**')
  // 옛 규칙: 「끌고 난 직후의 누름은 버린다」. **이제 필요 없다 — 손잡이가 안 끌기 때문이다.**
  // 버리는 코드를 없앤 자리에 **끌기를 다시 붙이지 못하게** 하는 규칙을 둔다.
  // 손잡이에 onPointerDown 이 돌아오면 그 순간 옛 결함(눌러도 안 접힘)도 같이 돌아온다.
  check(!/onPointerDown/.test(EDGE),
    '손잡이는 **끌지 않는다** — 끌면 눌러도 안 접히던 옛 결함이 돌아온다', EDGE.trim().slice(0, 100))
  check(!/dragged\.current/.test(shell),
    'click 을 버리는 코드는 없앴다 — 버릴 click 이 더는 안 생긴다')

  check(/left: \(shut \? 60 : width\)/.test(EDGE),
    '손잡이가 경계선을 따라간다 — 접힌 상태와 편 상태가 같은 물건이다')
  check(/\{!shut && \([\s\S]{0,200}?className="sh-rail"/.test(shell),
    '**접혀 있으면 띠를 안 그린다** — 60px 은 줄일 폭이 없어 col-resize 커서가 거짓말이 된다')
  check(/aria-hidden="true"/.test(cut(shell, '<div className="sh-rail"', '/>')),
    '띠는 읽어 주지 않는다 — 같은 일이 스크린리더에 두 번 나오면 안 된다')
  check(/aria-label=\{shut \? '메뉴 펴기' : '메뉴 접기'\}/.test(EDGE),
    '무엇을 하는 단추인지 글자로도 있다(아이콘 하나뿐이므로)')

  // 옛 규칙: 「평소에는 흐리고 셸에 마우스가 올 때 드러난다」(`opacity: .22` + `.sh:hover`).
  // **왜 바꿨나.** 본문 위로 걸치는 것이 싫어서였는데, 사용자가 말한 대로
  // **안 보이는 단추는 없는 단추다.** 이제 흐려지는 규칙 자체가 없어야 한다.
  const EDGECSS = cut(css, '.sh-edge {', '\n.sh-edge:hover')
  check(EDGECSS.length > 60, '손잡이 CSS 를 찾았다', `${EDGECSS.length}자`)
  check(!/opacity/.test(EDGECSS), '**늘 보인다** — 손잡이에 opacity 가 없다', EDGECSS.trim())
  check(!/\.sh:hover \.sh-edge/.test(css),
    '셸에 마우스가 와야 드러나던 규칙이 없다 — 남아 있으면 「평소」가 다시 생긴다')
  check(/cursor: pointer/.test(EDGECSS),
    '커서가 **누르는 커서**다 — 안 끄는 단추에 col-resize 를 달면 거짓말이다')
  // 옛 규칙: 「@media (hover: none) 에서는 늘 보이고 누르는 단추가 된다」.
  // **이제 늘 그렇다.** 예외 규칙을 남겨 두면 규칙 둘이 같은 말을 하게 되고,
  // 한쪽만 고치는 날 둘이 어긋난다.
  check(!/@media \(hover: none\)/.test(css),
    '손가락용 예외 규칙은 없앴다 — 이제 모든 화면에서 늘 보이는 누름 단추다')

  check(/\.sh-edge:hover, \.sh-edge:focus-visible/.test(css), '키보드로 짚어도 드러난다')
  // 눈에 띄라는 지시였다. 회색 테두리에 회색 글자면 켜 놓아도 안 보인다.
  check(/background: #EAF1FE/.test(EDGECSS) && /color: #2462EB/.test(EDGECSS),
    '**파란 강조**다(사용자 결정) — 흰 바탕 회색 테두리에 묻히지 않는다', EDGECSS.trim())

  const RAIL = cut(css, '.sh-rail {', '}')
  check(/background: transparent/.test(RAIL),
    '띠는 평소 **투명**이다 — 늘 보이는 세로줄을 하나 더 그리는 것이 아니다', RAIL)
  check(/\.sh-rail:hover \{ background/.test(css), '마우스가 오면 띠가 드러난다')
  check(/\.sh-body\.drag \.sh-rail \{ background: #2462EB/.test(css),
    '끄는 중에는 띠가 파랗다 — 지금 무엇이 움직이는지가 보인다')
  check(/\.sh-body\.drag \.sh-edge \{[^}]*#2462EB/.test(css),
    '끄는 중에는 손잡이도 같이 진해진다 — 띠와 손잡이가 **한 물건**으로 읽혀야 한다')
  // 손잡이가 띠에 깔리면, 손잡이를 누르려다 띠를 잡아 끌게 된다.
  const zE = (EDGECSS.match(/z-index: (\d+)/) || [])[1]
  const zR = (RAIL.match(/z-index: (\d+)/) || [])[1]
  check(zE && zR && Number(zE) > Number(zR),
    '손잡이가 띠보다 **위**다 — 깔리면 누르려다 끌게 된다', `손잡이 ${zE} / 띠 ${zR}`)

  check(/\.sh-body\.drag \{ transition: none/.test(css),
    '끄는 동안에는 폭이 손을 따라온다 — 애니메이션이 걸려 있으면 한 박자 늦는다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
