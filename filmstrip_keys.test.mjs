// **슬라이드 목록에서 키보드로 움직인다.**
//
// 2026-09-18 · 사용자가 파워포인트 영상을 보내며 물었다 — 「슬라이드 누르고 엔터 누르면
// 빈 슬라이드가 하나 생성되고, 키보드로 밑에 슬라이드로 넘어가는 기능」.
//
// 재 보니 우리는 셋 다 없었다(시험 서버 실측):
//   · 썸네일을 눌러도 **초점이 body 에 남았다** — 그냥 `div` 라 포커스를 못 받는다
//   · Enter → 아무 일 없음
//   · ↑↓ → 쪽이 안 바뀜(도형을 골라 뒀으면 그 도형만 1px 움직였다)
// PageUp/PageDown 만 되고 있었다.
//
// **전역 단축키로 만들면 안 된다.** ↑↓ 는 이미 「고른 도형 1px 옮기기」다 —
// 전역으로 걸면 정면으로 부딪힌다. 파워포인트도 **초점이 어디 있느냐**로 가른다.
// 그래서 이 목록 안에서만 듣고, 처리한 키는 캔버스까지 안 보낸다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs filmstrip_keys.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const bare = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const fs = bare(readFileSync('./src/builder/Filmstrip.tsx', 'utf8'))
const hk = bare(readFileSync('./src/builder/Hotkeys.tsx', 'utf8'))
const css = readFileSync('./src/builder/chrome.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// ── ① 초점을 받을 수 있나 ──────────────────────────────
// 여기가 막히면 나머지가 다 무의미하다 — 키가 이 목록에 오지를 않는다.
{
  check(/role="listbox"/.test(fs) && /role="option"/.test(fs), '목록과 항목이 무엇인지 말한다')
  check(/tabIndex=\{p\.id === sel \? 0 : -1\}/.test(fs),
    '**고른 것만 Tab 으로 들어온다**(roving tabindex) — 서른 장이면 Tab 을 서른 번 누르게 된다')
  check(/aria-selected=\{p\.id === sel\}/.test(fs), '읽어 주는 도구에도 어느 것이 골라졌는지 말한다')
  check(/\.axth:focus-visible\{/.test(css),
    '**초점이 눈에 보인다** — 고른 표시(파란 테두리)와 초점은 다른 것이라 같이 보여야 한다')
  check(/\.axth:focus\{outline:none\}/.test(css), '마우스로 누를 때는 안 뜬다')
}

// ── ② 키가 하는 일 ────────────────────────────────────
{
  const i = fs.indexOf('function onKey')
  const body = i < 0 ? '' : fs.slice(i, fs.indexOf('\n  }', i))
  check(i > 0 && /onKeyDown=\{onKey\}/.test(fs), '목록이 키를 듣는다')
  check(/'ArrowDown'[\s\S]{0,60}go\(at \+ 1\)/.test(body) && /'ArrowUp'[\s\S]{0,60}go\(at - 1\)/.test(body),
    '**↑↓ 로 위아래 슬라이드로 간다**')
  check(/'Enter'[\s\S]{0,60}addCard\('slide'\)/.test(body), "**Enter 로 새 슬라이드**")
  check(/'Home'/.test(body) && /'End'/.test(body), 'Home · End 로 처음·끝으로 — 목록이 길면 필요하다')
  // 끝에서 한 번 더 누르면 넘어가면 안 된다. 되감기면 「어디로 갔지」가 된다.
  check(/Math\.max\(0, Math\.min\(pages\.length - 1, i\)\)/.test(fs),
    '**끝에서 더 눌러도 안 넘어간다** — 되감기면 어디로 갔는지 놓친다')
}

// ── ③ 캔버스와 안 싸우는가 ─────────────────────────────
// 이 가드의 핵심이다. 전역으로 걸거나 stopPropagation 을 빼면, ↑ 한 번에
// **쪽도 바뀌고 도형도 1px 움직인다.** 둘 다 일어나면 무엇이 일어난 건지 아무도 모른다.
{
  check(/const eat = \(\) => \{ e\.preventDefault\(\); e\.stopPropagation\(\) \}/.test(fs),
    '**처리한 키는 캔버스까지 안 보낸다**')
  // **키마다 따로 센다.** 개수만 세면 한 갈래가 빠져도 다른 갈래가 수를 채워 준다
  // (처음에 그렇게 적었다가 6번을 기대하고 5번이 나와서 알았다 — 세는 검사는 늘 이렇게 샌다).
  const i2 = fs.indexOf('function onKey')
  const b2 = i2 < 0 ? '' : fs.slice(i2, fs.indexOf('\n  }', i2))
  const miss = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']
    .filter((k) => !new RegExp("'" + k + "'\\) \\{ eat\\(\\)").test(b2))
  check(miss.length === 0, '**다루는 키마다** 캔버스로 안 보낸다', miss.join(' · '))
  check(/if \(!mod && \(k === 'ArrowUp' \|\| k === 'ArrowDown'/.test(hk),
    '(근거) 캔버스는 여전히 방향키로 도형을 옮긴다 — 그래서 막아야 한다')
  // 전역에 또 걸면 초점이 어디 있든 두 벌이 돈다.
  check(!/window\.addEventListener\('keydown'/.test(fs),
    '**전역으로 걸지 않는다** — 초점으로 가르는 것이 이 방식의 전부다')
}

// ── ④ 초점이 고른 쪽을 따라가는가 ───────────────────────
// 눈에는 파랗게 보이는데 초점이 딴 데 있으면 다음 ↑ 가 엉뚱한 데서 출발한다.
{
  check(/list\.contains\(document\.activeElement\)/.test(fs),
    '**목록 안에 초점이 있을 때만** 옮긴다 — 아니면 글 치는 중에 초점을 빼앗는다')
  check(/querySelector<HTMLElement>\('\.axth\.on'\)/.test(fs), '고른 쪽으로 옮긴다')
  check(/scrollIntoView\(\{ block: 'nearest' \}\)/.test(fs),
    '화면 밖으로 나간 쪽은 끌어다 보여 준다 — 안 그러면 안 보이는 것이 골라진다')
  check(/\}, \[sel, pages\.length\]\)/.test(fs), '쪽이 바뀌거나 늘 때 다시 맞춘다')
}

// ── ⑤ 아는 길이 있는가 ────────────────────────────────
// 목록 안에서만 듣는 키다. 떠 있는 단추도 메뉴도 없으니 **도움말에 없으면 아무도 모른다.**
{
  const help = bare(readFileSync('./src/builder/Help.tsx', 'utf8'))
  check(/'↑ ↓ · Enter'/.test(help) && /슬라이드 목록에서/.test(help),
    '**도움말 단축키 표에 적혀 있다** — 이 키를 알 길이 그것뿐이다')
  check(/새 슬라이드\(고른 것 바로 뒤\)/.test(help),
    '어디에 생기는지도 적는다 — 「맨 끝에 생기겠지」로 읽히면 안 된다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
