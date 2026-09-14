// 창이 좁아지면 **곁의 패널을 스스로 접어 종이에게 자리를 내준다** (사용자 결정 ㄱ).
//
// **무엇이 문제였나.** 필름(212px)과 오른쪽 패널(336px)은 창이 좁아져도 줄지 않는다.
// 합쳐서 548px 이 늘 먼저 나가고 남는 것만 작업 무대가 된다. 게다가 맞춤 배율에는
// 바닥이 없어서 얼마든지 작아진다 — 1024 창에서 종이가 **37%**, 왼쪽 필름 썸네일의
// 두 배도 안 된다. 「종이가 안 보인다」는 사라지는 게 아니라 쪼그라드는 것이었다.
//
// **왜 접기인가.** 접는 연장은 이미 있었다(무대 양 끝의 ‹ › 손잡이). 1024에서 손으로
// 둘 다 접으면 37% → 72% 로 **완전히 돌아온다.** 못 쓰던 이유는 둘뿐이다 —
// 손잡이가 안 보이고, 손으로 해야 한다. 그래서 판단만 대신 해 준다.
//
// **사람이 손댄 쪽은 건드리지 않는다.** 이 함수는 「자동」인 쪽만 정한다.
// 한 번이라도 손잡이를 누르면 그 패널은 이 함수의 관할에서 빠진다(Layout 이 가른다).
// 자동이 사람의 선택을 되돌리면, 그게 바로 「패널이 저 혼자 움직인다」는 느낌이다.

/** 한 번의 판단에 필요한 것 전부. DOM 을 안 본다 — 그래야 검사할 수 있다. */
export interface FoldInput {
  /** 세 칸이 나눠 쓰는 폭(.ax-body). 패널을 접어도 **이 값은 안 변한다** —
   *  그래서 접었다 폈다 하는 되먹임이 생기지 않는다. */
  bodyW: number
  /** 무대의 높이. 가로 폭이 아니라 **높이가 발목을 잡고 있으면** 접어도 소용없다. */
  stageH: number
  /** 종이의 논리 크기(가로 1040×720 / 세로 432×576). */
  pageW: number
  pageH: number
  /** 지금 패널 폭(사람이 끌어서 바꿨을 수 있다). */
  leftW: number
  rightW: number
  /** 지금 펴져 있는가. 되접기·되펴기 문턱이 달라서(떨림 방지) 현재 상태가 필요하다. */
  leftOpen: boolean
  rightOpen: boolean
}

export interface FoldResult { leftOpen: boolean; rightOpen: boolean }

/** .stage 의 padding 16px 양쪽. Preview 의 맞춤 계산과 같은 값을 쓴다. */
const PAD = 32

/**
 * 문턱이 접을 때와 펼 때 다르다 — **같으면 그 경계에서 떤다.**
 * 창을 1px 끌 때마다 패널이 열렸다 닫혔다 하면 못 쓴다.
 *
 * 필름부터 접는 이유: 쪽 목록은 **보기만** 하는 곳이고, 접혀 있어도 손잡이 한 번이면
 * 돌아온다. 오른쪽 패널은 **값을 바꾸는 곳**이라 마지막까지 남긴다.
 */
const FOLD_L = 0.60, OPEN_L = 0.68
const FOLD_R = 0.45, OPEN_R = 0.54

export function autoFold(i: FoldInput): FoldResult {
  const { bodyW, stageH, pageW, pageH, leftW, rightW } = i
  // 아직 안 그려졌다. 아무것도 정하지 않는다 — 0 을 넓이로 믿고 다 접으면
  // 첫 그림에서 패널이 사라졌다 나타난다.
  if (!(bodyW > 0) || !(pageW > 0) || !(pageH > 0)) {
    return { leftOpen: i.leftOpen, rightOpen: i.rightOpen }
  }

  /** 높이가 허락하는 배율. 이보다 크게는 어차피 못 키운다. */
  const sH = stageH > 0 ? (stageH - PAD) / pageH : Infinity
  /** 폭이 허락하는 배율 — 그 조합으로 열었을 때. */
  const sW = (usedLeft: number, usedRight: number) =>
    (bodyW - usedLeft - usedRight - PAD) / pageW

  // ── 필름 ──
  // 둘 다 편 상태를 기준으로 잰다. 「지금 접혀 있으니 넓다」로 재면 영영 안 펴진다.
  const sBoth = sW(leftW, rightW)
  // **넓혀서 이득이 있을 때만 접는다.** 높이가 발목을 잡고 있으면(sBoth >= sH)
  // 패널을 접어 봐야 종이는 그대로다 — 자리만 뺏는 셈이다.
  const widthBinds = sBoth < sH
  const leftOpen = i.leftOpen
    ? !(widthBinds && sBoth < FOLD_L)      // 펴져 있다 → 많이 좁을 때만 접는다
    : (!widthBinds || sBoth >= OPEN_L)     // 접혀 있다 → 넉넉해지면 편다

  // ── 오른쪽 패널 ──
  // 필름을 접어서 이미 넓어졌을 수 있다. 그 결과를 넣고 다시 잰다.
  const sRight = sW(leftOpen ? leftW : 0, rightW)
  const widthBindsR = sRight < sH
  const rightOpen = i.rightOpen
    ? !(widthBindsR && sRight < FOLD_R)
    : (!widthBindsR || sRight >= OPEN_R)

  return { leftOpen, rightOpen }
}
