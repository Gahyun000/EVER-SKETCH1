// **곁자리는 하나다 — 챗봇과 메모가 탭으로 갈아든다.**
//
// 2026-09-18 · 사용자 말: 「왼쪽 메모 오른쪽 챗봇, 너무 과한 거 같아서」.
// 떠 있는 단추가 둘, 패널이 둘이었는데 **둘은 애초에 쌍둥이**였다 — 머리 짜임이 같고
// (제목 · S M L · 닫기), 늘 닫힌 채로 시작하는 규칙도 같고, notes.css 첫 줄에는 아예
// 「챗봇식 왼쪽 슬라이드 패널」이라고 적혀 있었다.
//
// ── 왜 탭(ㄷ)이고 알약(ㄱ)이 아닌가 ─────────────────────────
// 머리에 전환 알약을 넣는 안이 더 가벼워 보였는데 **실제 폭으로 재 보니 안 됐다.**
// 챗봇 머리는 안 줄었을 때 404px 가 필요한데 자리는 S 338 · M 458 이다. 알약을 얹으면
// S 에서 140px, M 에서 20px 만큼 **제목을 밀어내는데**, 알약 안에서 「지금 메모인가
// 챗봇인가」를 말해 주는 것이 바로 그 제목이었다. 시안에 그 숫자가 남아 있다
// (docs/화면시안_메모_챗봇_한패널_v1.0.html).
//
// **이 파일이 지키는 것 넷.**
//   ① 자리를 **한 곳에서** 고른다 — 각자 열림 상태를 들면 언젠가 둘이 겹친다.
//   ② 없앤 단추의 **몫을 누가 받았나** — 메모로 가는 길과 「적어 둔 게 있다」는 신호.
//   ③ 두 패널이 **같은 자리**에 선다 — 값이 어긋나면 탭을 누를 때마다 덜컥 움직인다.
//   ④ 탭은 **제 줄**을 쓴다 — 머리에 넣으면 위에 적은 그 결함으로 돌아간다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs side_panel.test.mjs
import { readFileSync, existsSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
// **JSX 주석을 먼저 벗긴다.** `/* */` 를 먼저 지우면 감싸던 중괄호 `{` `}` 만 남아서
// `</header> {} <SideTabs…` 꼴이 되고, 「바로 뒤에 붙었나」를 보는 검사가 헛돈다.
// (실제로 그렇게 한 번 틀렸다 — 붙여 놓고도 「안 붙었다」고 울었다.)
const bare = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const read = (p) => bare(readFileSync(p, 'utf8'))

const lay  = read('./src/builder/Layout.tsx')
const np   = read('./src/notes/NotesPanel.tsx')
const cp   = read('./src/chat/ChatPanel.tsx')
const menu = read('./src/builder/chrome/MenuBar.tsx')
const tabs = read('./src/ui/SideTabs.tsx')
// CSS 도 주석을 벗겨서 잰다. 안 그러면 **주석에 적어 둔 옛 이름**에 걸려
// 「아직 남아 있다」고 운다 — 실제로 한 번 그렇게 헛돌았다(.np-fab 을 없앴다는 설명 때문에).
const css  = readFileSync('./src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const ncss = readFileSync('./src/notes/notes.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// ── ① 자리는 한 곳에서 고른다 ──────────────────────────
{
  check(/const \[side, setSide\] = useState<null \| 'chat' \| 'notes'>/.test(lay),
    '**어느 것을 띄울지 한 곳에서 고른다**(Layout 의 side)')
  check(/isOpen=\{side === 'chat'\}/.test(lay) && /open=\{side === 'notes'\}/.test(lay),
    '둘 다 그 값 하나를 본다 — 그래서 동시에 뜰 수가 없다')
  // 메모장이 제 열림 상태를 **다시** 들면, 바깥이 닫았는데 안은 열려 있는 날이 온다.
  check(/export default function NotesPanel\(\{ open, onClose, onChat \}/.test(np),
    '메모장은 열림 상태를 **밖에서 받는다**')
  check(!/setOpenState|notepad-open-/.test(np),
    '메모장 안에 옛 열림 상태가 안 남아 있다 — 두 벌이면 바깥과 어긋난다')
}

// ── ② 없앤 단추의 몫을 누가 받았나 ──────────────────────
// 여기가 이 일에서 제일 조용히 망가지는 자리다. 단추만 지우면 **아무 오류도 없이**
// 메모장이 세상에서 사라진다 — 쓰던 사람만 「어? 어디 갔지」 하게 된다.
{
  check(!/np-fab/.test(np) && !/\.np-fab/.test(ncss),
    '떠 있던 메모 단추가 코드에도 CSS 에도 없다')
  const fabs = (lay.match(/className="chat-fab"/g) || []).length
  check(fabs === 1, '떠 있는 단추는 **하나뿐**이다', `${fabs}개`)

  // 길 ㉠ — 패널 안의 탭
  check(/<SideTabs mode="chat"[\s\S]{0,120}onNotes=\{onNotes\}/.test(cp), '챗봇 쪽에 메모로 가는 탭이 있다')
  check(/<SideTabs mode="notes"[\s\S]{0,120}onChat=\{onChat\}/.test(np), '메모 쪽에 챗봇으로 가는 탭이 있다')
  // 길 ㉡ — 메뉴. **챗봇을 안 여는 사람**에게는 이것이 유일한 길이다.
  check(/\{ label: '🗒 메모장', run: onNotes \}/.test(menu),
    '**도구 메뉴에 메모장이 있다** — 챗봇을 안 여는 사람에게는 이 길뿐이다')
  // **어느 자리에 달렸는지까지 봐야 한다.** 처음에는 파일 전체에서 onNotes 를 찾았는데,
  // 같은 손잡이가 ChatPanel 에도 달려 있어서 **메뉴 쪽을 끊어도 통과했다**(깨뜨려 보고 알았다).
  const mi = lay.indexOf('<MenuBar')
  const mtag = mi < 0 ? '' : lay.slice(mi, lay.indexOf('/>', mi))
  check(/onNotes=\{\(\) => setSide\('notes'\)\}/.test(mtag),
    '그 메뉴가 **실제로** 이어져 있다(MenuBar 에 달렸는지까지 본다)')

  // 신호 — 「적어 둔 게 있다」. 없앤 단추의 파란 점이 하던 일.
  check(/setNoteCount\(notes\.length\)/.test(np), '메모 개수를 바깥에 알린다')
  check(/useNoteCount/.test(tabs) && /side-dot/.test(tabs), '탭이 그 값을 보고 파란 점을 띄운다')
  check(/n > 0 &&/.test(tabs),
    '**0 일 때 화면에 0 이 안 찍힌다** — `n &&` 로 두면 리액트가 숫자 0 을 그대로 그린다')
  check(/\.side-dot\{/.test(css), '그 점의 모양이 있다')
}

// ── ③ 두 패널이 같은 자리에 선다 ────────────────────────
// 값이 어긋나면 탭을 누를 때마다 패널이 **덜컥 움직인다.** 눈으로는 「뭔가 튄다」로만 보이고
// 오류는 하나도 안 난다. 그래서 값을 뽑아서 **맞대 본다.**
{
  const rule = (s, sel) => {
    const i = s.indexOf(sel + '{')
    return i < 0 ? '' : s.slice(i + sel.length + 1, s.indexOf('}', i))
  }
  const a = rule(ncss, '.np-panel'), b = rule(css, '.chat-panel')
  check(!!a && !!b, '두 패널의 규칙을 찾았다')
  for (const k of ['top', 'right', 'bottom', 'border-radius', 'z-index']) {
    const get = (r) => (new RegExp('(?:^|;)\\s*' + k + ':([^;]+)').exec(r) || [])[1]
    check(get(a) && get(a) === get(b), `자리가 같다 — ${k}`, `메모 ${get(a)} · 챗봇 ${get(b)}`)
  }
  check(!/left:0/.test(a), '메모장이 더는 왼쪽 기둥이 아니다')

  // **같은 글자는 같은 폭이어야 한다.** 전에는 메모 320/430/620 · 챗봇 340/460/640 이라
  // 둘 다 M 인데도 30px 차이가 났다 — 탭을 누를 때마다 패널이 덜컥 움직였다(실측 460 → 430).
  const nums = (src, name) => (new RegExp(name + ' = \\{ S: (\\d+), M: (\\d+), L: (\\d+)').exec(src) || []).slice(1).join('/')
  const nSz = nums(np, 'SIZES'), cSz = nums(cp, 'SIZE_PRESETS')
  check(nSz && nSz === cSz, '**S M L 눈금이 둘이 같다** — 같은 글자인데 폭이 다르면 전환할 때마다 튄다',
    `메모 ${nSz} · 챗봇 ${cSz}`)
  // 기억은 따로다 — 메모는 넓게, 챗봇은 좁게 쓰는 사람이 있다.
  // 읽는 쪽과 쓰는 쪽을 **따로** 센다. 한 번만 보면 둘 중 하나가 남의 열쇠를 써도 통과한다.
  // 두 파일이 열쇠를 적는 방식이 다르다 — 메모는 글자를 그대로, 챗봇은 상수(SIZE_KEY)로.
  // 그래서 같은 잣대를 억지로 들이대지 않고 각자의 모양으로 본다.
  check(/getItem\('notepad-size'\)/.test(np) && /setItem\('notepad-size'/.test(np),
    '메모장은 제 열쇠로 읽고 쓴다(notepad-size)')
  check(/SIZE_KEY = 'agentic-pm-chat-size'/.test(cp)
        && /getItem\(SIZE_KEY\)/.test(cp) && /setItem\(SIZE_KEY/.test(cp),
    '챗봇은 제 열쇠로 읽고 쓴다(agentic-pm-chat-size)')
}

// ── ④ 탭은 제 줄을 쓴다 ────────────────────────────────
{
  // **닫힌 챗봇이 탭을 그리면 안 된다.** 이 패널은 닫혀도 화면 밖으로 밀려 있을 뿐
  // DOM 에 남는다 — 그냥 두면 메모장을 보는 동안 탭이 한 벌 더 살아 있다(실제로 네 칸이 잡혔다).
  check(/\{isOpen \? <SideTabs mode="chat"/.test(cp),
    '**열려 있을 때만 탭을 그린다** — 닫힌 채로 남으면 탭이 두 벌이 된다')
  check(/<\/header>\s*\{isOpen \? <SideTabs/.test(cp),
    '**탭이 머리 밖에 있다** — 머리 안에 넣으면 좁은 폭에서 제목을 밀어낸다(시안 ㄱ 가 그래서 떨어졌다)')
  check(/\.side-tabs\{[^}]*display:flex/.test(css) && /\.side-tabs button\{[^}]*flex:1/.test(css),
    '두 칸이 폭을 반씩 나눈다')
  check(/\.side-tabs button\.on\{[^}]*border-bottom-color/.test(css),
    '지금 어디에 서 있는지 **밑줄**로 말한다 — 색만으로는 못 읽는 사람이 있다')
  check(/role="tablist"/.test(tabs) && /aria-selected/.test(tabs), '읽어 주는 도구에도 어느 칸인지 말한다')
  check(existsSync('./docs/화면시안_메모_챗봇_한패널_v1.0.html'),
    '고르던 시안이 남아 있다(ㄱ 을 떨어뜨린 숫자가 거기 있다)')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
