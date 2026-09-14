// 방향을 바꿀 때 **마인드맵은 다시 앉히고(ㄱ), 되돌리면 자리도 돌아온다(ㄴ)**.
//
// **왜 생겼나.** 2026-09-14, 세로로 바꾼 화면 녹화를 받았다. ④의 끌어들이기가
// 요소를 **따로따로** `x ≤ W − w` 로 자르는데, 마인드맵은 가지들이 중심을 둘러싸고
// 있어서 오른쪽 절반이 **전부 같은 x** 로 갔다. 실측:
//
//     가지 3개 → 가장 깊은 겹침 7px,  같은 x 에 2개
//     가지 5개 → 38px(상자 높이가 38), 같은 x 에 3개
//     가지 8개 → 38px,                같은 x 에 **5개**
//
// `fitPaper.ts` 주석에 「겹칠 수는 있어도 잃지는 않는다」고 써 두고 넘어갔는데,
// **마인드맵은 「어디에 있느냐」가 곧 내용**이라 겹치면 잃은 것과 같다.
//
// 그리고 녹화에서 사용자는 **가로를 다시 눌러** 되돌리려 했다. 그게 본능인데
// 자리는 안 돌아왔다 — 되돌리는 길이 알림 줄 하나뿐이고 10초 뒤 사라졌다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs mindmap_relayout.test.mjs

import { readFileSync } from 'node:fs'
import { mindmapParts, relayoutMindmap, ringFor, ringCenter, BRANCH_BOX } from './src/cards/mindmapEls.ts'
import { fitPagesToPaper } from './src/canvas/fitPaper.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const LAND = [1040, 720], PORT = [432, 576]
const ids = () => { let i = 1; return () => i++ }

/** 가로에서 펼친 마인드맵 한 쪽. */
function mmPage(n, W = LAND[0], H = LAND[1]) {
  const { els, conns } = mindmapParts({}, W, H, ids(), n)
  return { id: 1, cardKey: 'slide', fields: {}, free: true, els, conns, strokes: [],
           mindmapCenter: conns[0].from }
}
const cxOf = (e) => e.x + e.w / 2, cyOf = (e) => e.y + e.h / 2
/** 서로 겹치는 요소 수와 가장 깊은 겹침. */
function overlap(els) {
  const hit = new Set(); let worst = 0
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (ox > 0 && oy > 0) { hit.add(i); hit.add(j); worst = Math.max(worst, Math.min(ox, oy)) }
  }
  return { n: hit.size, worst }
}
const outside = (els, W, H) => els.filter((e) => e.x < 0 || e.y < 0 || e.x + e.w > W || e.y + e.h > H).length

// ── 1. **겹침이 사라진다** ────────────────────────
{
  for (const n of [3, 5, 8]) {
    const p = mmPage(n)
    const after = fitPagesToPaper([p], ...PORT).pages[0].els
    const o = overlap(after)
    check(o.n === 0, `가지 ${n}개 — 세로로 바꿔도 **아무것도 안 겹친다**`, `${o.n}개 겹침 ${o.worst}px`)
    check(outside(after, ...PORT) === 0, `가지 ${n}개 — 종이 밖으로도 안 나간다`)
    // **가장자리에 몰리지 않는다.** 「같은 x」로 재면 안 된다 — 대칭인 타원에서는
    // ±45° 짝이 같은 x 에 놓이는데(겹치지는 않는다) 그건 정상이다.
    // 진짜 증상은 **잘린 자리(x = W − w)에 쌓이는 것**이다.
    const jam = after.filter((e) => e.x === PORT[0] - e.w).length
    check(jam <= 1, `가지 ${n}개 — 잘린 가장자리에 쌓이지 않는다`, `가장자리에 ${jam}개`)
  }
}

// ── 2. **각도를 지킨다** ─────────────────────────
//
// 왼쪽에 둔 가지는 왼쪽에, 12시 가지는 12시에 남아야 한다. 그게 이 설계가 자르기보다
// 나은 유일한 이유다 — 안 지키면 그냥 새로 만드는 것과 같다.
{
  const p = mmPage(5)
  const c0 = p.els.find((e) => e.id === p.mindmapCenter)
  const before = p.els.filter((e) => e.id !== c0.id && e.type === 'round')
    .map((e) => ({ id: e.id, a: Math.atan2(cyOf(e) - cyOf(c0), cxOf(e) - cxOf(c0)) }))
  const after = relayoutMindmap(p, ...PORT)
  const c1 = after.find((e) => e.id === p.mindmapCenter)
  let worstDeg = 0
  for (const b of before) {
    const e = after.find((x) => x.id === b.id)
    const a = Math.atan2(cyOf(e) - cyOf(c1), cxOf(e) - cxOf(c1))
    let d = Math.abs(a - b.a) * 180 / Math.PI
    if (d > 180) d = 360 - d
    worstDeg = Math.max(worstDeg, d)
  }
  check(worstDeg < 6, '가지가 **있던 방향에 그대로** 남는다', `가장 많이 틀어진 각 ${worstDeg.toFixed(1)}°`)
}
{
  // 손으로 옮겨 둔 가지도 그 **방향**은 지킨다(거리는 타원으로 돌아온다).
  const p = mmPage(3)
  const b = p.els.find((e) => e.text === '가지 2')
  b.x = 60; b.y = 60                                   // 사람이 왼쪽 위로 끌어다 놓았다
  const c0 = p.els.find((e) => e.id === p.mindmapCenter)
  const a0 = Math.atan2(cyOf(b) - cyOf(c0), cxOf(b) - cxOf(c0))
  const after = relayoutMindmap(p, ...PORT)
  const c1 = after.find((e) => e.id === p.mindmapCenter)
  const nb = after.find((e) => e.id === b.id)
  const a1 = Math.atan2(cyOf(nb) - cyOf(c1), cxOf(nb) - cxOf(c1))
  check(Math.abs(a1 - a0) * 180 / Math.PI < 6, '손으로 옮겨 둔 가지도 **그 방향**에 남는다')
  check(nb.x < c1.x && nb.y < c1.y, '왼쪽 위에 둔 것은 왼쪽 위에 있다',
    JSON.stringify({ x: nb.x, y: nb.y }))
}

// ── 3. 마인드맵 **아닌 것**은 안 건드린다 ──────────
{
  check(relayoutMindmap({ els: [{ id: 1, x: 0, y: 0, w: 10, h: 10 }], conns: [] }, ...PORT) === null,
    'mindmapCenter 가 없으면 null — 부르는 쪽이 평소대로 자른다')
  const p = mmPage(3)
  check(relayoutMindmap({ ...p, mindmapCenter: 999 }, ...PORT) === null,
    '중심을 지운 쪽도 null — 더는 마인드맵이 아니다')
  check(relayoutMindmap({ ...p, conns: [] }, ...PORT) === null, '선이 하나도 없으면 null')
}
{
  // 같은 쪽에 사람이 따로 붙인 상자는 **마인드맵이 아니다.** 자르기에만 맡긴다.
  const p = mmPage(3)
  const memo = { id: 900, type: 'round', x: 900, y: 40, w: 120, h: 40, text: '메모' }
  p.els = [...p.els, memo]
  const after = relayoutMindmap(p, ...PORT)
  const nm = after.find((e) => e.id === 900)
  check(nm === memo, '선으로 안 이어진 상자는 **그대로 둔다** (같은 객체)')
  // 그리고 fitPaper 가 그것만 자른다.
  const fitted = fitPagesToPaper([p], ...PORT).pages[0].els.find((e) => e.id === 900)
  check(fitted.x === PORT[0] - 120, '그 상자는 평소대로 가장자리로 잘린다', String(fitted.x))
}

// ── 4. 세로 종이 → 가로도 된다 ──────────────────
{
  const p = mmPage(5, ...PORT)
  const after = fitPagesToPaper([p], ...LAND).pages[0].els
  check(overlap(after).n === 0, '세로에서 만든 것을 가로로 바꿔도 안 겹친다')
  const { rx } = ringFor(...LAND)
  const c = after.find((e) => e.id === p.mindmapCenter)
  const far = Math.max(...after.filter((e) => e.id !== c.id).map((e) => Math.abs(cxOf(e) - cxOf(c))))
  check(far > rx * 0.8, '넓어진 종이만큼 **가지도 벌어진다** (세로 폭에 갇히지 않는다)',
    `가장 먼 가지 ${Math.round(far)} · rx ${Math.round(rx)}`)
}

// ── 5. 중심은 늘 **새로 만들 때와 같은 자리**에 ──
//
// 두 곳에 따로 적어 두면 언젠가 갈라지고, 그러면 방향만 바꿨는데 중심이 움직인다.
{
  for (const [W, H] of [LAND, PORT]) {
    const fresh = mindmapParts({}, W, H, ids(), 3)
    const fc = fresh.els.find((e) => e.id === fresh.conns[0].from)
    const after = relayoutMindmap(mmPage(3), W, H)
    const p = mmPage(3)
    const rc = after.find((e) => e.id === p.mindmapCenter)
    check(rc.x === fc.x && rc.y === fc.y,
      `${W === 432 ? '세로' : '가로'} — 다시 앉힌 중심이 새로 만든 것과 같은 자리다`,
      `${rc.x},${rc.y} / ${fc.x},${fc.y}`)
  }
  check(typeof ringCenter === 'function', '고리 중심을 **한 곳**에서 정한다 (ringCenter)')
  check(ringCenter(432, 576).y === 576 * 0.56, '종이 가운데보다 조금 아래 — 제목이 위를 쓴다')
}

// ── 6. ㄴ · **되돌아가는 길** ────────────────────
{
  const st = bare(read('./src/state/store.ts'))
  check(/if \(o === s\.orientation\) return \{\}/.test(st),
    '같은 방향을 다시 눌러도 아무 일도 안 한다 — 없으면 마인드맵이 까닭 없이 정리된다')
  check(/if \(lastFit && lastFit\.orientation === o && lastFit\.after === s\.pages\)/.test(st),
    '바꾸기 전 방향으로 다시 가면서 **그 사이 안 고쳤으면** 자리를 되돌린다')
  check(/after: pages/.test(st), '그때 내놓은 쪽 목록 **그 자체**를 들고 있는다')
  check(/restored: true/.test(st), '되돌렸다고 화면에 알린다')
  check(/lastFit = moved \? \{[^}]*\} : null/.test(st),
    '옮긴 게 0개면 들고 있던 것도 비운다')
  check(/export function resetFitUndo\(\)/.test(st), '자료를 바꿔 열 때 비울 길이 있다')

  const pj = bare(read('./src/persistence/projects.ts'))
  check((pj.match(/resetFitUndo\(\)/g) || []).length >= 2,
    '자료를 열 때와 새로 만들 때 **둘 다** 비운다')
  // 자료를 **여는** 자리에서 비우는가 — 두 줄이 같은 함수 안에 붙어 있어야 한다.
  const apply = pj.slice(pj.indexOf('function applyProject'), pj.indexOf('function applyProject') + 900)
  check(/resetHistory\(\)/.test(apply) && /resetFitUndo\(\)/.test(apply),
    'applyProject 안에서 resetHistory 와 나란히 비운다 — 같은 이유로 비우는 것이다')
}

// ── 7. 알림이 겹침을 말한다 ──────────────────────
{
  // 마인드맵은 이제 안 겹치지만, 딴 요소는 겹칠 수 있다.
  const els = [
    { id: 1, type: 'round', x: 900, y: 100, w: 200, h: 60 },
    { id: 2, type: 'round', x: 920, y: 120, w: 200, h: 60 },
    { id: 3, type: 'round', x: 10, y: 10, w: 100, h: 40 },
  ]
  const r = fitPagesToPaper([{ id: 1, els, conns: [], strokes: [] }], ...PORT)
  check(r.moved === 2, '나간 둘을 옮겼다', String(r.moved))
  check(r.overlapping === 2, '겹친 둘을 셌다', String(r.overlapping))
  const clean = fitPagesToPaper([{ id: 1, els: [els[2]], conns: [], strokes: [] }], ...PORT)
  check(clean.overlapping === 0, '안 겹치면 0이다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
