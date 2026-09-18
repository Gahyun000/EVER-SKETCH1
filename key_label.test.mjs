// **단축키는 그 사람 키보드에 있는 글자로 적는다.**
//
// 2026-09-18 · 사용자: 「메뉴바 안에 커맨드 기호로 나와 있는 거 윈도우 버전으로도 알려
// 줘야 하는 게 윈도우 사용자가 더 많음」. 맞는 말이었고, 재 보니 **앱 안에서 표기가 이미
// 두 가지로 갈려 있었다** — 메뉴바·매뉴얼은 `⌘S` 처럼 맥 기호만, 도움말·툴팁은
// `⌘/Ctrl + Z` 처럼 둘 다. ⇧·⌥·↵ 도 윈도우 키보드에는 없는 글자다.
//
// **판별이 틀려도 기능은 안 깨진다.** 단축키를 받는 자리 일곱 곳이 전부
// `metaKey || ctrlKey` 로 둘 다 받는다 — 여기서 정하는 것은 글자뿐이다. 그래도 맥인데
// 윈도우로 잘못 보면 맥 쓰는 사람이 Ctrl 을 보게 되므로, 사람이 눌러 고칠 길을 뒀다.
//
// 판별은 Chromium 의 플랫폼 흉내로 **열다섯 가지를 재서 전부 맞혔다**(2026-09-18):
// 맥·윈도우(크롬/엣지)·리눅스·아이패드, 그 다섯을 userAgentData 없이, platform 이 빌 때 넷,
// 둘이 어긋날 때 하나.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs key_label.test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { keyLabel } from './src/ui/keyLabel.ts'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

// ── ① 옮기는 셈을 **돌려서** 잰다 ──────────────────────
// 글자 맞추기로는 「+ 로 이었나 붙여 썼나」 같은 것이 안 잡힌다.
{
  check(keyLabel('mod+S', true) === '⌘S', '맥: mod+S → ⌘S', keyLabel('mod+S', true))
  check(keyLabel('mod+S', false) === 'Ctrl+S', '윈도우: mod+S → Ctrl+S', keyLabel('mod+S', false))
  check(keyLabel('mod+shift+Z', true) === '⌘⇧Z', '맥은 **붙여 쓴다**(⌘⇧Z)', keyLabel('mod+shift+Z', true))
  check(keyLabel('mod+shift+Z', false) === 'Ctrl+Shift+Z', '윈도우는 **+ 로 잇는다**', keyLabel('mod+shift+Z', false))
  check(keyLabel('mod+enter', true) === '⌘↵' && keyLabel('mod+enter', false) === 'Ctrl+Enter', '엔터도 갈린다')
  check(keyLabel('del', true) === '⌫' && keyLabel('del', false) === 'Del', '지우기도 갈린다')
  check(keyLabel('alt+O', true) === '⌥O' && keyLabel('alt+O', false) === 'Alt+O', '옵션/알트도 갈린다')
  // 모르는 조각은 **그대로 둔다.** 삼켜 버리면 「F5」 같은 것이 사라진다.
  check(keyLabel('F5', true) === 'F5' && keyLabel('mod+]', false) === 'Ctrl+]', '모르는 조각은 그대로 둔다')
}

// ── ② 판별은 세 단으로 떨어진다 ─────────────────────────
// 가운데(navigator.platform)는 폐기 예정이다. 하나만 믿으면 비는 날 통째로 틀린다.
{
  const src = bare(read('./src/ui/keyLabel.ts'))
  check(/userAgentData/.test(src) && /navigator\.platform/.test(src) && /userAgent\)/.test(src),
    '**세 군데를 차례로 본다** — 하나만 믿으면 그것이 비는 날 통째로 틀린다')
  check(/d\.platform\) return/.test(src), '첫 단이 있으면 그것으로 끝낸다')
}

// ── ③ 화면 어디에도 맥 기호가 **박혀** 있지 않다 ───────────
// 여기가 이 일에서 제일 조용히 되살아나는 자리다. 새 메뉴 항목을 하나 더하면서
// `sc: '⌘K'` 라고 적으면 아무 오류도 없이 **윈도우 사용자에게만** 틀린 글자가 뜬다.
{
  const bad = []
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.tsx?$/.test(p)) continue
      if (p.endsWith('ui/keyLabel.ts')) continue     // 글자 표가 사는 곳
      const code = bare(read(p))
      if (/[⌘⇧⌥↵⌫]/.test(code)) bad.push(p.replace('./src/', ''))
    }
  }
  walk('./src')
  check(bad.length === 0, '**코드 어디에도 맥 기호가 박혀 있지 않다**', bad.join(' · '))
}

// ── ④ 도움말 표가 **실제 단축키와 맞는가** ────────────────
// 2026-09-18 · 여기서 거짓말을 찾았다. 표에 「⌘/Ctrl + S = 이북 만들기」라고 적혀 있었는데
// 그 키는 **저장**이고 이북 만들기는 ⌘↵ 인데 표에 아예 없었다.
{
  const help = bare(read('./src/builder/Help.tsx'))
  const hk = bare(read('./src/builder/Hotkeys.tsx'))
  check(/lower === 's'\) \{ e\.preventDefault\(\); p\.onSave\(\)/.test(hk), '(근거) 그 키는 저장이다')
  check(/k === 'Enter'\) \{ e\.preventDefault\(\);[\s\S]{0,60}onBuild\(\)/.test(hk), '(근거) 이북 만들기는 엔터 쪽이다')
  check(/K\('mod\+S'\), d: '저장'/.test(help), '**표가 저장이라고 적는다**')
  check(/K\('mod\+enter'\), d: '이북\(웹\) 만들기'/.test(help), '**이북 만들기가 표에 있다** — 없던 줄이다')
  check(!/이북 만들기' \}[\s\S]{0,40}mod\+S/.test(help), '옛 짝이 안 남아 있다')
}

// ── ⑤ 사람이 고칠 수 있는가, 그리고 **손이 닿는 자리인가** ──
{
  const help = bare(read('./src/builder/Help.tsx'))
  const menu = bare(read('./src/builder/chrome/MenuBar.tsx'))
  // **만들어 두는 것만으로는 모자라다 — 화면에 놓여 있어야 한다.**
  // 처음엔 `function StyleSwitch` 만 찾았는데, 이름을 StyleSwitchX 로 바꿔 놓아도
  // 그대로 통과했다(앞의 것이 뒤의 것에 들어 있어서). 놓인 자리까지 본다.
  check(/function StyleSwitch\(/.test(help) && /<StyleSwitch \/>/.test(help),
    '표기 고르는 단추가 있고, **도움말 화면에 실제로 놓여 있다**')
  check(/'자동'/.test(help) && /'윈도우'/.test(help) && /'맥'/.test(help), '고를 것이 셋이다')
  check(/detectMac\(\) \? '맥으로 봤어요'/.test(help),
    '자동일 때 **무엇으로 봤는지 말해 준다** — 틀린 걸 알아야 고친다')
  // 환경설정에 뒀다면 **작성자는 못 연다.** 이 표를 보는 사람이 바로 그 작성자다.
  check(/\{ label: '⚙ 환경설정', run: onSettings, admin: true \}/.test(menu),
    '(근거) 환경설정은 관리자만 열린다 — 그래서 이 단추는 도움말에 있다')
}

// ── ⑥ 매뉴얼 본문에는 키 기호를 안 쓴다 ────────────────────
// 그림이 맥에서 찍은 실물 캡처라, 글만 Ctrl 로 바꾸면 그림 속 메뉴에는 ⌘ 가 그대로 보인다.
{
  const mm = bare(read('./src/builder/manualMake.ts'))
  check(!/[⌘⇧⌥↵⌫]/.test(mm), '**매뉴얼 글에 키 기호가 없다**')
  check(/단축키는 그 메뉴 오른쪽에 적혀 있습니다/.test(mm), '대신 어느 메뉴에 있는지로 적는다')
  check(!/⌘M|새 슬라이드」입니다/.test(mm), '없는 단축키를 가르치던 줄이 사라졌다')
}

// ── ⑦ 메뉴에서 ⌘M 표기를 뺐다 ───────────────────────────
// 받는 곳이 아예 없었고, 대안으로 꼽았던 ⌘⇧N 은 **크롬의 새 시크릿 창**이라 못 쓴다.
// 그래서 억지로 만들지 않고 표기만 뺐다 — 새 슬라이드는 필름스트립 Enter 로 간다(다음 일감).
{
  const menu = bare(read('./src/builder/chrome/MenuBar.tsx'))
  const n = (menu.match(/\{ label: '＋ 새 슬라이드', run: \(\) => addCard\('slide'\) \}/g) || []).length
  check(n === 2, '「＋ 새 슬라이드」 두 곳에 단축키 표기가 없다', `${n}곳`)
  check(!/sc: '⌘M'/.test(menu), '⌘M 이 안 남아 있다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
