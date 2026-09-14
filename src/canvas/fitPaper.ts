// 종이 밖으로 나간 요소를 **안으로 끌어들인다** — 방향을 바꿀 때(사용자 결정 ㄴ).
//
// **왜 필요한가.** 방향을 바꾸면 종이 크기만 바뀌고 **요소 좌표는 그대로**다.
// 가로(1040×720)에서 만든 것을 세로(432×576)로 바꾸면 오른쪽에 있던 것들이
// 종이 밖에 남는다. 화면에서는 잘려서 안 보이고, **내보내야 없어진 걸 안다.**
//
// **왜 「비율대로 다시 배치」가 아닌가.** 그림은 그쪽이 곱다. 그런데 사람이
// 맞춰 둔 자리가 **전부** 바뀐다 — 안 나간 것까지. 방향 한 번 눌렀다고
// 공들여 놓은 배치가 통째로 흐트러지면, 그건 고쳐 준 게 아니라 망가뜨린 것이다.
// 그래서 **밖으로 나간 것만** 가장자리 안쪽으로 민다. 겹칠 수는 있어도 잃지는 않는다.
//
// **조용히 하지 않는다.** 옮겨 놓고 말을 안 하면 「내가 놓은 자리가 아닌데」가 된다.
// 부르는 쪽이 몇 개를 옮겼는지 받아서 한 줄로 알린다.

import type { Page, FreeEl } from '../state/store'
import { relayoutMindmap } from '../cards/mindmapEls'
import { relayoutTree } from '../cards/treeEls'

export interface FitResult {
  pages: Page[]
  /** 옮긴 요소 수. 0이면 아무 말도 할 필요가 없다. */
  moved: number
  /** 옮기고 나서 **다른 것과 겹친** 요소 수. 옮겼다는 말만 하고 겹쳤다는 말을
   *  안 하면, 사람은 무엇이 어디 갔는지 못 찾는다. */
  overlapping: number
}

/** 한 값을 [0, max] 안으로. */
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))

/**
 * 모든 쪽의 요소를 새 종이 안으로 끌어들인다.
 *
 * **안 나간 것은 손대지 않는다** — 좌표가 그대로면 같은 객체를 그대로 둔다.
 * 새 객체를 만들면 리액트가 「바뀌었다」고 보고 다시 그리고, 되돌리기 이력에도
 * 안 바뀐 것이 바뀐 것처럼 쌓인다.
 *
 * 요소가 종이보다 **크면** 왼쪽 위에 맞춘다. 줄이지 않는다 —
 * 크기를 건드리면 표의 칸 너비 같은 것이 같이 망가진다.
 */
export function fitPagesToPaper(pages: Page[], W: number, H: number): FitResult {
  let moved = 0
  let overlapping = 0
  const out = pages.map((p) => {
    if (!p || !Array.isArray(p.els) || !p.els.length) return p

    // **그림은 자르지 않고 통째로 다시 앉힌다**(ㄱ · 2026-09-14).
    // 자르면 오른쪽 절반이 전부 같은 x 로 가서 포개진다 — 마인드맵 가지 8개짜리는
    // 다섯 개가 한 줄에 쌓였다. 트리는 레벨과 줄이 곧 뜻이라 더 심하다.
    // 둘 다 아니면 null 이 오고, 그때는 평소대로 자른다.
    // 트리는 **방향이 바뀔 수 있다** — 세로 종이에 왼→오른 4레벨은 안 들어간다.
    // 눕히면 같은 그림이 그대로 들어가고, 관계는 하나도 안 잃는다.
    const tree = relayoutTree(p, W, H)
    const base = relayoutMindmap(p, W, H) || (tree ? tree.els : null) || p.els

    let touched = false
    const els = base.map((e, i) => {
      if (!e) return e
      const x = clamp(e.x, Math.max(0, W - e.w))
      const y = clamp(e.y, Math.max(0, H - e.h))
      const out = (x === e.x && y === e.y) ? e : { ...e, x, y }
      // **원래 자리와 견준다.** 다시 앉히기까지 거친 뒤라, 바로 앞 값과 견주면
      // 다시 앉히며 옮긴 것을 안 센다.
      const was = p.els[i]
      if (was && (out.x !== was.x || out.y !== was.y)) { moved++; touched = true }
      return out
    })
    if (!touched) return (tree && tree.dir !== p.treeDir) ? { ...p, treeDir: tree.dir } : p
    overlapping += countOverlapping(els)
    // 눕혔으면 **그 사실을 쪽에 적어 둔다.** 안 적으면 다음에 다시 앉힐 때
    // 옛 방향으로 자리를 되읽어 레벨이 통째로 밀린다.
    return tree ? { ...p, els, treeDir: tree.dir } : { ...p, els }
  })
  return { pages: moved ? out : pages, moved, overlapping }
}

/** 다른 것과 한 군데라도 겹치는 요소의 수. 쪽마다 요소가 몇십 개라 제곱으로 훑어도 된다. */
function countOverlapping(els: (FreeEl | undefined)[]): number {
  const hit = new Set<number>()
  for (let i = 0; i < els.length; i++) {
    const a = els[i]; if (!a) continue
    for (let j = i + 1; j < els.length; j++) {
      const b = els[j]; if (!b) continue
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0) { hit.add(i); hit.add(j) }
    }
  }
  return hit.size
}
