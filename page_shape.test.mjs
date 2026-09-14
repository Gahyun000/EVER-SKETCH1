// 「칸이 빠진 쪽」이 화면을 죽이지 않는다.
//
// **왜 생겼나.** 2026-09-08, 결재 「거두기 → 회수」를 확인하려고 진짜 서버를 띄우고
// 시험용 자료를 데이터베이스에 **직접** 써 넣었다. 쪽에 `conns`·`strokes` 를 빠뜨렸는데,
// 결재함 상세를 열자 **화면이 통째로 하얘졌다.** `FreeLayer` 가 `page.conns.map(...)` 을
// 무방비로 읽다가 멈췄고, React 는 멈춘 부분을 통째로 지운다 —
// 그 안에 있던 확인창까지 함께 사라진다. 오류 메시지도 안 뜬다.
//
// **어느 쪽이 문제인지 실제로 갈라 봤다.**
//   겉껍데기 온전 + 쪽이 최소  → 터짐
//   겉껍데기 없음 + 쪽은 온전  → 멀쩡
// 겉껍데기(`title`·`orientation`…)는 `fullState()` 가 이미 메우고 있었다.
// **한 겹 아래, 쪽 안이 비어 있었다.**
//
// **`fields` 때(page_fields.test.mjs)와 같은 부류다.** 그때는 읽는 자리마다 `?.` 를
// 붙였다. 여기서는 그러지 않는다 — `els`·`conns`·`strokes` 를 읽는 자리가 서른 곳이
// 넘고, 자리마다 막으면 **다음에 새로 쓰는 한 줄이 또 샌다.**
// 대신 **들어오는 문 두 곳**에서 한 번 메운다:
//   1) `fullState()`        — 편집 화면이 자료를 열 때
//   2) `SlideViewer`        — 결재 스냅샷. **`fullState` 를 안 거친다**
//
// 그래서 이 검사는 둘을 본다: 메우는 함수가 제대로 메우는가, 그리고 **실제로 불리는가.**
// 함수만 있고 아무도 안 부르면 아무것도 막지 못한다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs page_shape.test.mjs

import { readFileSync } from 'node:fs'
import { fullPage, fullPages, fullSelected } from './src/persistence/draftStorage.ts'
import { tocItems } from './src/builder/util.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
// 주석을 걷어 낸 소스 — 안 그러면 주석에 적힌 글자가 검사를 거짓으로 통과시킨다.
const bare = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const readBare = (p) => bare(read(p))

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 1. 빠진 칸을 메우는가 ──────────────────────────
{
  const p = fullPage({ id: 7, els: [] })
  check(Array.isArray(p.conns) && p.conns.length === 0, '`conns` 가 없으면 빈 목록으로 메운다')
  check(Array.isArray(p.strokes) && p.strokes.length === 0, '`strokes` 가 없으면 빈 목록으로 메운다')
  check(Array.isArray(p.els), '`els` 도 반드시 목록이다')
  check(p.fields && typeof p.fields === 'object', '`fields` 도 반드시 서랍이다')
  check(p.free === false, '`free` 는 참거짓으로 굳힌다')
}
{
  // 아무것도 없는 쪽 — 실제로 터지던 모양보다도 더 앙상하다.
  const p = fullPage({})
  check(Array.isArray(p.els) && Array.isArray(p.conns) && Array.isArray(p.strokes),
    '빈 껍데기 쪽도 셋 다 목록으로 메운다')
}

// ── 2. 있는 값은 안 건드린다 ────────────────────────
//
// 메우는 함수가 **덮어쓰면** 그린 선과 이은 줄이 열 때마다 사라진다.
// 그건 안 터지는 대신 조용히 지우는 것이라, 터지는 쪽보다 나쁘다.
{
  const src = {
    id: 3, cardKey: 'slide', free: true,
    fields: { title: '있음' },
    els: [{ id: 1 }], conns: [{ from: 1, to: 2 }], strokes: [{ points: [[0, 0]] }],
    blocks: [{ id: 9, type: 'text', text: 'ㄱ' }], bg: '#fff', role: 'content',
  }
  const p = fullPage(src)
  check(p.els.length === 1 && p.conns.length === 1 && p.strokes.length === 1,
    '이미 있는 목록은 그대로 둔다')
  check(p.fields.title === '있음', '이미 있는 서랍은 그대로 둔다')
  check(p.free === true, '이미 있는 `free` 는 그대로 둔다')
  check(p.blocks && p.bg === '#fff' && p.role === 'content',
    '메우는 함수가 모르는 칸(blocks·bg·role)도 안 잃는다')
  check(p.id === 3 && p.cardKey === 'slide', 'id·카드 이름은 그대로다')
}

// ── 3. id 없는 쪽이 서로 겹치지 않는다 ───────────────
//
// 0 으로 메우면 그런 쪽이 둘일 때 React key 가 겹치고,
// **엉뚱한 쪽이 그려진다** — 안 터지니 알아채기까지 오래 걸린다.
{
  const ps = fullPages([{}, {}, { id: 5 }])
  const ids = ps.map((p) => p.id)
  check(new Set(ids).size === 3, 'id 없는 쪽이 여럿이어도 서로 다른 id 를 받는다', JSON.stringify(ids))
  check(ids.filter((n) => n < 0).length === 2, '메워 준 id 는 음수다 — 진짜 id 와 안 부딪힌다', JSON.stringify(ids))
  check(ids.includes(5), '진짜 id 는 그대로 쓴다')
}
{
  check(fullPages(undefined).length === 0, '쪽 목록 자체가 없어도 빈 목록을 돌려준다')
  check(fullPages('망가진 값').length === 0, '목록이 아닌 것이 와도 빈 목록을 돌려준다')
  check(fullPages([null, undefined]).length === 2, '목록 안이 비어 있어도 쪽 수는 지킨다')
}

// ── 4. 메운 쪽이 실제로 안 터지는가 ──────────────────
{
  let threw = null
  try { tocItems(fullPages([{ id: 1 }, {}, { id: 2, fields: { title: 'ㄴ' } }])) } catch (e) { threw = e }
  check(threw === null, '메운 쪽으로 목차를 만들어도 안 터진다', threw ? threw.message : '')
}

// ── 5. **실제로 불리는가** ─────────────────────────
//
// 여기가 이 검사의 핵심이다. 메우는 함수가 있어도 문에서 안 부르면 아무것도 안 막는다.
// 문은 둘이고, 둘은 서로를 안 거친다.
{
  const proj = readBare('./src/persistence/projects.ts')
  // 2026-09-14 에 `fullState` 가 한 줄에서 두 줄로 갈라졌다(고른 쪽도 같이 메우느라).
  // 글자 모양이 아니라 **메운 결과가 스냅샷에 실려 나가는가**를 본다.
  check(/const pages = fullPages\(s\.pages\)/.test(proj) && /^\s*pages,$/m.test(proj),
    '편집 화면 문(`fullState`)이 쪽까지 메우고, 그 결과를 내보낸다',
    '자료를 열 때 여기를 안 거치는 길은 없다')
  check(/import\s*\{[^}]*\bfullPages\b/.test(proj), 'projects.ts 가 그 함수를 실제로 들여온다')

  const sv = readBare('./src/approvals/SlideViewer.tsx')
  check(/const pages = fullPages\(snap\.pages\)/.test(sv),
    '결재 스냅샷 뷰어도 쪽을 메운다 — **`fullState` 를 안 거치는 두 번째 문**')
  check(!/snap\.pages\s*\|\|\s*\[\]/.test(sv),
    '옛 방식(`snap.pages || []`)이 남아 있지 않다 — 그건 목록만 막고 쪽 안은 못 막는다')
  check(/tocItems\(fullPages\(/.test(sv), '목차도 메운 쪽으로 만든다')
  check(/page=\{fullPage\(/.test(sv), '한 장 그리는 자리도 메운 쪽을 넘긴다')
}

// ── 6. 터지던 자리가 그대로 있다는 사실을 적어 둔다 ────
//
// `FreeLayer` 안의 `page.conns.map` 은 **일부러 그대로 둔다.**
// 서른 곳을 자리마다 막는 대신 문에서 메우기로 했으므로,
// 그 자리가 무방비라는 것은 이 설계에서 **정상**이다.
// 대신 5장이 문을 지킨다 — 문이 열리면 여기가 바로 터진다.
{
  const fl = readBare('./src/canvas/FreeLayer.tsx')
  check(/page\.conns\.map\(/.test(fl) || /page\.strokes\.map\(/.test(fl),
    '이 검사가 무엇을 지키는지 — 무방비로 읽는 자리가 여전히 있다(그래서 문이 중요하다)')
}

// ── 6. **고른 쪽이 없으면 무대가 빈다** ──────────────────
//
// 2026-09-14, ⑤(좁은 창)를 확인하다가 같은 문의 다른 구멍을 봤다.
// 쪽은 멀쩡히 있는데 **가운데 무대만** 「카드를 추가하세요」로 비었다 —
// 왼쪽 필름에는 쪽이 그려져 있는데. 미리보기가
// `pages.find((p) => p.id === selectedPageId)` 로 쪽을 고르는데,
// `selectedPageId` 가 없거나 지워진 쪽을 가리키면 그 find 가 빈손으로 온다.
// **쪽이 있는데 아무것도 안 보인다**는 점에서 위 다섯 절과 같은 부류다.
{
  const ps = fullPages([{ id: 7, cardKey: 'note' }, { id: 9, cardKey: 'note' }])
  check(fullSelected(ps, 9) === 9, '가리키는 쪽이 실제로 있으면 **그대로 둔다**',
    String(fullSelected(ps, 9)))
  check(fullSelected(ps, undefined) === 7, '값이 없으면 첫 쪽을 고른다',
    String(fullSelected(ps, undefined)))
  check(fullSelected(ps, null) === 7, 'null 이어도 첫 쪽', String(fullSelected(ps, null)))
  check(fullSelected(ps, 999) === 7, '**지워진 쪽을 가리키면** 첫 쪽으로 돌린다',
    String(fullSelected(ps, 999)))
  check(fullSelected(ps, '9') === 7, '숫자가 아닌 것도 안 믿는다', String(fullSelected(ps, '9')))
  check(fullSelected([], 3) === null, '쪽이 하나도 없으면 null — 없는 쪽을 가리키지 않는다',
    String(fullSelected([], 3)))
  // 음수 id 는 `fullPage` 가 id 없는 쪽에 붙여 주는 값이라 실제로 나온다.
  const neg = fullPages([{ cardKey: 'note' }, { cardKey: 'note' }])
  check(fullSelected(neg, neg[1].id) === neg[1].id, 'id 를 새로 붙인 쪽도 고를 수 있다')
}
{
  // **실제로 불리는가.** 함수만 있고 아무도 안 부르면 아무것도 막지 못한다.
  const pj = readBare('./src/persistence/projects.ts')
  check(/selectedPageId: fullSelected\(pages, s\.selectedPageId\)/.test(pj),
    '`fullState()` 가 자료를 열 때 실제로 메운다')
  // 쪽을 두 번 메우지 않는다 — `fullPages` 를 두 번 부르면 id 가 달라진다.
  check((pj.match(/fullPages\(/g) || []).length === 1,
    '`fullPages` 를 한 번만 부른다 (두 번 부르면 id 없는 쪽의 id 가 갈린다)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
