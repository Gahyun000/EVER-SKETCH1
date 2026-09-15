// 트리 2단계 — **살아 있는 쪽에서 구조를 읽고, 다시 앉힌다** (사용자 결정 ①ㄴㄷㄹ 합본 · ②ㄴ · ③ㄴ · 2026-09-15).
//
// ── 1단계와 무엇이 다른가 ────────────────────────
// 1단계는 **머메이드 글에서** 구조를 읽었다(`treeEls.treeParts`). 글은 한 번 쓰고 나면
// 그림과 따로 논다 — 손으로 상자를 더하면 글에는 없다. 그래서 2단계부터는
// **그림(요소와 선)이 진실**이고, 글은 처음 뼈대를 잡는 입력일 뿐이다.
//
// ── 뿌리를 세는 규칙 ─────────────────────────────
// **뿌리 = 들어오는 선이 없는 상자.** 저장된 값을 믿지 않는다.
// 사람이 선을 하나 그으면 뿌리였던 것이 자식이 되는데, 저장된 값은 그걸 모른다.
//
// 다만 **선이 하나도 없는 상자**는 셀 수가 없다 — 「＋ 새 뿌리」로 갓 만든 외톨이가 그렇다.
// 그래서 쪽에 `treeRoots` 를 적어 둔다. 이건 「뿌리 목록」이 아니라 **「트리에 속한 상자 명단」**이고,
// 실제로 누가 뿌리인지는 여기서 다시 센다. 명단에 있어도 부모가 생기면 자식이다.
//
// ── 접기(②ㄴ) ───────────────────────────────────
// `folded` 는 그 상자가 접혀 있다는 표시, `hidden` 은 접힌 윗대 때문에 안 보인다는 **결과**다.
// 결과를 저장하는 대신 매번 다시 계산한다 — 저장하면 둘이 어긋난다(doc_state 와 같은 이유).
// **그리고 `hidden` 은 편집 화면에서만 듣는다**(FreeLayer). 결재·팀 공유·내보내기는 다 펴진다.
//
// ── 접어 넣기(③ㄴ) ──────────────────────────────
// 깊어서 한 줄에 안 들어가면 **같은 종이 아래 띠로 이어 그린다.** 쪽을 나누지 않는다 —
// 나누면 「앞 장에서 이어짐」이라는 말과 두 장을 묶는 규칙이 통째로 따라온다.
// 아래 띠 머리에는 **부모를 흐리게 다시** 놓는다(echo). 그러지 않으면 띠 사이를
// 긴 선이 여러 개 가로지른다(시안에서 가지 셋으로 재 봤다).
//
// **echo 는 앉힐 때마다 새로 만든다.** 남겨 두면 원본 글자를 고쳤을 때 따라가지 않아
// 말이 어긋난다 — 쪽을 나눌 때 걱정했던 바로 그 문제다.

import type { FreeEl, Conn } from '../state/store'
import {
  NODE_W, NODE_H, PAD_X, PAD_TOP, PAD_BOTTOM,
  LR_COL, LR_ROW, TD_COL, TD_ROW, treeCapacity, type TreeDir,
} from './treeEls'

/** 흐리게 다시 놓은 부모. 값은 **원본 상자의 id**. 앉힐 때마다 지우고 새로 만든다. */
export const ECHO_COLOR = '#f4f6fa'
export const ECHO_TCOLOR = '#8a93a5'

export interface Shape {
  /** 트리에 속한 상자들 */
  members: number[]
  parent: Map<number, number>
  kids: Map<number, number[]>
  /** **들어오는 선이 없는 상자 전부.** 하나일 수도, 여럿일 수도 있다. */
  roots: number[]
  depth: Map<number, number>
  /** 접힌 윗대 때문에 안 보이는 상자 */
  hidden: Set<number>
}

const isEcho = (e: FreeEl) => e.echoOf != null

/** `maybe` 가 `of` 의 윗대인가. 고리를 부모로 삼지 않으려고 본다. */
function isAncestor(parent: Map<number, number>, of: number, maybe: number): boolean {
  let p = parent.get(of)
  let guard = 0
  while (p != null && guard++ < 500) { if (p === maybe) return true; p = parent.get(p) }
  return false
}

/**
 * 그림에서 구조를 읽는다. **echo 는 세지 않는다** — 그건 그림이지 구조가 아니다.
 *
 * `known` 은 쪽에 적어 둔 명단(`treeRoots`). 선이 하나도 없는 외톨이를 트리 안에
 * 붙들어 두는 몫만 한다. 누가 뿌리인지는 명단이 아니라 **선**이 정한다.
 */
export function treeShape(els: FreeEl[], conns: Conn[], known: number[] = []): Shape {
  const live = new Set((els || []).filter((e) => e && !isEcho(e)).map((e) => e.id))
  const members: number[] = []
  const seen = new Set<number>()
  const add = (id: number) => { if (live.has(id) && !seen.has(id)) { seen.add(id); members.push(id) } }

  // 요소 순서를 그대로 따른다 — 「처음 만난 순서가 그림 순서」라는 1단계 규칙과 같다.
  for (const e of els || []) {
    if (!e || isEcho(e)) continue
    if (known.includes(e.id)) add(e.id)
  }
  // **echo 를 원본으로 되돌려 읽는다.** 띠를 건너는 원래 선은 그림에서 빼는데(위 6번),
  // 그러면 아래 띠 첫 상자가 부모를 잃어 **뿌리로 잘못 세어진다.** echo 가 대신 이어 주므로
  // 「echo 에서 나간 선」을 「원본에서 나간 선」으로 읽으면 구조가 그대로 남는다.
  const asOrigin = new Map<number, number>()
  for (const e of els || []) if (e && e.echoOf != null) asOrigin.set(e.id, e.echoOf)
  const org = (id: number) => asOrigin.get(id) ?? id
  for (const c of conns || []) {
    if (!c) continue
    add(org(c.from)); add(org(c.to))
  }

  const parent = new Map<number, number>()
  const kids = new Map<number, number[]>()
  for (const id of members) kids.set(id, [])
  for (const c0 of conns || []) {
    if (!c0) continue
    const from = org(c0.from), to = org(c0.to)
    if (from === to) continue
    if (!seen.has(from) || !seen.has(to)) continue
    if (parent.has(to)) continue                         // 이미 부모가 있다 — 선만 남긴다
    if (isAncestor(parent, from, to)) continue           // 고리가 된다 — 선만 남긴다
    parent.set(to, from)
    kids.get(from)!.push(to)
  }

  const roots = members.filter((id) => !parent.has(id))

  const depth = new Map<number, number>()
  const walk = (id: number, d: number, guard: Set<number>) => {
    if (guard.has(id)) return
    guard.add(id)
    depth.set(id, d)
    for (const k of kids.get(id) || []) walk(k, d + 1, guard)
  }
  const guard = new Set<number>()
  roots.forEach((r) => walk(r, 0, guard))
  for (const id of members) if (!depth.has(id)) depth.set(id, 0)   // 고리 안에만 있던 것

  // 접힘 — `folded` 인 상자의 **아래쪽 전부**가 안 보인다. 자기 자신은 보인다.
  const byId = new Map((els || []).filter(Boolean).map((e) => [e.id, e]))
  const hidden = new Set<number>()
  for (const id of members) {
    let p = parent.get(id)
    let g = 0
    while (p != null && g++ < 500) {
      if (byId.get(p)?.folded) { hidden.add(id); break }
      p = parent.get(p)
    }
  }
  return { members, parent, kids, roots, depth, hidden }
}

/** 이 상자를 접으면 몇 개가 숨나. 접힌 상자 옆의 「+N」이 이 값이다. */
export function descendantCount(shape: Shape, id: number): number {
  let n = 0
  const walk = (x: number, g: Set<number>) => {
    if (g.has(x)) return
    g.add(x)
    for (const k of shape.kids.get(x) || []) { n++; walk(k, g) }
  }
  walk(id, new Set())
  return n
}

/**
 * **띠 나누기.** 레벨이 한 띠에 안 들어가면 아래 띠로 넘긴다.
 *
 * 첫 띠는 `L` 레벨을 온전히 쓰고, 그 뒤 띠는 **머리 한 칸을 부모(echo)에게 내준다**.
 * 그래서 두 띠면 `2L-1`, 세 띠면 `3L-2` 레벨이 들어간다 —
 * 가로 종이(L=5) 기준 9레벨 · 13레벨. 시안에 적어 드린 값과 같다.
 */
export function bandOf(depth: number, L: number): { band: number; col: number } {
  if (L <= 1) return { band: depth, col: 0 }
  if (depth < L) return { band: 0, col: depth }
  const per = L - 1
  const k = depth - L
  return { band: 1 + Math.floor(k / per), col: 1 + (k % per) }
}

/** 이 깊이를 담으려면 띠가 몇 개 필요한가. */
export function bandsNeeded(maxDepth: number, L: number): number {
  return bandOf(maxDepth, L).band + 1
}

function fitStep(want: number, usable: number, count: number, size: number, gap: number): number {
  if (count <= 1) return want
  const even = (usable - size) / (count - 1)
  return Math.max(size + gap, Math.min(want, even))
}

export interface Laid {
  els: FreeEl[]
  conns: Conn[]
  dir: TreeDir
  bands: number
  /** 겹친 상자 쌍 수 — 0 이어야 한다. 검사와 화면 알림이 본다. */
  overlapping: number
}

/**
 * 트리를 이 종이에 다시 앉힌다. 접힘·띠 나누기·echo 를 한꺼번에 처리한다.
 *
 * **트리 밖의 것은 건드리지 않는다** — 같은 쪽에 메모를 놓아 둔 사람이 있다.
 */
export function layoutTree(
  elsIn: FreeEl[], connsIn: Conn[], W: number, H: number,
  want: TreeDir, known: number[] = [],
): Laid {
  // 1. 지난번 echo 를 걷어낸다. **남겨 두면 글자가 어긋난다.**
  //
  // 그런데 echo 에 딸린 선을 **그냥 지우면 안 된다.** 띠를 건너는 원래 선은 지난번에
  // 뺐으므로(아래 6번), 지우는 순간 아래 띠 첫 상자가 부모를 영영 잃는다 —
  // 두 번 앉히면 뿌리가 둘로 늘어났다(2026-09-15 실측). **원본으로 되돌려 놓는다.**
  const els = (elsIn || []).filter((e) => e && !isEcho(e))
  const back = new Map<number, number>()
  for (const e of elsIn || []) if (e && e.echoOf != null) back.set(e.id, e.echoOf)
  const seenKey = new Set<string>()
  const conns: Conn[] = []
  for (const c of connsIn || []) {
    if (!c) continue
    const from = back.get(c.from) ?? c.from
    const to = back.get(c.to) ?? c.to
    if (back.has(c.to)) continue                 // echo 로 들어가던 선은 버린다
    const key = from + '>' + to
    if (seenKey.has(key)) continue
    seenKey.add(key)
    conns.push(back.has(c.from) ? { ...c, from, to } : c)
  }

  const shape = treeShape(els, conns, known)
  const vis = shape.members.filter((id) => !shape.hidden.has(id))
  if (!vis.length) return { els: elsIn, conns: connsIn, dir: want, bands: 1, overlapping: 0 }

  const byId = new Map(els.map((e) => [e.id, e]))
  const maxDepth = Math.max(0, ...vis.map((id) => shape.depth.get(id) || 0))

  // 2. 방향과 띠 수 — **눕히기보다 접어 넣기가 먼저다.** 눕히면 읽는 방향이 바뀌지만
  //    접어 넣기는 그대로 두고 자리만 만든다. 사람이 고른 방향을 되도록 지킨다.
  const pick = (d: TreeDir) => {
    const cap = treeCapacity(d, W, H)
    const L = Math.max(1, cap.levels)
    const bands = bandsNeeded(maxDepth, L)
    return { d, L, bands, slots: cap.slots }
  }
  let sel = pick(want)
  const other = pick(want === 'LR' ? 'TD' : 'LR')
  // 띠가 너무 많아지면(4개 이상) 줄이 한두 개밖에 안 남는다. 그때만 눕혀 본다.
  if (sel.bands >= 4 && other.bands < sel.bands) sel = other
  const dir = sel.d, L = sel.L, bands = sel.bands

  // 3. 띠마다 줄을 매긴다. 띠 b(≥1)의 머리는 **부모별로 하나씩 놓는 echo** 다.
  const cell = new Map<number, { band: number; col: number; row: number }>()
  const echoPlan: { band: number; parent: number; kids: number[] }[] = []

  for (let b = 0; b < bands; b++) {
    const inBand = vis.filter((id) => bandOf(shape.depth.get(id) || 0, L).band === b)
    if (!inBand.length) continue
    // 이 띠에서 **머리가 되는 상자** — 윗대가 이 띠에 없는 것들
    const heads = inBand.filter((id) => {
      const p = shape.parent.get(id)
      return p == null || shape.hidden.has(p) ||
        bandOf(shape.depth.get(p) || 0, L).band !== b
    })
    // 띠 b≥1 은 같은 부모끼리 묶어 echo 하나를 머리로 둔다
    const groups: { parent: number | null; kids: number[] }[] = []
    if (b === 0) {
      heads.forEach((id) => groups.push({ parent: null, kids: [id] }))
    } else {
      const byParent = new Map<number, number[]>()
      const orphan: number[] = []
      heads.forEach((id) => {
        const p = shape.parent.get(id)
        if (p == null || shape.hidden.has(p)) { orphan.push(id); return }
        if (!byParent.has(p)) byParent.set(p, [])
        byParent.get(p)!.push(id)
      })
      for (const [p, ks] of byParent) groups.push({ parent: p, kids: ks })
      orphan.forEach((id) => groups.push({ parent: null, kids: [id] }))
    }

    let next = 0
    const seen = new Set<number>()
    const walk = (id: number): number => {
      if (seen.has(id)) return next
      seen.add(id)
      const ch = (shape.kids.get(id) || []).filter((k) =>
        !shape.hidden.has(k) && !seen.has(k) &&
        bandOf(shape.depth.get(k) || 0, L).band === b)
      const col = bandOf(shape.depth.get(id) || 0, L).col
      if (!ch.length) { cell.set(id, { band: b, col, row: next }); return next++ }
      let first = -1, last = -1
      for (const k of ch) { const v = walk(k); if (first < 0) first = v; last = v }
      const row = (first + last) / 2
      cell.set(id, { band: b, col, row })
      return row
    }
    for (const g of groups) {
      const rows = g.kids.map((k) => walk(k))
      if (g.parent != null) {
        echoPlan.push({ band: b, parent: g.parent, kids: g.kids })
        // echo 는 제 자식들의 **가운데** 줄에 놓는다 — 보통 부모와 같은 규칙
        cell.set(-echoPlan.length, { band: b, col: 0, row: (rows[0] + rows[rows.length - 1]) / 2 })
      }
    }
  }

  // 4. 간격 — 레벨 축은 종이 전체, 줄 축은 **띠 하나**에 맞춘다.
  const usableW = W - PAD_X * 2, usableH = H - PAD_TOP - PAD_BOTTOM
  const usableLv = dir === 'LR' ? usableW : usableH
  const usableSl = dir === 'LR' ? usableH : usableW
  const all = [...cell.values()]
  const colsUsed = Math.max(1, ...all.map((c) => c.col + 1))
  const rowsUsed = Math.max(1, ...all.map((c) => Math.ceil(c.row) + 1))
  const bandSl = usableSl / bands
  const lvSize = dir === 'LR' ? NODE_W : NODE_H
  const slSize = dir === 'LR' ? NODE_H : NODE_W
  const lvWant = dir === 'LR' ? LR_COL : TD_ROW
  const slWant = dir === 'LR' ? LR_ROW : TD_COL
  const lvStep = fitStep(lvWant, usableLv, colsUsed, lvSize, dir === 'LR' ? 6 : 10)
  const slStep = fitStep(slWant, bandSl, rowsUsed, slSize, 6)

  const place = (c: { band: number; col: number; row: number }, w: number, h: number) => {
    const lv = (dir === 'LR' ? PAD_X : PAD_TOP) + c.col * lvStep
    const sl = (dir === 'LR' ? PAD_TOP : PAD_X) + c.band * bandSl + c.row * slStep
    const x = dir === 'LR' ? lv : sl
    const y = dir === 'LR' ? sl : lv
    return { x: Math.round(Math.max(0, Math.min(W - w, x))),
             y: Math.round(Math.max(0, Math.min(H - h, y))) }
  }

  // 5. 상자를 옮기고, 안 보이는 것에 표시를 단다
  const out: FreeEl[] = els.map((e) => {
    if (!e) return e
    const c = cell.get(e.id)
    const hid = shape.hidden.has(e.id)
    if (!c) return e.hidden === hid || !shape.members.includes(e.id) ? e : { ...e, hidden: hid }
    const p = place(c, e.w, e.h)
    if (e.x === p.x && e.y === p.y && !!e.hidden === hid) return e
    return { ...e, x: p.x, y: p.y, hidden: hid }
  })
  // 접힌 윗대 때문에 숨은 것은 위에서 표시했고, 트리 밖 상자는 hidden 을 건드리지 않는다.
  for (let i = 0; i < out.length; i++) {
    const e = out[i]
    if (e && e.hidden && !shape.hidden.has(e.id)) out[i] = { ...e, hidden: undefined }
  }

  // 6. echo 를 새로 만든다.
  //
  // **띠를 건너는 원래 선은 뺀다.** 안 빼면 echo 로 짧게 이어 놓고도 위 띠에서
  // 아래 띠까지 긴 선이 그대로 남는다 — 화면에서 보니 종이를 세로로 가로지르는
  // 줄이 하나 생겼다(2026-09-15 실측). ㄴ을 고른 이유가 그 긴 선을 없애는 것이었다.
  const crosses = new Set<string>()
  for (const pl of echoPlan) for (const k of pl.kids) crosses.add(pl.parent + '>' + k)
  let nextId = Math.max(0, ...(elsIn || []).map((e) => (e ? e.id : 0))) + 1
  const outConns: Conn[] = conns.filter((c) => !crosses.has(c.from + '>' + c.to))
  echoPlan.forEach((pl, i) => {
    const src = byId.get(pl.parent)
    if (!src) return
    const c = cell.get(-(i + 1))
    if (!c) return
    const p = place(c, src.w, src.h)
    const id = nextId++
    out.push({
      ...src, id, x: p.x, y: p.y, echoOf: pl.parent,
      color: ECHO_COLOR, tcolor: ECHO_TCOLOR, folded: undefined, hidden: undefined,
    })
    for (const k of pl.kids) {
      outConns.push({ from: id, to: k, kind: 'ortho', arrow: 'end', color: '#b9c2d4', width: 1.5 })
    }
  })

  // 7. 겹침을 센다 — **0 이어야 한다.** ④에서 배운 것: 겹치면 잃은 것과 같다.
  const shown = out.filter((e) => e && !e.hidden)
  let overlapping = 0
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i], b = shown[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlapping++
    }
  }

  return { els: out, conns: outConns, dir, bands, overlapping }
}

/** 새 상자 하나. 글자만 다르고 나머지는 트리 상자와 같다. */
export function newNode(id: number, text: string): FreeEl {
  return { id, type: 'box', x: PAD_X, y: PAD_TOP, w: NODE_W, h: NODE_H,
           text, color: '#eaf0ff', fs: 13, tcolor: '#1c2433' }
}

export const TREE_CONN: Omit<Conn, 'from' | 'to'> =
  { kind: 'ortho', arrow: 'end', color: '#b9c2d4', width: 1.5 }

/** 쪽에 적어 둔 명단. 옛 문서는 `treeRoot` 하나만 들고 있다. */
export function knownOf(page: { treeRoot?: number; treeRoots?: number[] }): number[] {
  return page.treeRoots || (page.treeRoot != null ? [page.treeRoot] : [])
}

/**
 * 이 쪽이 트리인가. 화면이 「트리」 칸을 띄울지, fitPaper 가 트리 길로 갈지 정할 때 본다.
 *
 * **「선으로 이어진 상자가 있나」로 판정하면 안 된다.** 마인드맵도 그렇다 —
 * 2026-09-15 에 실제로 그렇게 짰다가 마인드맵 쪽이 트리 길로 새어
 * 「선 없는 메모를 안 자른다」는 검사가 깨졌다. 표시는 쪽에 적힌 명단이 한다.
 */
export function isTreePage(page: { els?: FreeEl[]; treeRoot?: number; treeRoots?: number[]; mindmapCenter?: number }): boolean {
  if (page.mindmapCenter != null) return false
  const known = knownOf(page)
  if (!known.length) return false
  const live = new Set((page.els || []).filter(Boolean).map((e) => e.id))
  return known.some((id) => live.has(id))
}
