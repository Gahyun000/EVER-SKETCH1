// 트리 2단계 — 구조 읽기 · 접기 · 접어 넣기.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs tree_ops.test.mjs

import { readFileSync } from 'node:fs'
import { treeShape, descendantCount, bandOf, bandsNeeded, layoutTree, newNode, isTreePage, TREE_CONN } from './src/cards/treeOps.ts'
import { treeCapacity, NODE_W, NODE_H, PAD_X, PAD_TOP } from './src/cards/treeEls.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; return }
  fail++
  console.log('  X ' + label + (extra ? '  — ' + extra : ''))
}
const LAND = [1040, 720]

// 사슬 하나 만들기 — id 1..n, 1→2→…→n
function chain(n, from = 1) {
  const els = [], conns = []
  for (let i = 0; i < n; i++) {
    const id = from + i
    els.push(newNode(id, 'n' + id))
    if (i) conns.push({ from: id - 1, to: id, ...TREE_CONN })
  }
  return { els, conns }
}

// ── 1. 구조는 **선**에서 읽는다 ─────────────────────────────
{
  const a = chain(3, 1), b = chain(3, 11)
  const els = [...a.els, ...b.els], conns = [...a.conns, ...b.conns]
  const sh = treeShape(els, conns)
  check(sh.roots.length === 2, '줄기 둘이면 뿌리도 둘', `뿌리 ${JSON.stringify(sh.roots)}`)
  check(sh.roots[0] === 1 && sh.roots[1] === 11, '뿌리는 1 과 11')
  check(sh.depth.get(3) === 2 && sh.depth.get(13) === 2, '깊이는 줄기마다 따로 센다')
  check(sh.members.length === 6, '여섯 상자 모두 트리에 든다')
}
{
  // **저장된 값을 믿지 않는다** — 명단에 있어도 부모가 생기면 자식이다
  const { els, conns } = chain(2)
  const sh = treeShape(els, conns, [1, 2])
  check(sh.roots.length === 1 && sh.roots[0] === 1,
    '명단에 둘 다 있어도 부모가 있는 쪽은 뿌리가 아니다', `뿌리 ${JSON.stringify(sh.roots)}`)
}
{
  // 선이 하나도 없는 외톨이는 **명단으로만** 붙들 수 있다
  const els = [newNode(9, '새 뿌리')]
  check(treeShape(els, []).members.length === 0, '명단에 없으면 외톨이는 트리 밖')
  const sh = treeShape(els, [], [9])
  check(sh.members.length === 1 && sh.roots[0] === 9, '명단에 있으면 외톨이도 뿌리')
}
{
  // 고리는 부모로 삼지 않는다
  const { els, conns } = chain(3)
  conns.push({ from: 3, to: 1, ...TREE_CONN })
  const sh = treeShape(els, conns)
  check(sh.roots.length === 1 && sh.roots[0] === 1, '되돌아오는 선은 부모가 안 된다')
  check(sh.parent.get(1) === undefined, '1 은 여전히 뿌리')
}

// ── 2. 접기 ────────────────────────────────────────────────
{
  const { els, conns } = chain(4)
  els[1] = { ...els[1], folded: true }               // 2 를 접는다
  const sh = treeShape(els, conns)
  check(!sh.hidden.has(2), '접은 상자 자신은 보인다')
  check(sh.hidden.has(3) && sh.hidden.has(4), '접은 상자 아래는 전부 숨는다')
  check(sh.hidden.size === 2, '숨는 것은 딱 아래쪽뿐', `숨은 수 ${sh.hidden.size}`)
  check(descendantCount(sh, 2) === 2, '「+N」은 2', `N=${descendantCount(sh, 2)}`)
  check(descendantCount(sh, 1) === 3, '뿌리를 접으면 3개가 숨는다')
}

// ── 3. 띠 나누기 셈 ────────────────────────────────────────
{
  const L = 5
  check(bandOf(0, L).band === 0 && bandOf(4, L).col === 4, '첫 띠는 L 레벨을 온전히 쓴다')
  check(bandOf(5, L).band === 1 && bandOf(5, L).col === 1, '다음 띠는 머리 한 칸을 부모에게 준다')
  check(bandOf(8, L).band === 1 && bandOf(8, L).col === 4, '두 띠의 마지막 레벨은 8')
  check(bandOf(9, L).band === 2 && bandOf(9, L).col === 1, '9레벨부터 셋째 띠')
  check(bandsNeeded(4, L) === 1 && bandsNeeded(5, L) === 2 && bandsNeeded(8, L) === 2
    && bandsNeeded(9, L) === 3, '가로 종이: 한 띠 5레벨 · 두 띠 9레벨 · 세 띠 13레벨')
  check(bandsNeeded(12, L) === 3 && bandsNeeded(13, L) === 4, '세 띠는 13레벨(0~12)까지')
}
{
  // 시안에 적어 드린 값과 같은가
  const cap = treeCapacity('LR', ...LAND)
  check(cap.levels === 5, '가로 종이 한 띠 = 5레벨', `잰 값 ${cap.levels}`)
}

// ── 4. 접어 넣기 — 실제로 앉혀 본다 ────────────────────────
{
  const { els, conns } = chain(5)                    // 5레벨 — 한 띠에 딱 맞는다
  const r = layoutTree(els, conns, ...LAND, 'LR', [1])
  check(r.bands === 1, '5레벨은 한 띠', `띠 ${r.bands}`)
  check(r.els.filter((e) => e.echoOf != null).length === 0, '한 띠면 echo 가 없다')
  check(r.overlapping === 0, '겹침 0')
  check(r.dir === 'LR', '방향은 그대로')
}
{
  const { els, conns } = chain(8)                    // 8레벨 — 두 띠
  const r = layoutTree(els, conns, ...LAND, 'LR', [1])
  check(r.bands === 2, '8레벨은 두 띠', `띠 ${r.bands}`)
  const echoes = r.els.filter((e) => e.echoOf != null)
  check(echoes.length === 1, 'echo 는 하나', `${echoes.length}개`)
  check(echoes[0].echoOf === 5, 'echo 는 5번(마지막 띠의 부모)을 다시 놓은 것',
    `echoOf=${echoes[0] && echoes[0].echoOf}`)
  check(r.overlapping === 0, '두 띠에서도 겹침 0', `겹친 쌍 ${r.overlapping}`)
  const out = r.els.filter((e) => e.x < 0 || e.y < 0 || e.x + e.w > 1040 || e.y + e.h > 720)
  check(out.length === 0, '종이 밖으로 나간 것 없음', JSON.stringify(out.map((e) => [e.text, e.x, e.y])))
  // 아래 띠가 정말 **아래**에 있나
  const lower = r.els.find((e) => e.text === 'n6')
  const upper = r.els.find((e) => e.text === 'n5')
  check(lower && upper && lower.y > upper.y, '이어지는 상자는 아래 띠에 있다',
    `n5.y=${upper && upper.y} n6.y=${lower && lower.y}`)
  check(echoes[0].color === '#f4f6fa', 'echo 는 흐리다')
  // **띠를 건너는 원래 선은 빠져야 한다** — 안 그러면 긴 선이 종이를 가로지른다.
  const cross = r.conns.filter((c) => {
    const a = r.els.find((e) => e.id === c.from), b = r.els.find((e) => e.id === c.to)
    return a && b && Math.abs(a.y - b.y) > 200
  })
  check(cross.length === 0, '띠를 건너는 긴 선이 남지 않는다', `${cross.length}개`)
  check(r.conns.length === 7, '선은 7개 — 원래 7개 중 하나가 빠지고 echo 선 하나가 는다',
    `${r.conns.length}개`)
}
{
  // 가지가 셋 내려갈 때 — echo 도 셋이 아니라 **부모마다 하나**
  const els = [newNode(1, '뿌리')], conns = []
  for (let i = 0; i < 3; i++) {
    const a = 10 + i * 10
    els.push(newNode(a, 'k' + i)); conns.push({ from: 1, to: a, ...TREE_CONN })
    let prev = a
    for (let d = 1; d <= 5; d++) {                   // 깊이 6까지 — 두 띠로 넘어간다
      const id = a + d
      els.push(newNode(id, 'k' + i + '-' + d)); conns.push({ from: prev, to: id, ...TREE_CONN })
      prev = id
    }
  }
  const r = layoutTree(els, conns, ...LAND, 'LR', [1])
  check(r.bands === 2, '깊이 6이면 두 띠', `띠 ${r.bands}`)
  const echoes = r.els.filter((e) => e.echoOf != null)
  check(echoes.length === 3, '내려가는 부모가 셋이면 echo 도 셋', `${echoes.length}개`)
  check(r.overlapping === 0, '가지 셋이 내려가도 겹침 0', `겹친 쌍 ${r.overlapping}`)
}

// ── 5. echo 는 **다시 만든다** ─────────────────────────────
{
  const { els, conns } = chain(8)
  const once = layoutTree(els, conns, ...LAND, 'LR', [1])
  const twice = layoutTree(once.els, once.conns, ...LAND, 'LR', [1])
  check(twice.els.filter((e) => e.echoOf != null).length === 1,
    '다시 앉혀도 echo 가 불어나지 않는다',
    `${twice.els.filter((e) => e.echoOf != null).length}개`)
  check(twice.els.length === once.els.length, '상자 수도 그대로')
  // 원본 글자를 고치면 echo 도 따라간다
  const renamed = once.els.map((e) => (e.text === 'n5' && e.echoOf == null ? { ...e, text: '고친 이름' } : e))
  const after = layoutTree(renamed, once.conns, ...LAND, 'LR', [1])
  const ec = after.els.find((e) => e.echoOf != null)
  check(ec && ec.text === '고친 이름', 'echo 글자가 원본을 따라간다', `echo 글자 「${ec && ec.text}」`)
}
{
  // echo 는 **구조가 아니다** — 다시 읽을 때 뿌리로 세면 안 된다
  const { els, conns } = chain(8)
  const r = layoutTree(els, conns, ...LAND, 'LR', [1])
  const sh = treeShape(r.els, r.conns, [1])
  check(sh.roots.length === 1 && sh.roots[0] === 1, 'echo 를 뿌리로 세지 않는다',
    `뿌리 ${JSON.stringify(sh.roots)}`)
}

// ── 6. 접은 채 앉히기 ──────────────────────────────────────
{
  const { els, conns } = chain(8)
  els[2] = { ...els[2], folded: true }               // 3 을 접는다 → 4~8 숨음
  const r = layoutTree(els, conns, ...LAND, 'LR', [1])
  check(r.bands === 1, '접으면 깊이가 줄어 한 띠로 들어간다', `띠 ${r.bands}`)
  const hid = r.els.filter((e) => e.hidden)
  check(hid.length === 5, '숨은 상자 5개', `${hid.length}개`)
  check(r.els.filter((e) => e.echoOf != null).length === 0, '한 띠라 echo 도 없다')
  check(r.overlapping === 0, '숨은 것은 겹침으로 세지 않는다')
  check(r.els.length === 8, '**상자는 하나도 안 없어진다**', `${r.els.length}개`)
}

// ── 7. 뿌리 여럿을 한 장에 ─────────────────────────────────
{
  const a = chain(3, 1), b = chain(3, 11)
  const r = layoutTree([...a.els, ...b.els], [...a.conns, ...b.conns], ...LAND, 'LR', [1, 11])
  check(r.overlapping === 0, '줄기 둘이 겹치지 않는다', `겹친 쌍 ${r.overlapping}`)
  const y1 = r.els.find((e) => e.id === 1).y, y11 = r.els.find((e) => e.id === 11).y
  check(y1 !== y11, '두 뿌리는 다른 줄에 앉는다', `${y1} / ${y11}`)
  const x1 = r.els.find((e) => e.id === 1).x, x11 = r.els.find((e) => e.id === 11).x
  check(x1 === x11, '두 뿌리는 같은 레벨(맨 왼쪽)', `${x1} / ${x11}`)
}

// ── 8. 트리 밖의 것은 안 건드린다 ──────────────────────────
{
  const { els, conns } = chain(3)
  const memo = { id: 99, type: 'text', x: 700, y: 600, w: 200, h: 40, text: '메모', color: 'transparent', fs: 12 }
  const r = layoutTree([...els, memo], conns, ...LAND, 'LR', [1])
  const m = r.els.find((e) => e.id === 99)
  check(m.x === 700 && m.y === 600, '메모는 그 자리에 그대로')
  check(!m.hidden, '메모에 숨김 표시를 달지 않는다')
}

// ── 8-2. 망가진 쪽에서 안 터진다 ───────────────────────────
// 방향 단추 하나에 **모든 쪽**을 훑는다. 한 쪽이 이상하다고 화면이 하얘지면 안 된다.
// 2026-09-15: `byId` 를 만들 때 null 을 안 걸러서 fit_paper 검사가 잡아 줬다.
{
  const { els, conns } = chain(3)
  let err = ''
  try { treeShape([null, ...els, undefined], conns, [1]) } catch (e) { err = e.message }
  check(!err, 'els 에 빈 칸이 있어도 구조를 읽는다', err)
  try { layoutTree([null, ...els], conns, 1040, 720, 'LR', [1]) } catch (e) { err = e.message }
  check(!err, 'els 에 빈 칸이 있어도 앉힌다', err)
}

// ── 8-3. 마인드맵을 트리로 오인하지 않는다 ─────────────────
// 2026-09-15: 「선으로 이어진 상자가 있나」로 판정했다가 마인드맵 쪽이 트리 길로 샜다.
// mindmap_relayout 의 「선 없는 메모는 그대로 둔다」가 깨져서 알았다.
{
  const { els, conns } = chain(3)
  check(isTreePage({ els, conns, treeRoots: [1] }) === true, '명단이 있으면 트리')
  check(isTreePage({ els, conns }) === false, '명단이 없으면 트리가 아니다 — 선만으로는 모른다')
  check(isTreePage({ els, conns, treeRoots: [1], mindmapCenter: 1 }) === false,
    '마인드맵은 마인드맵이다')
  check(isTreePage({ els: [], treeRoots: [1] }) === false, '명단의 상자가 다 없어졌으면 아니다')
}

// ── 9. 규칙이 코드에 적혀 있나 ─────────────────────────────
{
  const src = read('./src/cards/treeOps.ts')
  check(/echo 는 앉힐 때마다 새로 만든다/.test(src), 'echo 를 왜 다시 만드는지 적혀 있다')
  check(/편집 화면에서만 듣는다/.test(src), '접기가 편집 화면에서만 듣는다고 적혀 있다')
  check(/들어오는 선이 없는 상자/.test(src), '뿌리 세는 규칙이 적혀 있다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
