// 「글 서랍(`fields`)이 없는 페이지」가 화면을 죽이지 않는다.
//
// **왜 생겼나.** 2026-09-08, 「L2 작성자가 결재를 내는데 모달이 안 뜬다」를 쫓다가
// 실제 서버를 띄우고 시험용 자료를 데이터베이스에 **직접** 써 넣었다.
// 앱을 거치지 않아 `fields` 를 빠뜨렸는데, 결재함 상세를 열자 **화면이 통째로 하얘졌다.**
// 목차를 만드는 `tocItems()` 가 `p.fields.title` 을 무방비로 읽다가 멈췄고,
// React 는 멈춘 부분을 통째로 지운다 — 그 안에 있던 확인창까지 함께 사라진다.
// 오류 메시지도 안 뜬다. 화면에는 **「모달이 안 뜬다」로만 보인다.**
//
// 그 날의 원인은 이게 아니었다(자료 9개 모두 서랍이 있었고, 낸 사람은 이미 세 번
// 성공적으로 제출한 뒤 자료가 잠겨 버튼이 사라진 것이었다).
// 그래도 남겨 둔다 — **「모달이 안 뜬다」가 실제로 일어날 수 있는 유일한 길**이었고,
// 그 길이 열려 있다는 사실 자체는 참이었다.
//
// **왜 「지금은 다 넣어 주니까 괜찮다」로 끝내지 않는가.**
// 그건 「오늘 넣고 있다」는 뜻이지 「없을 수 없다」는 뜻이 아니다.
// 예전 자료·손으로 고친 기록·나중에 붙일 가져오기가 모두 이 자리로 들어온다.
// 서랍이 없다고 화면이 죽는 것은 어느 쪽이든 과한 값이다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs page_fields.test.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tocItems } from './src/builder/util.ts'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 1. 실제로 안 죽는가 ────────────────────────────
// 순수 함수라 브라우저 없이 여기서 바로 부를 수 있다(그래서 .ts 에 있다).
{
  let threw = null
  let out = null
  try { out = tocItems([{ id: 1, cardKey: 'slide' }]) } catch (e) { threw = e }
  check(threw === null, '서랍 없는 페이지로 목차를 만들어도 안 터진다',
    threw ? threw.message : '')
  check(Array.isArray(out) && out.length === 1, '그런 페이지도 목차에 한 줄로 들어간다',
    JSON.stringify(out))
  check(!!(out && out[0] && out[0].title), '제목이 비지 않는다 — 카드 이름으로 대신한다',
    JSON.stringify(out && out[0]))
}
{
  // 섞여 있어도 된다 — 있는 것과 없는 것이 한 문서에 함께 온다.
  let threw = null
  try {
    tocItems([{ id: 1, cardKey: 'slide', fields: { title: '있음' } },
              { id: 2, cardKey: 'slide' },
              { id: 3, cardKey: 'slide', fields: {} }])
  } catch (e) { threw = e }
  check(threw === null, '있는 페이지와 없는 페이지가 섞여도 안 터진다', threw ? threw.message : '')
}

// ── 2. 다시 생기지 않게 한다 ────────────────────────
//
// `?.` 하나가 빠지는 것은 고쳐 놓고도 다음에 또 벌어지는 종류다 —
// 새 화면을 쓰면서 `p.fields.title` 이라고 적는 편이 자연스럽기 때문이다.
// **카드 정의(`c.fields`)는 레지스트리라 항상 있다** — 그건 막지 않는다.
const ROOT = new URL('./src/', import.meta.url).pathname
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(name)) files.push(p)
  }
}
walk(ROOT)

const bare = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

// 페이지 쪽 서랍만 본다. `c.fields` · `card.fields` 는 카드 정의라 늘 있다.
const BAD = /\b(?!c\b|card\b)[A-Za-z_$][\w$]*\.fields\.[A-Za-z_$]/
const hits = []
for (const f of files) {
  bare(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if (BAD.test(line)) hits.push(`${f.replace(ROOT, 'src/')}:${i + 1}  ${line.trim().slice(0, 70)}`)
  })
}
check(hits.length === 0,
  '페이지의 서랍을 무방비로 읽는 곳이 없다 — `p.fields?.title` 로 적는다',
  hits.join('  |  '))

// **별칭으로 새는 자리도 막는다.**
// `const f = page.fields` 처럼 한 번 담아 두면 그 뒤로는 `f.title` 이라 위 검사가 못 본다.
// PageView 가 정확히 그 모양이었고(별칭 하나에 아홉 군데), 여기를 빼 봐도 위 검사는
// 조용히 통과했다. 담는 순간에 `|| {}` 를 붙였는지 본다.
const ALIAS = /=\s*[A-Za-z_$][\w$]*\.fields\s*(?:$|;|\n)/
const aliases = []
for (const f of files) {
  bare(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if (/\.fields\b/.test(line) && ALIAS.test(line.trim()))
      aliases.push(`${f.replace(ROOT, 'src/')}:${i + 1}  ${line.trim().slice(0, 70)}`)
  })
}
check(aliases.length === 0,
  '서랍을 변수에 담을 때 `|| {}` 를 붙인다 — 별칭을 거치면 위 검사가 못 본다',
  aliases.join('  |  '))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
