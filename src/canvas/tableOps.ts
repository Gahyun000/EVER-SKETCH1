import type { FreeEl } from '../state/store'

// 표 편집 순수 함수 — FreeEl(table)을 받아 부분 패치(Partial<FreeEl>)를 돌려준다.
export type Merge = { r: number; c: number; rs: number; cs: number }
type Align = 'left' | 'center' | 'right'
type CAlign = Record<string, Align>
// 셀 단위 맵은 모두 "r_c" 키를 쓴다. calign(정렬)·cbg(배경색)가 같은 규칙이다.
type CellMap<T> = Record<string, T>

const key = (r: number, c: number) => r + '_' + c

function grid(el: FreeEl): { R: number; C: number; cells: string[][] } {
  const R = el.rows || 2, C = el.cols || 2
  const cells: string[][] = []
  for (let r = 0; r < R; r++) {
    const row: string[] = []
    for (let c = 0; c < C; c++) row.push((el.cells && el.cells[r] && el.cells[r][c]) || '')
    cells.push(row)
  }
  return { R, C, cells }
}

// (r,c)를 덮는 병합(앵커 포함) 찾기
export function mergeCovering(merges: Merge[] | undefined, r: number, c: number): Merge | undefined {
  if (!merges) return undefined
  return merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs)
}

// 덮이지만 앵커가 아닌 셀들(렌더에서 숨김)
export function coveredSet(merges: Merge[] | undefined): Set<string> {
  const s = new Set<string>()
  if (!merges) return s
  for (const m of merges) for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (!(r === m.r && c === m.c)) s.add(key(r, c))
  return s
}

// 행·열이 늘거나 줄면 셀 좌표가 통째로 밀린다. 좌표를 키로 쓰는 맵은 전부 다시 매핑해야 한다.
//
// **이 함수를 호출하지 않는 셀 맵을 새로 추가하면, 행을 하나 추가하는 순간
// 그 맵의 값이 한 칸씩 어긋난다.** 로드맵 표에서는 진행 셀 색이 엉뚱한 달로 밀리는 형태로 나타난다.
// 그래서 calign 전용이던 것을 제네릭으로 바꾸고, 셀 맵은 반드시 remapCells 를 거치게 한다.
function remapCells<T>(map: CellMap<T> | undefined, fn: (r: number, c: number) => [number, number] | null): CellMap<T> {
  const out: CellMap<T> = {}
  if (map) for (const k of Object.keys(map)) {
    const [r, c] = k.split('_').map(Number)
    const nk = fn(r, c)
    if (nk) out[key(nk[0], nk[1])] = map[k]
  }
  return out
}

export function addRow(el: FreeEl, at: number): Partial<FreeEl> {
  const { R, C, cells } = grid(el)
  const nc = cells.map((row) => row.slice())
  nc.splice(at, 0, Array.from({ length: C }, () => ''))
  const merges = (el.merges || []).map((m) => ({ ...m }))
  for (const m of merges) { if (at <= m.r) m.r++; else if (at <= m.r + m.rs - 1) m.rs++ }
  const move = (r: number, c: number): [number, number] => [r >= at ? r + 1 : r, c]
  const calign = remapCells(el.calign, move)
  const cbg = remapCells(el.cbg, move)
  return { rows: R + 1, cells: nc, merges, calign, cbg }
}

export function delRow(el: FreeEl, at: number): Partial<FreeEl> {
  const { R, cells } = grid(el)
  if (R <= 1) return {}
  const nc = cells.map((row) => row.slice()); nc.splice(at, 1)
  const merges: Merge[] = []
  for (const m0 of (el.merges || [])) {
    const m = { ...m0 }
    if (at < m.r) m.r--
    else if (at <= m.r + m.rs - 1) m.rs--
    if (m.rs >= 1 && m.cs >= 1 && !(m.rs === 1 && m.cs === 1)) merges.push(m)
  }
  const move = (r: number, c: number): [number, number] | null => (r === at ? null : [r > at ? r - 1 : r, c])
  const calign = remapCells(el.calign, move)
  const cbg = remapCells(el.cbg, move)
  return { rows: R - 1, cells: nc, merges, calign, cbg }
}

export function addCol(el: FreeEl, at: number): Partial<FreeEl> {
  const { C, cells } = grid(el)
  const nc = cells.map((row) => { const rr = row.slice(); rr.splice(at, 0, ''); return rr })
  const merges = (el.merges || []).map((m) => ({ ...m }))
  for (const m of merges) { if (at <= m.c) m.c++; else if (at <= m.c + m.cs - 1) m.cs++ }
  const move = (r: number, c: number): [number, number] => [r, c >= at ? c + 1 : c]
  const calign = remapCells(el.calign, move)
  const cbg = remapCells(el.cbg, move)
  return { cols: C + 1, cells: nc, merges, calign, cbg }
}

export function delCol(el: FreeEl, at: number): Partial<FreeEl> {
  const { C, cells } = grid(el)
  if (C <= 1) return {}
  const nc = cells.map((row) => { const rr = row.slice(); rr.splice(at, 1); return rr })
  const merges: Merge[] = []
  for (const m0 of (el.merges || [])) {
    const m = { ...m0 }
    if (at < m.c) m.c--
    else if (at <= m.c + m.cs - 1) m.cs--
    if (m.rs >= 1 && m.cs >= 1 && !(m.rs === 1 && m.cs === 1)) merges.push(m)
  }
  const move = (r: number, c: number): [number, number] | null => (c === at ? null : [r, c > at ? c - 1 : c])
  const calign = remapCells(el.calign, move)
  const cbg = remapCells(el.cbg, move)
  return { cols: C - 1, cells: nc, merges, calign, cbg }
}

export function mergeRange(el: FreeEl, r0: number, c0: number, r1: number, c1: number): Partial<FreeEl> {
  const R0 = Math.min(r0, r1), C0 = Math.min(c0, c1), R1 = Math.max(r0, r1), C1 = Math.max(c0, c1)
  if (R0 === R1 && C0 === C1) return {}
  const merges = (el.merges || []).filter((m) => !(m.r < R1 + 1 && m.r + m.rs > R0 && m.c < C1 + 1 && m.c + m.cs > C0))
  merges.push({ r: R0, c: C0, rs: R1 - R0 + 1, cs: C1 - C0 + 1 })
  return { merges }
}

export function unmergeAt(el: FreeEl, r: number, c: number): Partial<FreeEl> {
  const m = mergeCovering(el.merges, r, c)
  if (!m) return {}
  return { merges: (el.merges || []).filter((x) => x !== m) }
}

export function setAlignRange(el: FreeEl, r0: number, c0: number, r1: number, c1: number, align: Align): Partial<FreeEl> {
  const R0 = Math.min(r0, r1), C0 = Math.min(c0, c1), R1 = Math.max(r0, r1), C1 = Math.max(c0, c1)
  const calign: CAlign = { ...(el.calign || {}) }
  for (let r = R0; r <= R1; r++) for (let c = C0; c <= C1; c++) calign[key(r, c)] = align
  return { calign }
}

// 로드맵 진행 셀 색칠에서 허용하는 네 가지. 임의 색을 막아야 회차 취합에서 색의 의미가 유지된다.
// (표준템플릿_정본_사양_v1.0.md §3.3)
export const CBG_PALETTE = {
  done: '#2462EB',   // 완료 구간
  plan: '#EAF1FE',   // 계획 구간
  risk: '#D98A2A',   // 지연·리스크
  hold: '#EEF0F4',   // 보류
} as const
export type CbgKind = keyof typeof CBG_PALETTE
export const CBG_VALUES: string[] = Object.values(CBG_PALETTE)

export function setCellBgRange(el: FreeEl, r0: number, c0: number, r1: number, c1: number,
                               color: string | null): Partial<FreeEl> {
  const R0 = Math.min(r0, r1), C0 = Math.min(c0, c1), R1 = Math.max(r0, r1), C1 = Math.max(c0, c1)
  const cbg: CellMap<string> = { ...(el.cbg || {}) }
  for (let r = R0; r <= R1; r++) for (let c = C0; c <= C1; c++) {
    // null 이면 지운다 — 빈 문자열을 남기면 "칠했는데 투명"이라는 애매한 상태가 된다.
    if (color) cbg[key(r, c)] = color
    else delete cbg[key(r, c)]
  }
  return { cbg }
}

export function cellBg(el: FreeEl, r: number, c: number): string | undefined {
  return el.cbg ? el.cbg[key(r, c)] : undefined
}
