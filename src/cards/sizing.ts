import type { Orientation } from '../state/store'

/**
 * 페이지(종이)의 논리 크기 — 자유 캔버스 요소(FreeEl)의 x/y/w/h 가 쓰는 좌표계다.
 *
 * 가로 덱을 640×482 에서 **1040×720 으로 키웠다.** 두 가지 이유가 있다.
 *   1) 비율 — 임원회의 실물 PPT 가 10.83 × 7.50 in(1.444:1)이다.
 *      640×482(1.328:1)에 그대로 넣으면 위아래에 빈 띠가 생기고,
 *      "실물 그대로" 보여준다는 약속이 첫 화면부터 깨진다.
 *   2) 해상도 — 로드맵 표가 18열이다. 640px 폭에서는 한 칸이 30px 남짓이라
 *      월 숫자조차 줄바꿈된다. 편집이 불가능한 크기다.
 *
 * SC(타이포 배율)의 기준을 440 → 720 으로 함께 옮긴 것이 중요하다.
 * 640/440 = 1.4545, 1040/720 = 1.4444 — 카드 레이아웃의 글자 크기는 사실상 그대로다.
 * 기준을 안 옮기면 SC 가 2.36 으로 뛰어 기존 카드의 글씨가 통째로 커진다.
 */
export const DECK_W = 1040
export const DECK_H = 720
export const BOOK_W = 432
export const BOOK_H = 576

/**
 * 종이 **아래에 비워 두는 띠**. 꼬리말이 앉는 자리다.
 *
 * 서버 `template_seed.FOOT_ZONE`(= FOOT_GAP 18 + FOOT_H 16 + BOTTOM_PAD 16)의 거울이다.
 * `test_template_geometry.py` 가 두 값이 같은지 확인한다 — DECK_W/DECK_H 와 같은 방식이다.
 *
 * **꼬리말 글상자의 지금 y 로 재면 안 된다.** 꼬리말은 만들 때 표 바로 밑에 놓이므로
 * (5줄짜리 양식이면 y=392), 그걸 한계로 삼으면 표가 처음부터 「꽉 찼다」가 된다.
 * 한계는 **종이가 정하는 것**이지 지금 배치가 정하는 것이 아니다.
 */
export const FOOT_ZONE = 50

export function pageSize(orientation: Orientation) {
  const land = orientation === 'landscape'
  const W = land ? DECK_W : BOOK_W
  const H = land ? DECK_H : BOOK_H
  const SC = land ? W / 720 : H / 400
  return { W, H, SC, land }
}

/** 화면 안내 문구용 비율 표기 ('1.44:1'). */
export function ratioLabel(orientation: Orientation): string {
  const { W, H } = pageSize(orientation)
  return (W / H).toFixed(2) + ':1'
}
