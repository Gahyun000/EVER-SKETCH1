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
import { stripSlotConns, unlockLegacySlots } from './src/template/legacyUnlock.ts'

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

// ── 슬롯에 붙은 연결선 걷어내기 ──────────────────────
//
// 연결점(도형에 마우스를 올리면 나오는 파란 점 4개)은 `locked` 요소에는 안 떴다.
// 자리 잠금을 풀면서 **표 3개에 연결점이 새로 생겼고**, 임원이 칸을 잡으려다 선을
// 긋는 일이 실제로 일어났다(화면 녹화로 확인).
//
// 선은 `conns` 에 저장되고 **결재 스냅샷에 그대로 들어간다.** 그은 사람은 그은 줄도
// 모르는데 승인본에는 남는다. 그래서 연결점을 감추는 것만으로는 부족하다 —
// 감추기만 하면 이미 그어진 선이 화면에 남은 채 지울 방법이 없어진다.

const withConns = () => ([{
  id: 1,
  els: [
    { id: 11, type: 'table', slot: 'SLOT-A' },
    { id: 12, type: 'table', slot: 'SLOT-B' },
    { id: 13, type: 'box' },              // 사람이 따로 붙인 도형
    { id: 14, type: 'box' },
  ],
  conns: [
    { from: 11, to: 12 },                 // 슬롯 ↔ 슬롯
    { from: 13, to: 11 },                 // 도형 → 슬롯
    { from: 12, to: 14 },                 // 슬롯 → 도형
    { from: 13, to: 14 },                 // 도형 ↔ 도형 (사람이 그린 것)
  ],
}])

{
  const pages = withConns()
  const n = stripSlotConns(pages)
  check(n === 3, '슬롯에 닿은 선 셋을 걷어낸다', String(n))
  check(pages[0].conns.length === 1, '슬롯과 무관한 선은 남는다')
  check(pages[0].conns[0].from === 13 && pages[0].conns[0].to === 14,
        '남은 것은 도형끼리 그은 선이다')
}

{
  // **한쪽 끝만 닿아도 지운다.** 양식 블록에서 나가거나 들어오는 선은 의도한 것일
  // 가능성이 거의 없다.
  const pages = [{ id: 1, els: [{ id: 21, slot: 'SLOT-C' }, { id: 22, type: 'box' }],
                   conns: [{ from: 22, to: 21 }] }]
  stripSlotConns(pages)
  check(pages[0].conns.length === 0, '한쪽 끝만 슬롯이어도 지운다')
}

{
  // 슬롯이 없는 쪽(자유 이북)은 손대지 않는다.
  const pages = [{ id: 1, els: [{ id: 31, type: 'box' }, { id: 32, type: 'box' }],
                   conns: [{ from: 31, to: 32 }] }]
  check(stripSlotConns(pages) === 0, '자유 이북의 선은 건드리지 않는다')
  check(pages[0].conns.length === 1, '그대로 남는다')
}

{
  // 두 번 돌려도 같다 — 열 때마다 부른다.
  const pages = withConns()
  stripSlotConns(pages)
  check(stripSlotConns(pages) === 0, '두 번째부터는 걷어낼 것이 없다')
}

{
  check(stripSlotConns(undefined) === 0, 'pages 가 없어도 죽지 않는다')
  check(stripSlotConns([{ id: 1 }]) === 0, 'conns 가 없는 쪽도 넘어간다')
  check(stripSlotConns([{ id: 1, els: [{ id: 41, slot: 'SLOT-A' }], conns: [] }]) === 0,
        '빈 선 목록도 넘어간다')
  check(stripSlotConns([{ id: 1, els: [{ id: 42, slot: 'SLOT-A' }], conns: [null] }]) === 0,
        '깨진 선도 넘어간다')
}

console.log('\n' + pass + ' 통과, ' + fail + ' 실패')
if (fail) process.exit(1)
