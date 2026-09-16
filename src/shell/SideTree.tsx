// 사이드바 나무 — 「내 자료」 아래에 폴더와 자료를 펼친다.
//
// **한 줄에 누를 곳이 둘이다**(사용자 결정 ⑥).
//
//   · 아이콘 자리 — 접고 편다. **화면은 그대로.** 평소엔 폴더 그림이다가
//     마우스를 올리면 그 자리가 ▾ 로 바뀐다.
//   · 이름 — 폴더면 그 폴더의 목록으로 가고, 자료면 **그 자료를 연다.**
//     자료를 열 때 목록 화면을 거치지 않는다 — 그게 나무를 놓은 이유다.
//
// 어떤 줄이 나오는지는 `sideTree.ts` 가 정한다. 여기는 **그리고 누르는 일**만 한다.
import { useEffect, useState } from 'react'
import { useProjects } from '../persistence/projects'
import {
  shellTreeOpen, rememberShellTreeOpen, shellTreeCol, rememberShellTreeCol,
} from '../persistence/prefs'
import { treeRows, TREE_OPEN_DEFAULT, TREE_ROOT } from './sidebarTree'

/** 펴 둔 폴더. **모듈 밖에 둔다** — 사이드바는 화면이 바뀌어도 살아 있어야 하고,
 *  그 값은 사람마다 브라우저에 남는다. 아무것도 고른 적 없으면 `TREE_OPEN_DEFAULT`
 *  (= 전부 접힘)로 시작한다. 「아직 안 골랐음(null)」과 「전부 접어 둠([])」을 가려
 *  읽으므로, 전부 접은 사람이 들어올 때마다 뿌리가 도로 펴지는 일은 없다. */
function firstOpen(): Set<string> {
  const saved = shellTreeOpen()
  return new Set(saved === null ? TREE_OPEN_DEFAULT : saved)
}

/** 나무를 제 칸으로 뺐는가(①). 셸이 들고 있다 — 칸을 하나 더 그릴지 정하는 값이다. */
export function useTreeCol() {
  const [col, setCol] = useState<boolean>(shellTreeCol)
  const swap = () => setCol((v) => { rememberShellTreeCol(!v); return !v })
  return { col, swap }
}

export function useTreeOpen() {
  const [open, setOpen] = useState<Set<string>>(firstOpen)
  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      rememberShellTreeOpen([...next])
      return next
    })
  }
  return { open, toggle }
}

/** **펴 둔 상태는 셸이 들고 내려보낸다.** 여기서 `useTreeOpen()` 을 또 부르면
 *  뿌리(「내 자료」)의 ▾ 와 나무가 **서로 다른 값을 보게 된다** — 나무를 접어도
 *  위 화살표는 펴진 채로 남고, 다음 렌더에 도로 펴진다. */
export default function SideTree({ open, toggle, onGo, col, onSwap }: {
  open: Set<string>
  toggle: (id: string) => void
  /** 폴더나 「더 보기」를 눌렀다 — 셸이 목록 화면으로 옮긴다. */
  onGo: () => void
  /** 제 칸에 그려지고 있는가(①). 칸 안에서는 **뿌리를 접지 않는다** —
   *  칸 하나를 통째로 비우는 접기는 뜻이 없고, 다시 펼 자리도 사라진다. */
  col: boolean
  onSwap: () => void
}) {
  const folders = useProjects((s) => s.folders)
  const list = useProjects((s) => s.list)
  const here = useProjects((s) => s.here)
  const view = useProjects((s) => s.view)
  const activeId = useProjects((s) => s.activeId)
  const setHere = useProjects((s) => s.setHere)
  const loadFolders = useProjects((s) => s.loadFolders)
  const foldersError = useProjects((s) => s.foldersError)
  const openProject = useProjects((s) => s.openProject)

  // **폴더를 여기서도 받아 온다.** 예전에는 자료 목록 화면만 받아 왔다 —
  // 편집 중에 사이드바를 펴면 나무가 비어 있었다. 실패하면 **조용히 지나간다**:
  // 나무가 비는 것과 화면에 빨간 줄이 뜨는 것은 다른 무게다.
  useEffect(() => { void loadFolders().catch(() => { /* 나무는 부가 정보다 */ }) }, [loadFolders])

  const rows = treeRows(folders, list, col ? new Set([...open, TREE_ROOT]) : open)
  // 메뉴 안에 있을 때는 접으면 **통째로 사라진다**(위 「내 자료」의 ▾ 로 다시 편다).
  // 제 칸일 때는 머리줄이 남아야 한다 — 안 그러면 합칠 자리가 없어진다.
  // **못 읽었으면 빈 채로 사라지지 않는다**(2026-09-16) — 그때는 그 한 줄을 띄운다.
  if (!col && !rows.length && !foldersError) return null

  return (
    <div className={'sh-tree' + (col ? ' col' : '')} role="group" aria-label="폴더와 자료">
      {/* **머리줄은 제 칸일 때만 여기 있다**(2026-09-15).
          메뉴 안에 있을 때는 이 자리가 「내 자료」 바로 아래라, 줄이 하나 더 생기면서
          바꾸는 글자가 어중간하게 떠 있었다. 그건 나무의 머리가 아니라 **「내 자료」의
          머리**여야 하므로, 그 줄 오른쪽 끝으로 옮겼다(`AppShell`) — 제 칸의
          「합치기」가 칸 머리줄에 있는 것과 같은 자리다. */}
      {col && (
        <div className="sh-thead">
          <span className="t">폴더</span>
          <button className="sh-tswap" onClick={onSwap} title="메뉴 안으로 합친다">합치기</button>
        </div>
      )}
      {/* **폴더가 사라진 것과 없는 것은 다르다**(2026-09-16). 못 읽으면 나무는
          조용히 지나가는데(부가 정보라서), 그러면 폴더가 **아무 말 없이 없어진다** —
          실제로 그렇게 없어져서 왜 그런지 찾는 데 한참 걸렸다. 삼키되 자국은 남긴다. */}
      {foldersError && (
        <div className="sh-terr">
          폴더를 못 읽었어요.
          <button onClick={() => void loadFolders().catch(() => { /* 그대로 둔다 */ })}>다시</button>
        </div>
      )}
      {rows.map((r) => {
        const isFolder = r.kind === 'folder'
        const on = isFolder
          ? (view === 'library' && here === r.id)
          : (r.kind === 'doc' && view === 'editor' && activeId === r.id)
        return (
          <div key={r.kind + r.id} className={'sh-trow' + (on ? ' on' : '') + (r.hasKids ? ' kids' : '')}
            style={{ paddingLeft: 10 + r.depth * 13 }}>
            {r.hasKids ? (
              <button className={'sh-tfold' + (r.open ? '' : ' shut')} onClick={() => toggle(r.id)}
                aria-expanded={r.open} aria-label={(r.open ? '접기 · ' : '펴기 · ') + r.name}
                title={r.open ? '접기' : '펴기'}>
                <span className="em">{r.open ? '📂' : '📁'}</span>
                <span className="ar">▾</span>
              </button>
            ) : (
              <span className="sh-tfold flat" aria-hidden="true">
                <span className="em">{r.kind === 'more' ? '⋯' : isFolder ? '📁' : '📄'}</span>
              </span>
            )}
            <button className="sh-tname" title={r.name}
              onClick={() => {
                if (r.kind === 'doc') { void openProject(r.id); return }
                // 폴더와 「더 보기」는 둘 다 **목록 화면**으로 간다.
                // 「더 보기」를 누른 사람은 나머지를 보고 싶은 것이고, 그건 목록이 하는 일이다.
                setHere(r.id || null)
                onGo()
              }}>
              {r.kind === 'more' ? `더 보기 (${r.count})` : r.name}
            </button>
            {isFolder && r.count > 0 ? <span className="sh-tc">{r.count}</span> : null}
          </div>
        )
      })}
    </div>
  )
}
