// 2026-09-07 **이전에 만든** 표준 양식 자료의 자리 잠금을 푼다.
//
// 왜 필요한가
//   그날 양식에서 `locked: true` 를 뺐지만, 그건 **앞으로 만들어질 자료**에만 적용된다.
//   이미 만들어진 자료의 `state` 에는 요소마다 `locked: true` 가 그대로 적혀 있다.
//   그래서 예전 자료를 열면 표를 골라도 크기 손잡이가 안 나오고, 사용자에게는
//   「기능을 넣었다는데 내 화면에는 없다」로 보인다. 실제로 그렇게 보고를 받았다.
//
// 왜 슬롯 요소만 푸는가
//   슬롯 요소의 `locked` 는 **사람이 고른 값이 아니라 양식이 태어날 때 박힌 값**이다.
//   그 기본값이 틀렸다고 판단해서 뺀 것이므로, 이미 나간 자료도 같이 고쳐야 앞뒤가 맞는다.
//   반대로 슬롯이 없는 요소의 `locked` 는 사람이 오른쪽 패널에서 직접 켠 것이다 —
//   그건 건드리지 않는다.
//
// 왜 저장하지 않는가
//   여는 것만으로 남의 자료가 조용히 바뀌면, 열어 보기만 한 사람도 「수정함」이 된다.
//   그래서 화면에 올릴 때마다 다시 풀 뿐이고(여러 번 해도 결과가 같다),
//   실제 저장은 사용자가 무언가를 고칠 때 따라간다.
import { isSlotEl } from './slots'

interface HasSlot { id?: number; slot?: string; locked?: boolean }
interface HasConn { from?: number; to?: number }
interface HasEls { els?: HasSlot[]; conns?: HasConn[] }

/** 푼 것이 있으면 true. 원본 배열을 그 자리에서 고친다(reseedUids 와 같은 방식). */
export function unlockLegacySlots(pages: HasEls[] | undefined | null): boolean {
  let changed = false
  for (const pg of pages || []) {
    for (const el of pg?.els || []) {
      if (el && el.locked && isSlotEl(el.slot)) {
        delete el.locked
        changed = true
      }
    }
  }
  return changed
}


/**
 * 표준 양식의 슬롯 요소에 붙은 **연결선을 걷어낸다.**
 *
 * 왜 생겼는가
 *   연결점(도형에 마우스를 올리면 나오는 파란 점 4개)은 `locked` 요소에는 안 떴다.
 *   2026-09-07 에 양식의 자리 잠금을 풀면서 **표 3개에 연결점이 새로 생겼고**,
 *   임원이 칸을 잡으려다 선을 긋는 일이 실제로 일어났다.
 *
 *   선은 `conns` 에 저장되고 **결재 스냅샷에 그대로 들어간다.** 그은 사람은 그은 줄도
 *   모르는데 승인본에는 남는다. 그래서 연결점을 감추는 것만으로는 부족하다 —
 *   감추기만 하면 이미 그어진 선은 화면에 남은 채 지울 방법이 없어진다.
 *
 * 무엇을 지우는가
 *   **한쪽 끝이라도 슬롯 요소에 닿은 선.** 양식 블록에서 나가거나 들어오는 선은
 *   의도한 것일 가능성이 거의 없다. 슬롯과 무관한 선(사람이 따로 붙인 도형끼리)은 남긴다.
 *
 * 잠금 풀기와 마찬가지로 **저장하지 않는다** — 열 때마다 다시 하고, 실제 저장은
 * 사용자가 무언가를 고칠 때 따라간다.
 */
export function stripSlotConns(pages: HasEls[] | undefined | null): number {
  let removed = 0
  for (const pg of pages || []) {
    const conns = pg?.conns
    if (!Array.isArray(conns) || conns.length === 0) continue
    const slotIds = new Set<number>()
    for (const el of pg?.els || []) {
      if (el && typeof el.id === 'number' && isSlotEl(el.slot)) slotIds.add(el.id)
    }
    if (slotIds.size === 0) continue
    const kept = conns.filter((c) => !(c && (slotIds.has(c.from as number) || slotIds.has(c.to as number))))
    if (kept.length !== conns.length) {
      removed += conns.length - kept.length
      pg.conns = kept
    }
  }
  return removed
}
