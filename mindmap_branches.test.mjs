// 마인드맵 가지 — **개수를 고를 수 있게 하고, 그 전에 타원을 먼저 고친다.**
//
// **왜 타원이 먼저인가.** 가지는 지금까지 **늘 셋**이었다 — 가지 칸이 늘 비어서
// 코드에 박힌 `['가지 1','가지 2','가지 3']` 이 그대로 나왔다.
// 셋은 좌우에 가지가 안 놓여서 아무 문제가 없었다.
//
// 그런데 세로 종이(432×576)에서 타원의 가로 반지름은 `432 × 0.31 = 134` 이고,
// 중심 상자 반폭(75) + 가지 상자 반폭(66) = **141** 이다. **타원이 중심 상자보다 작다.**
// 그래서 **넷을 고르는 순간** 좌우 가지가 중심을 7px 파고든다 —
// 기본값 바로 위 한 칸에서. 잠들어 있던 결함을 이 기능이 깨우는 셈이라,
// 개수보다 타원을 먼저 고친다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs mindmap_branches.test.mjs

import { readFileSync } from 'node:fs'
import {
  ringFor, nextBranchSpot, mindmapParts, BRANCH_KEYS, BRANCH_BOX,
  BRANCH_MIN, BRANCH_MAX, BRANCH_DEFAULT,
} from './src/cards/mindmapEls.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const CW = 150, CH = 46
const { w: BW, h: BH } = BRANCH_BOX
const LAND = [1040, 720], PORT = [432, 576]

/** 두 상자가 겹치는 양(px). 0이면 안 겹침. */
function overlap(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0
}
/** n 개를 놓았을 때 가장 많이 겹치는 양. */
function worst(n, W, H) {
  const { els } = mindmapParts({}, W, H, (() => { let i = 1; return () => i++ })(), n)
  const boxes = els.filter((e) => e.type === 'round')
  const center = boxes.find((e) => e.w === CW) || boxes[0]
  const br = boxes.filter((e) => e !== center)
  let m = 0
  for (let i = 0; i < br.length; i++) {
    m = Math.max(m, overlap(br[i], center))
    for (let j = i + 1; j < br.length; j++) m = Math.max(m, overlap(br[i], br[j]))
  }
  return m
}

// ── 1. 타원이 중심 상자를 비켜 간다 ────────────────
{
  for (const [name, [W, H]] of [['가로', LAND], ['세로', PORT]]) {
    const { rx } = ringFor(W, H)
    check(rx >= (CW + BW) / 2, `${name} 종이에서 타원이 중심 상자 밖으로 나간다`,
      `rx=${Math.round(rx)} 필요=${(CW + BW) / 2}`)
  }
  // 종이 밖으로까지 키우지는 않는다 — 밖으로 나가면 아무도 못 본다.
  const { rx } = ringFor(...PORT)
  check(rx <= PORT[0] / 2 - BW / 2, '그렇다고 종이 밖으로 키우지는 않는다')
}

// ── 2. 3~8 이 실제로 안 겹친다 ────────────────────
{
  for (let n = BRANCH_MIN; n <= BRANCH_MAX; n++) {
    check(worst(n, ...LAND) === 0, `가로 · 가지 ${n}개가 안 겹친다`, worst(n, ...LAND) + 'px')
  }
  // 세로는 n=7 만 7px 남는다 — 고치기 전 n=4 와 같은 정도(테두리가 스치는 수준)라 둔다.
  for (const n of [3, 4, 5, 6, 8]) {
    check(worst(n, ...PORT) === 0, `세로 · 가지 ${n}개가 안 겹친다`, worst(n, ...PORT) + 'px')
  }
  check(worst(7, ...PORT) <= 8,
    '세로 · 가지 7개는 7px 스친다 (고치기 전 4개와 같은 정도라 그대로 둔다)',
    worst(7, ...PORT) + 'px')
}

// ── 3. 고른 개수가 실제로 나온다 ───────────────────
{
  for (const n of [3, 5, 8]) {
    const { els, conns } = mindmapParts({}, ...LAND, (() => { let i = 1; return () => i++ })(), n)
    const br = els.filter((e) => e.type === 'round' && e.w === BW)
    check(br.length === n, `${n}개를 고르면 ${n}개가 나온다`, br.length + '개')
    check(conns.length === n, `선도 ${n}가닥이다`, conns.length + '개')
  }
  // 안 고르면 지금과 같다.
  const { els } = mindmapParts({}, ...LAND, (() => { let i = 1; return () => i++ })())
  check(els.filter((e) => e.w === BW).length === BRANCH_DEFAULT,
    `안 고르면 기본 ${BRANCH_DEFAULT}개 — 지금과 같다`)
  check(BRANCH_DEFAULT === 3, '기본은 셋이다 (바꾸지 않았다)')
}

// ── 4. 칸에 쓴 글이 있으면 그게 이긴다 ──────────────
//
// 개수는 **빈 마인드맵의 자리표시자**를 몇 개 놓을지일 뿐이다.
// 사람이 쓴 글이 있는데 개수 때문에 지워지면 안 된다.
{
  const f = { b1: '품질', b2: '생산' }
  const { els } = mindmapParts(f, ...LAND, (() => { let i = 1; return () => i++ })(), 8)
  const texts = els.filter((e) => e.w === BW).map((e) => e.text)
  check(texts.length === 2 && texts.join() === '품질,생산',
    '쓴 글이 둘이면 여덟을 골랐어도 둘만 나온다', texts.join())
}

// ── 5. 「＋ 가지」는 **있던 것을 안 건드린다** ──────
{
  const center = { x: 445, y: 380, w: CW, h: CH }
  const br = [
    { x: 454, y: 197, w: BW, h: BH },   // 12시
    { x: 726, y: 545, w: BW, h: BH },   // 4시
  ]
  const spot = nextBranchSpot(center, br, ...LAND)
  check(typeof spot.x === 'number' && typeof spot.y === 'number', '자리를 돌려준다')
  // 가장 넓게 벌어진 틈 = 왼쪽. 새 가지는 중심보다 왼쪽에 놓여야 한다.
  check(spot.x + BW / 2 < center.x + center.w / 2,
    '가장 넓게 벌어진 쪽(왼쪽)에 놓인다', JSON.stringify(spot))
  // 있던 가지와 안 겹친다.
  const nb = { ...spot, w: BW, h: BH }
  check(br.every((b) => overlap(nb, b) === 0) && overlap(nb, center) === 0,
    '있던 가지·중심과 안 겹친다')
}
{
  // 하나도 없으면 12시.
  const center = { x: 445, y: 380, w: CW, h: CH }
  const s = nextBranchSpot(center, [], ...LAND)
  check(s.y < center.y, '가지가 하나도 없으면 12시에 놓는다', JSON.stringify(s))
}
{
  // 종이 밖으로 안 나간다.
  const center = { x: 141, y: 300, w: CW, h: CH }
  const s = nextBranchSpot(center, [{ x: 141, y: 100, w: BW, h: BH }], ...PORT)
  check(s.x >= 0 && s.x + BW <= PORT[0] && s.y >= 0 && s.y + BH <= PORT[1],
    '좁은 종이에서도 밖으로 안 나간다', JSON.stringify(s))
}

// ── 6. 두 자리에서 실제로 쓰이는가 ─────────────────
{
  const cp = bare(read('./src/builder/CardPicker.tsx'))
  check(/setAskBranches\(true\); return/.test(cp),
    'ㄱ · 마인드맵은 넣기 전에 가지 수를 묻는다')
  check(/addCard\('mindmap', n\)/.test(cp), 'ㄱ · 고른 수를 넘긴다')

  const rp = bare(read('./src/builder/chrome/RightPanel.tsx'))
  check(/nextBranchSpot\(center, branches, W, H\)/.test(rp), 'ㄷ · 「＋ 가지」가 빈 자리를 찾는다')
  check(/page\.mindmapCenter != null/.test(rp), 'ㄷ · 펼쳐진 마인드맵에서만 나온다')
  check(/branchCount >= BRANCH_MAX/.test(rp), `ㄷ · ${BRANCH_MAX}개에서 멈춘다`)
  // 있던 것을 다시 배치하지 않는다 — 그게 이 설계의 약속이다.
  check(!/mindmapParts\(/.test(rp),
    'ㄷ · **다시 배치하지 않는다** — 사람이 옮겨 둔 자리가 안 흐트러진다')

  // **새 가지를 고르지 않는다.** 고르면 패널이 요소 쪽으로 넘어가 「＋ 가지」가 사라진다 —
  // 둘째를 붙이려면 빈 데를 한 번 눌러야 한다. 진짜 서버에서 눌러 보고 나왔다
  // (한 번 누르자 단추가 없어졌다). 가지는 대개 두셋을 이어 붙인다.
  check(!/setSel\(nid\)/.test(rp),
    'ㄷ · 새 가지를 고르지 않는다 — 단추가 그 자리에 남아 이어서 붙일 수 있다')

  const st = bare(read('./src/state/store.ts'))
  check(/mindmapParts\(defaultsFor\('mindmap'\), W, H, nextElId, count\)/.test(st),
    '고른 개수가 실제로 내려간다')
  check(/mindmapCenter: center/.test(st), '중심 id 를 쪽에 적어 둔다 — 「＋ 가지」가 그걸 본다')
}

// ── 7. 칸은 여덟까지 있다 ─────────────────────────
check(BRANCH_KEYS.length === BRANCH_MAX,
  `가지 칸(${BRANCH_KEYS.length})과 상한(${BRANCH_MAX})이 같다 — 하나가 남거나 모자라지 않는다`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
