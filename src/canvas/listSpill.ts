// ②③ 가 넘치면 **통째로** 다음 쪽으로 간다.
//
// ── 왜 조각내지 않는가 ────────────────────────────
// 표가 종이 끝에 닿으면 조각을 만들어 잇는 길이 이미 있다(tableFlow.ts). 그런데
// 표준 양식의 ②③ 에는 그 길을 쓰지 않는다. 사용자 판단(2026-09-16, 갈림길 ㄴ):
//
//     「②③ 를 통째로 넘긴다」 — 줄을 쪼개 잇지 않는다.
//
// 실물 파워포인트가 그렇게 쓰인다. ② 의 3번째 줄까지는 1쪽, 4번째 줄부터 2쪽이면
// 읽는 사람이 같은 표를 두 번 찾아야 한다. ②③ 는 짧은 목록이라 통째로 옮기는 편이
// 읽기에 낫다. 로드맵(①)은 길어서 사정이 다르고, 거기서는 조각내 잇는다.
// 같은 판단이 server/template_seed.py 의 build_template_pages 에도 적혀 있다 —
// 처음 만들 때와 편집 중이 다르게 굴면 안 된다.
//
// ── 왜 상수를 베끼지 않는가 ────────────────────────
// 「2쪽에서 ②③ 는 y = BLOCK_Y 에 선다」를 여기에 다시 적을 수도 있었다. 그러면
// 서버의 양식 치수가 바뀔 때마다 두 곳을 같이 고쳐야 하고, 안 고치면 **편집 중에만**
// 자리가 어긋난다 — 눈에 잘 안 띄는 종류다.
//
// 그래서 **문서에서 읽는다.** 2쪽 배치에서 ②③ 표의 윗변은 로드맵 표의 윗변과 같은
// 높이다(BLOCK_Y = ROADMAP_Y). 그러니 「①의 윗변에 맞춰 올린다」고만 하면 된다.
// 꼬리말도 마찬가지로, 지금 문서에서 「덩어리 아래 몇 px」인지 재서 그대로 쓴다.
import type { FreeEl } from '../state/store'

/** 이 덩어리에 드는 슬롯. 이름표 글상자와 표가 같은 슬롯 이름을 달고 있다. */
const LIST_SLOTS = ['SLOT-B', 'SLOT-C']

/** 꼬리말을 못 찾았을 때 쓰는 간격(px). server/template_seed.FOOT_GAP 과 같은 값이지만
 *  **재는 데 실패했을 때만** 쓴다 — 보통은 문서에서 읽은 값이 이긴다. */
export const FALLBACK_FOOT_GAP = 18

export function isListSlot(slot: string | undefined): boolean {
  return !!slot && LIST_SLOTS.includes(slot)
}

export interface ListSpillPlan {
  /** 이 쪽에 남는 것 (꼬리말은 위로 당겨 이미 옮겨 놓았다). */
  stay: FreeEl[]
  /** 다음 쪽으로 가는 것 (이미 올려 놓았다). */
  move: FreeEl[]
  /** 얼마나 올라갔는지. 0 이하면 올릴 자리가 없다는 뜻이라 계획을 만들지 않는다. */
  dy: number
  /** 덩어리 아래 꼬리말까지의 간격. 문서에서 재어 둔 값이다. */
  gap: number
}

/**
 * 꼬리말을 덩어리 **바로 밑**에 앉힌다.
 *
 * **왜 따로 있나.** 넘긴 직후에 줄을 하나 더하면 표가 그만큼 자란다. 그때 꼬리말을
 * 그대로 두면 **표 속에 파묻힌다** — 2026-09-16 에 옮긴 쪽을 사진으로 보고 알았다.
 * 검사는 전부 통과하고 있었다(옮기는 것까지만 재고 있었으니까).
 *
 * **양식 덩어리만 센다**(SLOT-A·B·C). 처음에는 「꼬리말 아닌 것 전부」로 썼는데,
 * 그러면 사람이 종이 아래쪽에 도형 하나만 끌어다 놔도 꼬리말이 그 밑으로,
 * 때로는 종이 밖으로 밀려난다. 꼬리말이 따라야 하는 건 양식이지 낙서가 아니다.
 * (처음 쓴 「머리글은 빼고」는 아무 일도 안 하고 있었다 — 머리글은 늘 맨 위라
 *  빼든 말든 답이 같다. 일부러 넣었다 빼 봤더니 검사가 40/40 그대로였다.)
 */
export function placeFoot(els: FreeEl[], gap: number): FreeEl[] {
  const body = els.filter((e) => isListSlot(e.slot) || e.slot === 'SLOT-A')
  if (!body.length) return els
  const bottom = Math.max(...body.map((e) => e.y + e.h))
  return els.map((e) => (e.slot === 'foot' ? { ...e, y: bottom + gap } : e))
}

/** ①(로드맵)과 ②③ 가 **한 쪽에 같이** 있는가. 이때만 통째로 넘길 일이 생긴다.
 *  ②③ 만 있는 쪽에서 또 넘치면 그때는 조각내 잇는다(tableFlow.ts). */
export function canSpillListBlock(els: FreeEl[]): boolean {
  const hasRoadmap = els.some((e) => e.type === 'table' && e.slot === 'SLOT-A')
  const hasList = els.some((e) => isListSlot(e.slot))
  return hasRoadmap && hasList
}

/**
 * ②③ 를 다음 쪽으로 보내는 계획.
 *
 * 되돌릴 수 있게 **원본을 건드리지 않고** 새 배열을 만들어 돌려준다.
 * 나눌 게 없거나 올릴 자리가 없으면 null — 그때는 부르는 쪽이 조각내 잇는 길로 간다.
 */
export function planListSpill(els: FreeEl[]): ListSpillPlan | null {
  const roadmap = els.find((e) => e.type === 'table' && e.slot === 'SLOT-A')
  if (!roadmap) return null
  const block = els.filter((e) => isListSlot(e.slot))
  if (!block.length) return null

  // 올리는 기준은 **표**의 윗변이다. 이름표는 표 위에 붙어 함께 따라간다 —
  // 이름표를 기준으로 삼으면 2쪽에서 표가 이름표 높이만큼 내려앉는다.
  const tables = block.filter((e) => e.type === 'table')
  const top = Math.min(...(tables.length ? tables : block).map((e) => e.y))
  const dy = top - roadmap.y
  if (!(dy > 0)) return null   // 이미 그만큼 위에 있다 — 옮겨 봐야 제자리다

  const blockBottom = Math.max(...block.map((e) => e.y + e.h))
  const foot = els.find((e) => e.slot === 'foot')
  // 지금 문서에서 「덩어리 아래 몇 px 에 꼬리말이 있나」를 잰다. 음수가 나오면
  // (꼬리말이 덩어리보다 위에 있는 이상한 문서) 재는 데 실패한 것으로 본다.
  const gap = foot && foot.y - blockBottom >= 0 ? foot.y - blockBottom : FALLBACK_FOOT_GAP

  const moveIds = new Set(block.map((e) => e.id))
  const move = block.map((e) => ({ ...e, y: e.y - dy }))

  const stay = els
    .filter((e) => !moveIds.has(e.id))
    // 꼬리말은 **로드맵 바로 밑으로 당겨 올린다.** 안 그러면 ②③ 가 떠난 자리에
    // 꼬리말만 종이 한참 아래에 홀로 남는다.
    .map((e) => (e.slot === 'foot' ? { ...e, y: roadmap.y + roadmap.h + gap } : e))

  return { stay, move, dy, gap }
}
