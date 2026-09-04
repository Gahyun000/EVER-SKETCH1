// 폴더 탐색의 순수 계산 — 노드 단독 실행.
//
// 「…」을 어떻게 다룰지가 이 파일의 주제다. 대표님이 「중간에 ...으로 나오는 일은
// 없었으면 좋겠어」라고 하셨고, 검토 끝에 **답이 두 개로 갈렸다**:
//   쪽 번호는 창을 고정해 「…」이 생길 자리를 없애고(D25),
//   경로는 「…」을 남기되 **눌리는 버튼**으로 만든다(D26).
// 지나온 길은 없앨 수 없기 때문이다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs folder_nav.test.mjs

const {
  pageWindow, collapsePath, canCreateHere, scopeLabel, PAGE_WINDOW, PATH_VISIBLE,
  childrenOf, subtreeIds, scopedProjects, countInSubtree,
} = await import('./src/persistence/folderNav.ts')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}
const w = (c, t) => pageWindow(c, t).join(',')

// ── 쪽 번호 창 (D25) ──
check(PAGE_WINDOW === 5, '창은 다섯 칸 (확정값)')
check(w(1, 3) === '1,2,3', '쪽이 창보다 적으면 있는 만큼만')
check(w(1, 1) === '1', '한 쪽뿐이면 1')
check(w(1, 20) === '1,2,3,4,5', '첫 쪽 — 왼쪽에 붙는다')
check(w(2, 20) === '1,2,3,4,5', '둘째 쪽도 아직 왼쪽')
check(w(3, 20) === '1,2,3,4,5', '셋째 쪽부터 가운데가 맞는다')
check(w(10, 20) === '8,9,10,11,12', '가운데 — 현재 쪽이 한가운데')
check(w(18, 20) === '16,17,18,19,20', '끝 가까이 — 오른쪽에 붙는다')
check(w(20, 20) === '16,17,18,19,20', '마지막 쪽')
for (const [c, t] of [[1, 20], [7, 20], [20, 20], [3, 5], [1, 100]]) {
  const a = pageWindow(c, t)
  const contiguous = a.every((n, i) => i === 0 || n === a[i - 1] + 1)
  check(contiguous, `${c}/${t} — 번호가 끊기지 않는다 (「…」이 생길 자리가 없다)`)
}
check(pageWindow(10, 20).includes(10), '창 안에 현재 쪽이 반드시 있다')
check(pageWindow(0, 20)[0] === 1, '0쪽을 달라고 하면 첫 쪽 기준')
check(w(99, 20) === '16,17,18,19,20', '없는 쪽을 달라고 하면 마지막 기준')
check(pageWindow(1, 0).join(',') === '1', '쪽이 0이어도 1은 나온다')

// ── 경로 접기 (D26) ──
const P = (n) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, name: '단' + (i + 1) }))
check(PATH_VISIBLE === 4, '4칸까지는 다 보인다 (확정값)')
for (const n of [0, 1, 2, 3, 4]) {
  const r = collapsePath(P(n))
  check(!r.collapsed && r.shown.length === n && !r.hidden.length, `${n}칸 — 안 접는다`)
}
let r = collapsePath(P(5))
check(r.collapsed && r.hidden.length === 1 && r.shown.length === 4, '5칸 — 앞 1칸을 접는다')
check(r.hidden[0].name === '단1', '접히는 것은 **앞쪽** — 지금 있는 자리 근처가 더 중요하다')
check(r.shown[r.shown.length - 1].name === '단5', '마지막 칸은 언제나 보인다')
r = collapsePath(P(7))
check(r.hidden.map((x) => x.name).join() === '단1,단2,단3', '7칸 — 앞 3칸을 접는다')
check(r.hidden.length + r.shown.length === 7, '접어도 칸이 사라지지 않는다 — 눌러서 펼칠 수 있다')
check(collapsePath(P(6), 2).shown.length === 2, '보일 칸 수를 바꿀 수 있다')

// ── 깊이 (D24) ──
check(canCreateHere(0, 3) === true, '최상위에서는 만들 수 있다')
check(canCreateHere(2, 3) === true, '2단 안에서는 만들 수 있다(3단이 된다)')
check(canCreateHere(3, 3) === false, '3단 안에서는 못 만든다')

// ── 검색 범위 표시 (D27 · D29) ──
check(scopeLabel([]) === '내 자료 전체에서', '루트에서는 전체')
check(scopeLabel(P(2)) === '단2 아래에서', '폴더 안에서는 그 폴더 이름')
check(!scopeLabel(P(3)).includes('깊이'), '「깊이」 같은 군더더기를 붙이지 않는다 (D29)')


// ══════════════════════════════════════════════
// 트리 · 검색 범위 (D27)
// ══════════════════════════════════════════════
//   2026 ─ 1분기 ─ 영업
//        └ 2분기
//   기타
const TREE = [
  { id: 'a', name: '2026',  parent_id: null, folder_count: 2, project_count: 0 },
  { id: 'b', name: '1분기', parent_id: 'a',  folder_count: 1, project_count: 0 },
  { id: 'c', name: '영업',  parent_id: 'b',  folder_count: 0, project_count: 0 },
  { id: 'd', name: '2분기', parent_id: 'a',  folder_count: 0, project_count: 0 },
  { id: 'e', name: '기타',  parent_id: null, folder_count: 0, project_count: 0 },
]
const DOCS = [
  { id: 'p0', name: '최상위 자료', updated_at: 3, folder_id: null },
  { id: 'p1', name: '2026 자료',   updated_at: 4, folder_id: 'a' },
  { id: 'p2', name: '1분기 자료',  updated_at: 5, folder_id: 'b' },
  { id: 'p3', name: '영업 자료',   updated_at: 6, folder_id: 'c' },
  { id: 'p4', name: '기타 자료',   updated_at: 7, folder_id: 'e' },
]
const ids = (a) => a.map((x) => x.id).join(',')
const S = (o) => ids(scopedProjects({ projects: DOCS, folders: TREE, ...o }))

// ── 한 단 ──
check(childrenOf(TREE, null).map((f) => f.name).join() === '2026,기타', '최상위는 두 개')
check(childrenOf(TREE, 'a').map((f) => f.name).join() === '1분기,2분기', '2026 아래 두 개 (이름순)')
check(childrenOf(TREE, 'c').length === 0, '잎에는 자식이 없다')

// ── 하위 전부 ──
check([...subtreeIds(TREE, 'a')].sort().join() === 'a,b,c,d', '2026 아래 전부')
check([...subtreeIds(TREE, 'c')].join() === 'c', '잎은 자기만')
check(subtreeIds(TREE, null).has(null), '최상위 기준이면 「폴더 없음」도 범위에 든다')
check([...subtreeIds(TREE, null)].length === TREE.length + 1, '최상위 기준이면 전부 + null')
// 부모 링크가 깨져도 갇히지 않는다
const cycle = [{ id: 'x', name: 'x', parent_id: 'y', folder_count: 0, project_count: 0 },
               { id: 'y', name: 'y', parent_id: 'x', folder_count: 0, project_count: 0 }]
check([...subtreeIds(cycle, 'x')].sort().join() === 'x,y', '고리가 있어도 무한히 돌지 않는다')

// ── 목록은 한 단계 (검색어 없음) ──
check(S({ here: null, query: '' }) === 'p0', '최상위 목록 — 폴더에 안 든 것만')
check(S({ here: 'a', query: '' }) === 'p1', '2026 목록 — 그 폴더에 직접 든 것만')
check(S({ here: 'e', query: '' }) === 'p4', '기타 목록')

// ── 검색은 하위를 본다 (D27) ──
check(S({ here: 'a', query: '자료' }) === 'p1,p2,p3', '2026 에서 검색 — 아래 전부')
check(S({ here: 'b', query: '자료' }) === 'p2,p3', '1분기에서 검색 — 그 아래만')
check(!S({ here: 'b', query: '자료' }).includes('p4'), '형제 폴더(기타)는 안 걸린다')
check(S({ here: null, query: '자료' }) === 'p0,p1,p2,p3,p4', '최상위에서 검색 — 전부')
check(S({ here: 'a', query: '영업' }) === 'p3', '검색어가 좁힌다')
check(S({ here: 'a', query: '없는말' }) === '', '0건')
check(S({ here: 'c', query: '자료' }) === 'p3', '잎에서 검색하면 그 폴더만')

// ── 날짜도 검색이다 (범위가 하위로 넓어진다) ──
check(S({ here: 'a', query: '', from: '' , to: '' }) === 'p1', '조건이 다 비면 한 단계')
check(ids(scopedProjects({ projects: DOCS, folders: TREE, here: 'a', query: '',
  from: new Date(5).toISOString().slice(0, 10) })) !== 'p1',
  '날짜만 넣어도 검색으로 쳐서 하위를 본다')

// ── 폴더 칸에 적을 개수 ──
check(countInSubtree(DOCS, TREE, 'a') === 3, '2026 아래 자료 3건 (자기 것 + 하위)')
check(countInSubtree(DOCS, TREE, 'c') === 1, '잎은 자기 것만')
check(countInSubtree(DOCS, TREE, 'd') === 0, '빈 폴더는 0')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
