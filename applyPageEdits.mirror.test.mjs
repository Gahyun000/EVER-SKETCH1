// G5 미러 테스트 — store.applyPageEdits 의 순수 로직을 JS로 재현해 계약을 고정한다.
// (store.ts 는 zustand 이므로 여기서는 동일 규칙을 미러링해 검증한다: applyPlan.mirror 패턴과 동형.)
let uid = 100
// registry 미러(필드형 카드 일부) — buildPlanPage 의 빈칸 채우기 검증용.
const REG = {
  cover: ['title', 'sub'],
  kpi: ['title', 'k1', 'k2', 'k3'],
  roadmap: ['title', 'p1', 'p2'],
  note: [], // 특수 처리
}
const cardByKey = (k) => (k in REG && k !== 'note' && k !== 'slide' ? { key: k, fields: REG[k].map((f) => ({ key: f })) } : (k === 'note' ? { key: 'note', fields: [] } : undefined))
const isPlannablePage = (k) => k === 'note' || k === 'slide' || !!cardByKey(k)

function buildPlanPage(sp) {
  const cardKey = sp.cardKey
  const given = sp.fields || {}
  if (cardKey === 'note') {
    return { id: uid++, cardKey: 'note', fields: {}, blocks: [{ type: 'h1', text: (given.title || '새 페이지').toString(), bold: true }], free: false }
  }
  const empties = {}
  const c = cardByKey(cardKey)
  if (c) c.fields.forEach((fd) => { empties[fd.key] = '' })
  return { id: uid++, cardKey, fields: { ...empties, ...given }, free: false }
}

function applyPageEdits(state, edits, adds) {
  let pages = state.pages
  if (edits && edits.length) {
    const byId = new Map(edits.map((e) => [e.pageId, e.fields || {}]))
    pages = pages.map((p) => (byId.has(p.id) ? { ...p, fields: { ...p.fields, ...byId.get(p.id) } } : p))
  }
  let sel = state.selectedPageId
  if (adds && adds.length) {
    const np = adds.filter((a) => a && isPlannablePage(a.cardKey)).map(buildPlanPage)
    if (np.length) { pages = [...pages, ...np]; sel = np[0].id }
  }
  return { pages, selectedPageId: sel }
}

const fails = []
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) fails.push(label) }

const base = () => ({
  selectedPageId: 12,
  pages: [
    { id: 11, cardKey: 'cover', fields: { title: '표지', sub: '2026' } },
    { id: 12, cardKey: 'kpi', fields: { title: '기대 성과', k1: '불량률:-30%', k2: '검사시간:-40%' } },
  ],
})

// 1) edits: 주어진 키만 덮어쓰고 나머지·다른 페이지는 유지
let r = applyPageEdits(base(), [{ pageId: 12, fields: { k1: '불량률 30% 감축' } }], [])
const kpi = r.pages.find((p) => p.id === 12)
check(kpi.fields.k1 === '불량률 30% 감축', 'edit: 주어진 키 덮어씀')
check(kpi.fields.k2 === '검사시간:-40%', 'edit: 안 준 키는 유지')
check(kpi.fields.title === '기대 성과', 'edit: title 유지')
check(r.pages.find((p) => p.id === 11).fields.title === '표지', 'edit: 다른 페이지 불변')
check(r.pages.length === 2 && r.selectedPageId === 12, 'edit: 페이지 수·선택 불변')

// 2) 환각 pageId 는 무시
let r2 = applyPageEdits(base(), [{ pageId: 999, fields: { title: 'x' } }], [])
check(JSON.stringify(r2.pages) === JSON.stringify(base().pages), 'edit: 없는 pageId 무시')

// 3) adds: 알려진 카드 append + 빈칸 채움 + 선택 이동
let r3 = applyPageEdits(base(), [], [{ cardKey: 'roadmap', fields: { title: '로드맵', p1: 'PoC : 1분기' } }])
check(r3.pages.length === 3, 'add: 1장 추가 → 3장')
const rm = r3.pages[2]
check(rm.cardKey === 'roadmap' && rm.fields.p1 === 'PoC : 1분기', 'add: roadmap 필드 반영')
check(rm.fields.p2 === '', 'add: 미채운 필드는 빈칸(예시 아님)')
check(r3.selectedPageId === rm.id, 'add: 새 첫 장으로 선택 이동')

// 4) adds: 모르는 카드 필터 + note 는 블록
let r4 = applyPageEdits(base(), [], [{ cardKey: 'nope', fields: {} }, { cardKey: 'note', fields: { title: '메모장' } }])
check(r4.pages.length === 3, 'add: 모르는 카드 드롭(note 만 추가)')
check(r4.pages[2].cardKey === 'note' && r4.pages[2].blocks[0].text === '메모장', 'add: note → 제목 블록')

// 5) edits + adds 동시
let r5 = applyPageEdits(base(), [{ pageId: 11, fields: { sub: '새 부제' } }], [{ cardKey: 'roadmap', fields: {} }])
check(r5.pages.find((p) => p.id === 11).fields.sub === '새 부제', 'combo: edit 적용')
check(r5.pages.length === 3, 'combo: add 적용')

if (fails.length) { console.log(`\n${fails.length} FAIL: ${fails}`); process.exit(1) }
console.log('\nALL PASS')
