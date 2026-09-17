// **형제 앱 칩이 끊겼을 때 — 조용히 죽지 않는가.**
//
// 2026-09-17 · 시안 v1.0 의 ㉡「말리는 칩」으로 정했다. 이 파일이 지키는 것은 하나다.
//
//   **상대가 없으면 빈 탭을 열지 않는다.**
//
// 예전에는 EVER-FOLIO 가 안 떠 있어도, 포트가 어긋나 있어도, 칩이 똑같이 빈 탭을
// 열었다. 눌러 본 사람은 「안 띄웠나 보다」로 넘기고, **포트가 어긋난 경우를 끝내
// 모른다.** 8820→8808 로 옮긴 날 이 칩이 정확히 그렇게 죽을 뻔했다.
//
// 이 자리의 고약한 점은 **되돌리기가 너무 쉽다**는 것이다. `<SiblingLink>` 를 평범한
// `<a href>` 로 한 글자만 바꾸면 끝이고, 화면은 멀쩡하고, 아무 테스트도 안 깨진다.
// 그래서 여기서는 「그 부품이 쓰이고 있는가」를 잰다.
//
// 실제로 재 봤다(시험 서버 · Chromium, 8811 로 가는 요청을 끊어서):
//   떠 있을 때  — 흐림 false · 누르면 탭 1→2 · 말풍선 없음
//   안 떠 있을 때 — 흐림 true  · 누르면 탭 1→1(**안 열린다**) · 말풍선 1
//   EVER-FOLIO 쪽(app.html)도 같음 + 「그래도 열기」 누르면 탭 1→2 · Esc 로 닫힘
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs sibling.test.mjs
import { readFileSync, existsSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const strip = (s) => s
  // **HTML 주석도 걷는다**(2026-09-17 · 부숴 보고 알았다). FOLIO 쪽은 HTML 이라
  // `<!-- ... -->` 안에 「run.command 는 맥 파일이라 안 쓴다」는 **설명**이 들어 있다.
  // 안 걷으면 그 설명을 위반으로 잡아 **거짓 경보**가 난다.
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*(#|rem\s|\/\/).*$/gm, '')

const SRC = './src/siblingLink.tsx'
const sib = strip(read(SRC))
const css = read('./src/index.css')
const CHIPS = ['./src/builder/TopBar.tsx', './src/builder/chrome/TitleBar.tsx']

// ── ① 부품이 있고, 재 보고, 막지 않는가 ──────────────────
{
  check(existsSync(SRC), 'siblingLink 가 있다')
  check(/mode:\s*'no-cors'/.test(sib),
    '**다른 오리진을 찔러 본다**(no-cors) — 내용은 못 읽어도 대답했는지는 안다')
  check(/AbortSignal\.timeout\(/.test(sib),
    '**기다리다 끊는다** — 시간 제한이 없으면 「모름」에 영영 머물고 칩은 그냥 평소대로 연다')
  // 이 파일의 핵심. 안 떠 있을 때 **기본 동작을 막아야** 빈 탭이 안 열린다.
  check(/if \(!down\) return[\s\S]{0,120}preventDefault\(\)/.test(sib),
    '**안 떠 있을 때만 빈 탭을 막는다** — 살아 있으면 평범한 링크 그대로다')
  // 「그래도 열기」가 없으면 판정이 틀렸을 때 사람이 갇힌다.
  check(/window\.open\(url/.test(sib),
    '**길은 막지 않는다** — 판정이 틀릴 수 있어서 「그래도 열기」가 있다')
  check(/무엇을 하면 되는지|how\}/.test(read(SRC)) && /how[,:}]/.test(sib),
    '무엇을 하면 되는지(how)까지 말한다 — 이유만 말하면 반쪽이다')
}

// ── ② 나중에 띄운 경우를 잡는가 ───────────────────────────
// 한 번만 재고 끝내면, 사람이 상대 앱을 **나중에 띄워도** 칩은 계속 흐린 채다.
// 그러면 사람은 이 표시를 믿지 않게 되고, 표시가 없는 것만 못해진다.
{
  check(/onMouseEnter=\{recheck\}/.test(sib) && /onFocus=\{recheck\}/.test(sib),
    '**닿을 때마다 다시 잰다** — 마우스와 키보드 둘 다')
  check(/cache\.delete\(url\)/.test(sib),
    '다시 잴 때는 **묵은 답을 버린다** — 안 버리면 캐시가 옛 결과를 그대로 돌려준다')
}

// ── ③ 눈과 귀에 닿는가 ───────────────────────────────────
{
  // 색으로만 말하면 색을 못 가리는 사람에게는 아무 말도 안 한 것이다(UI 표준).
  check(/\.sib-down\{[^}]*border-style:dashed/.test(css),
    '**색 말고 모양으로도 말한다**(점선) — UI 표준: 상태는 색 외 수단을 같이 쓴다')
  // 문구를 박지 않는다 — 「연결 안돼있다」로 바뀐 것처럼 말은 또 바뀐다.
  // **바뀌는지**만 본다: 살아 있을 때와 아닐 때가 다른 글이면 된다.
  check(/title=\{down\s*\n?\s*\?/.test(sib),
    '툴팁이 상태에 따라 갈린다 — 안 눌러도 마우스만 올리면 안다')
  check(/title=\{down[\s\S]{0,260}\$\{runBy\}/.test(sib),
    '툴팁에도 **띄우는 법**이 들어간다 — 마우스만 올려도 무엇을 하면 되는지 안다')
  check(/role="status"/.test(sib),
    '읽어 주는 도구에 들린다(role="status")')
  // 브라우저 기본 대화상자는 UI 표준이 금지한다.
  check(!/\b(alert|confirm|prompt)\(/.test(sib),
    '브라우저 기본 경고창을 안 쓴다 — 프로젝트 것으로 말한다')
  check(/e\.key === 'Escape'/.test(sib),
    'Esc 로 닫힌다 — 닫는 길이 하나뿐이면 갇힌 느낌이 난다')
}

// ── ④ **정말로 쓰이고 있는가** — 여기가 제일 쉽게 풀린다 ────
// 부품만 남겨 두고 칩을 평범한 `<a href>` 로 되돌리면 아무것도 안 깨진다.
{
  for (const f of CHIPS) {
    const src = strip(read(f))
    check(/<SiblingLink\s/.test(src), `${f.replace('./src/', '')} 가 SiblingLink 를 쓴다`)
    // 같은 자리에 맨 `<a href={FOLIO_URL}>` 가 돌아오면 그게 되돌린 것이다.
    check(!/<a\s[^>]*href=\{FOLIO_URL\}/.test(src),
      `${f.replace('./src/', '')} 에 맨 링크가 되살아나지 않았다`)
    // 예전에는 `how="run.command"` 가 있는지 봤다. 그 값이 **맥 전용**이라 없앴으므로
    // 이제 맞는 질문은 「직접 적지 않았는가」다 — 적으면 운영체제를 못 따라간다.
    check(!/how=["'{]/.test(src),
      `${f.replace('./src/', '')} 가 띄우는 법을 **직접 안 적는다**(운영체제가 고르게 둔다)`)
  }
}

// ── ④-2 좁은 자리(표·상세 패널)는 띠로 말한다 ─────────────
//
// 2026-09-17 · 시안에서 **실제로 잘리는 것을 찍어 확인했다**
// (docs/화면시안_발행본보기_끊김표시_v1.0.html). 표는 overflow:hidden(index.css),
// 상세 패널은 overflow:auto 라 말풍선이 그 테두리에서 잘린다 — 아래쪽 줄일수록 심하다.
// 그래서 그 두 자리는 `quiet`: 말풍선 대신 **화면 아래 띠**(position:fixed)로 한 줄.
//
// 실제로 재 봤다: 흐림 true · 누르면 탭 1→1(빈 탭 안 열림) · 띠 1 ·
// **띠가 화면 안에 온전히 들어옴 true**(= 안 잘림).
{
  const lib = strip(read('./src/persistence/LibraryScreen.tsx'))
  const n = (lib.match(/<SiblingLink\s/g) || []).length
  check(n >= 2, '발행본 보기 두 자리(표 · 상세 패널)가 SiblingLink 를 쓴다', `${n}곳`)
  check(!/<a\s[^>]*href=\{folioBookUrl\(/.test(lib),
    '맨 링크가 되살아나지 않았다 — 되돌리면 다시 빈 탭이 열린다')
  // **quiet 를 안 주면 말풍선이 잘린다.** 잘린 말풍선은 없느니만 못하다.
  const bad = [...lib.matchAll(/<SiblingLink([\s\S]{0,200}?)>/g)]
    .filter((m) => !/\bquiet\b/.test(m[1])).length
  check(bad === 0,
    '**두 자리 다 quiet 다** — 표·패널은 overflow 가 걸려 있어 말풍선이 잘린다', `${bad}곳 빠짐`)
  // 찔러 보는 곳은 책 한 권이 아니라 **앱 뿌리**여야 한다. 책 주소로 재면 그 책이
  // 지워졌을 때도 「앱이 꺼졌다」고 말하게 된다.
  // **하나라도 빠지면 안 된다**(부숴 보고 고쳤다, 2026-09-17). 예전에는
  // 「파일 어딘가에 probeUrl 이 있으면 통과」였다. 그래서 두 자리 중 한 곳만 빼도
  // 나머지 한 곳에 걸려 그냥 통과했다 — 정작 뺀 그 자리가 잘못 재고 있는데도.
  const noProbe = [...lib.matchAll(/<SiblingLink([\s\S]{0,200}?)>/g)]
    .filter((m) => !/probeUrl=\{FOLIO_URL\}/.test(m[1])).length
  check(noProbe === 0,
    '**두 자리 다 앱 뿌리를 찔러 본다** — 책 주소로 재면 지워진 책을 꺼진 앱으로 오해한다',
    `${noProbe}곳 빠짐`)

  const sibq = sib
  check(/quiet && createPortal\(/.test(sibq),
    '띠는 **body 로 올린다**(포털) — 표 안에 그리면 그대로 잘린다')
  check(/className="build-toast"/.test(sibq),
    '이 앱이 이미 쓰는 띠를 쓴다 — 새 모양을 만들지 않았다')
  check(/setTimeout\(\(\) => setAsk\(false\), \d+\)/.test(sibq),
    '띠는 **스스로 사라진다** — 화면 아래에 남아 다음 일을 가리면 안 된다')
  check(/quiet[\s\S]{0,80}그래도 열기|그래도 열기[\s\S]{0,200}quiet/.test(read(SRC))
        || (sibq.match(/그래도 열기/g) || []).length >= 2,
    '띠에서도 **길은 막지 않는다** — 「그래도 열기」가 있다')
}

// ── ④-3 띄우는 법이 운영체제에 맞는가 ─────────────────────
//
// 2026-09-17 · 사용자 지적: 「run.command 는 맥이고 윈도우 쓰는 사람이 더 많다」.
// 없는 파일을 실행하라고 시키는 안내는 **안 하느니만 못하다** — 시킨 대로 했는데
// 안 되면 그다음부터 이 화면이 하는 말을 안 믿는다.
{
  check(/export function launcherName\(\)/.test(sib), '실행기 이름을 고르는 자리가 있다')
  check(/\/win\/i\.test\(/.test(sib), '**윈도우를 가려낸다**')
  check(/'start\.bat'/.test(sib) && /'start\.command'/.test(sib),
    '**표준 런처 이름을 쓴다**(start.bat · start.command) — 대장 §2 의 네 이름 중 둘')
  check(!/run\.command/.test(sib),
    '맥 전용 이름을 박아 두지 않았다')
  for (const f of CHIPS) {
    check(!/how="run\.command"/.test(strip(read(f))),
      `${f.replace('./src/', '')} 가 맥 전용 이름을 넘기지 않는다`)
  }
}

// ── ⑤ EVER-FOLIO 쪽도 같은가 ─────────────────────────────
// 한쪽만 고치면 반대 방향은 여전히 조용히 죽는다. 그 파일은 다른 저장소에 있어서
// **있을 때만** 잰다 — 없다고 이 저장소의 테스트를 떨어뜨리는 것은 거짓 경보다.
{
  const FOLIO = '../uniever_ebook/ebook-generator/webapp/app.html'
  if (!existsSync(FOLIO)) {
    console.log('· (EVER-FOLIO 저장소가 옆에 없어 건너뜀 — ' + FOLIO + ')')
  } else {
    const h = read(FOLIO)
    const hb = strip(h)   // 주석의 설명을 위반으로 잡지 않도록
    check(/mode:\s*'no-cors'/.test(h), 'FOLIO 쪽도 찔러 본다')
    check(/sib-down/.test(h) && /sib-pop/.test(h), 'FOLIO 쪽도 흐림과 말풍선이 있다')
    check(/그래도 열기/.test(h), 'FOLIO 쪽도 길을 막지 않는다')
    check(/start\.bat/.test(h) && /start\.command/.test(h),
      'FOLIO 쪽도 운영체제에 맞는 실행기 이름을 쓴다')
    check(!/run\.command/.test(hb), 'FOLIO 쪽에 맥 전용 이름이 안 남았다(주석의 설명은 뺀다)')
    // 이쪽의 진짜 위험은 주소가 박히는 것이다. meta 한 줄에서만 와야 한다.
    check(/<meta name="sketch-url"/.test(h), 'FOLIO 쪽 주소는 meta 한 줄에서 온다')
    check(!/id="frameBtn"[^>]*href=/.test(h),
      '**칩에 주소를 박아 두지 않았다** — serve.py 가 meta 만 갈아 끼우면 되게')
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
