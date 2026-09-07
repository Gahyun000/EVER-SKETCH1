// 숫자 칸이 **치는 도중에 값을 깎지 않게** 하는 두 판정.
//
// 화면 부품(NumInput.tsx)에서 떼어 놓은 이유는 하나다 — 이 규칙만 따로 시험하려고.
// 브라우저 없이 확인할 수 있어야 「60 을 50 으로 못 고친다」 같은 게 다시 새어 나가지 않는다.
// (node 의 타입 벗기기는 .tsx 를 못 읽는다. 그래서 순수 규칙은 .ts 에 둔다.)

/** 치는 중에 이 글자를 값으로 받아들일까. **범위 안일 때만** 받는다.
 *
 *  범위 밖이면 아직 다 안 친 것으로 보고 기다린다. 최솟값이 6 일 때
 *  50 을 치려면 5 를 먼저 지나가야 하는데, 거기서 6 으로 깎아 버리면
 *  0 을 칠 자리가 사라진다 — 그게 신고된 「6 이 고정된다」였다. */
export function liveValue(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  if (!isFinite(n)) return null
  return n >= min && n <= max ? n : null
}

/** 칸을 떠날 때의 값. 못 읽으면 null — 부르는 쪽이 **원래 값으로 되돌린다.**
 *
 *  0 이나 최솟값으로 대신 채우지 않는다. 사람이 지운 자리를 숫자로 메우면
 *  「내가 안 넣은 값이 들어가 있다」가 된다. */
export function commitValue(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  if (!isFinite(n)) return null
  return Math.max(min, Math.min(max, n))
}
