// **관리자 매뉴얼** — 보기 메뉴에 따로, 관리자에게만, 작성자 매뉴얼과 같은 뼈대로.
//
// 2026-09-18 · 사용자 결정(시안 v2.0): 자리는 **ㄷ 보기 메뉴**, 이름은 **둘로 나눔**,
// **인쇄 · PDF 붙임**, **열람자는 둘 다 안 보이고 · 작성자는 작성자 것만 · 관리자는 둘 다**,
// **「다음」 단추를 작성자 매뉴얼과 같게**.
//
// 등급 거르개 자체는 manual_files.test.mjs 가 본다. 여기서는 **창**을 본다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs admin_manual.test.mjs
import { readFileSync, existsSync } from 'node:fs'
import { ADMIN_CHAPTERS, ADMIN_DIR, ADMIN_STEP_COUNT } from './src/builder/manualAdmin.ts'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const bare = (t) => t
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
const cut = (t, a, b) => {
  const i = t.indexOf(a); if (i < 0) return ''
  const j = b ? t.indexOf(b, i + a.length) : -1
  return j < 0 ? t.slice(i) : t.slice(i, j)
}
const AM = bare(readFileSync('./src/builder/AdminManual.tsx', 'utf8'))
const DP = bare(readFileSync('./src/builder/DemoPlayer.tsx', 'utf8'))
const CB = bare(readFileSync('./src/builder/chrome/ClassicBar.tsx', 'utf8'))
const LY = bare(readFileSync('./src/builder/Layout.tsx', 'utf8'))
const RAW = readFileSync('./src/builder/manualAdmin.ts', 'utf8')

// ── ① 내용 ─────────────────────────────────────────
{
  check(ADMIN_CHAPTERS.length === 6, `6장이다 (지금 ${ADMIN_CHAPTERS.length}장)`)
  check(ADMIN_STEP_COUNT === ADMIN_CHAPTERS.reduce((n, c) => n + c.steps.length, 0),
    '걸음 수는 **세어서** 나온다 — 손으로 적어 두면 걸음이 늘 때 숫자만 옛말이 된다')
  check(ADMIN_STEP_COUNT >= 20, `걸음이 ${ADMIN_STEP_COUNT}개다`)
  // 번호가 겹치면 목록에서 고른 것과 무대에 뜨는 것이 어긋난다(FLAT.findIndex 가 앞엣것을 집는다).
  const ns = ADMIN_CHAPTERS.flatMap((c) => c.steps.map((s) => s.n))
  check(new Set(ns).size === ns.length, '걸음 번호가 겹치지 않는다', ns.join(' '))
  check(ns.every((n, k) => n.startsWith(ADMIN_CHAPTERS.find((c) => c.steps.some((s) => s.n === n)).no + '-')),
    '걸음 번호의 앞자리가 제 장 번호와 맞는다')
  // 그림이 없으면 화면에 깨진 네모가 뜬다. **파일이 정말 있는지** 본다.
  for (const c of ADMIN_CHAPTERS) for (const s of c.steps) {
    check(existsSync('./public' + ADMIN_DIR + s.img), `그림이 있다 — ${s.n} ${s.img}`)
  }
  check(ADMIN_CHAPTERS.every((c) => c.steps.every((s) => s.body && s.t)),
    '모든 걸음에 제목과 본문이 있다')
  // 글에 단축키 기호를 안 적는다 — 그림이 맥 캡처라 글만 Ctrl 로 바꾸면 그림과 어긋난다.
  const prose = ADMIN_CHAPTERS.flatMap((c) => c.steps.flatMap((s) => [s.body, s.tip || '', s.warn || '']))
  check(!prose.some((t) => /[⌘⇧⌥↵⌫]/.test(t)),
    '글에 **단축키 기호가 없다** — 그림이 실물 캡처라 글만 바꾸면 그림과 어긋난다',
    prose.find((t) => /[⌘⇧⌥↵⌫]/.test(t)) || '')
  check(/그림은 전부 실물 캡처다/.test(RAW), '「그림은 전부 실물 캡처」 규칙이 파일 머리에 적혀 있다')
  // **가린 곳이 있으면 글이 그렇게 말해야 한다**(2026-09-18). 실물 캡처라고 해 놓고 말없이
  // 덮어 두면, 읽는 사람은 실제 화면에도 회색 칸이 뜨는 줄 안다.
  const masked = ADMIN_CHAPTERS.flatMap((c) => c.steps).filter((s) =>
    /덮어 뒀|가렸|가려/.test((s.tip || '') + (s.warn || '') + s.body))
  check(masked.length === 1 && masked[0].n === '2-4',
    '가렸다고 말하는 걸음은 **2-4 하나뿐**이다', masked.map((s) => s.n).join(',') || '없음')
  check(/칸은 남기고 값만/.test(RAW),
    '무엇을 어떻게 가렸는지가 파일 머리에 적혀 있다 — 칸까지 지우면 어디에 뜨는지가 안 보인다')
}

// ── ② 작성자 매뉴얼과 **같은 뼈대** ─────────────────
{
  // 옷을 새로 지으면 두 창이 조금씩 어긋나고, 어긋난 것은 늘 한쪽만 고쳐진다.
  for (const k of ['man-wrap', 'man-list', 'man-grp', 'man-gh', 'man-sub', 'man-item',
    'man-no', 'man-t', 'man-stage', 'man-scroll', 'man-sh', 'man-sn', 'man-gif',
    'man-line', 'man-tip', 'man-nav', 'man-btn', 'man-cnt', 'man-tabs', 'man-print-btn']) {
    check(AM.includes(k) && DP.includes(k), `작성자 매뉴얼과 같은 **${k}** 를 쓴다`)
  }
  const NAV = cut(AM, '<div className="man-nav">', '</div>')
  check(/‹ 앞</.test(NAV) && /다음 ›/.test(NAV), '단추 글자가 같다(‹ 앞 · 다음 ›)')
  check(/\{mi \+ 1\} \/ \{FLAT\.length\}/.test(NAV), '가운데에 「지금 / 전체」가 있다')
  check(/disabled=\{mi === 0\}/.test(NAV) && /disabled=\{mi === FLAT\.length - 1\}/.test(NAV),
    '양 끝에서 단추가 죽는다')
  check(/<p className="man-tip"><b>알아두면<\/b>/.test(AM) && /<p className="man-tip warn"><b>주의<\/b>/.test(AM),
    '「알아두면」·「주의」 딱지도 같다')
  // 장 경계를 모르고 넘어간다 — 작성자 매뉴얼의 37걸음이 그렇다.
  check(/const FLAT = ADMIN_CHAPTERS\.flatMap/.test(AM),
    '걸음을 **한 줄로 펴서** 넘긴다 — 장 경계에서 멈추지 않는다')
  // 조건까지 같이 본다. `if (false) …` 로 죽여 놔도 글자는 남아 있다(일부러 깨 보다가 잡았다).
  check(/useEffect\(\(\) => \{ if \(scrollRef\.current\) scrollRef\.current\.scrollTop = 0 \}, \[mi\]\)/.test(AM),
    '걸음을 넘기면(mi 가 바뀌면) 맨 위부터 — 안 그러면 새 걸음이 제목도 없이 한복판부터 뜬다',
    (AM.match(/scrollTop = 0[^\n]*/) || [])[0] || '')
}

// ── ③ 인쇄 · PDF ───────────────────────────────────
{
  check(/className="man-print-btn"/.test(AM) && /window\.print\(\)/.test(AM), '인쇄 단추가 있다')
  const TABS = cut(AM, '<div className="man-tabs">', '</div>')
  // **`man-tab` 은 `man-tabs` 의 앞자락이다.** 그냥 찾으면 껍데기 이름(0번 자리)을 집어,
  // 탭 단추를 통째로 지워도 「앞에 있다」가 참이 된다 — 일부러 깨 보다가 잡았다(2026-09-18).
  const iTab = TABS.indexOf('className="man-tab '), iPr = TABS.indexOf('man-print-btn')
  check(iTab >= 0, '탭 단추가 있다', TABS.trim().slice(0, 80))
  check(iPr > iTab,
    '인쇄 단추가 **탭 줄 오른쪽 끝**이다 — 작성자 매뉴얼과 같은 자리라야 손이 안 헤맨다',
    `tab=${iTab} print=${iPr}`)
  // **body 바로 밑에 꽂아야 한다.** 인쇄 규칙이 `body > *:not(.man-print){display:none}` 이라,
  // 창 안에 있으면 창과 함께 숨어 **빈 종이가 나온다.**
  // **꽂는 자리를 글자 그대로** 본다. 「어딘가에 document.body 가 있다」로 재면
  // `document.getElementById('x') || document.body` 같은 것이 그냥 통과한다(일부러 깨 보다가 잡았다).
  check(/\n    document\.body,\n  \)/.test(AM),
    '인쇄판을 **body 바로 밑에** 꽂는다 — 창 안에 두면 창과 함께 숨어 빈 종이가 나온다',
    (AM.match(/createPortal\([\s\S]*?\n    ([^\n]+),\n  \)/) || [])[1] || '못 찾음')
  check(/className="man-print"/.test(AM), '숨겨 두는 판의 이름이 인쇄 규칙과 같다')
  const PS = cut(AM, 'function PrintSheet', 'export default')
  check(/ADMIN_CHAPTERS\.map/.test(PS) && /c\.steps\.map/.test(PS),
    '인쇄판이 **모든 장·모든 걸음**을 돈다 — 화면에는 한 걸음만 떠 있으므로 그대로 찍으면 한 장만 나온다')
  check(/mp-tip/.test(PS) && /mp-warn/.test(PS), '종이에도 「알아두면」·「주의」가 간다')
}

// ── ④ 배선 ─────────────────────────────────────────
{
  check(/window\.addEventListener\('ebook:admin-manual', am\)/.test(CB), '신호를 받는다')
  check(/window\.removeEventListener\('ebook:admin-manual', am\)/.test(CB),
    '떼기도 한다 — 안 떼면 창을 여닫을 때마다 하나씩 쌓인다')
  check(/onAdminManual/.test(CB) && /onAdminManual=\{\(\) => setAdminMan\(true\)\}/.test(LY), '화면까지 이어진다')
  check(/<AdminManual open=\{adminMan\}/.test(LY), '창이 그려진다')
  // 작성자 매뉴얼에는 `withSaveGuard` 가 붙어 있다(옛 튜토리얼이 작업 화면을 건드렸다).
  // 이건 읽기만 하는 창이라 안 붙인다 — 붙이면 읽으려는데 저장하라는 창이 먼저 뜬다.
  check(!/withSaveGuard[\s\S]{0,60}setAdminMan/.test(LY),
    '읽기만 하는 창이라 저장 가로막기를 안 붙인다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
