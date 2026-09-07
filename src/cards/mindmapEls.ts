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

export const BRANCH_KEYS = ['b1', 'b2', 'b3', 'b4', 'b5'] as const

const CENTER_W = 150, CENTER_H = 46
const BR_W = 132, BR_H = 38

/**
 * 필드를 요소와 선으로 펼친다.
 *
 * `id` 는 요소 번호를 만드는 함수다(캔버스의 것을 그대로 넘긴다) — 여기서 새로
 * 세면 이미 있는 요소와 번호가 겹쳐 선이 엉뚱한 도형에 붙는다.
 */
export function mindmapParts(fields: Record<string, string>, W: number, H: number,
                             id: () => number): MindmapParts {
  const center = (fields.center || '중심 주제').trim() || '중심 주제'
  const branches = BRANCH_KEYS.map((k) => (fields[k] || '').trim()).filter(Boolean)
  const list = branches.length ? branches : ['가지 1', '가지 2', '가지 3']

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
  const rx = W * 0.31, ry = H * 0.26

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
