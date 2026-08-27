import type { FreeEl } from '../state/store'

// 표 편집 순수 함수 — FreeEl(table)을 받아 부분 패치(Partial<FreeEl>)를 돌려준다.
export type Merge = { r: number; c: number; rs: number; cs: number }
type Align = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'
type CAlign = Record<string, Align>
type CVAlign = Record<string, VAlign>
type CFs = Record<string, number>

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

// 셀 좌표를 키로 쓰는 맵(가로정렬·세로정렬·글자크기)을 행/열 삽입·삭제에 맞춰 옮긴다.
function remapCellMap<T>(map: Record<string, T> | undefined, fn: (r: number, c: number) => [number, number] | null): Record<string, T> {
  const out: Record<string, T> = {}
  if (map) for (const k of Object.keys(map)) {
    const [r, c] = k.split('_').map(Number)
    const nk = fn(r, c)
    if (nk) out[key(nk[0], nk[1])] = map[k]
  }
  return out
}

// 셀 서식 맵은 세 개가 항상 함께 움직여야 한다. 하나라도 빠뜨리면 행을 지운 뒤
// 정렬만 따라오고 글자 크기는 엉뚱한 칸에 남는 식으로 표가 어긋난다.
function remapCellStyles(el: FreeEl, fn: (r: number, c: number) => [number, number] | null): Partial<FreeEl> {
  return {
    calign: remapCellMap<Align>(el.calign, fn),
    cvalign: remapCellMap<VAlign>(el.cvalign, fn),
    cfs: remapCellMap<number>(el.cfs, fn),
  }
}

export function addRow(el: FreeEl, at: number): Partial<FreeEl> {
  const { R, C, cells } = grid(el)
  const nc = cells.map((row) => row.slice())
  nc.splice(at, 0, Array.from({ length: C }, () => ''))
  const merges = (el.merges || []).map((m) => ({ ...m }))
  for (const m of merges) { if (at <= m.r) m.r++; else if (at <= m.r + m.rs - 1) m.rs++ }
  const st = remapCellStyles(el, (r, c) => [r >= at ? r + 1 : r, c])
  return { rows: R + 1, cells: nc, merges, ...st }
}

export function delRow(el: FreeEl, at0: number): Partial<FreeEl> {
  const { R, cells } = grid(el)
  if (R <= 1) return {}
  // 범위 밖이면 splice 가 아무것도 못 지우는데 rows 만 줄어 cells 와 어긋난다 →
  // 남은 행이 화면·내보내기에서 조용히 사라지고, 다음 '행 추가' 때 영구 삭제된다.
  const at = Math.max(0, Math.min(R - 1, at0))
  const nc = cells.map((row) => row.slice()); nc.splice(at, 1)
  const merges: Merge[] = []
  for (const m0 of (el.merges || [])) {
    const m = { ...m0 }
    if (at < m.r) m.r--
    else if (at <= m.r + m.rs - 1) m.rs--
    if (m.rs >= 1 && m.cs >= 1 && !(m.rs === 1 && m.cs === 1)) merges.push(m)
  }
  const st = remapCellStyles(el, (r, c) => (r === at ? null : [r > at ? r - 1 : r, c]))
  return { rows: R - 1, cells: nc, merges, ...st }
}

export function addCol(el: FreeEl, at: number): Partial<FreeEl> {
  const { C, cells } = grid(el)
  const nc = cells.map((row) => { const rr = row.slice(); rr.splice(at, 0, ''); return rr })
  const merges = (el.merges || []).map((m) => ({ ...m }))
  for (const m of merges) { if (at <= m.c) m.c++; else if (at <= m.c + m.cs - 1) m.cs++ }
  const st = remapCellStyles(el, (r, c) => [r, c >= at ? c + 1 : c])
  return { cols: C + 1, cells: nc, merges, ...st }
}

export function delCol(el: FreeEl, at0: number): Partial<FreeEl> {
  const { C, cells } = grid(el)
  if (C <= 1) return {}
  const at = Math.max(0, Math.min(C - 1, at0))   // delRow 와 같은 이유로 클램프
  const nc = cells.map((row) => { const rr = row.slice(); rr.splice(at, 1); return rr })
  const merges: Merge[] = []
  for (const m0 of (el.merges || [])) {
    const m = { ...m0 }
    if (at < m.c) m.c--
    else if (at <= m.c + m.cs - 1) m.cs--
    if (m.rs >= 1 && m.cs >= 1 && !(m.rs === 1 && m.cs === 1)) merges.push(m)
  }
  const st = remapCellStyles(el, (r, c) => (c === at ? null : [r, c > at ? c - 1 : c]))
  return { cols: C - 1, cells: nc, merges, ...st }
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

export function setVAlignRange(el: FreeEl, r0: number, c0: number, r1: number, c1: number, valign: VAlign): Partial<FreeEl> {
  const R0 = Math.min(r0, r1), C0 = Math.min(c0, c1), R1 = Math.max(r0, r1), C1 = Math.max(c0, c1)
  const cvalign: CVAlign = { ...(el.cvalign || {}) }
  for (let r = R0; r <= R1; r++) for (let c = C0; c <= C1; c++) cvalign[key(r, c)] = valign
  return { cvalign }
}

// fs 가 null 이면 셀 지정을 지워 표 기본 크기(el.fs)로 되돌린다.
// 지우기를 따로 두지 않으면 한 번 셀 크기를 준 표는 전체 크기 조절이 영영 안 먹는다.
export function setCellFsRange(el: FreeEl, r0: number, c0: number, r1: number, c1: number, fs: number | null): Partial<FreeEl> {
  const R0 = Math.min(r0, r1), C0 = Math.min(c0, c1), R1 = Math.max(r0, r1), C1 = Math.max(c0, c1)
  const cfs: CFs = { ...(el.cfs || {}) }
  for (let r = R0; r <= R1; r++) for (let c = C0; c <= C1; c++) {
    if (fs == null) delete cfs[key(r, c)]
    else cfs[key(r, c)] = Math.max(6, Math.min(120, Math.round(fs)))
  }
  return { cfs }
}
