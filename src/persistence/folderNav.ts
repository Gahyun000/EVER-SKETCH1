/**
 * 폴더 탐색의 순수 계산 — 쪽 번호 창(D25)과 경로 접기(D26).
 *
 * 둘 다 「…」을 어떻게 다룰 것인가에서 나온 결론인데, **답이 서로 다르다.**
 *   · 쪽 번호에서는 「…」을 **구조에서 없앴다** — 창이 늘 붙어 있는 다섯 칸이라
 *     끊길 자리가 아예 없다.
 *   · 경로에서는 「…」을 **남기되 눌리게** 했다 — 지나온 길은 없앨 수 없고,
 *     접힌 자리에 무엇이 있었는지 물어볼 수 있어야 한다.
 *
 * React 를 모른다 — 노드로 그냥 실행해서 검증한다(`folder_nav.test.mjs`).
 */

/** 한 번에 보여줄 쪽 번호 개수 (D25 확정). */
export const PAGE_WINDOW = 5
/** 경로를 접기 시작하는 칸 수 (D26 확정 — 4칸까지는 다 보인다). */
export const PATH_VISIBLE = 4

/**
 * 이어진 쪽 번호 다섯 개. **가운데에 현재 쪽을 두되 양 끝에서는 붙인다.**
 *
 * 「1 … 7 8 9 … 20」 같은 모양을 쓰지 않는 이유: 「…」은 눌러도 어디로 가는지 모르는
 * 자리이고, 쪽이 늘어날수록 그 모르는 자리가 화면 한가운데를 차지한다.
 * 창을 다섯 칸으로 고정하면 **끊길 자리 자체가 없다** — 표시를 고치는 대신 구조에서 없앴다.
 */
export function pageWindow(current: number, total: number, size = PAGE_WINDOW): number[] {
  const t = Math.max(1, Math.floor(total))
  const c = Math.min(Math.max(1, Math.floor(current)), t)
  const n = Math.min(Math.max(1, Math.floor(size)), t)
  // 가운데 정렬 → 왼쪽으로 넘치면 1 부터, 오른쪽으로 넘치면 끝에 붙인다.
  let start = c - Math.floor(n / 2)
  if (start < 1) start = 1
  if (start + n - 1 > t) start = t - n + 1
  return Array.from({ length: n }, (_, i) => start + i)
}

export interface Crumb { id: string; name: string }

export interface CollapsedPath {
  /** 접힌 칸들. 비어 있으면 「…」을 그리지 않는다. */
  hidden: Crumb[]
  /** 「…」 뒤에 이어 보일 칸들. */
  shown: Crumb[]
  collapsed: boolean
}

/**
 * 경로가 길어지면 **앞쪽을 접는다.** 뒤쪽(지금 있는 자리 근처)이 더 중요하다.
 *
 * 접힌 자리는 「…」 **버튼**이 된다 — 눌러서 감춰진 칸을 펼칠 수 있다.
 * 그냥 글자로 두면 「어디를 지나왔는지」를 확인할 방법이 사라진다.
 * 폴더는 3단까지라(D24) 평소에는 접힐 일이 없다. 「내 자료」 루트까지 세어도 4칸이다 —
 * 이 함수는 **팀 공유 경로(P6, 팀/작성자명/…)처럼 더 깊어질 때**를 위한 것이다.
 */
export function collapsePath(path: Crumb[], visible = PATH_VISIBLE): CollapsedPath {
  const v = Math.max(1, Math.floor(visible))
  if (path.length <= v) return { hidden: [], shown: path.slice(), collapsed: false }
  // 마지막 v 칸을 남기고 앞을 접는다.
  return { hidden: path.slice(0, path.length - v), shown: path.slice(path.length - v), collapsed: true }
}

/** 지금 자리에서 새 폴더를 만들 수 있는가 (D24 — 3단까지). */
export function canCreateHere(depth: number, maxDepth: number): boolean {
  return depth < maxDepth
}

/**
 * 「지금 어디를 보고 있는가」를 한 줄로. 검색칸 옆에 붙인다(D27).
 *
 * 「전체에서 / 이 폴더에서」 토글을 두지 않는 대신, **서 있는 자리가 곧 범위**임을
 * 글자로 말한다. 고르는 장치를 없애면 틀리게 고를 일도 없어진다.
 */
export function scopeLabel(path: Crumb[]): string {
  if (!path.length) return '내 자료 전체에서'
  return `${path[path.length - 1].name} 아래에서`
}

// ══════════════════════════════════════════════════════════
// 트리 · 검색 범위 (D27)
// ══════════════════════════════════════════════════════════

export interface FolderNode {
  id: string
  name: string
  parent_id: string | null
  folder_count: number
  project_count: number
}

/** 이 폴더 바로 아래 한 단. 이름순 — 서버가 이미 정렬해 주지만 화면이 다시 믿지 않는다. */
export function childrenOf(all: FolderNode[], parentId: string | null): FolderNode[] {
  return all
    .filter((f) => (f.parent_id || null) === (parentId || null))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/**
 * 이 폴더와 그 **아래 전부**의 id.
 *
 * 검색이 이 집합을 쓴다(D27 — 「목록은 한 단계만, 검색은 하위를 본다」).
 * `rootId` 가 null 이면 **모든** 폴더 + 최상위(null)를 뜻한다.
 * 깨진 부모 링크가 있어도 무한히 돌지 않게 방문한 것을 기억한다.
 */
export function subtreeIds(all: FolderNode[], rootId: string | null): Set<string | null> {
  const out = new Set<string | null>([rootId])
  if (rootId === null) {
    for (const f of all) out.add(f.id)
    return out
  }
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift() as string
    for (const f of all) {
      if ((f.parent_id || null) === cur && !out.has(f.id)) {
        out.add(f.id)
        queue.push(f.id)
      }
    }
  }
  return out
}

export interface ProjectLike {
  id: string
  name: string
  updated_at: number
  folder_id?: string | null
}

export interface ScopeInput {
  projects: ProjectLike[]
  folders: FolderNode[]
  /** 지금 서 있는 폴더. null = 최상위. */
  here: string | null
  query: string
  /** yyyy-mm-dd. 빈 값이면 안 거른다. */
  from?: string
  to?: string
}

/**
 * 지금 자리에서 보여줄 자료.
 *
 * **검색어가 없으면 이 폴더에 직접 든 것만**(한 단계).
 * **검색어가 있으면 이 폴더 아래 전부.** — D27.
 * 「전체에서 / 이 폴더에서」 토글을 두지 않는다. 서 있는 자리가 곧 범위이므로
 * 고를 것이 없고, 고르는 장치를 없애면 틀리게 고를 일도 없어진다.
 *
 * 날짜는 검색어와 **함께** 걸린다 — 표준 조회줄의 세 칸은 AND 다.
 */
export function scopedProjects(input: ScopeInput): ProjectLike[] {
  const { projects, folders, here } = input
  const term = (input.query || '').trim()
  const fromTs = input.from ? new Date(input.from + 'T00:00:00').getTime() : -Infinity
  const toTs = input.to ? new Date(input.to + 'T23:59:59').getTime() : Infinity
  const searching = !!term || !!input.from || !!input.to
  const scope = searching ? subtreeIds(folders, here) : new Set<string | null>([here])

  return projects.filter((p) => {
    if (!scope.has(p.folder_id || null)) return false
    const u = p.updated_at || 0
    if (u < fromTs || u > toTs) return false
    if (!term) return true
    return (p.name || '').includes(term) || p.id.includes(term)
  })
}

/** 이 폴더 안(하위 포함)에 자료가 몇 건인가 — 폴더 칸에 적어 준다. */
export function countInSubtree(
  projects: ProjectLike[], folders: FolderNode[], rootId: string,
): number {
  const scope = subtreeIds(folders, rootId)
  return projects.filter((p) => scope.has(p.folder_id || null)).length
}
