// **승인본 뷰어에서 나가는 길.**
//
// 2026-09-17 · 사용자 판단: 「여기서 팀 공유 열기보다 X 버튼이 더 좋을 것 같은데」.
//
// 맞았다. 이 화면은 팀 공유의 **「새 탭에서 크게 보기」로 열린다** — 즉 앞 탭에 팀 공유가
// 그대로 남아 있는데, 예전 단추는 **이 탭을 팀 공유로 바꿔** 버려서 같은 화면이 두 탭이 됐다.
// 사람은 결국 하나를 손으로 닫았다. 단추가 시킨 일이 사람이 원한 일이 아니었다.
//
// **이 파일이 지키는 것은 사실상 하나다 — 되돌아가는 길.**
//
// 닫기는 늘 되지 않는다. 브라우저는 스크립트가 연 탭만 스크립트로 닫게 해 준다.
// 실제로 재 봤다(Chromium):
//   · 「새 탭에서 크게 보기」로 열린 탭 → 닫힌다(탭 2→1). 거의 모든 경우가 이것.
//   · 사람이 주소를 직접 연 탭      → **안 닫힌다.** 아무 일도 안 일어난다.
// `window.opener` 로는 못 가린다(`noopener` 라 둘 다 없다). 눌러 보기 전에는 알 수 없다.
//
// 그래서 **닫아 보고, 그래도 여기 있으면 팀 공유로 보낸다.** 이 뒷길이 끊기면
// 링크를 받은 사람은 **막다른 화면에 갇힌다** — 닫히지도 않고 갈 데도 없다.
// 예전 단추가 하던 일이 없어진 게 아니라 ✕ 뒤로 들어온 것이고, 그 사실을 여기서 지킨다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs viewer_close.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const v = bare(read('./src/teamlib/ApprovalViewer.tsx'))
const panel = bare(read('./src/teamlib/TeamLibraryPanel.tsx'))
const model = read('./src/teamlib/teamLibraryModel.ts')
const lib = bare(read('./src/persistence/LibraryScreen.tsx'))
const css = read('./src/auth/auth.css')

// 머리줄의 단추 자리만 잘라 본다 — 「지난 승인본」의 닫기(X)와 섞이면 안 된다.
const hi = v.indexOf('<div className="tv-head">')
const head = hi < 0 ? '' : v.slice(hi, v.indexOf('</div>', v.indexOf('tv-x')) + 6)

// ── ① 나가는 단추가 ✕ 하나다 ─────────────────────────
{
  check(hi > 0, '머리줄이 있다')
  check(/className="es-mini tv-x"/.test(head), '머리줄에 ✕ 단추가 있다')
  check(!/팀 공유 열기/.test(v), '「팀 공유 열기」 글자 단추는 없어졌다')
  check(!/es-mini primary/.test(head),
    '**파란색이 아니다** — 이 화면에서 할 일은 읽는 것이고, 닫기는 창틀이다')
  // 아이콘뿐이라 이름이 없으면 읽어 주는 도구에서 「버튼」으로만 들린다.
  check(/title="닫기"/.test(head) && /aria-label="닫기"/.test(head),
    '그림뿐이라 **이름을 붙였다**(title · aria-label)')
  check(/\.tv-x\s*\{/.test(css), '✕ 의 모양이 있다 — 없으면 글자 단추 폭 그대로 넓어진다')
}

// ── ② 닫아 본다 ────────────────────────────────────
{
  check(/window\.close\(\)/.test(head), '먼저 닫아 본다')
}

// ── ③ **못 닫으면 되돌아간다** — 이 파일의 핵심 ──────────
//
// 여기가 끊기면 링크를 받은 사람은 닫히지도 않고 갈 데도 없는 화면에 갇힌다.
// 「닫기만 있고 뒷길이 없는」 상태는 아무 오류도 안 내고 테스트도 다 통과한다.
{
  check(/window\.setTimeout\(/.test(head),
    '**닫고 나서 뒤를 본다** — 닫혔으면 이 타이머는 영영 안 돈다')
  check(/window\.location\.href = '\/\?shared=1'/.test(head),
    '**못 닫았으면 팀 공유로 보낸다** — 여기가 막다른 화면을 막는 유일한 길이다')
  // 순서가 중요하다. 먼저 옮겨 가면 닫을 기회가 없어진다.
  const ci = head.indexOf('window.close()')
  const ni = head.indexOf("window.location.href = '/?shared=1'")
  check(ci > 0 && ni > ci, '**닫기가 먼저다** — 먼저 옮겨 가면 닫을 기회가 사라진다')
  // 지연이 0 이면 닫히는 중에도 주소를 바꿔 버려 **늘 팀 공유로 간다**(= ✕ 가 안 닫힘).
  const ms = (head.match(/\},\s*(\d+)\)/) || [])[1]
  check(ms && Number(ms) >= 50,
    '잠깐 기다렸다가 본다 — 0 이면 닫히는 중에 주소를 바꿔 **늘 팀 공유로 간다**', '지연=' + ms)
}

// ── ④ 그 뒷길이 실제로 닿는 곳이 있는가 ──────────────────
// `/?shared=1` 은 약속이다. 받는 쪽이 없어지면 ✕ 는 빈 화면으로 보낸다.
{
  check(/shared/.test(model), '주소에 실린 「팀 공유를 열어 달라」를 읽는 자리가 있다')
  // **부분문자열 함정을 피한다**(부수기 I 에서 드러났다). 처음엔 이름만 찾았는데,
  // `wantsSharedFromSearchX` 로 바꿔도 그 안에 옛 이름이 그대로 들어 있어 통과했다.
  // 「이름이 보이나」가 아니라 **「그 함수를 부르나」**를 본다.
  check(/wantsSharedFromSearch\(/.test(lib),
    '**라이브러리가 그 표시를 보고 팀 공유로 연다** — 받는 쪽이 살아 있다')
}

// ── ⑤ 전제가 그대로인가 ───────────────────────────────
// 이 설계는 「이 화면이 새 탭으로 열린다」에 기대고 있다. 그게 바뀌면 ✕ 는
// **앞 탭을 닫아** 사람이 보던 것을 통째로 없앤다.
{
  check(/window\.open\(`\/view\/\$\{aid\}`, '_blank'/.test(panel),
    '**여전히 새 탭으로 연다** — 이게 바뀌면 ✕ 가 보던 창을 닫아 버린다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
