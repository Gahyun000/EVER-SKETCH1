// 이식해 온 `SlideViewer` 가 **기대는 CSS** 를 지킨다.
//
// 왜 이 파일이 있는가 — 2026-09-07 에 팀 공유·결재함의 슬라이드가 통째로 안 보이는
// 것을 발견했다. 원인은 코드가 아니라 **안 가져온 CSS 두 줄**이었다:
//
//     .ap-scaler>div{position:absolute;left:0;top:0;transform-origin:top left}
//
// `SlideViewer.tsx` 는 ebook_html1 에서 **무수정**으로 가져왔고 tsc 도 서버 테스트도
// 초록이었다. 그런데 그 컴포넌트의 정확성은 같이 안 가져온 `approvals.css` 에 달려 있었다.
// `transform: scale()` 의 기본 원점은 가운데라, 원점을 안 잡으면 그림이 클립 상자
// 밖으로 밀려나고 `overflow:hidden` 이 지운다 — **요소는 DOM 에 다 있는데 화면은 빈 채로.**
//
// 타입 검사도 서버 테스트도 못 잡는 종류라, 여기서 CSS 자체를 못박는다.
//
// 실행: node slide_viewer_css.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const css = read('./src/auth/auth.css')
const viewer = read('./src/approvals/SlideViewer.tsx')
// 주석을 걷고 공백을 지운 사본 — 서식이 바뀌어도 규칙 자체는 지켜지고,
// **설명 글이 선택자로 읽히지도 않는다**: 주석을 안 걷었더니 주석 닫는 기호가
// 바로 뒤 선택자에 붙어 「.es-card.ap-card 규칙이 없다」로 잘못 걸렸다.
const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

// ── 축소가 어긋나지 않는다 ──────────────────────────
check(/\.ap-scaler>div\{[^}]*transform-origin:topleft/.test(flat),
  '.ap-scaler>div 에 transform-origin:top left 가 있다 (없으면 슬라이드가 통째로 안 보인다)')
check(/\.ap-scaler>div\{[^}]*position:absolute/.test(flat) &&
      /\.ap-scaler>div\{[^}]*left:0/.test(flat) && /\.ap-scaler>div\{[^}]*top:0/.test(flat),
  '.ap-scaler>div 가 왼쪽 위에 붙는다')
check(/\.ap-scaler\{[^}]*position:relative/.test(flat),
  '.ap-scaler 가 position:relative 다 (자식의 absolute 가 기댈 자리)')
check(/\.ap-scaler\{[^}]*overflow:hidden/.test(flat),
  '.ap-scaler 가 넘치는 부분을 자른다')

// 컴포넌트가 정말 그 구조를 그리는지 — 클래스 이름만 지키면 의미가 없다.
check(/className="ap-scaler"/.test(viewer) && viewer.includes('scale(') && viewer.includes('transform'),
  'SlideViewer 가 .ap-scaler 안에서 scale() 로 줄인다 (CSS 가 지키는 대상이 맞다)')
check(!/transform-origin/.test(viewer),
  '원점은 **CSS 가** 정한다 — 컴포넌트는 무수정 이식본이라 여기에 손대지 않는다')

// ── 같은 카드는 같은 크기로 ──────────────────────────
// 결재함(.ap)과 팀 공유(.tl)가 같은 `ap-card` 를 쓰는데 규칙이 `.ap` 안에만 있어서
// 팀 공유만 860px 로 떴다. 같은 이름을 쓰면서 크기가 다른 이유는 어디에도 없었다.
check(/(^|[},])\.es-card\.ap-card\{/.test(flat),
  '.ap-card 규칙이 특정 화면(.ap) 안에 갇혀 있지 않다')
check(!/\.ap\s+\.es-card\.ap-card/.test(css),
  '.ap 스코프가 다시 붙지 않았다 (붙으면 팀 공유가 또 좁아진다)')
check(/\.es-card\.ap-card\{[^}]*max-width:1180px/.test(flat), '카드 최대 폭 1180px')
check(/\.es-card\.ap-card\{[^}]*max-height:92vh/.test(flat), '카드가 화면을 넘지 않는다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
