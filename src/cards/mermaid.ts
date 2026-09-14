// 머메이드를 **읽어서 트리로 펼친다** (사용자 결정 가-ㄷ · 2026-09-14).
//
// ── 왜 렌더가 아니라 파서인가 ──────────────────────
// 머메이드 라이브러리를 넣어 그림을 그리면 결과가 **SVG 한 덩어리**가 된다.
// 그러면 상자 하나를 잡아 옮길 수 없다 — 지금 「프로세스(플로우)」 카드가 딱 그 상태이고,
// 마인드맵을 카드에서 요소로 바꾼 이유가 바로 그것이었다
// (`mindmapEls.ts`: *임원진이 「위치 이동 및 사이즈 조정 안됨」이라고 한 것이 이것이다*).
//
// 그래서 머메이드는 **입력 형식**으로만 쓴다. 글로 뼈대를 빠르게 잡고,
// 펼친 뒤에는 마인드맵과 똑같이 상자 하나씩 잡고 옮긴다.
//
// ── 읽는 문법은 이만큼이다 ────────────────────────
//   graph LR | TD        방향. 없으면 LR
//   A[기획]              네모
//   A(기획)              둥근 네모
//   A{판단}              마름모
//   A --> B              이음
//   A -->|채택| B        이음 + 선 이름
//   %% 메모              무시
//
// ── 못 읽은 줄을 버리지 않는다 ────────────────────
// 조용히 무시하면 「내가 쓴 게 왜 안 나오지」가 되고, 사람은 제 오타를 못 찾는다.
// 그래서 `errors` 에 **줄 번호와 원문 그대로** 담아 돌려주고, 화면이 그걸 보여 준다.

/** 상자 생김새. 머메이드의 괄호 모양이 그대로 뜻이 된다. */
export type NodeShape = 'box' | 'round' | 'dec'

export interface MmNode { id: string; label: string; shape: NodeShape }
export interface MmEdge { from: string; to: string; label: string }
export interface MmError { line: number; text: string }
export interface MmGraph {
  dir: 'LR' | 'TD'
  /** 처음 만난 순서. 배치가 이 순서를 따르므로 **줄 순서가 곧 그림 순서**다. */
  order: string[]
  nodes: Record<string, MmNode>
  edges: MmEdge[]
  errors: MmError[]
}

const RE_GRAPH = /^graph\s+(LR|RL|TD|TB|BT)\s*$/i
/** `A[글]` · `A(글)` · `A{글}` — 라벨은 없어도 된다. */
const LABEL = '(\\[[^\\]]*\\]|\\([^)]*\\)|\\{[^}]*\\})'
const RE_EDGE = new RegExp(
  '^([A-Za-z0-9_가-힣]+)\\s*' + LABEL + '?\\s*-->(?:\\|([^|]*)\\|)?\\s*([A-Za-z0-9_가-힣]+)\\s*' + LABEL + '?\\s*$')
const RE_NODE = new RegExp('^([A-Za-z0-9_가-힣]+)\\s*' + LABEL + '\\s*$')

function shapeOf(lab: string): NodeShape {
  return lab[0] === '{' ? 'dec' : lab[0] === '(' ? 'round' : 'box'
}

export function parseMermaid(text: string): MmGraph {
  const nodes: Record<string, MmNode> = {}
  const order: string[] = []
  const edges: MmEdge[] = []
  const errors: MmError[] = []
  let dir: 'LR' | 'TD' | null = null

  const add = (id: string, lab?: string) => {
    if (!nodes[id]) { nodes[id] = { id, label: id, shape: 'box' }; order.push(id) }
    if (lab) {
      nodes[id].label = lab.slice(1, -1).trim() || id
      nodes[id].shape = shapeOf(lab)
    }
  }

  ;(text || '').split('\n').forEach((raw, i) => {
    const s = raw.trim()
    if (!s || s.startsWith('%%')) return
    const g = RE_GRAPH.exec(s)
    if (g) {
      const d = g[1].toUpperCase()
      // RL·BT 는 방향을 뒤집는 것인데, 트리에서는 「뿌리가 어디냐」가 바뀔 뿐이라
      // 지금은 가로/세로 둘로만 받는다. 못 읽었다고 하지 않고 **가까운 쪽으로** 읽는다.
      dir = (d === 'TD' || d === 'TB' || d === 'BT') ? 'TD' : 'LR'
      return
    }
    const e = RE_EDGE.exec(s)
    if (e) {
      add(e[1], e[2]); add(e[4], e[5])
      edges.push({ from: e[1], to: e[4], label: (e[3] || '').trim() })
      return
    }
    const n = RE_NODE.exec(s)
    if (n) { add(n[1], n[2]); return }
    errors.push({ line: i + 1, text: raw })
  })

  return { dir: dir || 'LR', order, nodes, edges, errors }
}

/**
 * 그림을 **다시 머메이드 글로** 뽑는다.
 *
 * 손으로 고친 트리를 회의록·코드 주석에 그대로 붙여 넣을 수 있게 한다.
 * 만드는 값에 비해 쓸모가 커서 1차에 같이 넣는다 — 그리고 **파서가 제대로 읽는지
 * 스스로 확인하는 수단**이기도 하다(글 → 그림 → 글이 같아야 한다).
 */
export function toMermaid(g: Pick<MmGraph, 'dir' | 'order' | 'nodes' | 'edges'>): string {
  const wrap = (n: MmNode) =>
    n.shape === 'dec' ? `{${n.label}}` : n.shape === 'round' ? `(${n.label})` : `[${n.label}]`
  const lines = [`graph ${g.dir}`]
  const drawn = new Set<string>()
  for (const e of g.edges) {
    const a = g.nodes[e.from], b = g.nodes[e.to]
    if (!a || !b) continue
    const A = drawn.has(a.id) ? a.id : a.id + wrap(a)
    const B = drawn.has(b.id) ? b.id : b.id + wrap(b)
    drawn.add(a.id); drawn.add(b.id)
    lines.push(`  ${A} -->${e.label ? `|${e.label}|` : ''} ${B}`)
  }
  // 아무 데도 안 이어진 외톨이도 남긴다 — 글로 뽑았다가 다시 읽으면 사라지면 안 된다.
  for (const id of g.order) {
    if (drawn.has(id)) continue
    lines.push(`  ${id}${wrap(g.nodes[id])}`)
  }
  return lines.join('\n')
}
