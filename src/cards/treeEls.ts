// 트리 — **머메이드로 뼈대를 잡고 요소로 펼친다** (사용자 결정 가-ㄷ · 나-둘 다 · 2026-09-14).
//
// ── 마인드맵과 무엇이 다른가 ──────────────────────
// 마인드맵은 **방사형**이고 깊이가 한 단계다. 「무엇이 무엇에서 나왔나」를 여러 단계로
// 그릴 수가 없다. PM 의 일(기획 → 설계 → 개발 → 검수, 그 아래 산출물)은 **순서와 깊이**가
// 있어서 방사형에 안 들어간다. 실제로 손으로 가지를 끌어다 트리 모양을 만들어 쓰고 계셨다.
//
// **재료는 마인드맵 것을 그대로 쓴다** — 요소로 펼치기 · ortho 연결선 · 방향 바꿀 때 다시
// 앉히기. 바뀌는 것은 **배치 규칙**뿐이다: 타원 대신 레벨별 열/행.
//
// ── 재 보고 정한 값들 ────────────────────────────
// 가로 1040×720 → 왼→오른 5레벨 × 10줄 · 위→아래 6레벨 × 6칸
// 세로  432×576 → 왼→오른 2레벨 × 7줄 · 위→아래 4레벨 × **2칸**
// **세로는 사실상 못 쓴다.** 그래서 부르는 쪽이 세로에서 트리를 넣을 때 물어야 한다.
//
// ── 하지 않는 것 ─────────────────────────────────
// **전체 자동 정렬을 매번 하지 않는다.** 노드를 더할 때마다 전부 줄 세우면 사람이 옮겨 둔
// 자리가 사라진다 — 방향 전환에서 겪은 것과 같은 종류다(④). 처음 펼칠 때 한 번,
// 그리고 방향이 바뀔 때 한 번만 앉힌다.

import type { FreeEl, Conn, Page } from '../state/store'
import type { MmGraph, NodeShape } from './mermaid'

export interface TreeParts {
  els: FreeEl[]; conns: Conn[]; rootId: number
  /** **실제로 앉힌 방향.** 원하신 방향이 종이에 안 들어가면 눕힌다(`bestDir`).
   *  부르는 쪽이 이걸 쪽에 적어 둬야 나중에 다시 앉힐 때 어긋나지 않는다. */
  dir: TreeDir
}

/** 상자 한 칸. 마인드맵 가지와 같은 크기라 눈에 익다. */
export const NODE_W = 132, NODE_H = 38
/** 왼→오른: 레벨 간격 · 줄 간격.  위→아래: 형제 간격 · 레벨 간격. */
export const LR_COL = 192, LR_ROW = 56
export const TD_COL = 156, TD_ROW = 88
/** 종이 안 여백. 위쪽은 제목 자리(94), 아래는 꼬리말 자리(50)를 피한다. */
export const PAD_X = 24, PAD_TOP = 94, PAD_BOTTOM = 50

export type TreeDir = 'LR' | 'TD'

/**
 * **간격을 이 종이에 맞춘다.**
 *
 * 상수 간격(LR_COL 192)을 그대로 쓰면 세로 종이(432)에서 3레벨째가 종이 밖으로 나가고,
 * 가장자리로 잘리면서 **앞 레벨과 포개진다** — 방향 전환에서 겪은 것과 같은 증상이다.
 * 그래서 「레벨이 몇이고 쓸 수 있는 폭이 얼마인가」에서 간격을 되계산한다.
 *
 * **줄이되 상자보다 좁게는 안 줄인다.** 그 아래로 가면 상자끼리 겹치는데,
 * 그건 안 보이는 것과 같다. 거기까지 가면 애초에 이 종이에 안 들어가는 그림이고,
 * 고르는 화면이 「넘칩니다」로 미리 말한다.
 */
function fitStep(want: number, usable: number, count: number, size: number, gap: number): number {
  if (count <= 1) return want
  const even = (usable - size) / (count - 1)
  return Math.max(size + gap, Math.min(want, even))
}

/** 이 그림을 이 종이에 앉힐 때 쓸 레벨 간격·줄 간격. */
export function treeSteps(dir: TreeDir, W: number, H: number, levels: number, slots: number):
  { col: number; row: number } {
  const usableW = W - PAD_X * 2, usableH = H - PAD_TOP - PAD_BOTTOM
  if (dir === 'LR') {
    return { col: fitStep(LR_COL, usableW, levels, NODE_W, 6),
             row: fitStep(LR_ROW, usableH, slots, NODE_H, 6) }
  }
  return { col: fitStep(TD_COL, usableW, slots, NODE_W, 6),
           row: fitStep(TD_ROW, usableH, levels, NODE_H, 10) }
}

/**
 * 이 방향으로 **정말 들어가는가.** 간격을 최소까지 줄여도 안 되면 false.
 *
 * 줄여도 안 되는데 억지로 앉히면 가장자리에서 잘리며 **앞 레벨과 통째로 포개진다** —
 * 세로 종이(432)에 4레벨을 왼→오른으로 놓으면 실제로 그렇게 된다(측정: 38px, 완전 포갬).
 */
export function treeFits(dir: TreeDir, W: number, H: number, levels: number, slots: number): boolean {
  const usableW = W - PAD_X * 2, usableH = H - PAD_TOP - PAD_BOTTOM
  const needCol = (n: number) => (n - 1) * (NODE_W + 6) + NODE_W
  const needRow = (n: number, gap: number) => (n - 1) * (NODE_H + gap) + NODE_H
  return dir === 'LR'
    ? needCol(levels) <= usableW && needRow(slots, 6) <= usableH
    : needCol(slots) <= usableW && needRow(levels, 10) <= usableH
}

/**
 * **안 들어가면 눕힌다.**
 *
 * 세로 종이에서 왼→오른 트리는 2레벨이면 끝이다(측정). 그대로 앉히면 3레벨째부터
 * 포개져서 **그림이 없어진 것과 같다.** 위→아래로 눕히면 같은 그림이 그대로 들어간다 —
 * 바뀌는 것은 **읽는 방향뿐이고 관계는 하나도 안 잃는다.**
 *
 * 둘 다 안 들어가면 원하신 방향을 그대로 둔다. 그건 종이를 바꾸거나 줄여야 하는 그림이고,
 * 고르는 화면이 「넘칩니다」로 미리 말한다. **말없이 망가뜨리지는 않는다.**
 */
export function bestDir(want: TreeDir, W: number, H: number, levels: number, slots: number): TreeDir {
  if (treeFits(want, W, H, levels, slots)) return want
  const other: TreeDir = want === 'LR' ? 'TD' : 'LR'
  return treeFits(other, W, H, levels, slots) ? other : want
}

/** 이 종이에 들어가는 레벨 수와 줄(칸) 수. 화면이 「몇 레벨까지」를 말해 줄 때 쓴다. */
export function treeCapacity(dir: TreeDir, W: number, H: number): { levels: number; slots: number } {
  const usableW = W - PAD_X * 2, usableH = H - PAD_TOP - PAD_BOTTOM
  if (dir === 'LR') {
    return { levels: Math.max(1, Math.floor((usableW + (LR_COL - NODE_W)) / LR_COL)),
             slots: Math.max(1, Math.floor(usableH / LR_ROW)) }
  }
  return { levels: Math.max(1, Math.floor(usableH / TD_ROW)),
           slots: Math.max(1, Math.floor((usableW + (TD_COL - NODE_W)) / TD_COL)) }
}

/** 부모·자식 관계를 짓는다. **먼저 만난 쪽이 부모**다 —
 *  머메이드는 그물도 그릴 수 있지만 트리는 부모가 하나여야 한다.
 *  되돌아오는 선(C → A 같은 것)은 부모로 삼지 않고 **선만** 남긴다. */
function relate(g: Pick<MmGraph, 'order' | 'edges'>) {
  const parent: Record<string, string> = {}
  const kids: Record<string, string[]> = {}
  g.order.forEach((id) => { kids[id] = [] })
  for (const e of g.edges) {
    if (e.from === e.to) continue
    if (parent[e.to] !== undefined) continue        // 이미 부모가 있다 — 선만 남긴다
    if (isAncestor(parent, e.from, e.to)) continue  // 고리가 된다 — 선만 남긴다
    parent[e.to] = e.from
    ;(kids[e.from] || (kids[e.from] = [])).push(e.to)
  }
  const roots = g.order.filter((id) => parent[id] === undefined)
  return { parent, kids, roots }
}
/** `maybe` 가 `of` 의 윗대인가. 고리(A→B→A)를 부모 관계로 삼지 않으려고 본다. */
function isAncestor(parent: Record<string, string>, of: string, maybe: string): boolean {
  let p: string | undefined = parent[of]
  let guard = 0
  while (p && guard++ < 200) { if (p === maybe) return true; p = parent[p] }
  return false
}

/**
 * **자리만** 계산한다(깊이 · 줄). 종이 크기를 모른다 —
 * 그래야 「몇 줄이 나오나」를 미리 세어 쪽을 나눌 수 있다.
 */
export function treeSlots(g: Pick<MmGraph, 'order' | 'edges'>):
  { depth: Record<string, number>; slot: Record<string, number>; rows: number; levels: number } {
  const { kids, roots } = relate(g)
  const depth: Record<string, number> = {}
  const slot: Record<string, number> = {}
  let next = 0
  const walk = (id: string, d: number, seen: Set<string>): number => {
    if (seen.has(id)) return next                     // 고리 방어
    seen.add(id)
    depth[id] = d
    const ch = (kids[id] || []).filter((k) => !seen.has(k))
    if (!ch.length) { slot[id] = next++; return slot[id] }
    let first = -1, last = -1
    for (const k of ch) { const v = walk(k, d + 1, seen); if (first < 0) first = v; last = v }
    slot[id] = (first + last) / 2                     // 부모는 자식들의 **가운데**
    return slot[id]
  }
  const seen = new Set<string>()
  roots.forEach((r) => walk(r, 0, seen))
  // 어디에도 안 걸린 외톨이(고리 안에만 있던 것)도 자리를 준다.
  for (const id of g.order) if (depth[id] === undefined) { depth[id] = 0; slot[id] = next++ }
  const levels = Math.max(0, ...Object.values(depth)) + 1
  return { depth, slot, rows: next, levels }
}

const FILL: Record<NodeShape, { type: string; color: string; tcolor: string }> = {
  box:   { type: 'rect',  color: '#eaf0ff', tcolor: '#1c2433' },
  round: { type: 'round', color: '#eaf0ff', tcolor: '#1c2433' },
  // 판단은 **색으로도 다르다** — 갈림길인지 아닌지가 한눈에 보여야 한다.
  dec:   { type: 'diamond', color: '#fff3e2', tcolor: '#7a4412' },
}

/**
 * 머메이드 그래프 → 상자와 선.
 *
 * `dir` 을 안 주면 글에 적힌 방향(`graph LR`)을 따른다. 사람이 화면에서 고르면 그게 이긴다.
 */
export function treeParts(g: MmGraph, W: number, H: number, id: () => number,
                          dir?: TreeDir): TreeParts {
  const { depth, slot, rows, levels } = treeSlots(g)
  const d: TreeDir = bestDir(dir || g.dir, W, H, levels, rows)
  const step = treeSteps(d, W, H, levels, rows)
  const mine: Record<string, number> = {}
  const els: FreeEl[] = []

  for (const key of g.order) {
    const n = g.nodes[key]
    const f = FILL[n.shape] || FILL.box
    const x = d === 'LR' ? PAD_X + depth[key] * step.col : PAD_X + slot[key] * step.col
    const y = d === 'LR' ? PAD_TOP + slot[key] * step.row : PAD_TOP + depth[key] * step.row
    const eid = id()
    mine[key] = eid
    els.push({
      id: eid, type: f.type, text: n.label, color: f.color, tcolor: f.tcolor, fs: 13,
      w: NODE_W, h: NODE_H,
      x: Math.round(Math.max(0, Math.min(W - NODE_W, x))),
      y: Math.round(Math.max(0, Math.min(H - NODE_H, y))),
    })
  }

  // **꺾은선(ortho)이다.** 트리 선은 직선으로 그으면 대각선이 엇갈려 읽기 어렵다.
  // 화살촉을 붙인다 — 마인드맵과 달리 트리는 **방향이 있는 관계**다.
  const conns: Conn[] = g.edges
    .filter((e) => mine[e.from] != null && mine[e.to] != null && e.from !== e.to)
    .map((e) => ({ from: mine[e.from], to: mine[e.to], kind: 'ortho' as const,
                   arrow: 'end' as const, color: '#b9c2d4', width: 1.5 }))

  const rootKey = g.order.find((k) => depth[k] === 0) || g.order[0]
  return { els, conns, rootId: mine[rootKey] ?? (els[0]?.id ?? 0), dir: d }
}

/**
 * **방향을 바꿀 때 트리를 통째로 다시 앉힌다** — 마인드맵의 `relayoutMindmap` 과 같은 이유.
 *
 * 자르면 오른쪽 절반이 한 줄에 포개진다. 트리는 **레벨과 줄이 곧 뜻**이라 더 심하다.
 * 지금 좌표에서 레벨·줄을 되읽어(=글자가 아니라 **자리**에서) 새 간격으로 다시 앉힌다.
 * 트리가 아니면 `null` — 부르는 쪽이 「그럼 평소대로」로 읽는다.
 */
export function relayoutTree(
  page: { els?: FreeEl[]; conns?: Conn[]; treeRoot?: number; treeDir?: TreeDir },
  W: number, H: number,
): { els: FreeEl[]; dir: TreeDir } | null {
  const els = page.els
  if (page.treeRoot == null || !Array.isArray(els) || !els.length) return null
  if (!els.some((e) => e && e.id === page.treeRoot)) return null
  const d: TreeDir = page.treeDir || 'LR'

  const inTree = new Set<number>()
  for (const c of page.conns || []) { if (!c) continue; inTree.add(c.from); inTree.add(c.to) }
  inTree.add(page.treeRoot)

  // **지금 좌표에서 레벨·줄을 되읽는다.** 글자가 아니라 자리에서 읽으므로, 사람이
  // 조금 옮겨 놓았어도 가장 가까운 칸으로 붙는다. 되읽을 때는 **원래 간격**을 쓴다 —
  // 앉힐 때는 새 종이에 맞춘 간격을 쓴다. 그 둘을 섞으면 레벨이 밀린다.
  const wasCol = d === 'LR' ? LR_COL : TD_COL
  const wasRow = d === 'LR' ? LR_ROW : TD_ROW
  const cell = els.filter((e) => e && inTree.has(e.id)).map((e) => ({
    id: e.id,
    lv: Math.max(0, Math.round((d === 'LR' ? e.x - PAD_X : e.y - PAD_TOP) / (d === 'LR' ? wasCol : wasRow))),
    sl: Math.max(0, Math.round((d === 'LR' ? e.y - PAD_TOP : e.x - PAD_X) / (d === 'LR' ? wasRow : wasCol))),
  }))
  const levels = Math.max(1, ...cell.map((c) => c.lv + 1))
  const slots = Math.max(1, ...cell.map((c) => c.sl + 1))
  // **안 들어가면 눕힌다.** 자르면 레벨이 통째로 포개진다.
  const nd = bestDir(d, W, H, levels, slots)
  const step = treeSteps(nd, W, H, levels, slots)
  const at = new Map(cell.map((c) => [c.id, c]))

  const out = els.map((e) => {
    if (!e || !inTree.has(e.id)) return e            // 트리 밖의 것은 안 건드린다
    const c = at.get(e.id); if (!c) return e
    const x = nd === 'LR' ? PAD_X + c.lv * step.col : PAD_X + c.sl * step.col
    const y = nd === 'LR' ? PAD_TOP + c.sl * step.row : PAD_TOP + c.lv * step.row
    const nx = Math.round(Math.max(0, Math.min(W - e.w, x)))
    const ny = Math.round(Math.max(0, Math.min(H - e.h, y)))
    return (e.x === nx && e.y === ny) ? e : { ...e, x: nx, y: ny }
  })
  return { els: out, dir: nd }
}

/** 이 쪽이 트리에서 펼쳐진 것인가. 화면이 「＋ 자식」을 붙일지 정할 때 본다. */
export function isTreePage(page: Pick<Page, 'els'> & { treeRoot?: number }): boolean {
  return page.treeRoot != null && !!(page.els || []).some((e) => e && e.id === page.treeRoot)
}
