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

interface HasSlot { slot?: string; locked?: boolean }
interface HasEls { els?: HasSlot[] }

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
