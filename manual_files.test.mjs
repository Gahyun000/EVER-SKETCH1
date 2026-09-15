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

// 이름이 바뀐 것도 여기서 지킨다 — 「예시영상」으로 되돌아가면 잡는다.
const tb = read('./src/builder/TopBar.tsx'), mb = read('./src/builder/chrome/MenuBar.tsx')
check(/작성자 매뉴얼/.test(tb) && !/▶ 예시영상/.test(tb), '위 막대 단추가 「작성자 매뉴얼」이다')
check(/작성자 매뉴얼/.test(mb) && !/▶ 예시영상/.test(mb), '보기 메뉴도 「작성자 매뉴얼」이다')
// 등급으로 막지 않는다 — Lv3 도 본다(사용자 결정).
check(!/role\s*===\s*'viewer'/.test(tb), '등급으로 매뉴얼을 막지 않는다 — Lv3 도 본다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
