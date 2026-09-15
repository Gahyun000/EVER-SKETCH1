// 자료 목록의 **표** — 어떤 열을 세우고, 어떻게 줄 세우고, 언제 표를 포기하는가.
//
// **왜 표인가.** 지금 줄 목록은 `9월 3일 14:20 · 12페이지 · 결재 중 · 잠김` 을 한 줄에
// 이어 붙여 놓는다. 같은 종류가 세로로 안 서 있어서 눈이 매번 글을 읽어야 하고,
// 「승인된 것만 보자」·「오래된 것부터 보자」 같은 일을 할 수가 없다.
//
// **정렬은 거의 공짜다.** 서버가 목록을 `ORDER BY updated_at DESC` 로 **전부** 내려주고
// 쪽 나누기는 화면이 한다(`filtered.slice(...)`). 상태 칩도 `apiStatusMap()` 으로 한 번에
// 받는다. 그래서 열 머리를 눌러 줄 세우는 데 서버를 안 건드린다.
//
// **좁으면 표를 포기한다.** 사이드바 214 + 폴더 칸 220 + 상세 340 을 빼고 나면 1126 창에서
// 목록 칸이 400px 밑으로 내려간다. 거기에 여섯 열을 밀어 넣으면 제목이 두 글자만 남는다.
// 그럴 때는 **줄 목록으로 내려간다** — 좁은 화면에서 표를 우기는 것보다 낫다.
import type { DocState, StatusChip } from '../approvals/approvalApi'

/** 표의 「상태」 칸 글자. **`DOC_STATE_LABEL` 과 일부러 다르다.**
 *
 *  그쪽은 줄 목록의 **배지** 글자라 `draft` 와 `approved` 가 빈 글자다 — 목록의
 *  기본값이라 모든 줄에 붙으면 배지가 아니라 배경이 되기 때문이다. 표는 반대다.
 *  상태만 모아 세우려고 만든 칸이라 **빈 칸이면 그 칸을 만든 뜻이 없다.**
 *  두 벌을 두는 대신 한쪽을 고치면 다른 쪽이 망가진다. */
export const LIB_STATE_LABEL: Record<DocState, string> = {
  draft: '초안', pending: '결재 중', rejected: '반려',
  approved: '승인', revision_pending: '수정 요청 중', revising: '수정 중',
}

export type LibColKey = 'name' | 'state' | 'approver' | 'sent' | 'updated' | 'published'

export interface LibCol {
  key: LibColKey
  label: string
  /** 최소 폭(px). 제목은 남는 자리를 다 쓰므로 이 값이 **바닥**이다. */
  w: number
  /** 줄 세울 수 있는 열인가. */
  sortable: boolean
}

/** 사용자 결정 ⑤ — 제목 · 상태 · 결재자 · 낸 날 · 수정일 · 발행. */
export const LIB_COLS: LibCol[] = [
  { key: 'name', label: '제목', w: 220, sortable: true },
  { key: 'state', label: '상태', w: 92, sortable: true },
  { key: 'approver', label: '결재자', w: 96, sortable: true },
  { key: 'sent', label: '낸 날', w: 104, sortable: true },
  { key: 'updated', label: '수정일', w: 116, sortable: true },
  { key: 'published', label: '발행', w: 62, sortable: true },
]

/** 좌우 여백 + 도구 칸(제출·복제·삭제). 표가 들어갈 자리를 셀 때 같이 센다. */
export const LIB_ACTS_W = 132

/** 여섯 열이 다 들어가려면 필요한 최소 폭. */
export const LIB_TABLE_MIN = LIB_COLS.reduce((a, c) => a + c.w, 0) + LIB_ACTS_W

/** 이 폭이면 표를 그리는가. 아니면 줄 목록으로 내려간다. */
export function wantsTable(width: number): boolean {
  return width >= LIB_TABLE_MIN
}

export type SortDir = 'asc' | 'desc'
export interface LibSort { key: LibColKey; dir: SortDir }

/** 처음 줄 세우기 — 서버가 주는 차례와 **같은 뜻**이어야 한다(최근 수정 먼저). */
export const LIB_SORT_DEFAULT: LibSort = { key: 'updated', dir: 'desc' }

/** 열 머리를 눌렀을 때. 같은 열이면 방향만 뒤집고, 다른 열이면 그 열의 **기본 방향**으로.
 *
 *  날짜는 **최근 먼저**가 기본이고 글자는 **가나다순**이 기본이다. 한 방향으로 통일하면
 *  「수정일」을 눌렀을 때 2019년 것부터 나온다 — 누른 사람이 원한 답이 아니다. */
export function nextSort(cur: LibSort, key: LibColKey): LibSort {
  if (cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'sent' || key === 'updated' ? 'desc' : 'asc' }
}

export interface LibRow {
  id: string
  name: string
  updated_at: number
  published_id?: string | null
}

/** 상태 칩의 차례. **글자 순이 아니라 일이 흘러가는 순서**다 —
 *  초안 → 결재 중 → 반려 → 수정 요청 중 → 수정 중 → 승인.
 *  가나다로 세우면 「반려」와 「발행」이 붙어 서고 아무 뜻이 없다. */
const STATE_ORDER: Record<string, number> = {
  draft: 0, pending: 1, rejected: 2, revision_pending: 3, revising: 4, approved: 5,
}

/**
 * 줄 세운다. **원본을 안 건드린다** — 받은 배열은 스토어가 들고 있는 것이다.
 *
 * 값이 없는 줄(아직 안 낸 자료의 「낸 날」 같은 것)은 방향과 상관없이 **늘 뒤로** 간다.
 * 안 그러면 「낸 날」로 세울 때마다 안 낸 자료가 화면을 덮는다.
 */
export function sortRows<T extends LibRow>(
  rows: T[], chips: Record<string, StatusChip | undefined>, sort: LibSort,
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  const val = (r: T): number | string | null => {
    const c = chips[r.id]
    switch (sort.key) {
      case 'name': return (r.name || '').trim() || '제목 없음'
      case 'state': return c ? (STATE_ORDER[c.state] ?? 99) : -1
      case 'approver': return c?.approver_name || null
      case 'sent': return c?.created_at ?? null
      case 'updated': return r.updated_at ?? null
      case 'published': return r.published_id ? 1 : 0
      default: return null
    }
  }
  return rows.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    if (x === null && y === null) return tie(a, b)
    if (x === null) return 1          // 빈 값은 늘 뒤
    if (y === null) return -1
    const d = typeof x === 'string' && typeof y === 'string'
      ? x.localeCompare(y as string, 'ko')
      : (x as number) - (y as number)
    return d !== 0 ? d * sign : tie(a, b)
  })
}

/** 동점은 **최근 수정 먼저**로 깬다. 안 정하면 줄 세울 때마다 차례가 달라져서,
 *  같은 화면을 두 번 봤는데 순서가 바뀐 것처럼 보인다. */
function tie(a: LibRow, b: LibRow): number {
  return (b.updated_at || 0) - (a.updated_at || 0)
}
