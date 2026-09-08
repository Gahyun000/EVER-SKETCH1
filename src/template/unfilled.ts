// 표준 양식에서 **아직 안 쓴 자리**를 센다.
//
// 결재 카드가 「내기 전에 한 번 보세요」로 띄우는 값이다.
// **막지 않는다** — 알리고 그 자리로 데려다 줄 뿐이다. 임원이 일부러 비우는 칸이 있고
// (「이번 달 해당 없음」), 화면이 대신 판단해 막으면 그 사람은 고장 났다고 이해하고
// 관리자에게 전화한다.
//
// **왜 「빈 칸 개수」가 아닌가.**
// ① 로드맵은 18열인데 그중 12열이 달(月)이고, 그 칸은 **글이 아니라 색으로** 채운다.
// 빈 칸을 세면 아무도 안 틀렸는데 「빈 칸 132개」가 뜬다. 그래서 **사람이 글을 쓰는
// 열만** 본다 — 로드맵은 달이 시작되기 전(`ROADMAP_MONTH_COL0`)까지다.
//
// 화면과 떨어져 있어 `node` 로 바로 시험할 수 있다(그래서 .ts 다 — .tsx 는 못 읽는다).

import { isSlotEl, lockedRowCount, ROADMAP_MONTH_COL0 } from './slots'

export type UnfilledKind = 'empty' | 'partial'

export interface Unfilled {
  slot: string
  /** 화면에 적을 이름. 문서 안의 이름표를 그대로 쓰고, 없으면 슬롯 이름. */
  label: string
  kind: UnfilledKind
  /** empty 면 0, partial 이면 쓰다 만 줄의 수. */
  rows: number
  /** 데려다 줄 자리 — 요소 id 와 (있으면) 첫 빈 칸. */
  elId: number
  cell?: { r: number; c: number }
}

/** 표 하나에서 **사람이 글을 쓰는 열**. 로드맵의 달 칸은 색으로 채우므로 뺀다. */
export function textCols(slot: string, cols: number): number[] {
  const n = Math.max(0, cols)
  if (slot === 'SLOT-A') {
    const end = Math.min(ROADMAP_MONTH_COL0, n)
    return Array.from({ length: Math.max(0, end) }, (_, i) => i)
  }
  return Array.from({ length: n }, (_, i) => i)
}

interface TableLike {
  id: number
  type: string
  slot?: string
  rows?: number
  cols?: number
  cells?: string[][]
}
interface PageLike { els?: TableLike[] }

const filled = (v: string | undefined): boolean => !!v && v.trim() !== ''

/**
 * 표 하나를 본다.
 *   · 본문에 쓴 줄이 하나도 없다      → `empty`  (「아직 안 쓰셨습니다」)
 *   · 쓴 줄인데 빈 칸이 남았다        → `partial`(「쓰다 만 줄 2개」)
 *   · 아예 안 건드린 줄은 세지 않는다  → 표는 넉넉히 나오고, 남는 줄은 정상이다
 */
export function unfilledOf(el: TableLike, label?: string): Unfilled | null {
  if (el.type !== 'table' || !isSlotEl(el.slot)) return null
  const slot = el.slot as string
  const cells = el.cells || []
  const cols = el.cols ?? (cells[0]?.length ?? 0)
  const head = lockedRowCount(slot)
  const tc = textCols(slot, cols)
  if (tc.length === 0) return null

  let wrote = 0, partial = 0
  let first: { r: number; c: number } | undefined
  for (let r = head; r < cells.length; r++) {
    const row = cells[r] || []
    const any = tc.some((c) => filled(row[c]))
    if (!any) continue                       // 안 건드린 줄 — 남는 줄은 정상이다
    wrote++
    const holes = tc.filter((c) => !filled(row[c]))
    if (holes.length) {
      partial++
      if (!first) first = { r, c: holes[0] }
    }
  }
  const name = label || slot
  if (wrote === 0) return { slot, label: name, kind: 'empty', rows: 0, elId: el.id,
                            cell: { r: head, c: tc[0] } }
  if (partial > 0) return { slot, label: name, kind: 'partial', rows: partial, elId: el.id, cell: first }
  return null
}

/** 문서 안에서 그 슬롯의 **이름표**를 찾는다 — 「① 로드맵 / 마일스톤」. */
export function slotLabels(pages: PageLike[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pages || []) {
    for (const e of p?.els || []) {
      if (!e || e.type !== 'text' || !isSlotEl(e.slot)) continue
      const t = ((e as { text?: string }).text || '').trim()
      if (t && !out[e.slot as string]) out[e.slot as string] = t
    }
  }
  return out
}

/**
 * 문서 전체.
 *
 * **이어진 조각은 한 표로 본다.** 표가 넘쳐 다음 장으로 이어지면(`contFrom`)
 * 같은 슬롯의 표가 둘이 된다 — 따로 세면 「② 가 비었다」가 두 번 뜬다.
 * 앞 조각에 이미 썼으면 그 슬롯은 빈 것이 아니다.
 */
export function unfilled(pages: PageLike[]): Unfilled[] {
  const labels = slotLabels(pages)
  const bySlot = new Map<string, Unfilled | 'ok'>()
  // **망가진 자료에 안 죽는다.** 이 카드는 화면 맨 위에 늘 떠 있어서,
  // 여기서 한 번 터지면 오른쪽 패널이 통째로 사라진다 — 도구를 못 쓰게 된다.
  for (const p of pages || []) {
    for (const e of p?.els || []) {
      if (!e || e.type !== 'table' || !isSlotEl(e.slot)) continue
      const u = unfilledOf(e, labels[e.slot as string])
      const slot = e.slot as string
      const prev = bySlot.get(slot)
      if (u === null) { bySlot.set(slot, 'ok'); continue }   // 이 조각은 멀쩡하다
      if (prev === 'ok') continue                             // 다른 조각이 이미 멀쩡했다
      if (prev && prev.kind === 'partial' && u.kind === 'empty') continue
      bySlot.set(slot, u)
    }
  }
  const out: Unfilled[] = []
  for (const v of bySlot.values()) if (v !== 'ok') out.push(v)
  // 문서에 놓인 순서(①②③)를 지킨다 — 슬롯 이름이 그 순서다.
  return out.sort((a, b) => a.slot.localeCompare(b.slot))
}

/** 카드에 한 줄로 적을 말. */
export function unfilledText(u: Unfilled): string {
  return u.kind === 'empty'
    ? `${u.label} — 아직 안 쓰셨습니다`
    : `${u.label} — 쓰다 만 줄 ${u.rows}개`
}
