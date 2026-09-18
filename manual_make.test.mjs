// **작성자 매뉴얼 ① 만들기 — 탭과 인쇄판.**
//
// 2026-09-17 · 매뉴얼이 둘로 갈렸다.
//   · ① 만들기 — 표준 양식 한 장을 손으로 채우는 37걸음(`manualMake.ts`)
//   · ② 제도  — 결재 흐름 열두 편(`DemoPlayer.tsx` 의 EPISODES)
// 그리고 **종이로 들고 따라 할 수 있게** 인쇄(PDF)를 붙였다.
//
// **여기서 지키는 것은 「조용히 망가지는 것」들이다.** 셋 다 오류를 안 내고,
// 화면도 멀쩡하고, 사람이 그 자리를 다시 열어 보기 전에는 아무도 모른다.
//
//   ① **그림 경로.** `img` 하나를 오타 내면 그 걸음만 빈 네모다. 서른일곱 걸음을
//      다 넘겨 보는 사람은 없다. → 파일이 실제로 있는지 하나하나 대조한다.
//   ② **인쇄판이 붙는 자리.** 인쇄 규칙은 `body > *:not(.man-print){display:none}`
//      이다. 인쇄판을 모달 안에 두면 **저를 감추는 규칙에 저도 걸려** 인쇄가 백지로
//      나온다. 화면은 아무 이상이 없다. → `document.body` 포털인지 잰다.
//   ③ **인쇄판이 화면판과 따로 산다.** 화면은 `FLAT[mi]` 한 걸음만 그리므로,
//      인쇄판이 그걸 그대로 쓰면 **한 걸음짜리 PDF** 가 나온다. → 인쇄판이
//      MAKE_CHAPTERS 전체를 돈다는 것을 잰다.
//
// 실제로 재 봤다(시험 서버 · Chromium, 인쇄 매체로 바꿔서):
//   인쇄판 부모=body · 장 11(10장+머메이드) · 걸음 37 · 그림 37(깨진 것 0)
//   화면에서 display=none · 인쇄에서 block · body 직계 중 남은 것 없음 · A4 15쪽
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs manual_make.test.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
// JSX 주석을 **먼저** 벗긴다. `/* */` 를 먼저 지우면 감싸던 중괄호만 `{}` 로 남아서
// 「바로 뒤에 붙었나」를 보는 검사가 헛돈다(다른 가드에서 한 번 겪었다).
const bare = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const M = await import('./src/builder/manualMake.ts')
const { MAKE_CHAPTERS, MAKE_DIR, MAKE_STEP_COUNT, MM_ROWS, MM_SAMPLE } = M
const dp = bare(read('./src/builder/DemoPlayer.tsx'))
const css = read('./src/index.css')

const STEPS = MAKE_CHAPTERS.flatMap((c) => c.steps)

// ── ① 걸음의 뼈대 ──────────────────────────────────────
{
  check(MAKE_CHAPTERS.length >= 8, '장이 여럿이다', `${MAKE_CHAPTERS.length}장`)
  check(STEPS.length === MAKE_STEP_COUNT,
    '**세어 둔 걸음 수와 실제가 같다** — 탭에 뜨는 「37걸음」이 거짓말이 되면 안 된다',
    `실제 ${STEPS.length} · 적힌 ${MAKE_STEP_COUNT}`)
  // 번호는 화면에 그대로 뜬다. 겹치면 목록에서 어느 걸 누른 건지 알 수 없고,
  // DemoPlayer 가 `FLAT.findIndex(f => f.n === x.n)` 로 찾으므로 **엉뚱한 걸음이 열린다.**
  check(new Set(STEPS.map((s) => s.n)).size === STEPS.length,
    '걸음 번호가 겹치지 않는다 — 목록이 번호로 걸음을 찾는다')
  for (const c of MAKE_CHAPTERS) {
    check(c.steps.every((s) => s.n.startsWith(c.no + '-')),
      `${c.no}장의 걸음 번호가 그 장을 가리킨다`)
  }
  check(STEPS.every((s) => s.t && s.body && s.body.length >= 20),
    '걸음마다 제목과 본문이 있다',
    STEPS.filter((s) => !s.body || s.body.length < 20).map((s) => s.n).join(' '))
}

// ── ② 그림이 **진짜로 거기 있는가** ────────────────────
// 이 파일에서 제일 값이 나가는 자리다. 오타 하나가 조용히 빈 네모가 된다.
{
  const dir = './public' + MAKE_DIR
  check(existsSync(dir), '그림 폴더가 있다', dir)
  const have = new Set(existsSync(dir) ? readdirSync(dir) : [])
  const missing = STEPS.filter((s) => !have.has(s.img)).map((s) => `${s.n}:${s.img}`)
  check(missing.length === 0, '**걸음마다 가리키는 그림이 실제로 있다**', missing.join(' '))
  // 안 쓰는 그림이 쌓이면 폴더만 무거워진다(앱에 같이 실린다). 경고 삼아 센다.
  const used = new Set(STEPS.map((s) => s.img))
  const idle = [...have].filter((f) => !used.has(f))
  check(idle.length === 0, '안 쓰는 그림이 남아 있지 않다', idle.join(' '))
}

// ── ③ 탭 — 두 갈래가 다 있고, 만들기가 먼저다 ───────────
{
  check(/useState<'make' \| 'flow'>\('make'\)/.test(dp),
    "**처음 열면 「만들기」다** — 처음 쓰는 사람이 제일 먼저 할 일이 그것이다")
  check(/setTab\('make'\)/.test(dp) && /setTab\('flow'\)/.test(dp),
    '두 탭을 다 누를 수 있다')
  check(/if \(open\) \{[^}]*setTab\('make'\)/.test(dp),
    '창을 다시 열면 만들기로 돌아온다 — 지난번 탭이 남아 있으면 「왜 여기서 시작하지」가 된다')
  // 탭이 둘인데 ← → 가 한쪽만 넘기면, 보이는 화면은 그대로인 채 **안 보이는 쪽이 넘어간다.**
  const ki = dp.indexOf("e.key === 'ArrowRight'")
  const kseg = ki < 0 ? '' : dp.slice(dp.lastIndexOf('const on =', ki), ki + 300)
  check(/tab === 'make' \? setMi : setI/.test(kseg),
    '**← → 가 보고 있는 탭을 따라간다** — 안 그러면 안 보이는 쪽이 조용히 넘어간다')
  check(/\}, \[open, tab\]\)/.test(dp),
    '탭을 바꾸면 그 손잡이를 다시 건다 — 빠지면 첫 탭에 고정된 채 남는다')
  check(/\.man-tab\{/.test(css) && /\.man-tab\.on\{|\.man-tab\.on,/.test(css),
    '켜진 탭이 눈에 보인다 — 모양이 없으면 둘 중 어디인지 모른다')
}

// ── ④ 인쇄 단추 ────────────────────────────────────────
{
  check(/window\.print\(\)/.test(dp), '인쇄 단추가 브라우저 인쇄를 부른다')
  check(/tab === 'make' && \(\s*<button className="man-print-btn"/.test(dp),
    '**만들기 쪽에서만 낸다** — 제도 열두 편은 종이로 들고 따라 할 것이 아니다')
  // 「PDF」라고만 적어 두면 누르고 나서 **인쇄 대화상자**가 떠 당황한다.
  check(/title="[^"]*PDF로 저장[^"]*"/.test(dp),
    '무엇이 뜨는지 미리 말해 준다(인쇄 창에서 「PDF로 저장」)')
  check(/\.man-print-btn\{/.test(css), '인쇄 단추에 모양이 있다')
}

// ── ⑤ 인쇄판 — 여기가 조용히 백지가 되는 자리 ────────────
{
  const i = dp.indexOf('function PrintSheet')
  const ps = i < 0 ? '' : dp.slice(i, dp.indexOf('\n}', i))
  check(i > 0, 'PrintSheet 가 있다')
  // **모달 안에 두면 인쇄가 백지다.** `body > *:not(.man-print)` 가 모달째 감추고,
  // 그 안에 있는 인쇄판도 부모를 따라 사라진다. 화면에는 아무 이상이 없다.
  check(/createPortal\(/.test(ps) && /,\s*document\.body,?\s*\)/.test(ps),
    '**인쇄판이 document.body 바로 밑에 붙는다** — 모달 안에 두면 저를 감추는 규칙에 저도 걸려 백지가 된다')
  // 화면판은 한 걸음(FLAT[mi])만 그린다. 인쇄판이 그걸 쓰면 한 걸음짜리 PDF 가 나온다.
  check(/MAKE_CHAPTERS\.map\(/.test(ps),
    '**인쇄판은 전부 돈다** — 화면판을 그대로 쓰면 한 걸음짜리 PDF 가 된다')
  check(/st\.img/.test(ps) || /MAKE_DIR \+/.test(ps), '인쇄판에도 그림이 실린다')
  check(/MM_ROWS\.map\(/.test(ps) && /MM_SAMPLE/.test(ps),
    '머메이드 표도 종이에 같이 간다 — 처음 쓰는 사람이 제일 막히는 자리다')
  check(/aria-hidden="true"/.test(ps),
    '읽어 주는 도구에는 안 들린다 — 같은 내용이 두 번 읽히면 못 쓴다')
  check(/<PrintSheet \/>/.test(dp), '창에 실제로 놓여 있다')
}

// ── ⑥ 인쇄 규칙 ────────────────────────────────────────
{
  check(/\.man-print\{display:none\}/.test(css),
    '평소엔 숨어 있다 — 안 숨기면 화면 아래에 매뉴얼이 통째로 또 깔린다')
  check(/@media print\{/.test(css), '인쇄용 규칙이 있다')
  const pi = css.indexOf('@media print{')
  const pc = pi < 0 ? '' : css.slice(pi)
  check(/body > \*:not\(\.man-print\)\{display:none !important\}/.test(pc),
    '인쇄 때 앱 화면을 감춘다')
  check(/\.man-print\{display:block !important\}/.test(pc),
    '**인쇄판만 남긴다** — 이 줄이 빠지면 위 규칙만 남아 전부 백지다')
  check(/\.mp-step\{[^}]*break-inside:avoid/.test(pc),
    '한 걸음이 쪽을 넘어 잘리지 않는다 — 글과 그림이 갈라지면 못 읽는다')
  check(/tr\{[^}]*break-inside:avoid/.test(pc),
    '머메이드 표도 줄 단위로 안 잘린다')
}

// ── ⑦ 머메이드 도움표가 제구실을 하는가 ──────────────────
// 사용자 지적(9/17): 「B -> C, B -> D 로 **두 갈래가 뻗는 걸** 처음엔 이해 못 하실 수도 있다」.
{
  check(MM_ROWS.length >= 8, '문법 줄이 여럿이다', `${MM_ROWS.length}줄`)
  // 이름만 보고 넘어가지 않는다 — **보기글이 실제로 갈라지는가**를 잰다.
  // (이름표가 같은 줄이 둘이면 그 자리에서 길이 갈라진다.)
  const head = (l) => l.trim().split(/\s*--/)[0].trim()
  const branch = MM_ROWS.find((r) => {
    const ls = r.code.split('\n').map((x) => x.trim()).filter(Boolean)
    return ls.length >= 2 && new Set(ls.map(head)).size === 1
  })
  check(!!branch,
    '**가지 치기를 보기로 보여 준다** — 같은 이름표를 왼쪽에 두 번 쓴 줄이 실제로 있다')
  check(branch && /가지|갈라/.test(branch.k + branch.d),
    '그 보기가 무슨 뜻인지 말로도 설명한다 — 코드만 보면 왜 둘인지 모른다')
  check(/-->/.test(MM_SAMPLE) && /\{/.test(MM_SAMPLE),
    '보기글에 이음선과 마름모가 다 있다')
  check(/graph TB/.test(MM_SAMPLE), '보기글이 방향으로 시작한다')
}

// ── 틀이 고정인가 (2026-09-18 · 사용자 결정 ㄱ) ──────────────
//
// 사용자 말: 「다음 넘길 때 버튼 위치가 달라서 산만한데」. 재 보니 산만한 정도가 아니었다.
// 37걸음을 하나씩 넘기며 잰 값(창 1700×1000):
//   · 「다음」이 선 높이 **399 ~ 1,982px** — 흔들림 1,583px
//   · 그림 높이         **64 ~ 1,654px**
// y≈1,982 는 **창 밖**이다. 그 걸음에서는 스크롤을 내려야 다음으로 갈 수 있었고,
// 탭 줄과 인쇄 단추도 같이 밀려 사라졌다.
//
// 까닭은 그림이다 — 실물 캡처라 비율이 900×69(0.08)부터 400×820(2.05)까지 **26.6배** 벌어진다.
// 한글 인쇄 미리보기처럼 한 칸에 맞추는 안(ㄴ)은 안 골랐다. 한글이 그렇게 되는 건 모든 쪽이
// 같은 A4 라서다. 우리는 그 전제가 없어서, 맞추면 납작한 것은 허공만 남고 긴 것은 글씨가 안 읽힌다.
//
// **그래서 틀만 고정하고 그림은 그대로 둔다.** 이 칸이 지키는 것은 그 「틀」이다.
{
  // **CSS 도 주석을 벗기고 잰다.** 안 벗기면 설명에 적어 둔 규칙 이름이 진짜 규칙으로 잡힌다 —
  // 방금 이 칸이 그래서 헛돌았다(「두 곳」이라고 울었는데 한 곳은 내가 쓴 주석이었다).
  const css = read('./src/index.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const dp = bare(read('./src/builder/DemoPlayer.tsx'))

  // ① 창이 내용 따라 자라지 않는다
  // 규칙이 **한 벌뿐인지**도 같이 본다. 예전에는 같은 선택자가 두 번 있어서 아래 것이
  // 위엣것을 덮고 있었다 — 폭을 고치러 온 사람이 위를 고치고 「왜 안 바뀌지」 하게 된다.
  // (이 검사를 처음 썼을 때 실제로 위엣 옛 규칙을 집어 들고 헛돌았다.)
  const dms = css.match(/\.ui-modal\.demo-modal\{[^}]*\}/g) || []
  check(dms.length === 1, '창 규칙이 **한 곳**에만 있다', `${dms.length}곳`)
  const dm = dms.length ? /\{([^}]*)\}/.exec(dms[0])[1] : ''
  check(/height:86vh/.test(dm) && /overflow:hidden/.test(dm),
    '**창 높이가 박혀 있다** — 안 박으면 내용 따라 자라고, 그때마다 아래 것이 전부 밀린다', dm)

  // ② 붙박이 둘 — 탭 줄(위) · 이동 막대(아래)
  const rule = (sel) => (new RegExp('\\' + sel + '\\{([^}]*)\\}').exec(css) || [])[1] || ''
  check(/flex:none/.test(rule('.man-tabs')), '탭 줄이 붙박이다 — 긴 그림에 밀려 사라지던 자리다')
  check(/flex:none/.test(rule('.man-nav')),
    '**이동 막대가 붙박이다** — 이 한 줄이 이번 고침의 전부다')

  // ③ 구르는 곳은 둘뿐 — 목록과 무대 속살
  check(/flex:1/.test(rule('.man-wrap')) && /min-height:0/.test(rule('.man-wrap')),
    '가운데가 남은 높이를 다 쓴다')
  check(/overflow:auto/.test(rule('.man-scroll')) && /min-height:0/.test(rule('.man-scroll')),
    '걸음의 속살만 구른다')
  // min-height:0 을 빠뜨리면 **줄지 않는다** — flex 칸의 기본 최소 크기가 내용이라,
  // 긴 그림이 들어오면 무대가 그대로 부풀어 이동 막대를 밀어낸다. 고정한 보람이 없어진다.
  check(/min-height:0/.test(rule('.man-stage')),
    '**무대에 min-height:0 이 있다** — 없으면 flex 칸이 내용만큼 부풀어 붙박이가 도로 밀린다')

  // ④ **이동 막대가 구르는 칸 밖에 있는가.** 여기가 이 고침의 핵심이고, 안에 넣으면
  //    아무 오류 없이 예전 증상으로 돌아간다 — 그림이 길면 같이 아래로 흘러간다.
  const outside = (dp.match(/<\/div>\s*<div className="man-nav">/g) || []).length
  check(outside === 2, '**두 갈래 다** 이동 막대가 구르는 칸 **밖**에 있다', `${outside}곳`)
  const scrolls = (dp.match(/className="man-scroll"/g) || []).length
  check(scrolls === 2, '두 갈래 다 구르는 칸이 있다', `${scrolls}곳`)

  // ⑤ 넘기면 맨 위부터
  check(/scrollRef\.current\.scrollTop = 0/.test(dp),
    '걸음을 넘기면 **맨 위부터** 보여 준다 — 안 그러면 새 걸음이 제목도 없이 한복판부터 뜬다')
  check(/\}, \[mi, i, tab\]\)/.test(dp),
    '걸음·편·갈래가 바뀔 때 **모두** 되돌린다 — 하나만 빼도 그 길에서만 가운데부터 뜬다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
