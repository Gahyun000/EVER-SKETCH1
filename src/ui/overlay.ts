import { useEffect } from 'react'

/**
 * **위를 덮고 있는 것이 있는가.**
 *
 * 2026-09-18 · 발표 중 Esc 가 안 닫히는 것을 쫓다가 나온 두 번째 까닭이다.
 * 첫 번째(리스너가 키 퍼지는 도중에 떼였다 붙는 것)를 고치고 나서도, **표 칸을 하나
 * 골라 둔 채로 발표를 시작하면 여전히 안 닫혔다.**
 *
 * 캔버스(`FreeLayer`)가 표 칸 조작용으로 **window 의 capture 단계**에서 키를 듣는데,
 * Escape 를 받으면 「고른 칸 풀기」로 삼고 `stopPropagation` 한다. capture 는 제일 먼저다 —
 * 그래서 **위에 전체 화면이 덮여 있어도 캔버스가 키를 먼저 먹어 치웠다.** 발표 화면은
 * 그 키를 구경도 못 했다.
 *
 * 규칙은 간단하다. **위를 덮은 것이 있으면 아래는 키를 건드리지 않는다.**
 *
 * 리액트 상태가 아니라 **모듈 안의 수**로 센다. 이 값은 그리는 동안이 아니라
 * **키가 왔을 때** 읽히므로, 상태로 두면 아무 이득 없이 캔버스가 통째로 다시 그려진다.
 * (그 「다시 그리기」가 바로 첫 번째 결함의 원인이었다 — 같은 덫을 두 번 밟지 않는다.)
 *
 * 세는 것이지 참/거짓이 아니다. 발표 위에 모달이 또 뜨는 일이 있어서, 하나가 닫혔다고
 * 해서 아래가 곧바로 키를 가져가면 안 된다.
 */
let depth = 0

export function overlayOpen(): boolean { return depth > 0 }

/** 시험용. 실제 코드에서는 쓰지 않는다. */
export function _resetOverlays(): void { depth = 0 }

/** 전체 화면으로 덮는 것이 열려 있는 동안만 센다. */
export function useOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return
    depth += 1
    return () => { depth = Math.max(0, depth - 1) }
  }, [open])
}
