import type { FreeEl } from '../state/store'

// 표 편집 순수 함수 — FreeEl(table)을 받아 부분 패치(Partial<FreeEl>)를 돌려준다.
export type Merge = { r: number; c: number; rs: number; cs: number }
type Align = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'
type CAlign = Record<string, Align>
// 셀 단위 맵은 모두 "r_c" 키를 쓴다. calign(가로정렬)·cvalign(세로정렬)·cfs(글자크기)·cbg(배경색)가 같은 규칙이다.
type CellMap<T> = Record<string, T>
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

// 열 너비·행 높이는 **비율(가중치) 배열**이다. px 가 아니다.
// px 로 두면 표 전체 크기를 바꾸는 순간 칸 합이 표 폭과 어긋나 마지막 칸이 잘린다.
// 길이가 열/행 수와 다르면(구 문서·잘못된 입력) 균등 분할로 되돌린다 — 조용히 어긋난 폭을
// 유지하는 것보다 눈에 띄게 균등해지는 편이 고치기 쉽다.
/** 실제로 쓰이는 칸 비율. 저장된 배열이 못 믿을 상태면 **균등 분할**로 되돌린다.
 *
 *  화면에 그리는 쪽(sizeTracks)과 손잡이 자리를 잡는 쪽이 **같은 값을 봐야** 한다.
 *  두 곳이 각자 판단하면, 배열이 어긋난 표에서 손잡이가 실제 경계선과 다른 데 선다. */
export function trackSizes(arr: number[] | undefined, n: number): number[] {
  const ok = !!arr && arr.length === n && arr.every((v) => typeof v === 'number' && v > 0 && isFinite(v))
  return ok ? (arr as number[]).slice() : Array.from({ length: n }, () => 1)
}

export function sizeTracks(arr: number[] | undefined, n: number): string {
  const ok = !!arr && arr.length === n && arr.every((v) => typeof v === 'number' && v > 0 && isFinite(v))
  return ok ? (arr as number[]).map((v) => v + 'fr').join(' ') : `repeat(${n}, 1fr)`
}

/** 경계선 i(칸 i 와 i+1 사이)를 끌었을 때의 새 비율 배열.
 *
 *  **합을 그대로 둔다.** 한쪽이 넓어지면 옆이 그만큼 좁아진다 — 표 전체 크기는
 *  안 변한다. 표를 키우는 것은 모서리 손잡이가 할 일이고, 이건 「안에서 나누는」 일이다.
 *  둘을 한 동작에 섞으면 열 하나 넓히려다 표가 종이 밖으로 나간다.
 *
 *  `px` 는 이 방향의 표 크기(캔버스 px), `dPx` 는 끌린 거리다.
 *  최소 12px 은 남긴다 — 0 으로 만들면 그 열은 다시 잡을 수 없다.
 */
export function dragTrack(arr: number[], i: number, dPx: number, px: number,
                          minPx = 12): number[] {
  if (i < 0 || i + 1 >= arr.length || !(px > 0)) return arr
  const total = arr.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return arr
  const min = (total * minPx) / px
  const a0 = arr[i], b0 = arr[i + 1]
  // 두 칸 다 이미 최소보다 작으면(아주 좁은 표) 건드리지 않는다 — 억지로 맞추면 튄다.
  if (a0 - min < 0 && b0 - min < 0) return arr
  let d = (dPx * total) / px
  d = Math.max(-(a0 - min), Math.min(b0 - min, d))
  const out = arr.slice()
  out[i] = a0 + d
  out[i + 1] = b0 - d
  return out
}

// 새 행/열의 크기는 **바로 그 자리에 있던 것과 같게** 잡는다(끝에 붙이면 마지막 것과 같게).
// 1 로 고정하면 넓은 '구분' 열 옆에 열을 넣었을 때 그 칸만 좁아져 표가 어긋나 보인다.
function insertSize(arr: number[] | undefined, at: number, n: number): number[] | undefined {
  if (!arr || arr.length !== n) return undefined
  const out = arr.slice()
  out.splice(at, 0, arr[Math.min(Math.max(at, 0), arr.length - 1)] || 1)
  return out
}
function removeSize(arr: number[] | undefined, at: number, n: number): number[] | undefined {
  if (!arr || arr.length !== n) return undefined
  const out = arr.slice()
  out.splice(at, 1)
  return out.length ? out : undefined
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

// 셀 서식 맵은 네 개가 항상 함께 움직여야 한다. 하나라도 빠뜨리면 행을 지운 뒤
// 정렬만 따라오고 글자 크기·진행 셀 색은 엉뚱한 칸에 남는 식으로 표가 어긋난다.
// **셀 맵을 새로 추가하면 반드시 여기에도 넣는다.**
function remapCellStyles(el: FreeEl, fn: (r: number, c: number) => [number, number] | null): Partial<FreeEl> {
  return {
    calign: remapCells<Align>(el.calign, fn),
    cvalign: remapCells<VAlign>(el.cvalign, fn),
    cfs: remapCells<number>(el.cfs, fn),
    cbg: remapCells<string>(el.cbg, fn),
  }
}

/**
 * 행이 하나 늘거나 줄 때 **표 전체 높이**를 얼마로 옮길지.
 *
 * ── 왜 필요한가 ────────────────────────────────────
 * 예전에는 행을 추가해도 `h` 를 안 건드렸다. 표는 고정 높이 격자이고
 * `gridTemplateRows` 가 `fr` 이라, 행이 늘면 **남아 있던 행들이 대신 납작해졌다.**
 * 실측: 로드맵에 6행을 넣으면 행 높이가 34.2px → 18.4px 가 된다. 진행 구간
 * 라벨('설계·구축')이 한 줄에 안 들어가 잘리기 시작하는 크기다.
 * 사용자 눈에는 「행을 넣었더니 표가 뭉개졌다」로 보인다.
 *
 * ── 규칙 ─────────────────────────────────────────
 * **행 높이는 사람이 정하고, 표 높이는 행 수를 따라간다.**
 * 행을 하나 넣으면 그 자리 행과 같은 크기만큼 표가 커지고, 빼면 그만큼 작아진다.
 * 그래서 남아 있는 행들의 높이는 언제나 그대로다.
 *
 * 넣을 때만 늘리고 뺄 때 안 줄이면, 넣었다 뺐다 하는 동안 표가 계속 부푼다.
 * 양쪽을 대칭으로 두는 편이 예측 가능하다.
 *
 * 행마다 크기가 다를 수 있으므로(`rowh` 는 fr 가중치) 비율로 계산한다 —
 * 가중치가 모두 같으면 자연히 (R+1)/R 이 된다.
 */
export function rowChangedHeight(el: FreeEl, at: number, delta: 1 | -1): number | undefined {
  const h = el.h
  if (typeof h !== 'number' || !isFinite(h) || h <= 0) return undefined
  const R = el.rows || (el.cells ? el.cells.length : 0) || 1
  const arr = el.rowh
  const ok = !!arr && arr.length === R && arr.every((v) => typeof v === 'number' && v > 0 && isFinite(v))
  const w = ok ? (arr as number[]) : Array.from({ length: R }, () => 1)
  const sum = w.reduce((a, b) => a + b, 0)
  if (sum <= 0) return undefined
  // 새 행의 크기는 insertSize() 와 **같은 규칙**으로 잡는다 — 그 자리에 있던 행과 같게.
  // 두 곳이 다른 규칙을 쓰면 표 높이와 행 높이가 서로 안 맞는다.
  const one = w[Math.min(Math.max(at, 0), R - 1)] || 1
  const next = delta > 0 ? sum + one : sum - one
  if (next <= 0) return undefined
  return Math.max(1, Math.round((h * next) / sum))
}

export function addRow(el: FreeEl, at: number): Partial<FreeEl> {
  const { R, C, cells } = grid(el)
  const nc = cells.map((row) => row.slice())
  nc.splice(at, 0, Array.from({ length: C }, () => ''))
  const merges = (el.merges || []).map((m) => ({ ...m }))
  for (const m of merges) { if (at <= m.r) m.r++; else if (at <= m.r + m.rs - 1) m.rs++ }
  const st = remapCellStyles(el, (r, c) => [r >= at ? r + 1 : r, c])
  return { rows: R + 1, cells: nc, merges, ...st, rowh: insertSize(el.rowh, at, R),
           h: rowChangedHeight(el, at, 1) }
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
  return { rows: R - 1, cells: nc, merges, ...st, rowh: removeSize(el.rowh, at, R),
           h: rowChangedHeight(el, at, -1) }
}

export function addCol(el: FreeEl, at: number): Partial<FreeEl> {
  const { C, cells } = grid(el)
  const nc = cells.map((row) => { const rr = row.slice(); rr.splice(at, 0, ''); return rr })
  const merges = (el.merges || []).map((m) => ({ ...m }))
  for (const m of merges) { if (at <= m.c) m.c++; else if (at <= m.c + m.cs - 1) m.cs++ }
  const st = remapCellStyles(el, (r, c) => [r, c >= at ? c + 1 : c])
  return { cols: C + 1, cells: nc, merges, ...st, colw: insertSize(el.colw, at, C) }
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
  return { cols: C - 1, cells: nc, merges, ...st, colw: removeSize(el.colw, at, C) }
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
