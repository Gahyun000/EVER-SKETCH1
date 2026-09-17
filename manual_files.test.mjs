// 작성자 매뉴얼 — **열두 편이 정말 거기 있는지** 지킨다 (2026-09-15).
//
// 화면은 `<img src="/manual/…">` 하나로 그린다. 파일 이름이 한 글자만 어긋나도
// 빈 네모가 뜨는데 **아무 소리도 안 난다** — 콘솔에 404 가 찍힐 뿐이다.
// 매뉴얼은 처음 쓰는 사람이 보는 것이라, 빈 네모 하나가 곧 「이 도구 망가졌네」가 된다.
//
// 파일 이름을 **영문으로 고정**한다. 한글 파일명은 주소로 나갈 때 인코딩을 타고
// 서버·CDN 마다 다르게 다룬다 — 화면에 보이는 이름은 EPISODES 가 들고 있으니 손해가 없다.
//
// node 는 `.tsx` 를 못 읽는다(타입 벗기기는 .ts 까지다). 그래서 **소스에서 뽑아 본다** —
// 다른 화면 검사들이 쓰는 것과 같은 방식이다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs manual_files.test.mjs

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; return }
  fail++
  console.log('  X ' + label + (extra ? '  — ' + extra : ''))
}

const src = read('./src/builder/DemoPlayer.tsx')
const eps = [...src.matchAll(/\{\s*no:\s*(\d+),\s*title:\s*'([^']+)',\s*file:\s*'([^']+)'/g)]
  .map((m) => ({ no: Number(m[1]), title: m[2], file: m[3] }))

check(eps.length === 12, '열두 편이다', `${eps.length}편`)
check(eps.every((e, i) => e.no === i + 1), '번호가 1부터 12까지 빠짐없다',
  eps.map((e) => e.no).join(','))

const dir = new URL('./public/manual/', import.meta.url).pathname
check(existsSync(dir), 'public/manual/ 이 있다')

for (const e of eps) {
  const p = dir + e.file
  check(existsSync(p), `${e.no}편 「${e.title}」 파일이 있다`, e.file)
  if (!existsSync(p)) continue
  const sz = statSync(p).size
  check(sz > 10000, `${e.no}편 파일이 비어 있지 않다`, `${Math.round(sz / 1024)}KB`)
  check(/^[\w.\-]+$/.test(e.file), `${e.no}편 파일 이름이 영문·숫자뿐이다`, e.file)
}

// 한 줄 설명이 다 있어야 한다 — 그림만 있으면 무엇을 보라는 건지 모른다.
const lines = [...src.matchAll(/line:\s*'([^']*)'/g)].map((m) => m[1])
check(lines.length === 12, '편마다 한 줄 설명이 있다', `${lines.length}줄`)
check(lines.every((l) => l.length >= 20), '설명이 한 줄값은 한다',
  lines.filter((l) => l.length < 20).join(' / '))

// 남는 파일이 없어야 한다 — 이름을 바꾸고 옛것을 안 지우면 배포만 무거워진다.
const files = readdirSync(dir).filter((f) => /\.(gif|png)$/.test(f))
const extra = files.filter((f) => !eps.some((e) => e.file === f))
check(extra.length === 0, 'public/manual/ 에 안 쓰는 파일이 없다', extra.join(', '))

// ── 매뉴얼로 **들어가는 길**이 살아 있나 ──────────────────────────────
//
// **2026-09-17 에 다시 썼다 — 지운 게 아니다.**
//
// 여기에는 「위 막대 단추가 「작성자 매뉴얼」이다」가 있었고, 그걸 `src/builder/TopBar.tsx`
// 에서 쟀다. 그런데 **TopBar 는 그려지지 않는다** — `Layout` 은 `MenuBar`+`ClassicBar` 를 쓴다
// (롤업 소스맵으로 확인: TopBar 는 번들에 아예 안 들어간다. qc_docs 는 2026-08-12 에
// 이미 적어 뒀다). 즉 이 확인은 **아무도 안 보는 파일**을 지키고 있었고, 살아 있는 화면에서
// 매뉴얼이 통째로 안 열리게 되어도 초록불이었을 것이다. **제일 나쁜 종류의 가드다** —
// 있으니까 지켜지는 줄 알고 아무도 다시 안 본다.
//
// 그래서 **살아 있는 길 전체**를 잰다. 이 길은 네 토막이고, 한 토막만 끊겨도 메뉴를 눌렀을 때
// **아무 일도 안 일어난다** — 오류도 안 나서 눌러 보기 전에는 모른다.
//
//   보기 메뉴(MenuBar) ─ 'ebook:demo' ─▶ ClassicBar 가 듣는다 ─▶ Layout 이 연다 ─▶ DemoPlayer
//
// 주석은 걷고 본다. DemoPlayer 머리말이 옛 이름(「예시영상」)을 **내력으로** 적어 두고 있어서,
// 안 걷으면 「옛 이름이 안 남았나」가 영영 거짓이 된다.
const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const mb = bare(read('./src/builder/chrome/MenuBar.tsx'))
const cb = bare(read('./src/builder/chrome/ClassicBar.tsx'))
const lay = bare(read('./src/builder/Layout.tsx'))
const dp = bare(read('./src/builder/DemoPlayer.tsx'))

// ① 들어가는 자리 — 이름과, 그 이름이 쏘는 신호가 한 줄에 같이 있어야 한다.
//    따로 재면 이름만 맞고 엉뚱한 신호를 쏘는 것을 못 잡는다.
// 닫는 괄호까지 박지 않는다 — 단축키 하나(`sc: 'F1'`)만 붙여도 애먼 데서 빨간불이 난다.
// 여기서 재는 것은 「그 이름이 그 신호를 쏜다」뿐이고, 딱지 검사는 아래 ②가 맡는다.
check(/\{ label: '▶ 작성자 매뉴얼',[^}]*run: \(\) => emit\('ebook:demo'\)/.test(mb),
  '보기 메뉴에 「▶ 작성자 매뉴얼」이 있고 ebook:demo 를 쏜다')

// ② 등급으로 막지 않는다 — Lv3 도 본다(사용자 결정).
//    MenuBar 는 `admin`·`publish` 딱지가 붙은 항목만 가린다. 그 항목에 딱지가 없어야 한다.
const item = (mb.match(/\{ label: '▶ 작성자 매뉴얼'[^}]*\}/) || [''])[0]
check(item && !/admin: true|publish: true/.test(item),
  '등급으로 매뉴얼을 막지 않는다 — Lv3 도 본다')

// ③ 그 신호를 **듣는 쪽**이 있다. 여기가 끊기면 눌러도 조용하다.
check(/window\.addEventListener\('ebook:demo'/.test(cb) && /auxRef\.current\.onDemo\(\)/.test(cb),
  'ClassicBar 가 ebook:demo 를 듣고 onDemo 를 부른다')

// ④ Layout 이 그 손잡이를 실제로 넘기고, 창을 그린다.
// 이 한 줄을 두 번 틀렸다. 적어 둔다.
//  · `<ClassicBar[^>]*onDemo=\{` — 넘기는 값 안에 화살표(`() =>`)의 `>` 가 있어서 거기서 끊긴다.
//  · `indexOf('<ClassicBar')` — 위쪽의 `useRef<ClassicBarHandle>` 이 먼저 걸린다(타입 인자다).
// 태그로 쓰인 자리는 이름 **뒤에 빈칸**이 온다. 거기서부터 태그 끝까지만 본다.
const cm = /<ClassicBar\s/.exec(lay)
const ctag = cm ? lay.slice(cm.index, lay.indexOf('/>', cm.index)) : ''
check(/onDemo=\{/.test(ctag), 'Layout 이 ClassicBar 에 onDemo 를 넘긴다')
check(/<DemoPlayer open=\{demo\}/.test(lay), 'Layout 이 DemoPlayer 를 그린다')

// ⑤ 옛 이름으로 되돌아가면 잡는다 — **살아 있는 파일 전부**에서 본다.
for (const [nm, t] of [['보기 메뉴', mb], ['ClassicBar', cb], ['Layout', lay], ['DemoPlayer', dp]]) {
  check(!/예시영상/.test(t), nm + ' 에 옛 이름 「예시영상」이 안 남았다')
}
check(/작성자 매뉴얼/.test(dp), '창 제목도 「작성자 매뉴얼」이다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
