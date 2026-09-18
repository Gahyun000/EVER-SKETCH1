// **전체 화면으로 덮는 것들의 키가 정말 듣는가.**
//
// 2026-09-17~18 · 「30초 시연」을 보기 메뉴로 옮기다가 **Esc 가 안 닫힌다**는 것을 발견했다.
// ✕ 는 됐다. 이어서 재 보니 **발표(슬라이드쇼)도 같았다** — 나가는 단추에 「✕ 나가기 (Esc)」
// 라고 적어 두고 그 Esc 가 안 먹었다.
//
// ── 까닭 (이 파일이 있는 이유의 전부다) ────────────────────────
// 리스너가 **없어서**가 아니라, **키가 퍼지는 도중에 떼였다 붙어서** 안 불린 것이다.
//   ① `onClose` 는 부모가 렌더마다 새로 만드는 화살표라 deps 에 넣으면
//      효과가 **렌더마다** 떼였다 다시 붙는다.
//   ② 키를 누르면 다른 리스너(캔버스·단축키)가 먼저 받아 setState 를 하고,
//      키 이벤트는 discrete 라 React 18 이 **그 자리에서 곧바로** 다시 그린다.
//   ③ 그 다시 그리기가 **이벤트가 아직 퍼지는 도중에** 리스너를 떼었다 붙인다.
//      DOM 규칙상 퍼지는 도중에 떼인 리스너는 안 불리고, 새로 붙은 것도 안 불린다.
//
// **등록은 멀쩡한데 한 번도 안 불린다.** 그래서 코드를 아무리 읽어도 안 보인다.
// 브라우저에서 확인한 방법을 적어 둔다 — 다음에 또 만나면 이 순서로 재면 된다:
//   · 그 리스너 **뒤에** 시험용 리스너를 붙여 본다 → 불린다(즉 이벤트는 거기까지 온다)
//   · addEventListener 를 감싸 기록해 두고 핸들러를 **손으로** 불러 본다 → 창이 닫힌다
//   · 곧 핸들러는 멀쩡하고 **키가 못 닿은 것**이다
//
// 고치는 법은 하나뿐이다. **붙였다 떼지 않는 것** — deps 는 `open` 하나로 두고,
// 렌더마다 바뀌는 값(닫는 함수·쪽 수)은 ref 로 본다.
//
// ── 그리고 **까닭이 하나 더 있었다** (2026-09-18) ──────────────
// 위를 고치고도 **표 칸을 하나 골라 둔 채로 발표를 켜면 여전히 안 닫혔다.**
// 캔버스가 표 칸 조작용으로 **window 의 capture** 단계에서 키를 듣는데, Escape 를
// 「고른 칸 풀기」로 삼고 stopPropagation 한다. capture 는 제일 먼저다 — 위에 전체 화면이
// 덮여 있어도 **아래가 먼저 먹어 치웠다.** 그래서 규칙을 하나 세웠다:
// **위를 덮은 것이 있으면 아래는 키를 건드리지 않는다**(src/ui/overlay.ts).
//
// **아직 같은 모양인 곳이 남아 있다**(일부러 안 건드렸다):
//   · src/approvals/SlideViewer.tsx — deps `[idx, pages.length, onIdx]`. 화살표 넘기기.
// 따로 정하고 손대기로 했다. 여기에 적어 두는 이유는 **잊지 않기 위해서**다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs overlay_keys.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const read = (p) => bare(readFileSync(p, 'utf8'))

// 고쳐 둔 두 곳. 같은 규칙, 같은 검사.
const CASES = [
  { f: './src/builder/Present.tsx', name: '발표(슬라이드쇼)' },
  { f: './src/builder/TutorialPlayer.tsx', name: '30초 시연' },
]

for (const { f, name } of CASES) {
  const s = read(f)
  const i = s.indexOf("window.addEventListener('keydown'")
  const j = s.indexOf('}, [', i)
  const deps = j < 0 ? '' : s.slice(j, s.indexOf(')', j) + 1)
  check(i > 0, `${name}: 키를 듣는다`)
  check(/^\}, \[open\]\)$/.test(deps.trim()),
    `**${name}: 리스너가 렌더마다 붙었다 떼지지 않는다**(deps 는 open 뿐)`, deps.trim())
  // deps 에서 뺀 값을 그냥 쓰면 **옛 값**을 부른다 — 안 부르는 것만큼이나 조용한 결함이다.
  check(/closeRef\.current\(\)/.test(s),
    `${name}: 닫는 함수는 ref 로 본다 — deps 에서 뺀 값을 그냥 쓰면 옛 함수를 부른다`)
  check(!/\}, \[open, onClose\]\)/.test(s) && !/onClose\]\)/.test(s),
    `${name}: deps 에 onClose 가 없다 — 이게 들어오는 순간 Esc 가 통째로 죽는다`)
}

// 발표는 화살표·스페이스도 같은 리스너를 탄다. 쪽 수도 ref 로 봐야 deps 가 안 는다.
{
  const s = read('./src/builder/Present.tsx')
  // **리스너 안에서** ref 를 보는지 재야 한다. 파일 어딘가의 `lenRef.current = pages.length`
  // 대입만 보고 통과시키면, 정작 핸들러가 pages.length 를 그대로 써도 못 잡는다
  // (처음 쓴 검사가 딱 그래서 헛돌았다 — 일부러 깨뜨려 보고 알았다).
  const k = s.indexOf("function onKey")
  const body = k < 0 ? '' : s.slice(k, s.indexOf('}, [', k))
  check(/lenRef\.current/.test(body) && !/pages\.length/.test(body),
    '발표: **리스너 안에서** 쪽 수를 ref 로 본다 — deps 에 넣으면 쪽이 늘 때마다 다시 붙는다')
  check(/ArrowRight/.test(s) && /ArrowLeft/.test(s), '발표: 화살표 넘기기가 같은 리스너에 있다')
}

// 나가는 길이 **키 말고도** 있는가. 키가 안 통하는 자리에서 유일한 출구다.
{
  // 발표에는 나가는 단추가 **두 자리**에 있다 — 쪽이 없을 때 뜨는 화면에도 하나 있다.
  // 하나만 세면 다른 하나가 사라져도 통과한다. 쪽이 없는 화면이야말로 갇히기 쉬운 자리다.
  const px = (read('./src/builder/Present.tsx').match(/className="pexit"/g) || []).length
  check(px === 2, '발표: ✕ 나가기 단추가 **두 화면 모두**에 있다(쪽이 있을 때 · 없을 때)', `${px}곳`)
  check(/className="tutp-x"/.test(read('./src/builder/TutorialPlayer.tsx')), '시연: ✕ 닫기 단추가 있다')
}

// ── 덮였으면 아래는 키를 안 건드리는가 ──────────────────
// 여기는 글자 맞추기로는 못 믿는다 — **세는 일**이라 실제로 돌려서 잰다.
{
  const { overlayOpen, useOverlay, _resetOverlays } = await import('./src/ui/overlay.ts')
  _resetOverlays()
  check(typeof useOverlay === 'function', '덮는 것이 스스로 세는 손잡이가 있다')
  check(overlayOpen() === false, '아무것도 안 덮였으면 거짓이다')

  // 훅은 리액트가 있어야 도니, 세는 부분만 같은 방식으로 흉내 내 본다.
  // **참/거짓이 아니라 수여야 한다** — 발표 위에 모달이 또 뜨는 일이 있고,
  // 그때 하나가 닫혔다고 아래가 곧바로 키를 가져가면 안 된다.
  const src = readFileSync('./src/ui/overlay.ts', 'utf8')
  check(/depth \+= 1/.test(src) && /depth - 1/.test(src),
    '**참/거짓이 아니라 수로 센다** — 겹쳐 뜬 것 하나가 닫혔다고 아래가 키를 가져가면 안 된다')
  check(/Math\.max\(0, depth - 1\)/.test(src), '수가 음수로 내려가지 않는다')
  check(!/useState|zustand|create\(/.test(src),
    '**리액트 상태로 두지 않는다** — 이 값은 키가 왔을 때 읽히지, 그리는 동안 읽히지 않는다. '
    + '상태로 두면 덮일 때마다 캔버스가 통째로 다시 그려지는데, 그 다시 그리기가 바로 첫 번째 결함의 원인이었다')

  // 덮는 쪽 셋이 실제로 센다
  for (const [f, name] of [['./src/builder/Present.tsx','발표'],
                           ['./src/builder/TutorialPlayer.tsx','시연'],
                           ['./src/ui/Modal.tsx','모달 껍데기']]) {
    check(/useOverlay\(/.test(read(f)), `${name}: 덮고 있는 동안 스스로 센다`)
  }
  // 아래가 실제로 물러나는가 — **두 리스너 모두**. 하나만 고치면 「발표는 되는데
  // 표 칸 고른 발표는 안 되는」 반쪽이 된다(실제로 그 반쪽을 밟았다).
  const fl = read('./src/canvas/FreeLayer.tsx')
  const uses = (fl.match(/if \(overlayOpen\(\)\) return/g) || []).length
  check(uses >= 2, '캔버스의 **키 리스너 둘 다** 덮였으면 물러난다', `${uses}곳`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
