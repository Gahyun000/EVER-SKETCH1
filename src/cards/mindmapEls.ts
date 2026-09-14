// 마인드맵을 **진짜 요소로 펼친다.**
//
// ── 왜 바꿨나 ────────────────────────────────────────
// 예전 마인드맵은 필드(중심 주제 · 가지 1~5)에서 **SVG 그림 한 덩어리**를 만들어
// 냈다(PageView.mindmapSVG). 그래서 「로그아웃」이나 「생존의 법칙」은 각각의 물건이
// 아니라 그림의 일부였고, 잡을 것이 없었다. 임원진이 「위치 이동 및 사이즈 조정
// 안됨」이라고 한 것이 이것이다 — 고장이 아니라 설계가 그랬다.
//
// ── 왜 「한 번만 펼치기」인가 ───────────────────────────
// 요소로 그리는 순간 **자리라는 값이 생긴다.** 그러면 필드와 자리 중 누가 주인인지
// 정해야 한다. 계속 맞추는 쪽을 고르면 「가지 3을 지웠다 다시 넣으면 자리가
// 초기화되나」, 「가지를 6개로 늘리면 옮겨 둔 것들이 다시 흩어지나」가 끝없이 따라온다.
// 오늘 표 높이(자동 vs 수동)와 표 잠금(자리 vs 편집)에서 같은 문제를 두 번 겪었고,
// 두 번 다 **역할을 갈라서** 풀렸다.
//
// 그래서 여기서는 아예 주인을 하나로 만든다. **넣는 순간 한 번 펼치고, 그 뒤로는
// 보통 도형이다.** 필드는 씨앗이고, 자란 뒤에는 캔버스가 진실이다.
// 잃는 것도 분명하다 — 가지 이름 다섯 개를 오른쪽 칸에서 한 번에 치던 편의는 없다.
//
// 자리 계산은 예전 SVG 와 같은 모양을 쓴다(중심 + 타원 위 등간격). 열었을 때
// 「내가 알던 그 그림」이어야 한다.
import type { Conn, FreeEl } from '../state/store'

export interface MindmapParts { els: FreeEl[]; conns: Conn[] }

export const BRANCH_KEYS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'] as const

/** 가지 수의 위아래. **기본은 셋**(지금과 같다) — 고르지 않으면 이대로 나온다.
 *
 *  여덟에서 끊는 이유는 겹쳐서가 아니다. 아래 `ringFor` 로 타원을 키우면
 *  세로 종이에서도 여덟까지 안 겹친다. 그보다는 **선이 여덟 가닥을 넘어가면**
 *  중심에서 뻗은 부채가 그림이 아니라 얼룩으로 읽힌다. */
export const BRANCH_MIN = 3, BRANCH_MAX = 8, BRANCH_DEFAULT = 3

const CENTER_W = 150, CENTER_H = 46
const BR_W = 132, BR_H = 38

/**
 * 가지가 놓이는 타원. **중심 상자를 비켜 가게** 키운다.
 *
 * 예전에는 `W * 0.31` 하나였다. 가로 종이(1040)에서는 322 라 넉넉한데,
 * **세로 종이(432)에서는 134** 밖에 안 된다 — 중심 상자 반폭(75) + 가지 상자 반폭(66) =
 * **141** 이라 좌우에 놓이는 가지가 중심을 7px 파고들었다.
 *
 * 지금은 가지가 늘 셋이라(칸이 비면 셋으로 대신한다) 아무도 못 봤다. 셋은 좌우에
 * 가지가 안 놓이기 때문이다. **개수를 고르게 하는 순간 넷에서 바로 드러난다** —
 * 기본값 바로 위 한 칸에서. 그래서 개수보다 이것을 먼저 고친다.
 *
 * 종이 밖으로 나가지 않는 선에서만 키운다. 세로 종이에서 10px 늘어난다.
 */
export function ringFor(W: number, H: number): { rx: number; ry: number } {
  const needX = (CENTER_W + BR_W) / 2 + 10      // 중심과 가지가 가로로 안 겹치는 최소
  const needY = (CENTER_H + BR_H) / 2 + 10
  const maxX = W / 2 - BR_W / 2 - 6             // 종이 안에 남는 최대
  const maxY = H / 2 - BR_H / 2 - 6
  return {
    rx: Math.min(Math.max(W * 0.31, needX), Math.max(maxX, 1)),
    ry: Math.min(Math.max(H * 0.26, needY), Math.max(maxY, 1)),
  }
}

/**
 * 필드를 요소와 선으로 펼친다.
 *
 * `id` 는 요소 번호를 만드는 함수다(캔버스의 것을 그대로 넘긴다) — 여기서 새로
 * 세면 이미 있는 요소와 번호가 겹쳐 선이 엉뚱한 도형에 붙는다.
 */
export function mindmapParts(fields: Record<string, string>, W: number, H: number,
                             id: () => number, count = BRANCH_DEFAULT): MindmapParts {
  const center = (fields.center || '중심 주제').trim() || '중심 주제'
  const branches = BRANCH_KEYS.map((k) => (fields[k] || '').trim()).filter(Boolean)
  // 칸이 비어 있으면 **고른 개수만큼** 자리표시자를 놓는다.
  // 예전에는 여기 셋이 박혀 있어서, 가지 칸이 늘 비는 지금 구조에서는 **늘 셋**이었다.
  const want = Math.min(BRANCH_MAX, Math.max(1, Math.round(count || BRANCH_DEFAULT)))
  const list = branches.length ? branches
    : Array.from({ length: want }, (_, i) => `가지 ${i + 1}`)

  const els: FreeEl[] = []
  const conns: Conn[] = []

  const title = (fields.title || '').trim()
  if (title) {
    els.push({
      id: id(), type: 'text', x: 24, y: 26, w: W - 48, h: 36,
      text: title, color: 'transparent', fs: Math.round(H * 0.038) + 8,
      bold: true, align: 'left', tcolor: '#0F1B3D',
    })
  }

  // 중심은 종이 가운데보다 **조금 아래**. 제목이 위를 쓰기 때문이다.
  const cx = W / 2, cy = H * 0.56
  const { rx, ry } = ringFor(W, H)

  const centerId = id()
  els.push({
    id: centerId, type: 'round', x: Math.round(cx - CENTER_W / 2), y: Math.round(cy - CENTER_H / 2),
    w: CENTER_W, h: CENTER_H, text: center, color: '#111318', fs: 15, bold: true, tcolor: '#ffffff',
  })

  const n = list.length
  list.forEach((t, i) => {
    // 첫 가지를 12시에 놓고 시계 방향. 예전 SVG 와 같은 배치다.
    const a = ((-90 + i * (360 / n)) * Math.PI) / 180
    const bx = cx + rx * Math.cos(a), by = cy + ry * Math.sin(a)
    const bid = id()
    els.push({
      id: bid, type: 'round', x: Math.round(bx - BR_W / 2), y: Math.round(by - BR_H / 2),
      w: BR_W, h: BR_H, text: t, color: '#eaf0ff', fs: 13, tcolor: '#1c2433',
    })
    // 화살표가 아니라 **선**이다. 마인드맵의 가지에 방향이 있는 게 아니다.
    conns.push({ from: centerId, to: bid, kind: 'straight', arrow: 'none',
                 color: '#c3cbdb', width: 1.5 })
  })

  // 종이 밖으로 나가면 아무도 못 본다 — 가지가 많아 타원이 커져도 안에 붙잡아 둔다.
  for (const el of els) {
    el.x = Math.max(0, Math.min(W - el.w, el.x))
    el.y = Math.max(0, Math.min(H - el.h, el.y))
  }
  return { els, conns }
}

/**
 * 「＋ 가지」가 놓일 자리 — **가장 넓게 벌어진 틈의 한가운데.**
 *
 * **있던 가지는 안 건드린다**(사용자 결정 ㄷ). 펼치고 나면 마인드맵은 진짜 요소라
 * 사람이 옮겨 놓았을 수 있다. 개수를 바꿀 때마다 전부 다시 배치하면
 * **옮겨 둔 것이 매번 날아간다.** 그래서 빈 자리에 하나 얹기만 한다.
 *
 * 「빈 자리」는 **각도로** 찾는다. 중심에서 본 가지들의 각을 줄 세우고 가장 먼 두
 * 이웃 사이를 고른다 — 눈으로 보기에도 거기가 비어 보이는 자리다.
 * 가지가 하나도 없으면 12시.
 *
 * 반지름은 **있는 가지들의 평균**을 쓴다. 기본 타원을 그대로 쓰면 사람이 넓혀 놓은
 * 마인드맵에 새 가지만 안쪽으로 파고든다.
 */
export function nextBranchSpot(
  center: { x: number; y: number; w: number; h: number },
  branches: { x: number; y: number; w: number; h: number }[],
  W: number, H: number,
): { x: number; y: number } {
  const cx = center.x + center.w / 2, cy = center.y + center.h / 2
  const ring = ringFor(W, H)

  const angs = branches
    .map((b) => Math.atan2((b.y + b.h / 2) - cy, (b.x + b.w / 2) - cx))
    .map((a) => (a + Math.PI * 2) % (Math.PI * 2))
    .sort((p, q) => p - q)

  let put = -Math.PI / 2                       // 12시
  if (angs.length === 1) put = angs[0] + Math.PI          // 반대편
  else if (angs.length > 1) {
    let best = -1
    for (let i = 0; i < angs.length; i++) {
      const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2
      if (b - a > best) { best = b - a; put = a + (b - a) / 2 }
    }
  }

  // 사람이 넓혀 놓았으면 그 크기를 따라간다.
  let rx = ring.rx, ry = ring.ry
  if (branches.length) {
    const dx = branches.map((b) => Math.abs((b.x + b.w / 2) - cx))
    const dy = branches.map((b) => Math.abs((b.y + b.h / 2) - cy))
    rx = Math.max(rx, dx.reduce((a, b) => a + b, 0) / dx.length)
    ry = Math.max(ry, dy.reduce((a, b) => a + b, 0) / dy.length)
  }

  const x = cx + rx * Math.cos(put) - BR_W / 2
  const y = cy + ry * Math.sin(put) - BR_H / 2
  // 종이 밖으로 나가면 아무도 못 본다.
  return {
    x: Math.round(Math.max(0, Math.min(W - BR_W, x))),
    y: Math.round(Math.max(0, Math.min(H - BR_H, y))),
  }
}

/** 새 가지 상자 한 칸의 크기 — 부르는 쪽이 요소를 만들 때 쓴다. */
export const BRANCH_BOX = { w: BR_W, h: BR_H }
