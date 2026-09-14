// **이 장에 줄이 몇 개나 더 들어가는가.**
//
// **왜 필요한가.** 로드맵 표에 줄을 계속 넣으면 이런 일이 벌어지고 있었다
// (세로 720 종이 · 표 윗변 94 · 한 줄 40 · 머리글 2줄 · 꼬리말 자리 50):
//
//     본문 12줄  정상
//     본문 13줄  꼬리말 자리를 덮는다                      ← 화면은 아무 말 없음
//     본문 14줄  표가 **위로 기어 올라간다**(윗변 94 → 80)  ← 아무 말 없음
//     본문 15줄  더 올라가 제목 글상자를 파고든다(→ 40)     ← 아무 말 없음
//     본문 16줄  종이를 통째로 덮는다(→ 0)                 ← **이제야** 경고
//     본문 17줄~ 줄 높이가 줄기 시작한다(37.9 → 34.3 → …)
//
// 옛 판정은 「표 높이 ≥ 종이 높이」였다. **네 줄 늦다.** 그때는 이미 표가 종이를
// 통째로 덮고 있다. 그래서 판정을 **「한 줄 더 넣으면 꼬리말을 넘는가」**로 바꾼다.
//
// **왜 「종이 아래끝」이 아니라 꼬리말 띠까지인가.** 종이 아래끝으로 재면 꼬리말을
// 덮는 구간을 못 잡는다. 종이 아래 50px 은 꼬리말이 앉는 자리다.
//
// **꼬리말 글상자의 지금 y 로 재는 길은 안 된다.** 처음에 그걸로 만들었다가 실물에서
// 걸렸다 — 꼬리말은 **만들 때 표 바로 밑에** 놓인다. 5줄짜리 양식이면 y=392 이고,
// 그걸 한계로 삼으면 표가 처음부터 「꽉 찼다」가 되어 줄 하나만 더해도 새 쪽이 생긴다.
// 한계는 **종이가 정하는 것**이지 지금 배치가 정하는 것이 아니다.
//
// 그래서 `sizing.FOOT_ZONE`(50)을 쓴다. 서버 `template_seed.FOOT_ZONE` 의 거울이고
// `test_template_geometry.py` 가 두 값이 같은지 지킨다 — DECK_W/DECK_H 와 같은 방식이다.
// 이렇게 재면 표준 양식에서 12줄이 나오고, 서버 `_max_data_rows()` 와 같은 답이다.

import type { FreeEl } from '../state/store'
import { FOOT_ZONE } from '../cards/sizing'

/** 이 쪽에서 표가 쓸 수 있는 **아래 한계선** — 꼬리말 자리 위까지. */
export function bottomLimit(pageH: number): number {
  return Math.max(0, pageH - FOOT_ZONE)
}

/** 한 줄의 높이. 줄 수가 없으면 0 — 부르는 쪽이 「모른다」로 다룬다. */
export function rowHeight(el: Pick<FreeEl, 'h' | 'rows'>): number {
  const r = el.rows || 0
  return r > 0 ? el.h / r : 0
}

/**
 * **한 줄 더 넣으면 한계선을 넘는가.**
 *
 * 경고를 띄우는 조건이자 다음 장으로 잇는 조건이다 — **둘이 같아야 한다.**
 * 갈라 두면 「경고는 떴는데 안 이어진다」나 그 반대가 생긴다.
 *
 * 이미 망가진 옛 자료(높이가 종이에 맞춰 잘리고 윗변이 0 이 된 것)에서도
 * `y + h` 가 이미 한계선을 넘으므로 그대로 참이 된다 — 따로 챙길 일이 없다.
 */
export function isFull(el: Pick<FreeEl, 'y' | 'h' | 'rows'>, limit: number): boolean {
  const rh = rowHeight(el)
  if (!(rh > 0)) return false          // 줄 수를 모르면 판정하지 않는다
  return el.y + el.h + rh > limit
}

/**
 * 이 장에 들어가는 **본문** 줄 수. 화면에 「이 장은 N줄까지입니다」로 쓴다.
 *
 * 숫자를 말해 주는 것과 「찼다」고만 말하는 것은 다르다 — 12를 알면 사람이
 * 미리 나눠 쓸 수 있고, 「찼다」만 알면 다 쓰고 나서야 안다.
 */
export function dataCapacity(el: Pick<FreeEl, 'y' | 'h' | 'rows'>, headRows: number,
                             limit: number): number {
  const rh = rowHeight(el)
  if (!(rh > 0)) return 0
  return Math.max(0, Math.floor((limit - el.y) / rh) - headRows)
}
