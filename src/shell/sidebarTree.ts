// 사이드바 나무 — 무엇을 어떤 차례로 보일지 정하는 **순수 함수**.
//
// **왜 나무인가.** 지금까지 폴더는 목록 위의 카드 5열이었다. 들어가면 카드가 사라지고
// 나오려면 위 경로를 눌러야 했다. 그래서 「지금 어디 있나」와 「어디로 갈 수 있나」를
// 같이 볼 수가 없었고, 자료를 열려면 반드시 목록 화면을 거쳐야 했다.
// 나무로 두면 둘 다 왼쪽에 늘 있고, **자료를 사이드바에서 바로 연다.**
//
// **왜 자료까지만 내려가나**(사용자 결정 ⑨ㄱ). 쪽까지 펼치면 편집기 왼쪽 필름과
// 같은 일을 하는 자리가 둘이 된다. 쪽을 고르는 곳은 한 군데여야 한다.
//
// **왜 화면(tsx)이 아니라 여기인가.** 「몇 개까지 보이나」·「어느 차례인가」·
// 「접힌 폴더 아래는 안 센다」 같은 것은 눈으로 확인하기 어려운 규칙이다.
// 순수 함수로 떼어 두면 시험이 값으로 잡는다.
import { childrenOf, countInSubtree, type FolderNode, type ProjectLike } from '../persistence/folderNav'

/** 뿌리(「내 자료」)의 열림 상태를 담는 자리. **폴더 id 와 겹치지 않는 글자**를 쓴다 —
 *  폴더 id 는 `f...` 꼴이라 `~` 는 절대 안 나온다. */
export const TREE_ROOT = '~'

/** 한 폴더 아래에 **바로 보이는** 자료 수(사용자 결정 ⑩ㄱ).
 *
 *  사이드바는 **자주 가는 곳**이고, 전부 훑는 곳은 목록 화면이다. 폴더 하나에 쉰 개가
 *  쌓였는데 다 펼치면 결재함이 스크롤 아래로 밀려난다 — 나무를 만든 이유가 사라진다.
 *  넘치면 「⋯ 더 보기 (38)」 한 줄이 붙고, 누르면 그 폴더의 목록 화면으로 간다. */
export const TREE_DOCS = 10

export interface TreeRow {
  kind: 'folder' | 'doc' | 'more'
  /** 폴더 id · 자료 id · (더 보기는) 그 폴더 id. 뿌리의 「더 보기」는 '' 이다. */
  id: string
  name: string
  /** 뿌리 바로 아래가 0. 화면은 이 값으로 들여쓴다. */
  depth: number
  /** 펼칠 것이 있는 폴더인가 — 아래 폴더든 자료든 하나라도 있으면 참. */
  hasKids: boolean
  /** 지금 펼쳐져 있는가(폴더만). */
  open: boolean
  /** 폴더: 그 아래 **전부**의 자료 수. 더 보기: 아직 안 보인 수. */
  count: number
}

/**
 * 나무에 그릴 줄을 차례대로 만든다.
 *
 * `open` 에 `TREE_ROOT` 가 없으면 **빈 배열**이다 — 「내 자료」를 접었다는 뜻이다.
 *
 * 한 폴더 안의 차례는 **폴더 먼저, 그다음 자료**다. 폴더는 이름순(`childrenOf`),
 * 자료는 받아 온 차례 그대로 둔다 — 서버가 `updated_at DESC` 로 준다. 그래서 위에서
 * 잘리는 것은 늘 **오래된 것**이고, 방금 만지던 자료는 언제나 보인다.
 */
export function treeRows(
  folders: FolderNode[], projects: ProjectLike[], open: Set<string>, limit = TREE_DOCS,
): TreeRow[] {
  const rows: TreeRow[] = []
  if (!open.has(TREE_ROOT)) return rows

  // **같은 폴더를 두 번 그리지 않는다.** 이 걷기는 부모를 따라 **내려가기만** 하므로
  // 고리에는 애초에 닿지 않는다(고리 안의 폴더는 부모 사슬에 null 이 없어 뿌리에서 못 온다).
  // 막는 것은 다른 것이다 — **id 가 겹친 줄**이 목록에 들어오는 경우다. 서버가 같은 폴더를
  // 두 번 내려주거나 두 응답이 겹쳐 담기면 `childrenOf` 가 같은 id 를 두 번 돌려주고,
  // 그러면 그 아래 가지가 통째로 두 번 그려진다. 한 번 그린 폴더는 다시 안 그린다.
  const seen = new Set<string>()

  const walk = (parent: string | null, depth: number) => {
    for (const f of childrenOf(folders, parent)) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      const kids = childrenOf(folders, f.id).length + docsIn(projects, f.id).length
      const isOpen = open.has(f.id)
      rows.push({
        kind: 'folder', id: f.id, name: f.name, depth,
        hasKids: kids > 0, open: isOpen,
        count: countInSubtree(projects, folders, f.id),
      })
      if (isOpen) walk(f.id, depth + 1)
    }
    const docs = docsIn(projects, parent)
    for (const p of docs.slice(0, limit)) {
      rows.push({ kind: 'doc', id: p.id, name: nameOf(p), depth, hasKids: false, open: false, count: 0 })
    }
    if (docs.length > limit) {
      rows.push({
        kind: 'more', id: parent || '', name: '더 보기', depth,
        hasKids: false, open: false, count: docs.length - limit,
      })
    }
  }
  walk(null, 0)
  return rows
}

/** 그 폴더에 **바로** 든 자료. 하위 폴더 것은 안 센다 — 나무가 그 자리에서 또 보여 준다. */
function docsIn(projects: ProjectLike[], folderId: string | null): ProjectLike[] {
  return projects.filter((p) => (p.folder_id || null) === (folderId || null))
}

/** 이름 없는 자료도 **한 줄을 차지해야 한다.** 빈 글자면 누를 곳이 사라진다 —
 *  방금 만든 「제목 없음」이 나무에서만 안 보이면 없어진 줄 안다. */
function nameOf(p: ProjectLike): string {
  return (p.name || '').trim() || '제목 없음'
}
