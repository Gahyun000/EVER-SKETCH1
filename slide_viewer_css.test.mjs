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
// 바로 뒤 선택자에 붙어 「그런 규칙이 없다」로 잘못 걸렸다.
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

// ── 결재함과 팀 공유는 같은 몸이다 ──────────────────
//
// **이 자리는 원래 카드를 지켰다**(2026-09-07 ~ 09-15). 두 화면이 같은 `ap-card` 를
// 쓰는데 규칙이 `.ap` 안에만 걸려 있어 팀 공유만 860px 로 떴고, 그래서 여기서
// 「카드 최대 폭 1180px · 최대 높이 92vh」를 못박았다.
//
// **그 못을 뽑았다.** 지키려던 것은 1180 이라는 숫자가 아니라 「두 화면이 같은 크기로
// 뜬다」였는데, 2026-09-15 에 카드 자체를 걷어 화면이 곧 마스터-디테일이 되면서
// 그 숫자가 지킬 대상이 아니라 **없애야 할 대상**이 됐다. 1512px 창에서 332px 이
// 놀고 상세가 860 에 갇히는 것이 바로 그 숫자 때문이었다.
//
// 그래서 단언을 지우지 않고 **뜻을 그대로 옮겼다**: 여전히 두 화면이 같은 뼈대를
// 쓰는지, 그리고 **다시 카드로 가두지 않았는지**를 본다.
const apx = read('./src/approvals/ApprovalsPanel.tsx')
const tlx = read('./src/teamlib/TeamLibraryPanel.tsx')

check(!/es-card/.test(apx) && !/es-card/.test(tlx),
  '결재함·팀 공유를 카드로 다시 감싸지 않았다 (감싸면 화면 한가운데 섬이 된다)')
check(['md-screen', 'md-top', 'md-body', 'md-grip'].every((c) => apx.includes(c) && tlx.includes(c)),
  '두 화면이 같은 뼈대를 쓴다 (.md-screen · .md-top · .md-body · .md-grip)')
check(/\.sh-page\.md-screen\{[^}]*overflow:hidden/.test(flat),
  '화면 자체는 안 구른다 — 구르는 것은 목록과 상세 안쪽뿐이다')
check(/\.ap-body\{[^}]*display:grid/.test(flat) &&
      /\.ap-body\{[^}]*grid-template-columns:320pxauto1fr/.test(flat),
  '목록 | 손잡이 | 상세 — 칸이 **셋**이고 목록 기본 320px, 남는 자리는 전부 상세가 쓴다(①ㄱ)')
check(!/\.ap-body\{[^}]*max-width/.test(flat) && !/\.ap-detail\{[^}]*max-width/.test(flat),
  '목록·상세에 최대 폭이 다시 붙지 않았다 (붙는 순간 상세가 도로 갇힌다)')
check(/\.md-grip\{[^}]*cursor:col-resize/.test(flat),
  '경계선이 곧 끄는 손잡이다(④ㄴ)')
// 폭은 컴포넌트가 인라인으로 준다. 인라인은 선택자로 못 이기므로, 좁은 화면 규칙이
// `!important` 를 안 달면 **한 줄로 쌓이라는 말이 무시된다** — 붙였다 뗐다 하기 쉬운
// 표시라 여기서 못박는다.
check(/@media\(max-width:860px\)\{[\s\S]*?\.ap-body\{[^}]*grid-template-columns:1fr!important/.test(flat),
  '좁은 화면에서 칸 쌓기가 인라인 폭을 이긴다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
