/**
 * 팀 공유 화면의 순수 계산 (P6).
 *
 * 서버가 주는 것은 **팀 / 작성자 / 월** 세 겹으로 접힌 나무다(D22). 화면은 그것을
 * 한 줄씩 늘어놓아야 하고, 그러면서 **검색**과 **쪽 나눔**을 함께 해야 한다.
 *
 * 여기서 한 번 겪은 함정이 팀 관리(`teamModel.buildGroups`)에서 겪은 것과 같다 —
 * **묶음 머리글은 자기 자리를 스스로 알지 못한다.** 항목을 잘라 쪽에 나눠 담고 나면
 * 「이 쪽의 첫 줄이 새 작성자인가」를 다시 계산해야 하고, 안 하면 머리글이 모든 쪽에
 * 나타나거나(중복) 어느 쪽에서도 안 나타난다(맥락 소실).
 * 그래서 **항목을 먼저 한 줄로 펴고, 자른 뒤에, 머리글을 다시 끼운다.**
 *
 * React 를 모른다 — 노드로 그냥 실행해서 검증한다(`team_library_screen.test.mjs`).
 */
import type { LibItem, LibTeam, Relation } from './teamLibraryApi'

/** 한 쪽에 담는 자료 수. 자료 목록(12)과 같은 눈금을 쓴다. */
export const PAGE_SIZE = 12

/** 「현재」·「이전」은 **글자로 붙인다**(D19) — 색으로만 상태를 구분하지 않는다(표준). */
export const RELATION_LABEL: Record<Relation, string> = {
  current: '현재',
  past: '이전',
  other: '다른 팀',
}

/** 관계를 한 줄로 설명한다. 배지만 있으면 「이전이 무슨 뜻이지」에서 멈춘다. */
export const RELATION_HINT: Record<Relation, string> = {
  current: '지금 속한 팀입니다.',
  past: '전에 속했던 팀입니다. 내가 낸 자료만 보이고, 읽기만 됩니다.',
  other: '내 팀이 아닙니다. 읽기만 됩니다.',
}

/** `2026-09` → `2026년 9월`. 빈 값이면 「승인일 미상」 — 없는 달을 지어내지 않는다. */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '')
  if (!m) return '승인일 미상'
  return `${m[1]}년 ${Number(m[2])}월`
}

/** 한 줄로 편 자료. 어느 작성자·어느 달의 것인지를 **항목이 들고 다닌다.** */
export interface FlatItem {
  authorId: string
  authorName: string
  authorDept: string
  isMe: boolean
  ym: string
  item: LibItem
}

export type Row =
  | { kind: 'author'; key: string; name: string; dept: string; isMe: boolean; count: number }
  | { kind: 'month'; key: string; ym: string; label: string; count: number }
  | { kind: 'item'; key: string; flat: FlatItem }

function norm(s: string): string {
  return (s || '').trim().toLowerCase()
}

/**
 * 검색어에 걸리는가. **자료 이름과 작성자 이름 둘 다** 본다 —
 * 팀 공유에서 사람이 찾는 것은 「그 자료」 아니면 「그 사람이 낸 것」 둘 중 하나다.
 * 폴더 경로도 본다(자료가 어느 서랍에서 나왔는지가 이름보다 기억날 때가 있다).
 */
export function matches(f: FlatItem, query: string): boolean {
  const q = norm(query)
  if (!q) return true
  return [f.item.project_name, f.authorName, f.authorDept, f.item.folder_path]
    .some((s) => norm(String(s || '')).includes(q))
}

/**
 * 팀 하나를 한 줄로 편다. 서버가 준 순서(본인 먼저 → 가나다, 최근 달 먼저)를 그대로 지킨다 —
 * 여기서 다시 정렬하면 서버와 화면이 서로 다른 순서를 갖게 된다.
 */
export function flatten(team: LibTeam | null | undefined): FlatItem[] {
  if (!team) return []
  const out: FlatItem[] = []
  for (const a of team.authors || []) {
    for (const m of a.months || []) {
      for (const it of m.items || []) {
        out.push({
          authorId: a.id, authorName: a.name, authorDept: a.dept || '',
          isMe: !!a.is_me, ym: m.ym, item: it,
        })
      }
    }
  }
  return out
}

export interface Paged {
  rows: Row[]
  /** 검색 결과 자료 수. 「N건」은 **자료 수**지 줄 수가 아니다. */
  total: number
  totalPages: number
  page: number
}

/**
 * 검색 → 쪽 나눔 → **머리글 다시 끼우기**, 이 순서다.
 *
 * 머리글을 먼저 끼우고 자르면 머리글이 쪽 수를 잡아먹어 쪽마다 담기는 자료 수가
 * 들쭉날쭉해지고, 잘린 자리에 머리글만 덩그러니 남는 쪽이 생긴다.
 * 자른 뒤에 끼우면 **모든 쪽이 정확히 PAGE_SIZE 건**을 담고, 각 쪽은 자기 첫 줄에
 * 맞는 머리글을 새로 얻는다 — 3쪽만 열어도 「누가 낸 몇 월 자료인지」를 안다.
 */
export function pageOf(
  flat: FlatItem[], query: string, page: number, size = PAGE_SIZE,
): Paged {
  const hit = flat.filter((f) => matches(f, query))
  const n = Math.max(1, Math.floor(size))
  const totalPages = Math.max(1, Math.ceil(hit.length / n))
  const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  const slice = hit.slice((p - 1) * n, p * n)

  // 이 쪽 안에서의 묶음 크기를 센다 — 「(3건)」이 전체 수를 말하면
  // 쪽에는 1건만 보이는데 3건이라고 적혀 있는 상태가 된다.
  const authorCount = new Map<string, number>()
  const monthCount = new Map<string, number>()
  for (const f of slice) {
    authorCount.set(f.authorId, (authorCount.get(f.authorId) || 0) + 1)
    monthCount.set(f.authorId + '|' + f.ym, (monthCount.get(f.authorId + '|' + f.ym) || 0) + 1)
  }

  const rows: Row[] = []
  let curAuthor = ''
  let curMonth = ''
  for (const f of slice) {
    if (f.authorId !== curAuthor) {
      curAuthor = f.authorId
      curMonth = ''
      rows.push({
        kind: 'author', key: 'a:' + f.authorId, name: f.authorName,
        dept: f.authorDept, isMe: f.isMe, count: authorCount.get(f.authorId) || 0,
      })
    }
    if (f.ym !== curMonth) {
      curMonth = f.ym
      rows.push({
        kind: 'month', key: 'm:' + f.authorId + ':' + f.ym, ym: f.ym,
        label: monthLabel(f.ym), count: monthCount.get(f.authorId + '|' + f.ym) || 0,
      })
    }
    rows.push({ kind: 'item', key: 'i:' + f.item.id, flat: f })
  }

  return { rows, total: hit.length, totalPages, page: p }
}

/**
 * 팀 고르개에 쓸 줄. **자료가 0건인 팀은 서버가 아예 안 준다** —
 * 「승인본이 있는 팀」만 목록에 오므로, 빈 팀 이름이 떠서 눌러도 아무것도 없는 일은 없다.
 */
export function teamTabs(teams: LibTeam[]): { id: string; label: string; relation: Relation; count: number }[] {
  return (teams || []).map((t) => ({
    id: t.id, label: t.name, relation: t.relation, count: t.count,
  }))
}

/** 지금 고른 팀. id 가 없거나 사라졌으면 **첫 팀**(= 현재 팀)으로 되돌린다. */
export function pickTeam(teams: LibTeam[], id: string | null): LibTeam | null {
  if (!teams || teams.length === 0) return null
  return teams.find((t) => t.id === id) || teams[0]
}


/**
 * 주소가 `/view/<결재id>` 면 그 id, 아니면 null. **화면을 고르는 유일한 기준이다**(㉰).
 *
 * 규칙을 좁게 잡은 이유 — 여기서 나온 값은 그대로 API 주소에 붙어 나간다.
 * 결재 id 는 `a` + 16진수 12자리라 글자 종류가 정해져 있으므로, 그 밖의 것은
 * **id 로 읽지 않는다.** 「일단 받아서 서버가 거르게 하자」로 두면
 * `/view/../../…` 같은 것이 주소 조립에 섞여 들어갈 자리가 생긴다.
 */
export function viewerIdFromPath(pathname: string): string | null {
  const m = /^\/view\/([A-Za-z0-9_-]{1,64})\/?$/.exec(pathname || '')
  return m ? m[1] : null
}


/**
 * 주소에 「팀 공유를 열어 달라」가 실려 있는가. 뷰어의 「팀 공유 열기」가 붙여 보낸다.
 *
 * **주소를 읽는 두 번째 자리다**(첫째는 `viewerIdFromPath`). 굳이 늘린 이유 —
 * 뷰어에서 돌아온 사람이 방금까지 보던 것은 **팀 자료**인데, 그냥 `/` 로 보내면
 * 「내 서랍」(자기 자료 목록)에 내린다. 제 자료가 없는 열람자에게는 그게
 * 「아직 만든 것이 없어요」 빈 화면이라, 팀 자료를 보러 온 사람을 상관없는 화면에
 * 한 번 세웠다 보내게 된다.
 *
 * **읽고 나면 주소에서 지운다**(`LibraryScreen`). 창을 닫은 뒤에도 주소에 남아 있으면
 * 새로 고칠 때마다 다시 열려서, 주소가 화면과 다른 말을 하게 된다.
 */
export function wantsSharedFromSearch(search: string): boolean {
  try {
    return new URLSearchParams(search || '').get('shared') === '1'
  } catch {
    return false
  }
}
