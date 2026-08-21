import { mergeCovering } from '../canvas/tableOps'
import { isSlotEl, lockedRowCount } from '../template/slots'
import type { FreeEl } from '../state/store'
import { cellLabel, parseCell } from './anchor'

/**
 * 짚은 자리를 **사람의 말로** 바꾼다.
 *
 * 「5행 3~6열」은 사람의 말이 아니다. 받는 사람은 그걸 읽고 표에서 다시
 * 세어봐야 한다 — 지적을 그 자리에 붙여 놓은 의미가 절반 사라진다.
 * 「B프로젝트 · 2월~5월」이면 세지 않아도 된다.
 *
 * ── 왜 정본 열 순서를 코드에 박지 않았는가 ──
 * 처음에는 template_seed 의 열 뜻(2~13열 = 1~12월)을 그대로 옮겨 적으려 했다.
 * 그런데 실제로 배부되는 자료의 상당수는 **임원이 올린 실물 PPT** 를 변환한
 * 표다. 그건 정본 슬롯이 아니고, 열 순서도 부서마다 다르다.
 * 박아 넣은 표는 정본에서만 맞고 실물에서는 전부 틀린다.
 *
 * 그래서 **표 자신에게 묻는다.** 머리글 행에 이미 '3월' 이 적혀 있고,
 * 왼쪽 칸에 이미 'B프로젝트' 가 적혀 있다. 그걸 읽어서 쓴다.
 * 정본이든 실물이든 같은 방식으로 통한다.
 */

const MAX_NAME = 14

function clean(s: string | undefined): string {
  if (!s) return ''
  // 표 안의 글자는 줄바꿈과 군더더기 공백이 많다. 한 줄로 눌러서 짧게 자른다.
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > MAX_NAME ? t.slice(0, MAX_NAME) + '…' : t
}

/** 병합을 따라가 그 칸에 실제로 보이는 글자를 읽는다. */
function valueAt(el: FreeEl, r: number, c: number): string {
  const m = mergeCovering(el.merges, r, c)
  const rr = m ? m.r : r
  const cc = m ? m.c : c
  return clean(el.cells?.[rr]?.[cc])
}

/**
 * 머리글이 몇 행인가.
 *
 * **실물 PPT 에서 변환된 표는 `headRow: false` 다.** 변환기는 어디까지가
 * 머리글인지 모르니 표시하지 않는다. 그 값만 믿으면 실제로 배부되는 자료
 * 대부분에서 머리글이 0행이 되고, 이 기능은 조용히 아무 일도 하지 않는다
 * (번호로만 나온다 — 고치기 전과 똑같아진다).
 *
 * 그래서 표에게서 한 가지 단서를 더 읽는다. 로드맵 계열 표는 왼쪽 위
 * 이름표 칸이 머리글 높이만큼 세로로 병합돼 있다 — 실물 변환본도,
 * 정본 양식도 (0,0)에 rs=2 병합이 있다. 그 높이가 곧 머리글 행 수다.
 */
function headRowCount(el: FreeEl): number {
  const declared = isSlotEl(el.slot) ? lockedRowCount(el.slot) : (el.headRow !== false ? 1 : 0)
  const corner = mergeCovering(el.merges, 0, 0)
  const byMerge = corner && corner.r === 0 && corner.c === 0 ? corner.rs : 0
  const rows = el.rows || 0
  // 표 전체가 머리글일 수는 없다. 이상한 병합에 끌려가지 않게 위쪽 절반으로 묶는다.
  return Math.min(Math.max(declared, byMerge), Math.max(1, Math.floor(rows / 2)))
}

/**
 * 그 열의 이름. 머리글을 **아래에서 위로** 훑는다.
 *
 * 로드맵 머리글은 두 줄이다 — 위가 「2026년」(열두 칸에 걸친 병합),
 * 아래가 「3월」. 위에서부터 찾으면 3월도 5월도 전부 「2026년」이 된다.
 * 아래쪽이 늘 더 구체적이다.
 */
function colName(el: FreeEl, c: number): string {
  const hr = headRowCount(el)
  for (let r = hr - 1; r >= 0; r--) {
    const v = valueAt(el, r, c)
    if (!v) continue
    // 정본 양식의 월 머리글은 그냥 「3」이다(위 칸에 「2026년」이 걸려 있다).
    // 그대로 쓰면 "B프로젝트 · 3~5" 가 되어 무엇의 3인지 알 수 없다.
    // **바로 위가 연도 띠일 때만** 월을 붙인다 — 일련번호를 월로 읽는 사고를 막는다.
    if (/^\d{1,2}$/.test(v) && r > 0 && valueAt(el, r - 1, c).includes('년')) {
      return v + '월'
    }
    return v
  }
  return ''
}

/**
 * 그 행의 이름. 왼쪽 이름표 칸에서 가져온다.
 *
 * 오른쪽으로 갈수록 구체적이다 — 0열은 「상시」 같은 묶음, 1열이 프로젝트명이다.
 * 그래서 왼쪽 두 칸 중 **더 오른쪽의 값**을 쓴다.
 */
function rowName(el: FreeEl, r: number): string {
  const hr = headRowCount(el)
  if (r < hr) return ''            // 머리글 행 자체에는 행 이름이 없다
  const lead = Math.min(2, el.cols || 2)
  for (let c = lead - 1; c >= 0; c--) {
    const v = valueAt(el, r, c)
    if (v) return v
  }
  return ''
}

/** "A~B" 로 잇되, 같으면 하나만. 한쪽이 비면 있는 쪽만. */
function span(a: string, b: string): string {
  if (a && b) return a === b ? a : `${a}~${b}`
  return a || b
}

/**
 * 표의 칸(또는 범위)을 사람 말로.
 *
 * 이름을 못 찾으면 **번호로 되돌아간다.** 빈 표나 머리글이 없는 표에서
 * 억지로 이름을 지어내면 엉뚱한 곳을 가리키게 된다 — 번호가 낫다.
 */
export function tableAnchorLabel(el: FreeEl | undefined, cell: string | null): string {
  const rg = parseCell(cell)
  if (!rg) return ''
  const nums = cellLabel(cell)
  if (!el || el.type !== 'table') return nums

  let rows = span(rowName(el, rg.r0), rowName(el, rg.r1))
  let cols = span(colName(el, rg.c0), colName(el, rg.c1))

  // 한쪽 이름만 나오면 어느 줄인지 알 수 없다. 아직 아무것도 안 쓴 로드맵에서
  // 「1월~4월」만 뜨면 **어느 프로젝트의 1~4월인지** 알 수 없어서, 지적을
  // 그 자리에 붙여 놓은 의미가 없어진다. 그럴 때만 번호로 채운다.
  const hr = headRowCount(el)
  if (!rows && cols && rg.r0 >= hr) {
    rows = rg.r0 === rg.r1 ? `${rg.r0 + 1}행` : `${rg.r0 + 1}~${rg.r1 + 1}행`
  }
  if (rows && !cols) {
    cols = rg.c0 === rg.c1 ? `${rg.c0 + 1}열` : `${rg.c0 + 1}~${rg.c1 + 1}열`
  }

  if (rows && cols) return `${rows} · ${cols}`
  if (cols) return cols          // 머리글만 짚은 경우 — 「3월~5월」
  return nums
}

/** 목록·툴바에서 함께 쓸 짧은 위치 문구. 이름이 있으면 번호는 덧붙이지 않는다. */
export function anchorText(el: FreeEl | undefined, cell: string | null, hasEl: boolean): string {
  if (cell) {
    const t = tableAnchorLabel(el, cell)
    return t ? `표 · ${t}` : '표'
  }
  return hasEl ? '요소' : '이 장 전체'
}
