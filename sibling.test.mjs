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
  check(/title=\{down[\s\S]{0,200}안 떠 있습니다/.test(sib),
    '툴팁도 같이 바뀐다 — 안 눌러도 마우스만 올리면 안다')
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
    check(/how="run\.command"/.test(src), `${f.replace('./src/', '')} 가 띄우는 법을 알려 준다`)
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
    check(/mode:\s*'no-cors'/.test(h), 'FOLIO 쪽도 찔러 본다')
    check(/sib-down/.test(h) && /sib-pop/.test(h), 'FOLIO 쪽도 흐림과 말풍선이 있다')
    check(/그래도 열기/.test(h), 'FOLIO 쪽도 길을 막지 않는다')
    // 이쪽의 진짜 위험은 주소가 박히는 것이다. meta 한 줄에서만 와야 한다.
    check(/<meta name="sketch-url"/.test(h), 'FOLIO 쪽 주소는 meta 한 줄에서 온다')
    check(!/id="frameBtn"[^>]*href=/.test(h),
      '**칩에 주소를 박아 두지 않았다** — serve.py 가 meta 만 갈아 끼우면 되게')
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
