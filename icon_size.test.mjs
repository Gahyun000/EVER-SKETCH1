// 화면에서 쓰는 **아이콘 크기 이름이 실제로 정의돼 있는지** 지킨다.
//
// 이 저장소는 Tailwind 를 쓰지 않는다. `className="h-4 w-4"` 는 `src/index.css` 의
// 손으로 적은 한 줄이 정의하는 것이고, **거기 없는 이름을 쓰면 아무 일도 안 일어난다** —
// lucide 기본값 24px 로 그려진다. 10.5px 글자 옆에 24px 아이콘이 서면 칩이 깨져 보인다.
//
// 2026-09-07 에 `h-3`·`h-3.5` 가 통째로 빠져 있는 것을 발견했다. 폴더 경로 구분자,
// 자료 목록의 「잠김」 자물쇠, 결재함의 코멘트 표시가 전부 24px 였다.
// **타입 검사도 서버 테스트도 못 잡는다** — 클래스 이름은 그냥 문자열이다.
//
// 실행: node icon_size.test.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('./src', import.meta.url))
const read = (p) => readFileSync(p, 'utf8')

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

const css = read(fileURLToPath(new URL('./src/index.css', import.meta.url)))
/** CSS 가 실제로 정의한 크기 이름. `.h-3\.5` 처럼 escape 된 것도 읽는다. */
const defined = new Set(
  [...css.matchAll(/\.((?:h|w)-[0-9]+(?:\\\.[0-9]+)?)\s*[,{]/g)]
    .map((m) => m[1].replace('\\.', '.')),
)

/** 화면에서 실제로 쓰는 이름. */
const used = new Map()   // 이름 → 처음 쓴 곳
for (const file of walk(root)) {
  const src = read(file)
  for (const m of src.matchAll(/className="([^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (/^(h|w)-[0-9]+(\.[0-9]+)?$/.test(cls) && !used.has(cls)) {
        used.set(cls, file.slice(file.indexOf('/src/') + 1))
      }
    }
  }
}

check(defined.size > 0, 'CSS 가 아이콘 크기를 정의한다', [...defined].join(', '))
check(used.size > 0, '화면이 아이콘 크기 이름을 쓴다', [...used.keys()].join(', '))

const missing = [...used.entries()].filter(([cls]) => !defined.has(cls))
check(missing.length === 0,
  '쓰는 이름이 **전부 정의돼 있다** (없으면 그 아이콘만 24px 로 튄다)',
  missing.map(([c, f]) => `${c} (${f})`).join(', '))

// 짝이 맞는지 — `h-3` 만 정의하고 `w-3` 을 빼면 세로만 줄어 찌그러진다.
for (const cls of defined) {
  const pair = cls.startsWith('h-') ? 'w-' + cls.slice(2) : 'h-' + cls.slice(2)
  check(defined.has(pair), `${cls} 와 ${pair} 가 함께 정의돼 있다 (한쪽만 있으면 찌그러진다)`)
}

// 크기가 실제로 값이 있는지(0 이나 auto 로 죽어 있지 않은지)
check(/\.h-3,\.w-3\{width:12px;height:12px\}/.test(css.replace(/\s+/g, '')),
  'h-3 은 12px 다')
check(/\.h-4,\.w-4,\.h-5,\.w-5\{width:16px;height:16px\}/.test(css.replace(/\s+/g, '')),
  'h-4 는 16px 다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
