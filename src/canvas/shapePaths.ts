/**
 * **오려 만드는 갈래의 꼭짓점 — 여기가 유일한 정의다.**
 *
 * 마름모·삼각형 같은 모양은 네모 상자를 오려서 만든다. 오리는 규칙(clip-path)은
 * 원래 index.css 에 있었는데, 그러면 **테두리를 그릴 수가 없다** — 오릴 때 테두리도
 * 같이 잘려서 꼭짓점에 자국만 남는다(2026-09-16 에 눈으로 확인). 색과 두께를 줘도
 * 빗변에는 선이 안 생긴다.
 *
 * 그래서 꼭짓점을 **글로 옮겼다.** 같은 숫자로
 *   · 상자를 오리고(`polyClip`)
 *   · 그 위에 **선을 그린다**(`polyPoints` → SVG polygon)
 * 두 벌이 되면 모양과 선이 어긋나므로, CSS 에서는 이 갈래들의 clip-path 를 **뺐다**.
 *
 * 숫자는 **백분율**이다. 비율로 적어 두면 크기와 무관하게 같은 모양이 나온다.
 */
export type Poly = [number, number][]

export const SHAPE_POLY: Record<string, Poly> = {
  diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
  triangle: [[50, 5], [100, 100], [0, 100]],
  hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]],
  pentagon: [[50, 0], [100, 38], [82, 100], [18, 100], [0, 38]],
  parallelogram: [[22, 0], [100, 0], [78, 100], [0, 100]],
  chevron: [[0, 0], [78, 0], [100, 50], [78, 100], [0, 100], [22, 50]],
  arrowR: [[0, 28], [58, 28], [58, 0], [100, 50], [58, 100], [58, 72], [0, 72]],
  arrowL: [[42, 0], [42, 28], [100, 28], [100, 72], [42, 72], [42, 100], [0, 50]],
  arrowU: [[0, 50], [50, 0], [100, 50], [72, 50], [72, 100], [28, 100], [28, 50]],
  arrowD: [[28, 0], [72, 0], [72, 50], [100, 50], [50, 100], [0, 50], [28, 50]],
  star5: [[50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]],
  star4: [[50, 0], [60, 40], [100, 50], [60, 60], [50, 100], [40, 60], [0, 50], [40, 40]],
  banner: [[0, 0], [100, 0], [88, 50], [100, 100], [0, 100], [12, 50]],
  callout: [[0, 0], [100, 0], [100, 72], [34, 72], [20, 100], [24, 72], [0, 72]],
}

/** 오려 만드는 갈래 이름들. 목록을 따로 적지 않는다 — 꼭짓점이 있는 갈래가 곧 그것이다. */
export const CLIPPED: string[] = Object.keys(SHAPE_POLY)

/** 오린 뒤에도 남기는 둥글기. 말풍선만 모서리가 둥글다. */
export const SHAPE_RADIUS: Record<string, number> = { callout: 8 }

/** 상자를 오리는 규칙. 없는 갈래면 `undefined` — 그때는 안 오린다. */
export function polyClip(kind: string | undefined): string | undefined {
  const p = kind ? SHAPE_POLY[kind] : undefined
  if (!p) return undefined
  return 'polygon(' + p.map(([x, y]) => x + '% ' + y + '%').join(',') + ')'
}

/**
 * 선을 그릴 꼭짓점 — **상자 크기(px)로 환산해서** 준다.
 *
 * 백분율을 그대로 두고 viewBox 를 `0 0 100 100` 으로 늘려 쓰면 안 된다. 가로세로 비가
 * 다른 상자에서 **선 굵기까지 같이 늘어나** 한쪽은 굵고 한쪽은 가늘어진다. viewBox 를
 * 상자와 같은 단위로 두면 선 굵기가 어디서나 같다.
 */
export function polyPoints(kind: string | undefined, w: number, h: number): string | undefined {
  const p = kind ? SHAPE_POLY[kind] : undefined
  if (!p) return undefined
  return p.map(([x, y]) => (x * w / 100) + ',' + (y * h / 100)).join(' ')
}

/**
 * 선 모양을 **굵기에 맞춰** 끊는다. 굵은 선에 잔 점선을 쓰면 뭉쳐 보이고,
 * 가는 선에 긴 파선을 쓰면 듬성해 보인다 — 길이를 굵기에 비례시켜 둔다.
 */
export function dashArray(kind: 'solid' | 'dashed' | 'dotted' | undefined, bw: number): string | undefined {
  if (kind === 'dashed') return (bw * 3).toFixed(2) + ' ' + (bw * 2.2).toFixed(2)
  if (kind === 'dotted') return '0.01 ' + (bw * 2).toFixed(2)
  return undefined
}
