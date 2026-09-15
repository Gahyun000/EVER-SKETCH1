// 사이드바 나무가 무엇을 어떤 차례로 보이는가.
//
// 2026-09-15 · 폴더가 목록 위 카드에서 **왼쪽 나무**로 옮겨 왔다. 들어가면 카드가
// 사라지고 나오려면 위 경로를 눌러야 하던 구조에서는 「지금 어디 있나」와 「어디로
// 갈 수 있나」를 같이 볼 수 없었고, 자료를 열려면 반드시 목록 화면을 거쳐야 했다.
//
// 여기서 지키는 것.
//   · 접은 것 아래는 **줄을 만들지 않는다** — 화면이 나중에 거르는 게 아니다
//   · 한 폴더 안은 **폴더 먼저, 그다음 자료**
//   · 자료는 받아 온 차례(최근 수정 순)를 그대로 — 잘리는 것은 늘 오래된 것
//   · 넘치면 「더 보기」 한 줄. 몇 개가 안 보이는지 숫자로 말한다
//   · 부모 링크가 고리를 이뤄도 **안 멈추는 일이 없다**
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs side_tree.test.mjs

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const { treeRows, TREE_ROOT, TREE_DOCS, TREE_OPEN_DEFAULT } = await import('./src/shell/sidebarTree.ts')

const F = (id, name, parent_id = null) => ({ id, name, parent_id })
const P = (id, name, folder_id = null, updated_at = 0) => ({ id, name, folder_id, updated_at })

// 기획 ─ 2026        제안 ─ 물류
const folders = [F('f1', '기획'), F('f2', '2026', 'f1'), F('f3', '제안'), F('f4', '물류', 'f3')]
const projects = [
  P('p1', '9월 기획안', 'f2', 90), P('p2', 'MLOps 구성안', 'f2', 80),
  P('p3', '물류 자동화', 'f4', 70), P('p4', '제목 없음', null, 60),
]
const open = (...ids) => new Set(ids)
const kinds = (rows) => rows.map((r) => r.kind + ':' + r.name + '@' + r.depth).join(' ')

// ── 처음 모습 (⑧ㄴ) ─────────────────────────────────
//
// 2026-09-15 · 처음에는 뿌리를 펴 둔 채로 시작했다. 그랬더니 뿌리에 쌓인 자료가
// 그대로 늘어서서 **결재함이 한참 아래로 밀렸다** — 결재함 배지는 「지금 할 일」
// 신호라 첫 화면에서 밀리면 안 되는 자리다. 그래서 전부 접고 시작한다.
check(Array.isArray(TREE_OPEN_DEFAULT) && TREE_OPEN_DEFAULT.length === 0,
  '아무것도 고른 적 없으면 **전부 접혀 있다** — 메뉴가 자료 목록에 안 밀린다')
check(treeRows(folders, projects, new Set(TREE_OPEN_DEFAULT)).length === 0,
  '그 기본값으로는 나무 줄이 하나도 안 생긴다')

// ── 접으면 줄이 아예 없다 ────────────────────────────
check(treeRows(folders, projects, open()).length === 0,
  '「내 자료」를 접으면 아래 줄을 아예 만들지 않는다 — 그린 다음 숨기는 게 아니다')

// ── 뿌리만 펼친 모습 ─────────────────────────────────
{
  const rows = treeRows(folders, projects, open(TREE_ROOT))
  check(kinds(rows) === 'folder:기획@0 folder:제안@0 doc:제목 없음@0',
    '뿌리를 펴면 **폴더 먼저, 그다음 뿌리에 놓인 자료**', kinds(rows))
  check(rows.every((r) => r.depth === 0), '아직 한 단만 보인다')
  const 기획 = rows[0]
  check(기획.hasKids === true && 기획.open === false, '펼칠 것이 있지만 아직 접혀 있다')
  check(기획.count === 2, '폴더 옆 숫자는 **그 아래 전부**를 센다 (기획 → 2026 의 2건)')
}

// ── 한 단 더 펼치기 ──────────────────────────────────
{
  const rows = treeRows(folders, projects, open(TREE_ROOT, 'f1', 'f2'))
  check(kinds(rows) === 'folder:기획@0 folder:2026@1 doc:9월 기획안@2 doc:MLOps 구성안@2 folder:제안@0 doc:제목 없음@0',
    '편 폴더 아래만 한 단씩 들어간다', kinds(rows))
  check(rows.find((r) => r.name === '9월 기획안').depth === 2, '자료는 제 폴더보다 한 단 더 들어간다')
  check(!rows.some((r) => r.name === '물류 자동화'), '안 편 폴더(제안 › 물류) 안의 자료는 안 보인다')
}

// **차례는 손대지 않는다.** 서버가 updated_at DESC 로 주므로 위가 최근이다.
{
  const rows = treeRows(folders, [P('a', '가', 'f2', 10), P('b', '나', 'f2', 99)], open(TREE_ROOT, 'f1', 'f2'))
  const docs = rows.filter((r) => r.kind === 'doc').map((r) => r.name)
  check(docs.join(',') === '가,나', '받아 온 차례를 그대로 쓴다 — 화면이 다시 정렬하지 않는다')
}

// ── 넘칠 때 (⑩ㄱ) ───────────────────────────────────
{
  const many = Array.from({ length: 13 }, (_, i) => P('m' + i, '자료' + i, 'f2', 100 - i))
  const rows = treeRows(folders, many, open(TREE_ROOT, 'f1', 'f2'))
  const docs = rows.filter((r) => r.kind === 'doc')
  const more = rows.filter((r) => r.kind === 'more')
  check(docs.length === TREE_DOCS, `한 폴더에서 ${TREE_DOCS}개까지만 보인다`, String(docs.length))
  check(docs[0].name === '자료0' && docs[9].name === '자료9',
    '잘리는 것은 **오래된 것** — 방금 만지던 자료는 언제나 보인다')
  check(more.length === 1 && more[0].count === 3,
    '「더 보기」가 한 줄 붙고 **몇 개가 안 보이는지** 숫자로 말한다')
  check(more[0].id === 'f2', '「더 보기」는 어느 폴더의 것인지 들고 있다 — 눌러서 그 목록으로 간다')
  check(more[0].depth === docs[0].depth, '「더 보기」는 자료와 같은 줄에 선다')
  // **그 무리의 끝**이지 배열 전체의 끝이 아니다 — 뒤에 형제 폴더(제안)와 뿌리 자료가 더 온다.
  check(rows.indexOf(more[0]) === rows.lastIndexOf(docs[docs.length - 1]) + 1,
    '「더 보기」는 그 폴더의 마지막 자료 바로 다음에 온다')
  check(rows.some((r) => r.name === '제안'), '「더 보기」 뒤로 형제 폴더가 계속 그려진다')
}
{
  const ten = Array.from({ length: TREE_DOCS }, (_, i) => P('t' + i, 'T' + i, null, i))
  check(!treeRows(folders, ten, open(TREE_ROOT)).some((r) => r.kind === 'more'),
    '딱 맞으면 「더 보기」를 안 붙인다 — 0개 더 있다고 말하지 않는다')
}

// ── 이름 없는 자료 ───────────────────────────────────
{
  const rows = treeRows([], [P('x', '   ', null, 1)], open(TREE_ROOT))
  check(rows[0].name === '제목 없음',
    '이름이 빈 자료도 한 줄을 차지한다 — 빈 글자면 누를 곳이 사라진다')
}

// ── 목록이 이상하게 들어왔을 때 ─────────────────────
{
  // 고리는 **뿌리에서 닿지 않는다** — 고리 안의 폴더는 부모 사슬에 null 이 없다.
  // 그러니 걷기가 멈추는 게 문제가 아니라, 그런 폴더가 나무에 안 뜨는 게 맞는 답이다.
  const loop = [F('a', '가', 'b'), F('b', '나', 'a')]
  const rows = treeRows(loop, [], open(TREE_ROOT, 'a', 'b'))
  check(rows.length === 0, '부모 링크가 고리를 이룬 폴더는 나무에 안 뜬다 — 뿌리에서 닿지 않는다')
}
{
  // **이게 `seen` 이 진짜로 막는 것이다.** 서버가 같은 폴더를 두 번 내려주거나
  // 두 응답이 겹쳐 담기면, 그 아래 가지가 통째로 두 번 그려진다.
  const dup = [F('f1', '기획'), F('f1', '기획'), F('f9', '안', 'f1')]
  const rows = treeRows(dup, [P('p9', '자료', 'f9', 1)], open(TREE_ROOT, 'f1', 'f9'))
  const ids = rows.map((r) => r.kind + ':' + r.id)
  check(new Set(ids).size === ids.length, '같은 id 가 두 번 들어와도 한 번만 그린다', ids.join(','))
  check(rows.filter((r) => r.name === '자료').length === 1, '그 아래 가지도 두 번 안 그려진다')
}

// ── 펴 둔 것을 기억하는가 (⑧ㄱ) ─────────────────────
{
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  const { shellTreeOpen, rememberShellTreeOpen } = await import('./src/persistence/prefs.ts')

  check(shellTreeOpen() === null, '아직 고른 적이 없으면 null — 부르는 쪽이 제 기본값(뿌리만 펴기)을 쓴다')
  rememberShellTreeOpen([TREE_ROOT, 'f1'])
  check(JSON.stringify(shellTreeOpen()) === JSON.stringify([TREE_ROOT, 'f1']), '펴 둔 폴더를 기억한다')
  // **「전부 접음」과 「아직 안 골랐음」은 다른 말이다.** 안 가르면 전부 접은 사람이
  // 들어올 때마다 뿌리가 도로 펴진다.
  rememberShellTreeOpen([])
  check(Array.isArray(shellTreeOpen()) && shellTreeOpen().length === 0,
    '전부 접어 둔 것도 그대로 기억한다 — 다음에 들어와도 안 펴진다')

  store.set('es_shell_tree_open', '{{{')
  check(shellTreeOpen() === null, '망가진 값이면 null 로 떨어진다')
  store.set('es_shell_tree_open', '[1,{"a":2},"f9"]')
  check(JSON.stringify(shellTreeOpen()) === JSON.stringify(['f9']),
    '글자가 아닌 것은 버린다 — 섞여 있으면 Set.has 가 조용히 늘 거짓이 된다')

  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
    removeItem: () => { throw new Error('blocked') },
  }
  let threw = false
  try { check(shellTreeOpen() === null, '저장이 막힌 브라우저에서도 null 로 떨어진다') } catch { threw = true }
  try { rememberShellTreeOpen(['x']) } catch { threw = true }
  check(!threw, '저장이 막혀도 **던지지 않는다** — 나무 하나 때문에 화면이 안 뜨면 안 된다')
}

// ── 셸이 나무를 어떻게 붙였나 ───────────────────────
{
  const { readFileSync } = await import('node:fs')
  const read = (p) => readFileSync(p, 'utf8')
  const shell = read('./src/shell/AppShell.tsx')
  const tsx = read('./src/shell/SideTree.tsx')
  const css = read('./src/shell/shell.css')

  // **펴 둔 상태는 한 군데서 나온다.** 셸과 나무가 각자 useTreeOpen() 을 부르면
  // 나무를 접어도 위 ▾ 는 펴진 채로 남고, 다음 렌더에 도로 펴진다.
  check(/const \{ open: treeOpen, toggle: treeToggle \} = useTreeOpen\(\)/.test(shell),
    '펴 둔 상태는 셸이 들고 있다')
  check(/<SideTree open=\{treeOpen\} toggle=\{treeToggle\}/.test(shell),
    '나무는 그 값을 받아 쓴다 — 제 손으로 또 만들지 않는다')
  check(!/useTreeOpen\(\)/.test(tsx.split('export default')[1] || ''),
    '나무 안에서 useTreeOpen() 을 다시 부르지 않는다')
  check(/saved === null \? TREE_OPEN_DEFAULT : saved/.test(tsx),
    '처음 모습은 **한 군데(TREE_OPEN_DEFAULT)**에서 온다 — 화면이 제 손으로 정하지 않는다')

  // 나무는 「내 자료」에만, 그리고 **메뉴 안에 둔 동안** 거기 달린다.
  // 제 칸으로 뺐으면(①ㄴ) 「내 자료」 밑은 비어야 한다 — 둘 다 그리면 나무가 두 벌이 된다.
  check(/const treeInNav = !treeCol && !shut/.test(shell),
    '메뉴 안에 나무가 달리는 조건이 한 군데에 적혀 있다')
  check(/it\.k === 'library' && treeInNav\s*\n?\s*\? <SideTree/.test(shell),
    '나무는 「내 자료」 아래에만, 메뉴 안에 둔 동안에만 그린다')
  check(/\{it\.k === 'library' && treeInNav \? \(/.test(shell),
    '뿌리의 ▾ 도 같은 조건을 쓴다 — 나무가 없는데 화살표만 남지 않는다')
  check(/\.sh-body\.shut \.sh-tree, \.sh-body\.shut \.sh-fold \{ display: none/.test(css),
    '접힌 60px 열에는 나무가 없다 — 글자가 없으면 나무가 아니다')

  // ⑥ — 한 줄에 누를 곳이 둘.
  check(/\.sh-navrow\.hastree:hover > \.sh-fold \{ display: grid/.test(css)
     && /\.sh-navrow\.hastree:hover > \.sh-nav > \.ic \{ visibility: hidden/.test(css),
    '마우스를 올리면 아이콘 자리가 ▾ 로 **바뀐다** — 둘이 겹쳐 보이지 않는다')
  check(/\.sh-trow\.kids:hover \.sh-tfold \.em \{ display: none/.test(css)
     && /\.sh-trow\.kids:hover \.sh-tfold \.ar \{ display: block/.test(css),
    '폴더 줄도 같은 몸짓이다')
  check(/\.sh-fold:focus-visible \{ display: grid/.test(css),
    '키보드로 짚어도 드러난다 — 아이콘만 보고는 누를 곳인지 알 수 없다')

  // 자료를 누르면 **목록을 안 거친다.** 나무를 놓은 이유가 이것이다.
  check(/if \(r\.kind === 'doc'\) \{ void openProject\(r\.id\); return \}/.test(tsx),
    '자료 이름을 누르면 바로 연다 — 목록 화면을 거치지 않는다')
  check(/setHere\(r\.id \|\| null\)\s*\n\s*onGo\(\)/.test(tsx),
    '폴더와 「더 보기」는 그 폴더의 목록으로 간다')
  check(/onClick=\{\(\) => toggle\(r\.id\)\}/.test(tsx) && /aria-expanded=\{r\.open\}/.test(tsx),
    '아이콘 자리는 접고 펴기만 한다 — 화면을 안 옮긴다')

  // 편집 중에도 나무가 비지 않아야 한다.
  check(/void loadFolders\(\)\.catch\(/.test(tsx),
    '나무도 폴더를 받아 온다 — 편집 중에 펴면 비어 있으면 안 된다')
  check(/catch\(\(\) => \{ \/\* 나무는 부가 정보다 \*\/ \}\)/.test(tsx),
    '못 받아 와도 **조용히** 지나간다 — 목록 화면의 빨간 줄과는 무게가 다르다')

  // ── ① 칸 나누기 ─────────────────────────────────
  check(/\{treeCol && !shut \? \(/.test(shell) && /<aside className="sh-col"/.test(shell),
    '제 칸으로 빼면 메뉴와 본문 사이에 칸이 하나 생긴다')
  check(/gridTemplateColumns: \(shut \? '60px' : width \+ 'px'\)\s*\n\s*\+ \(treeCol && !shut \? ' 220px' : ''\) \+ ' 1fr'/.test(shell),
    '칸이 늘면 격자도 같이 는다 — 폭 계산이 한 군데에 있다')
  check(/treeCol && !shut/.test(shell) && !/treeCol \? <aside/.test(shell),
    '접힌 60px 열 옆에 폴더 칸만 남지 않는다')
  check(/col \? new Set\(\[\.\.\.open, TREE_ROOT\]\) : open/.test(tsx),
    '제 칸에서는 뿌리를 접지 않는다 — 칸을 통째로 비우면 다시 펼 자리가 없다')
  check(/if \(!col && !rows\.length\) return null/.test(tsx),
    '제 칸에서는 줄이 없어도 머리줄이 남는다 — 안 그러면 합칠 자리가 사라진다')
  // **바꾸는 글자는 「그 칸의 머리줄」에 있다.**
  // 제 칸일 때는 칸 머리줄에 「폴더 … 합치기」, 메뉴 안일 때는 「내 자료」 줄
  // 오른쪽 끝에 「칸 나누기」. 전에는 메뉴 안에서 나무 위에 줄을 하나 더 만들어
  // 어중간하게 떠 있었다(2026-09-15, 사용자가 화면으로 잡아 줬다).
  check(/\{col && \(/.test(tsx) && />합치기<\/button>/.test(tsx),
    '제 칸일 때는 칸 머리줄에 「합치기」가 있다')
  check(!/'칸 나누기'/.test(tsx) && !/칸 나누기/.test(tsx),
    '메뉴 안일 때의 글자는 나무가 아니라 셸이 놓는다')
  check(/className="sh-tswap onrow"/.test(shell) && />칸 나누기<\/button>/.test(shell),
    '「칸 나누기」는 **「내 자료」 줄 오른쪽 끝**에 있다 — 「합치기」와 같은 자리다')
  check(/\.sh-tswap\.onrow \{ position: absolute; right: 7px/.test(css)
     && /\.sh-navrow\.hastree:hover > \.sh-tswap\.onrow \{ opacity: 1/.test(css),
    '그 줄에 마우스가 올 때 드러난다')
  // 나무를 접어 두어도 보인다 — 처음에는 접힌 채로 시작하므로(⑧ㄴ) 이게 중요하다.
  check(/it\.k === 'library' && treeInNav \? \(\s*\n\s*\/\* \*\*「내 자료」의 머리줄/.test(shell),
    '나무를 펴지 않아도 보인다 — 조건이 「메뉴 안이냐」뿐이다')
  check(/<span className="t">폴더<\/span>/.test(tsx) && !/col \? <span/.test(tsx),
    '「폴더」라는 이름표는 제 칸에만 있다 — 메뉴 안에서는 바로 위 「내 자료」가 그 말이다')
  check(/\.sh-side:hover \.sh-tswap, \.sh-col:hover \.sh-tswap \{ opacity: 1/.test(css),
    '바꾸는 글자는 평소엔 안 보인다 — 한 번 쓰고 마는 글자가 자리를 계속 차지하지 않는다')
  check(/\.sh-tswap:focus-visible \{ opacity: 1/.test(css), '키보드로 짚으면 드러난다')
}

// ── 제 칸으로 뺐는지 기억하는가 (①) ─────────────────
{
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  const { shellTreeCol, rememberShellTreeCol, rememberShellTreeOpen: remOpen } =
    await import('./src/persistence/prefs.ts')
  check(shellTreeCol() === false, '기본은 메뉴 안이다 (①ㄱ) — 처음 보는 사람에게 칸 넷은 많다')
  rememberShellTreeCol(true)
  check(shellTreeCol() === true, '제 칸으로 뺀 것을 기억한다')
  rememberShellTreeCol(false)
  check(shellTreeCol() === false, '다시 합친 것도 기억한다')
  // **자리가 겹치면 서로 덮어쓴다.** 폴더를 펴 두었다고 칸이 갈라지면 안 된다.
  remOpen(['f1'])
  check(store.get('es_shell_tree_col') === '0' && store.get('es_shell_tree_open') === '["f1"]',
    '펴 둔 폴더와 칸 나누기는 **다른 자리**에 적힌다', [...store.keys()].join(','))
  check(shellTreeCol() === false, '폴더를 펴 두어도 칸은 안 갈라진다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
