// 읽기 전용 뷰어(㉰)의 **확정된 규칙**을 지킨다.
//
// 시안 `docs/화면시안_팀공유_새탭뷰어_흐름_v1.0.html` 에서 확정한 것:
//   · 미리보기는 **남는다.** 역할만 바뀐다 — 확인은 제자리, 읽기는 새 탭.
//   · 새 탭은 **자료 하나뿐.** 목록도 탭도 없다.
//   · 주소가 생기므로 「이 링크 아무나 보나」에 **화면이 먼저 답한다.**
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs viewer_screen.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { viewerIdFromPath, wantsSharedFromSearch } from './src/teamlib/teamLibraryModel.ts'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ══════════ 주소를 읽는 규칙 ══════════
check(viewerIdFromPath('/view/a7541122da58a') === 'a7541122da58a', '주소에서 결재 id 를 읽는다')
check(viewerIdFromPath('/view/a7541122da58a/') === 'a7541122da58a', '끝의 빗금이 있어도 읽는다')
check(viewerIdFromPath('/') === null && viewerIdFromPath('') === null,
  '보통 주소에서는 뷰어를 켜지 않는다')
check(viewerIdFromPath('/view/') === null, 'id 없는 주소는 뷰어가 아니다')
check(viewerIdFromPath('/view/../../etc/passwd') === null,
  '경로를 거슬러 올라가는 주소를 id 로 읽지 않는다')
check(viewerIdFromPath('/view/a b') === null && viewerIdFromPath('/view/<script>') === null,
  '이상한 글자가 섞인 id 는 안 읽는다 — 그대로 주소에 붙여 부르는 값이다')
check(viewerIdFromPath('/view/' + 'x'.repeat(200)) === null, '터무니없이 긴 id 는 안 읽는다')
check(viewerIdFromPath('/viewer/abc') === null && viewerIdFromPath('/x/view/abc') === null,
  '비슷한 주소에 걸리지 않는다')

// ══════════ 돌아가는 길 (2026-09-07 확정: ㉡) ══════════
check(wantsSharedFromSearch('?shared=1') === true, '주소가 팀 공유를 열어 달라고 하면 읽는다')
check(wantsSharedFromSearch('?a=1&shared=1&b=2') === true, '다른 값이 섞여 있어도 읽는다')
check(wantsSharedFromSearch('') === false && wantsSharedFromSearch('?x=1') === false,
  '보통 주소에서는 안 연다')
check(wantsSharedFromSearch('?shared=0') === false && wantsSharedFromSearch('?shared') === false,
  '**값이 1일 때만** 연다 — 「shared 가 있으면」으로 두면 오타에도 열린다')
check(wantsSharedFromSearch(null) === false && wantsSharedFromSearch(undefined) === false,
  '값이 없어도 안 터진다')

// ══════════ 소스에서 못박는 규칙 ══════════
const app = read('./src/App.tsx')
const viewer = read('./src/teamlib/ApprovalViewer.tsx')
const panel = read('./src/teamlib/TeamLibraryPanel.tsx')
const css = read('./src/auth/auth.css')
const routes = read('./server/app.py')

const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const viewerCode = bare(viewer)
const panelCode = bare(panel)

// 로그인 뒤에 그린다 — 주소만 안다고 열리면 안 된다.
check(/AuthGate[\s\S]{0,400}ApprovalViewer/.test(bare(app)),
  '뷰어도 로그인 관문 **안**에 있다 (주소만으로는 안 열린다)')
check(/viewerIdFromPath\(window\.location\.pathname\)/.test(bare(app)),
  '주소로 화면을 가르는 자리가 App 한 곳뿐이다')
check(!/react-router|createBrowserRouter/.test(app),
  '라우터를 들이지 않았다 — 갈래가 하나뿐이다')

// 판정은 서버가 한다.
check(/apiTeamApproval/.test(viewerCode) && !/role\s*===|team_ids/.test(viewerCode),
  '화면이 등급·팀으로 다시 거르지 않는다 — 판정은 서버(can_see_approval)가 한다')
check(/status === 404[\s\S]{0,120}denied/.test(viewerCode),
  '404 를 「볼 수 없음」으로 받는다')
check(/같은 팀 사람만/.test(viewer) && !/없는 자료|존재하지 않/.test(viewer),
  '**「없다」고 말하지 않는다** — 서버가 없음과 남의 것을 일부러 같은 답으로 뭉갰다')
check(/이 자료를 만든 팀만 볼 수 있어요/.test(viewer),
  '「이 링크 아무나 보나」에 화면이 먼저 답한다')

// 읽는 화면이다 — 쓰는 길이 없어야 한다.
check(!/method:\s*['"](POST|PUT|PATCH|DELETE)/.test(viewer) && !/apiDecide|apiRequest|apiAddComment/.test(viewerCode),
  '뷰어에는 **쓰는 길이 없다**')
check(/읽기 전용/.test(viewer) && /\.tv-ro\s*\{[^}]*background/.test(css),
  '「읽기 전용」을 **글자로** 말한다 (자물쇠 그림만 두지 않는다)')

// 한 장짜리에 필름스트립·쪽번호를 두지 않는다.
check(/pages <= 1 \? ' one'/.test(viewerCode) && /\.tv\.one \.ap-film[^{]*\{[^}]*display:\s*none/.test(css),
  '한 장짜리 자료에는 필름스트립과 「1 / 1」이 안 뜬다')

// 「수정 중」은 그림이 아니라 글자다(D8).
check(/직전 승인본/.test(viewer), '「수정 중」이면 지금 보이는 것이 직전 승인본이라고 말한다')

// ── 앞 화면: 미리보기는 남고, 두 군데로 들어간다 ──
check(/SlideViewer/.test(panelCode), '**팀 공유의 미리보기는 그대로 있다** (확인하는 자리)')
check(/새 탭에서 크게 보기/.test(panel), '「새 탭에서 크게 보기」 버튼이 있다')
check(/tl-peek[\s\S]{0,200}openBig/.test(panelCode) || /openBig[\s\S]{0,200}tl-peek/.test(panelCode),
  '미리보기 **그림 자체도** 눌린다')
check(/<button className="ap-viewer tl-peek"/.test(panel),
  '그림을 감싼 것이 button 이다 — 키보드로도 닿는다')
check(/window\.open\(`\/view\/\$\{aid\}`, '_blank'/.test(panelCode),
  '**새 탭**으로 연다 — 앞 창이 남아 고르던 자리를 잃지 않는다')
check(/noopener/.test(panelCode), '새 탭에 noopener 를 준다')
check(/\.tl-peek:hover \.tl-peek-veil/.test(css) && /focus-visible/.test(css),
  '눌리는 자리임을 올려 보거나 탭으로 짚으면 알 수 있다')

// ── 돌아가는 길: 뷰어 → 팀 공유 ──
// **이게 없으면 링크를 받은 사람은 문서 한 장을 보고 끝이다.** 그 사람에게는
// 닫고 돌아갈 앞 창이 아예 없다 — 이 탭이 전부다.
const lib = read('./src/persistence/LibraryScreen.tsx')
const libCode = bare(lib)
// 2026-09-17 · **이 줄은 한 번 헛돌았다.** 예전엔 `/팀 공유 열기/.test(viewer)` 였는데,
// 그날 그 단추를 ✕ 로 바꾸면서 **글자는 주석에만 남았고 가드는 그대로 통과했다.**
// (`viewer` 는 주석을 안 걷은 원본이다.) 나가는 길이 통째로 사라져도 모를 뻔했다.
// 그래서 **주석을 걷은 쪽(viewerCode)에서 실제 단추**를 본다.
check(/className="es-mini tv-x"/.test(viewerCode),
  '뷰어에 나가는 단추(✕)가 있다 — 모양이 바뀌어도 「나갈 자리」는 있어야 한다')
check(/window\.location\.href = '\/\?shared=1'/.test(viewerCode),
  '`/` 가 아니라 **팀 공유로** 보낸다 (방금까지 보던 것이 팀 자료다)')
check(/wantsSharedFromSearch\(window\.location\.search\)/.test(libCode),
  '자료 목록이 그 주소를 읽어 창을 열어 둔다')
// 2026-09-10 · 셸이 들어오면서 자료 화면도 주소를 쓰게 됐다(`pushState`).
// 그래서 「pushState 가 없다」로는 더 못 잡는다 — **`?shared=1` 로 들어온 길만**
// 갈아 끼우는지를 본다. 밀어 넣으면 뒤로 가기가 `/?shared=1` 로 돌아가고,
// 그 주소는 팀 공유를 또 연다 — 고치려던 증상이 뒤로 가기로 되살아난다.
check(/wantsSharedFromSearch\(window\.location\.search\)\) go\('team', true\)/.test(libCode),
  '읽은 뒤 주소에서 지운다 — 안 지우면 창을 닫아도 새로 고칠 때마다 다시 열린다')
check(/if \(replace\) window\.history\.replaceState/.test(libCode),
  '그 길만 replaceState 로 갈아 끼운다')

// ── 서버: 껍데기만 준다 ──
check(/@app\.get\("\/view\/\{aid\}"\)/.test(routes), '뷰어 주소가 서버에 있다')
check(/FileResponse/.test(routes) && /index\.html/.test(routes), '화면 껍데기(index.html)를 준다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
