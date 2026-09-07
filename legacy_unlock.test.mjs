// **예전에 만든 자료**의 표준 양식 잠금을 열 때 푸는가.
//
// 왜 이 파일이 있는가
//   2026-09-07 에 양식에서 `locked: true` 를 뺐다. 그런데 그건 **앞으로 만들 자료**에만
//   적용된다 — 이미 만들어진 자료의 state 에는 요소마다 그대로 적혀 있다.
//   그래서 사용자가 예전 자료를 열고 「기능을 넣었다는데 내 화면에는 손잡이가 없다」고
//   화면 녹화를 보내 왔다. 실제로 표를 골라도 크기 손잡이가 안 나왔다.
//
//   **기본값을 바꾸는 변경은 이미 나간 자료를 어떻게 할지까지 정해야 끝난다.**
//   이 파일은 그 절반이 빠지지 않게 붙잡아 둔다.
//
// 실행: node --experimental-strip-types legacy_unlock.test.mjs
import { unlockLegacySlots } from './src/template/legacyUnlock.ts'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const legacy = () => ([{
  id: 1,
  els: [
    { id: 11, type: 'text', slot: 'head', locked: true },
    { id: 12, type: 'table', slot: 'SLOT-A', locked: true },
    { id: 13, type: 'text', slot: 'foot', locked: true },
    { id: 14, type: 'table', slot: 'SLOT-B', locked: true },
  ],
}, {
  id: 2,
  els: [{ id: 21, type: 'table', slot: 'SLOT-C', locked: true }],
}])

{
  const pages = legacy()
  const changed = unlockLegacySlots(pages)
  check(changed === true, '풀 것이 있으면 그렇다고 알린다')
  const stuck = pages.flatMap((p) => p.els).filter((e) => e.locked)
  check(stuck.length === 0, '모든 슬롯 요소의 잠금이 풀린다', stuck.map((e) => e.slot).join(','))
  check(!('locked' in pages[0].els[1]), '값을 false 로 두지 않고 아예 지운다 — 새로 만든 양식과 같은 모양이어야 한다')
  check(pages[1].els[0].locked === undefined, '두 번째 쪽도 훑는다 (양식이 두 장이다)')
}

{
  // **사람이 직접 잠근 것은 건드리지 않는다.** 슬롯이 없는 요소의 locked 는
  // 오른쪽 패널에서 사용자가 켠 것이다.
  const pages = [{ id: 1, els: [
    { id: 31, type: 'box', locked: true },                     // 사람이 잠금
    { id: 32, type: 'text', slot: 'head', locked: true },       // 양식이 박은 잠금
  ] }]
  unlockLegacySlots(pages)
  check(pages[0].els[0].locked === true, '슬롯이 없는 요소의 잠금은 그대로 둔다')
  check(pages[0].els[1].locked === undefined, '슬롯 요소만 푼다')
}

{
  const pages = [{ id: 1, els: [{ id: 41, type: 'table', slot: 'SLOT-A' }] }]
  check(unlockLegacySlots(pages) === false, '풀 것이 없으면 아무 일도 없었다고 알린다')
}

{
  // 두 번 돌려도 같아야 한다 — 열 때마다 부르기 때문이다.
  const pages = legacy()
  unlockLegacySlots(pages)
  check(unlockLegacySlots(pages) === false, '두 번째부터는 바꿀 게 없다(여러 번 해도 같다)')
}

{
  // 깨진 입력에도 안 죽는다. 자료를 여는 길목이라 여기서 던지면 화면이 아예 안 뜬다.
  check(unlockLegacySlots(undefined) === false, 'pages 가 없어도 죽지 않는다')
  check(unlockLegacySlots(null) === false, 'null 도 마찬가지')
  check(unlockLegacySlots([{ id: 1 }]) === false, 'els 가 없는 쪽도 넘어간다')
  check(unlockLegacySlots([{ id: 1, els: [null, undefined] }]) === false, '빈 요소도 넘어간다')
}

{
  // 모르는 슬롯 이름은 슬롯이 아니다 — 기본 거부.
  const pages = [{ id: 1, els: [{ id: 51, slot: 'SLOT-Z', locked: true }] }]
  unlockLegacySlots(pages)
  check(pages[0].els[0].locked === true, '모르는 슬롯 이름은 건드리지 않는다')
}

console.log('\n' + pass + ' 통과, ' + fail + ' 실패')
if (fail) process.exit(1)
