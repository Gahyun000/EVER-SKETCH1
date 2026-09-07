// 표가 종이 끝에 닿으면 **다음 장으로 이어진다**.
//
// ── 무엇을 만드는가 ────────────────────────────────
// 한 표가 여러 장에 걸치는 개념은 이 저장소에 없다. 요소는 한 쪽에 속하고 x/y/w/h 를
// 갖는다. 그래서 「한 표를 여러 쪽에 걸쳐 그린다」가 아니라
// **「조각으로 나누되 한 표라고 표시한다」**로 만든다.
//
//     머리 조각   contFrom 이 없다. 표의 시작이다.
//     이은 조각   contFrom = 앞에 있던 **본문 행의 개수**. 머리글 행은 다시 붙인다.
//
// ── 왜 조각이 한 표여야 하는가 ──────────────────────
// 취합은 슬롯 이름으로 표를 찾는다. 조각이 그냥 별개의 표가 되면 SLOT-A 가 둘이 되어
// 「어느 게 진짜 로드맵인가」를 정할 수 없다. 그래서 조각에는 반드시 contFrom 이 있고,
// server/template_guard.py 는 contFrom 이 있는 것을 세지 않는다 —
// 그 규칙은 이 기능을 만들기 전에 미리 넣어 두었다.
//
// ── 머리글을 다시 붙이는 이유 ───────────────────────
// 2쪽만 펼친 사람에게 열 이름이 없으면 18열짜리 표는 숫자 덩어리다.
// 종이 문서가 표를 나눌 때 늘 하는 일이기도 하다.
//
// ── 하지 않는 것 ──────────────────────────────────
// **되흐름(reflow)이 없다.** 가운데에 행을 끼워 넣어도 마지막 행이 다음 장으로
// 밀려가지 않는다. 그건 쪽을 「흐름」으로 바꾸는 일이고, 지금 구조에서는 훨씬 큰 공사다.
// 여기서 하는 것은 「끝에 계속 적다가 종이가 차면 다음 장에서 이어 적는다」뿐이다.
// **store 에서 값을 가져오지 않는다.** store 가 이 파일을 쓰므로 값을 되가져오면
// 순환 참조가 된다(history.ts 를 model.ts 에서 떼어낸 것과 같은 이유).
// 그래서 새 id 는 부르는 쪽이 준다.
import type { FreeEl } from '../state/store'

/** 이 표가 앞 장에서 이어진 조각인가. */
export function isContinuation(el: Pick<FreeEl, 'contFrom'>): boolean {
  return typeof el.contFrom === 'number' && el.contFrom > 0
}

/** 이 조각이 들고 있는 **본문** 행 수 (머리글 행을 뺀 나머지). */
export function dataRows(el: Pick<FreeEl, 'rows'>, headRows: number): number {
  return Math.max(0, (el.rows || 0) - headRows)
}

/**
 * 이 표에 행을 하나 더 넣으면 종이를 넘는가.
 *
 * **위로 밀어 올려서 해결하지 않는다.** 표의 윗변은 그 자리에 있고 아래로 자란다 —
 * 위로 밀면 제목 글상자를 덮으면서 자라고, 사용자 눈에는 표가 스스로 기어 올라가는
 * 것으로 보인다. 아래가 막히면 그때가 다음 장으로 갈 때다.
 */
export function overflows(el: Pick<FreeEl, 'y'>, nextH: number, pageH: number): boolean {
  return el.y + nextH > pageH
}

/**
 * 이은 조각을 만든다. 머리 조각의 생김새를 그대로 물려받고 **본문은 빈 한 줄**로 시작한다.
 *
 * `priorDataRows` 는 이 조각 앞에 있던 본문 행의 총수다 —
 * 화면에 「N행부터 이어짐」이라고 적고, 조각들의 순서를 정하는 근거이기도 하다.
 */
export function makeContinuation(head: FreeEl, priorDataRows: number,
                                 headRows: number, y: number, newId: number): FreeEl {
  const cols = head.cols || 1
  const headCells = (head.cells || []).slice(0, headRows).map((r) => r.slice())
  while (headCells.length < headRows) headCells.push(Array.from({ length: cols }, () => ''))
  const cells = [...headCells, Array.from({ length: cols }, () => '')]

  // 머리글 행의 색만 물려받는다. 본문 칸 색(진행 구간)은 그 행의 것이라 따라오면 안 된다.
  const cbg: Record<string, string> = {}
  for (const k of Object.keys(head.cbg || {})) {
    const r = Number(k.split('_')[0])
    if (r < headRows) cbg[k] = (head.cbg as Record<string, string>)[k]
  }

  // 머리글을 가로로 묶은 병합(예: '2026' 이 12칸)은 그대로 가져온다.
  // 본문에 걸친 병합은 그 행의 것이므로 두고 온다.
  const merges = (head.merges || []).filter((m) => m.r + m.rs - 1 < headRows).map((m) => ({ ...m }))

  const rows = headRows + 1
  const rowH = (head.h || 0) / Math.max(1, head.rows || 1)
  return {
    ...head,
    id: newId,
    y,
    h: Math.max(1, Math.round(rowH * rows)),
    rows,
    cells,
    cbg,
    merges,
    calign: {},
    cvalign: {},
    cfs: {},
    rowh: undefined,          // 머리 조각의 행별 비율은 행 수가 달라 뜻이 안 맞는다
    contFrom: priorDataRows,
  }
}

/** 화면에 붙이는 이름표. 「(계속)」이 없으면 같은 표가 두 번 나온 것처럼 보인다. */
export function continuationLabel(el: Pick<FreeEl, 'contFrom'>): string {
  return isContinuation(el) ? `(계속 — ${(el.contFrom as number) + 1}번째 줄부터)` : ''
}
