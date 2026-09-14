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

import type { Page } from '../state/store'

export interface FitResult {
  pages: Page[]
  /** 옮긴 요소 수. 0이면 아무 말도 할 필요가 없다. */
  moved: number
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
  const out = pages.map((p) => {
    if (!p || !Array.isArray(p.els) || !p.els.length) return p
    let touched = false
    const els = p.els.map((e) => {
      if (!e) return e
      const x = clamp(e.x, Math.max(0, W - e.w))
      const y = clamp(e.y, Math.max(0, H - e.h))
      if (x === e.x && y === e.y) return e
      touched = true
      moved++
      return { ...e, x, y }
    })
    return touched ? { ...p, els } : p
  })
  return { pages: moved ? out : pages, moved }
}
