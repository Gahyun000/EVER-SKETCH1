/**
 * 정렬 아이콘 — **파워포인트·한글에서 보던 그림.**
 *
 * 2026-09-16 · 전에는 유니코드 글자(`⇤ ⇔ ⇥ ⤒ ⇕ ⤓`)였다. 글꼴마다 모양이 달라지고,
 * 무엇보다 **두 제품에서 보던 그림이 아니다.** 이 도구를 쓰는 사람들은 그 그림으로
 * 25년을 익혔다 — 새 그림을 배우게 할 까닭이 없다.
 *
 * 가로 정렬은 **길이가 다른 줄 네 개**가 한쪽에 붙는 모양이고(가운데는 양쪽이 고르게),
 * 세로 정렬은 **칸 안에서 글줄이 위·가운데·아래로 붙는** 모양이다. 두 제품이 같다.
 *
 * 글상자와 표 칸이 **같은 그림을 쓴다.** 예전에는 두 곳이 각자 글자를 박아 두어,
 * 한쪽을 고치면 다른 쪽이 남았다.
 */

/** 줄 네 개의 길이. 1·3번째가 길고 2·4번째가 짧다 — 글이 흐르는 모양이다. */
const RUNS = [16, 10, 16, 8]
const YS = [6, 10.5, 15, 19.5]

import type { AlignDir, VAlignDir } from './alignLabels'

/** 가로 정렬. 줄 네 개가 왼쪽·가운데·오른쪽에 붙는다. */
export function AlignIcon({ dir }: { dir: AlignDir }) {
  return (
    <svg className="al-ic" viewBox="0 0 24 26" width="17" height="18" fill="currentColor" aria-hidden="true">
      {RUNS.map((w, i) => {
        const x = dir === 'left' ? 4 : dir === 'right' ? 20 - w : (24 - w) / 2
        return <rect key={i} x={x} y={YS[i] - 1.3} width={w} height={2.6} rx={1.3} />
      })}
    </svg>
  )
}

/** 세로 정렬. **칸을 그린다** — 가로 정렬과 달리 「어디에 붙었는지」는 테두리가 있어야
 *  읽힌다. 줄만 그리면 위·가운데·아래가 서로 구분이 안 된다. */
export function VAlignIcon({ dir }: { dir: VAlignDir }) {
  const ys = dir === 'top' ? [6.2, 9.8] : dir === 'bottom' ? [16.2, 19.8] : [11.2, 14.8]
  return (
    <svg className="al-ic" viewBox="0 0 24 26" width="17" height="18" fill="currentColor" aria-hidden="true">
      <rect x={2.6} y={2.6} width={18.8} height={20.8} rx={2.4} fill="none"
        stroke="currentColor" strokeWidth={1.7} />
      {ys.map((y, i) => <rect key={i} x={6} y={y - 1.15} width={12} height={2.3} rx={1.15} />)}
    </svg>
  )
}

/** 말은 `alignLabels.ts` 에 있다 — 검사가 직접 읽을 수 있어야 해서 갈랐다.
 *  부르는 쪽이 두 곳을 import 하지 않게 여기서 다시 내보낸다. */
export { ALIGN_LABEL, VALIGN_LABEL, type AlignDir, type VAlignDir } from './alignLabels'
