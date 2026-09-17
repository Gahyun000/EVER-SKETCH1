// **제목을 두 번 누르면 들어간다 — 그리고 못 들어가면 어디로 가야 하는지 말한다.**
//
// 2026-09-17 · 사용자 영상에서 나온 일이다. 자료 하나를 열려고 제목을 누르고 →
// 오른쪽 끝까지 마우스를 옮겨 상세의 「열기」를 누르고 → 들어갔다. 세 걸음이다.
// **같은 표에서 폴더는 한 번에 들어간다**(`goFolder`). 규칙이 둘이면 손이 걸린다.
//
// 시안 v1.0 으로 정한 것(docs/화면시안_제목더블클릭_진입_v1.0.html):
//   📖 아이콘 → 상세(결재 이력·의견)  ·  제목 한 번 → 고르기  ·  제목 두 번 → 들어가기
//   잠긴 자료 두 번 → 모달로 까닭을 말하고, 닫으면 **다음에 누를 곳**을 가리킨다(㉠ 링)
//
// **이 파일이 지키는 것 셋.**
//   ① 판정이 한 벌인가 — 「열기」 단추와 같은 `locked` 를 봐야 한다. 두 벌이 되면
//      단추로는 막히는데 더블클릭으로는 열리는 날이 온다(오늘 포트에서 겪은 그 모양).
//   ② **표와 카드 양쪽에 있는가** — 창이 822px 아래로 내려가면 표가 카드로 바뀐다.
//      한쪽만 넣으면 **창을 좁힌 순간 기능이 사라지고**, 쓰는 사람은 까닭을 못 찾는다.
//   ③ 못 들어갈 때 **다음 길이 맞는가** — 결재 중에는 수정 요청을 낼 수 없다.
//
// ③ 은 이번에 **거짓말을 하나 찾아서** 생긴 항목이다. 상세 패널이 결재 중일 때도
// 「고치려면 수정 요청을 내세요」라고 했는데, `doc_state.can_request_revision` 은
// **승인됨일 때만** 참이다. 시킨 대로 하려 해도 누를 것이 없었다. 결재 중의 길은 회수다.
//
// 실제로 재 봤다(시험 서버 · Chromium):
//   📖 → 상세 열림 true · 줄 강조 true
//   제목 한 번 → 줄 강조 true · **상세 안 뜸**
//   제목 두 번(초안) → 편집기 진입 true
//   제목 두 번(승인) → 모달, 목록에 그대로 머묾 · 닫으니 「수정 요청」 단추에 링 1개
//   제목 두 번(결재 중) → 모달에 「결재함으로 가기」 · 누르니 주소가 /inbox
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs dblclick_open.test.mjs
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
  .replace(/^\s*(\/\/).*$/gm, '')

const raw = read('./src/persistence/LibraryScreen.tsx')
const lib = strip(raw)
const css = read('./src/index.css')
const py = read('./server/doc_state.py')

// ── ① 판정은 한 벌이다 ────────────────────────────────
{
  const i = lib.indexOf('const openOrExplain')
  const body = i < 0 ? '' : lib.slice(i, lib.indexOf('\n  }', i))
  check(i > 0, '여는 손잡이가 한 곳에 있다(openOrExplain)')
  check(/chips\[p\.id\]\?\.locked/.test(body),
    '**「열기」 단추와 같은 판정을 쓴다**(chips[…].locked) — 두 벌이 되면 반드시 갈라진다')
  check(/openProject\(p\.id\)/.test(body), '안 잠겼으면 그냥 연다')
  check(/setLockInfo\(p\)/.test(body), '잠겼으면 **까닭을 말한다** — 조용히 아무 일도 안 하면 고장으로 읽힌다')
  // 「열기」 단추가 보는 것과 같은 이름인지 대조한다. 이름이 갈리면 규칙도 갈린다.
  check(/disabled=\{!!selChip\?\.locked\}/.test(lib),
    '(근거) 상세의 「열기」도 같은 locked 를 본다')
}

// ── ② 표와 카드 **양쪽**에 있다 ────────────────────────
// 여기가 제일 조용히 반쪽이 되는 자리다. 넓은 창에서 고치고 확인하면 카드 쪽은 안 보인다.
{
  const dbl = (lib.match(/onDoubleClick=\{/g) || []).length
  check(dbl >= 2, '**두 갈래 다 두 번 누르기가 있다**(표 · 카드)', `${dbl}곳`)
  check(/lib-tname-hit/.test(lib) && /lib-open-hit/.test(lib),
    '표의 제목 자리와 카드의 제목 자리가 둘 다 살아 있다')
  // 아이콘도 양쪽에서 따로 눌려야 한다 — 한쪽만 되면 상세를 여는 법이 창 폭에 따라 달라진다.
  check(/className="lib-tico"[\s\S]{0,180}onClick=/.test(lib), '표에서 📖 가 따로 눌린다')
  check(/className="lib-ico-hit"[\s\S]{0,180}onClick=/.test(lib), '카드에서도 📖 가 따로 눌린다')
  check(/\.lib-ico-hit\{/.test(css) && /\.lib-tname-hit\{/.test(css), '두 자리에 모양이 있다')
}

// ── ③ 한 번과 두 번이 다른 일을 한다 ────────────────────
{
  // 한 번에 상세까지 열면, 두 번 누르려고 멈춘 사람에게 패널이 깜빡인다.
  // **자리마다 센다**(부숴 보고 고쳤다, 2026-09-17 · 오늘만 세 번째다).
  // 「파일 어딘가에 있으면 통과」로 두면, 표와 카드 중 **한쪽만 망가뜨려도** 다른 쪽에
  // 걸려 그냥 통과한다 — 정작 망가진 그 자리가 안 잡힌다.
  //
  // **폴더는 뺀다.** 카드 보기의 폴더 줄이 `lib-open-hit` 을 같이 쓰는데, 폴더는
  // **한 번에 들어가는 것이 맞다**(`goFolder`) — 애초에 「폴더는 한 번, 자료는 세 걸음」
  // 이라는 그 비대칭이 이 작업을 부른 이유였다. 자료만 골라 센다.
  //
  // **여는 태그를 `>` 로 끊지 않는다.** 처음엔 `[\s\S]{0,320}?>` 로 잘랐는데,
  // `onClick={() => goFolder(f.id)}` 의 **화살표 안 `>`** 에 먼저 걸려 창이 반 토막 났다.
  // 오늘 아침 `ClassicBar` 에서 똑같이 당하고 적어 뒀는데 또 했다. 그냥 넉넉한 창을 본다.
  const hits = [...lib.matchAll(/<button className="(lib-tname-hit|lib-open-hit)"/g)]
    .map((m) => [m[0], lib.slice(m.index, m.index + 340)])
    .filter((m) => !/goFolder\(/.test(m[1]))
  check(hits.length === 2, '자료의 제목을 누르는 자리가 둘이다(표 · 카드)', `${hits.length}곳`)
  check(/className="lib-open-hit"[^>]*onClick=\{\(\) => goFolder\(/.test(lib),
    '(대조) **폴더는 여전히 한 번에 들어간다** — 여기까지 두 번 누르게 만들면 되레 나빠진다')
  const opensDetail = hits.filter((m) => /setSel\(/.test(m[1])).length
  check(opensDetail === 0,
    '**제목 한 번은 고르기만 한다** — 상세는 📖 가 연다. 한 번에 상세까지 열면 두 번 누르려고 멈춘 사람에게 패널이 깜빡인다',
    `${opensDetail}곳이 상세를 연다`)
  const noPick = hits.filter((m) => !/setPick\(p\.id\)/.test(m[1])).length
  check(noPick === 0, '두 자리 다 줄을 고른다', `${noPick}곳 빠짐`)
  check(/setPick\(p\.id\); setSel\(p\)/.test(lib),
    '📖 를 누르면 상세가 열리고 줄도 같이 고른다')
  // 이름을 고치는 중에는 글자를 두 번 눌러 고르는 일이 흔하다.
  // 이것도 자리마다 센다 — 한쪽에만 막아 두면 다른 쪽에서 글자를 고르다 편집기로 끌려간다.
  // 여기도 같은 이유로 `>` 로 끊지 않는다.
  const dbls = [...lib.matchAll(/onDoubleClick=\{/g)]
    .map((m) => ['', lib.slice(m.index, m.index + 160)])
  check(dbls.length === 2, '두 번 누르는 자리가 둘이다(표 · 카드)', `${dbls.length}곳`)
  const unguarded = dbls.filter((m) => !/editing\?\.id !== p\.id/.test(m[1])).length
  check(unguarded === 0,
    '**두 자리 다** 이름 고치는 중에는 안 들어간다 — 글자를 두 번 눌러 고르려던 것이다',
    `${unguarded}곳 빠짐`)
  check(/\.lib-tname-hit\{[^}]*user-select:none/.test(css),
    '두 번 눌러도 **제목 글자가 선택되지 않는다** — 안 막으면 매번 파랗게 드래그된다')
}

// ── ④ 못 들어갈 때 **다음 길**이 맞는가 ──────────────────
// 이번에 거짓말을 하나 고쳤다. 그 거짓말이 되살아나는지 여기서 본다.
{
  check(/return state == APPROVED/.test(py),
    '(근거) 서버: 수정 요청은 **승인됨일 때만** 낼 수 있다')
  const i = lib.indexOf('{lockInfo && (')
  const modal = i < 0 ? '' : lib.slice(i, i + 2200)
  check(i > 0, '잠금 모달이 있다')
  check(/state === 'pending'/.test(modal),
    '**결재 중과 승인됨을 갈라 말한다** — 다음 길이 서로 다르다')
  check(/회수/.test(modal), '결재 중에는 **회수**를 알려 준다')
  check(/go\('inbox'\)/.test(modal),
    '결재 중은 가리키는 대신 **데려다준다** — 줄에는 짚을 단추가 없다')
  check(/setPointAt\(id\)/.test(modal),
    '승인됨은 닫은 뒤 **그 자리를 가리킨다**')
  // 브라우저 기본 창은 UI 표준이 금지한다.
  check(!/\b(alert|confirm|prompt)\(/.test(lib), '브라우저 기본 경고창을 안 쓴다')

  // **상세 패널의 같은 문장도 고쳐졌는가.** 모달만 고치고 패널을 두면 한 화면이
  // 두 말을 한다 — 그게 이번에 찾은 거짓말의 원래 자리다.
  const j = lib.indexOf('lib-d-lock')
  const lock = j < 0 ? '' : lib.slice(j, j + 620)
  check(/pending[\s\S]{0,140}회수/.test(lock),
    '**상세 패널도** 결재 중에는 회수를 말한다 — 여기가 「수정 요청을 내세요」라고 거짓말하던 자리다')
  check(/승인된 자료라[\s\S]{0,80}수정 요청/.test(lock), '승인됨에는 수정 요청을 말한다')
}

// ── ⑤ 가리키기가 **끝나는가** ───────────────────────────
// 끝없이 반짝이면 그때부터는 방해다. 사람이 알아채면 그만둬야 한다.
{
  check(/@keyframes libPointRing/.test(css), '가리키는 링이 있다')
  check(/animation:libPointRing [^;}]*\s3(\s|;|})/.test(css),
    '**세 번만 돌고 멈춘다** — 무한 반복이면 표를 못 읽는다')
  check(/prefers-reduced-motion: reduce[\s\S]{0,220}\.lib-act\.lib-point\{animation:none/.test(css),
    '움직임을 줄여 달라고 한 사람에게는 **테두리만** 남긴다 — 규칙은 지키되 말은 남긴다')
  const k = lib.indexOf('if (!pointAt) return')
  const eff = k < 0 ? '' : lib.slice(k, k + 420)
  check(/setTimeout\(off/.test(eff), '시간이 지나면 스스로 꺼진다')
  check(/addEventListener\('pointerdown', off/.test(eff),
    '아무 데나 누르면 즉시 꺼진다 — 이미 알아챈 사람에게 계속 반짝이면 방해다')
  check(/setPointAt\(null\); setRevising/.test(lib),
    '그 단추를 실제로 누르면 링도 같이 끈다')
}

// ── ⑥ 시안이 남아 있는가 ────────────────────────────────
// 「왜 이렇게 정했나」를 다음 사람이 볼 수 있어야 한다. 셋 중 하나를 고른 자리다.
{
  check(existsSync('./docs/화면시안_제목더블클릭_진입_v1.0.html'),
    '고르던 시안이 저장소에 남아 있다(㉠·㉡·㉢ 중 ㉠ 을 고른 근거)')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
