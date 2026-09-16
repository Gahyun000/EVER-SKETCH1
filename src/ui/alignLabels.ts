/**
 * 정렬에 붙이는 **말**.
 *
 * **한글·파워포인트의 말을 그대로 쓴다** — 「세로 가운데」는 두 제품에서 「가운데
 * 맞춤」이다. 그림만 맞추고 말이 다르면 반만 익숙하다.
 *
 * 그림(`alignIcons.tsx`)과 따로 둔 것은 **말은 검사가 직접 읽어야 해서**다.
 * JSX 가 든 파일은 검사 실행기가 못 읽는다.
 */

export type AlignDir = 'left' | 'center' | 'right'
export type VAlignDir = 'top' | 'middle' | 'bottom'

export const ALIGN_LABEL: Record<AlignDir, string> = {
  left: '왼쪽 맞춤', center: '가운데 맞춤', right: '오른쪽 맞춤',
}
export const VALIGN_LABEL: Record<VAlignDir, string> = {
  top: '위쪽 맞춤', middle: '가운데 맞춤', bottom: '아래쪽 맞춤',
}
