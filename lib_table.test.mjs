// 자료 목록의 표 — 열·줄 세우기·언제 표를 포기하는가.
//
// 2026-09-15 · 줄 목록(`9월 3일 14:20 · 12페이지 · 결재 중 · 잠김`)에서 표로 바꿨다.
// 같은 종류가 세로로 서야 눈이 글을 안 읽고, 「승인된 것만」·「오래된 것부터」가 된다.
//
// 여기서 지키는 것.
//   · 줄 세우기는 **원본을 안 건드린다** — 스토어가 들고 있는 배열이다
//   · 값이 없는 줄은 방향과 상관없이 **늘 뒤로** — 안 낸 자료가 화면을 덮으면 안 된다
//   · 상태는 **일이 흘러가는 순서**로 선다 (가나다가 아니다)
//   · 날짜는 최근 먼저, 글자는 가나다순으로 **시작**한다
//   · 동점은 늘 같게 깨진다 — 같은 화면을 두 번 봤는데 차례가 달라지면 안 된다
//   · 좁으면 표를 **포기한다**
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs lib_table.test.mjs

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const {
  LIB_COLS, LIB_TABLE_MIN, LIB_ACTS_W, wantsTable, nextSort, sortRows,
  LIB_SORT_DEFAULT, LIB_STATE_LABEL, folderRowsOf,
} = await import('./src/persistence/libTable.ts')
const { DOC_STATE_LABEL } = await import('./src/approvals/approvalApi.ts')

// ── 열 ──────────────────────────────────────────────
{
  const keys = LIB_COLS.map((c) => c.key).join(',')
  check(keys === 'name,state,approver,sent,updated,published',
    '고른 여섯 열이 그 차례로 선다 (⑤)', keys)
  check(LIB_TABLE_MIN === LIB_COLS.reduce((a, c) => a + c.w, 0) + LIB_ACTS_W,
    '최소 폭은 열 폭 합 + 도구 칸이다 — 한 군데서 셈한다')
  check(LIB_TABLE_MIN > 700 && LIB_TABLE_MIN < 900, `최소 폭이 ${LIB_TABLE_MIN}px 쯤이다`)
  check(wantsTable(LIB_TABLE_MIN) && !wantsTable(LIB_TABLE_MIN - 1),
    '딱 맞으면 그리고 한 픽셀 모자라면 포기한다')
  check(!wantsTable(1126 - 214 - 220 - 340),
    '1126 창 + 폴더 칸 + 상세까지 열면 표를 포기한다 (352px)')
  check(wantsTable(1512 - 214), '1512 창에서 상세를 닫으면 표가 들어간다')
}

// ── 상태 이름표 ─────────────────────────────────────
{
  // **일부러 다르다.** 줄 목록의 배지는 「초안·승인」을 안 적는다(모든 줄에 붙으면
  // 배지가 아니라 배경이다). 표의 상태 칸은 반대로 **비면 안 된다.**
  check(DOC_STATE_LABEL.draft === '' && DOC_STATE_LABEL.approved === '',
    '줄 목록 배지는 초안·승인을 안 적는다 (그대로다)')
  check(LIB_STATE_LABEL.draft === '초안' && LIB_STATE_LABEL.approved === '승인',
    '표의 상태 칸은 초안·승인도 적는다 — 빈 칸이면 그 칸을 만든 뜻이 없다')
  check(Object.keys(LIB_STATE_LABEL).length === Object.keys(DOC_STATE_LABEL).length,
    '두 이름표가 같은 상태 집합을 덮는다 — 한쪽에만 있는 상태가 없다')
  check(Object.values(LIB_STATE_LABEL).every((v) => v.length > 0), '표에는 빈 글자가 없다')
}

// ── 열 머리를 눌렀을 때 ─────────────────────────────
{
  check(LIB_SORT_DEFAULT.key === 'updated' && LIB_SORT_DEFAULT.dir === 'desc',
    '처음은 최근 수정 먼저 — 서버가 주는 차례와 같은 뜻이다')
  const a = nextSort(LIB_SORT_DEFAULT, 'updated')
  check(a.dir === 'asc', '같은 열을 또 누르면 방향만 뒤집는다')
  check(nextSort(a, 'updated').dir === 'desc', '한 번 더 누르면 되돌아온다')
  check(nextSort(LIB_SORT_DEFAULT, 'name').dir === 'asc', '글자 열은 가나다순으로 시작한다')
  check(nextSort(LIB_SORT_DEFAULT, 'sent').dir === 'desc', '날짜 열은 최근 먼저로 시작한다')
  // 한 방향으로 통일하면 「수정일」을 눌렀을 때 2019년 것부터 나온다.
  check(nextSort({ key: 'name', dir: 'asc' }, 'updated').dir === 'desc',
    '다른 열로 옮겨도 그 열의 기본 방향을 쓴다 — 앞 열의 방향을 물려받지 않는다')
}

// ── 줄 세우기 ───────────────────────────────────────
const R = (id, name, updated_at, published_id = null) => ({ id, name, updated_at, published_id })
const C = (state, created_at, approver_name) => ({
  approval_id: 'a', status: 'pending', round: 1, kind: 'approval',
  decided_at: null, created_at, state, locked: false, approver_name,
})
{
  const rows = [R('p1', '나', 200), R('p2', '가', 100), R('p3', '다', 300)]
  const chips = {}
  const before = rows.map((r) => r.id).join(',')
  const out = sortRows(rows, chips, { key: 'name', dir: 'asc' })
  check(rows.map((r) => r.id).join(',') === before, '**원본을 안 건드린다**')
  check(out.map((r) => r.name).join(',') === '가,나,다', '가나다순으로 선다')
  check(sortRows(rows, chips, { key: 'name', dir: 'desc' }).map((r) => r.name).join(',') === '다,나,가',
    '거꾸로도 선다')
}
{
  // 상태는 **일이 흘러가는 순서**다. 가나다면 「반려」와 「발행」이 붙어 서고 뜻이 없다.
  const rows = [R('a', 'A', 1), R('b', 'B', 2), R('c', 'C', 3), R('d', 'D', 4)]
  const chips = { a: C('approved', 10), b: C('draft', 10), c: C('pending', 10), d: C('rejected', 10) }
  const out = sortRows(rows, chips, { key: 'state', dir: 'asc' }).map((r) => chips[r.id].state)
  check(out.join(',') === 'draft,pending,rejected,approved', '초안 → 결재 중 → 반려 → 승인', out.join(','))
}
{
  // **빈 값은 늘 뒤로.** 안 그러면 「낸 날」로 세울 때마다 안 낸 자료가 화면을 덮는다.
  const rows = [R('p1', '낸 것', 100), R('p2', '안 낸 것', 200), R('p3', '낸 것2', 300)]
  const chips = { p1: C('pending', 50), p3: C('pending', 70) }
  const asc = sortRows(rows, chips, { key: 'sent', dir: 'asc' }).map((r) => r.id)
  const desc = sortRows(rows, chips, { key: 'sent', dir: 'desc' }).map((r) => r.id)
  check(asc[asc.length - 1] === 'p2' && desc[desc.length - 1] === 'p2',
    '값이 없는 줄은 **방향과 상관없이** 맨 뒤다', asc.join(',') + ' / ' + desc.join(','))
  check(asc.slice(0, 2).join(',') === 'p1,p3' && desc.slice(0, 2).join(',') === 'p3,p1',
    '값이 있는 것끼리는 제대로 선다')
}
{
  const rows = [R('p1', 'A', 100), R('p2', 'B', 200)]
  const chips = { p1: C('pending', 1, '이강선'), p2: C('pending', 2) }
  const out = sortRows(rows, chips, { key: 'approver', dir: 'asc' }).map((r) => r.id)
  check(out.join(',') === 'p1,p2', '결재자가 없는 줄은 뒤로 — 결정 전에는 결재자가 없다')
}
{
  const rows = [R('p1', 'A', 100, null), R('p2', 'B', 200, 'e1'), R('p3', 'C', 300, null)]
  const out = sortRows(rows, {}, { key: 'published', dir: 'desc' }).map((r) => r.id)
  check(out[0] === 'p2', '발행된 것을 먼저 세울 수 있다')
}
{
  // **동점은 늘 같게 깨진다.** 안 정하면 같은 화면을 두 번 봤는데 차례가 달라진다.
  const rows = [R('p1', '같음', 100), R('p2', '같음', 300), R('p3', '같음', 200)]
  const a = sortRows(rows, {}, { key: 'name', dir: 'asc' }).map((r) => r.id).join(',')
  const b = sortRows(rows.slice().reverse(), {}, { key: 'name', dir: 'asc' }).map((r) => r.id).join(',')
  check(a === b, '들어온 차례가 달라도 결과가 같다', a + ' vs ' + b)
  check(a === 'p2,p3,p1', '동점은 최근 수정 먼저로 깬다', a)
}

// ── 화면이 그 규칙을 쓰는가 ─────────────────────────
{
  const { readFileSync } = await import('node:fs')
  const read = (p) => readFileSync(p, 'utf8')
  const lib = read('./src/persistence/LibraryScreen.tsx')
  const css = read('./src/index.css')

  // ── 가 · 폭은 한 군데서 정한다 ──
  check(/--lib-w:min\(1400px,100%\)/.test(css), '폭을 한 군데서 정한다')
  // **숫자로 세던 것을 이름으로 바꿨다**(2026-09-15). 전에는 「9개 이상」으로 셌는데,
  // 안 쓰는 `.lib-search{width:var(--lib-w)}` 가 그 숫자를 채워 주고 있었다 —
  // 죽은 줄 하나가 지킴이를 통과시키고 있었던 셈이다. 이제 **어느 줄인지**를 적는다.
  for (const k of ['lib-head', 'lib-crumb', 'lib-ferr', 'lib-mk', 'lib-pager', 'lib-list', 'lib-pagebar']) {
    check(new RegExp(`\\.${k}\\{[^}]*width:var\\(--lib-w\\)`).test(css),
      `.${k} 가 그 한 폭을 쓴다`)
  }
  // 데모 덮개 하나만 남는다 — 목록과 무관한 자리다.
  check((css.match(/width:min\(880px,94vw\)/g) || []).length === 1,
    '줄마다 880px 를 박아 두지 않는다 (남은 하나는 데모 덮개)')

  // ── ㄷ · 검색이 머리줄로 ──
  //
  // **줄 자체가 공통 부품이 됐다**(2026-09-15). 전에는 화면마다 제 손으로 그렸고
  // 크기도 말도 달랐다 — 그래서 `.lib-search` 라는 이름은 더 없다.
  const head = lib.slice(lib.indexOf('className="lib-head"'), lib.indexOf('</SearchRow>'))
  check(/<SearchRow/.test(head),
    '검색이 **머리줄 안**에 있다 — 목록 위가 한 줄 가벼워진다')
  check((lib.match(/<SearchRow/g) || []).length === 1,
    '검색 줄이 두 군데에 있지 않다')
  check(!/className="lib-search"/.test(lib),
    '제 손으로 그리던 옛 줄이 남아 있지 않다')

  // ── ⑤ · 표 ──
  check(/const asTable = listW === 0 \|\| wantsTable\(listW\)/.test(lib),
    '표를 그릴지는 **잰 폭**으로 정한다 — 창 크기만으로는 사이드바·폴더 칸을 못 센다')
  check(/new ResizeObserver/.test(lib) && /getBoundingClientRect\(\)\.width/.test(lib),
    '그리기 전에 한 번 재고, 그 뒤로는 바뀔 때마다 다시 잰다')
  check(/setListW\(el\.getBoundingClientRect\(\)\.width\)/.test(lib)
     && /useLayoutEffect/.test(lib),
    '**칠하기 전에** 잰다 — 0 에서 시작하면 들어올 때마다 줄 목록이 깜빡였다 표로 바뀐다')
  check(/typeof ResizeObserver === 'undefined'/.test(lib),
    '관찰자가 없는 환경에서도 안 터진다')
  check(/onClick=\{\(\) => setSort\(nextSort\(sort, c\.key\)\)\}/.test(lib),
    '열 머리를 누르면 줄 세우기가 바뀐다')
  check(/aria-sort=/.test(lib), '어느 열로 세웠는지 보조 기술도 안다')

  // **줄 세운 뒤에 쪽을 나눈다.** 거꾸로 하면 1쪽 안에서만 줄이 서서,
  // 「제목순」인데 2쪽 첫 줄이 1쪽 마지막 줄보다 앞에 온다.
  const iSort = lib.indexOf('sortRows(filtered, chips, sort)')
  const iSlice = lib.indexOf('ordered.slice((cur - 1) * PAGE_SIZE')
  check(iSort > 0 && iSlice > iSort, '줄을 세운 **뒤에** 쪽을 나눈다')
  check(!/filtered\.slice\(\(cur - 1\)/.test(lib), '안 세운 목록을 쪽으로 자르지 않는다')

  // 도구 칸이 한 벌이어야 한다 — 두 벌이면 한쪽만 고쳐진다.
  // 확인창 제목에도 같은 말이 있으므로 **단추만** 센다.
  check((lib.match(/className="lib-act" title="결재 제출"/g) || []).length === 1,
    '줄 오른쪽 도구가 한 벌이다 (표와 줄 목록이 같이 쓴다)')
  check((lib.match(/\{actionsFor\(p\)\}/g) || []).length === 2,
    '그 한 벌을 표와 줄 목록이 각각 불러 쓴다')
  check((lib.match(/className="lib-rename"/g) || []).length === 1,
    '이름 고치는 칸도 한 벌이다')

  // 표의 상태 칸은 **빈 칸이 아니다**. 줄 목록 배지와 다른 이름표를 쓴다.
  check(/LIB_STATE_LABEL\[c\.state\]/.test(lib), '표는 표용 이름표를 쓴다')
  check(/DOC_STATE_LABEL\[chips\[p\.id\]\.state\]/.test(lib), '줄 목록은 배지 이름표를 그대로 쓴다')

  // 값이 없는 칸.
  check(/\{c\?\.approver_name \|\| dim\}/.test(lib), '결재자가 없으면 「—」 — 결정 전에는 없는 게 맞다')
  // **칩이 없는 것과 값이 없는 것은 다른 말이다.** 결재 이력이 하나도 없으면 초안이다.
  check(/<span className="lib-chip draft" style=\{\{ marginLeft: 0 \}\}>\{LIB_STATE_LABEL\.draft\}<\/span>/.test(lib),
    '결재 이력이 없으면 「초안」이다 — 「—」로 두면 새로 만든 자료가 전부 「모름」처럼 보인다')
  check(/\.lib-chip\.draft\{background:#f1f3f6/.test(css),
    '그 칩에 색이 있다 — 표에서만 쓰이므로 가장 조용한 색이다')
  check(/\{c\?\.created_at \? fmtKst\(c\.created_at\) : dim\}/.test(lib), '안 낸 자료의 「낸 날」도 「—」')
}

// ── 폴더가 목록 첫 줄로 (①ㄴ · 2026-09-15) ────────────
//
// 5열 카드를 걷고 폴더를 목록 안으로 들였다. 카드가 하던 일(폴더로 들어가기)을
// 사이드바 나무가 똑같이 하고 있어서, 같은 것이 한 화면에 두 번 있었다.
{
  const F = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]
  check(folderRowsOf(F, false, 1).length === 3, '첫 쪽에서는 폴더가 다 보인다')
  check(folderRowsOf(F, false, 1).map((f) => f.id).join(',') === 'f1,f2,f3',
    '받은 차례 그대로 — 줄 세우기는 자료에만 건다')

  // **검색 중에는 감춘다.** 검색은 자료를 찾는 일이라, 결과 위에 폴더가 얹히면
  // 무엇이 걸린 것인지 헷갈린다 — 카드 시절부터의 규칙을 그대로 옮겨 왔다.
  check(folderRowsOf(F, true, 1).length === 0, '검색 중에는 폴더가 안 보인다')

  // **첫 쪽에서만.** 폴더는 목록의 일부지 목록 위에 붙은 머리글이 아니다.
  // 쪽마다 되풀이되면 「쪽을 넘겼는데 안 넘어갔나」가 된다.
  check(folderRowsOf(F, false, 2).length === 0, '둘째 쪽에는 폴더가 안 따라온다')
  check(folderRowsOf(F, false, 9).length === 0, '먼 쪽에도 안 따라온다')
  check(folderRowsOf(F, true, 3).length === 0, '검색 + 뒷쪽 — 둘 다 걸려도 안 보인다')

  check(folderRowsOf([], false, 1).length === 0, '폴더가 없으면 빈 채로')

  // **원본을 안 건드린다.** 스토어가 들고 있는 배열이라, 화면이 뒤집으면
  // 다음에 그리는 곳이 뒤집힌 것을 본다(`sortRows` 와 같은 약속이다).
  const src = [{ id: 'a' }, { id: 'b' }]
  const out = folderRowsOf(src, false, 1)
  out.reverse()
  check(src.map((f) => f.id).join(',') === 'a,b', '받은 배열을 그 자리에서 안 뒤집는다')
  check(out !== src, '새 배열을 준다')
}

// ── 화면이 정말 그 답을 쓰는가 ──────────────────────
{
  const { readFileSync } = await import('node:fs')
  const lib = readFileSync('./src/persistence/LibraryScreen.tsx', 'utf8')
  const css = readFileSync('./src/index.css', 'utf8')
  check(/folderRowsOf\(subFolders, searching, cur\)/.test(lib),
    '폴더 줄을 화면이 제 손으로 고르지 않는다 — libTable 의 답을 쓴다')
  // 건수는 **자료 기준**이다. 폴더를 더해 「전체 5개 · 1/1 페이지」라고 적으면
  // 12개씩 나누는 셈과 안 맞는다 — 쪽에 실린 것은 3개인데 5개라고 적힌다.
  check(/\{searching \? '조회 결과' : '전체'\} \{total\}개/.test(lib),
    '「전체 N개」는 자료 수 그대로다 (폴더를 더하지 않는다)')
  check(/폴더 \$\{fRows\.length\}개 · /.test(lib),
    '폴더 수는 그 앞에 따로 적는다')
  // 폴더만 있고 자료가 없을 때 목록이 통째로 비면 폴더까지 사라진다.
  check(/total === 0 && fRows\.length === 0/.test(lib),
    '폴더가 있으면 빈 화면으로 덮지 않는다')
  check(/colSpan=\{LIB_COLS\.length \+ 1\}/.test(lib),
    '그때 빈 말은 표 안에 **줄 하나**로 들어간다 (칸 수를 손으로 안 센다)')

  // ── ②ㄴ 검색 줄이 표와 같은 폭 ──
  //
  // `.lib-head` 는 로고·이름표·「팀 공유」·「결재함」을 함께 담던 시절의 가로 flex 였다.
  // 자식이 검색 줄 하나만 남은 뒤로 그 규칙은 **줄을 제 내용만큼(846px)만 늘리는** 일을
  // 했다 — 표는 1258 인데 줄은 846 이라 「새 이북」이 표 오른쪽 끝에서 412px 떨어진
  // 허공에 섰고, 창이 좁아지면 단추만 아랫줄로 밀렸다.
  check(/\.lib-head\{width:var\(--lib-w\)[^}]*\}/.test(css),
    '머리줄이 표와 같은 폭이다')
  check(!/\.lib-head\{[^}]*display:flex/.test(css),
    '머리줄이 다시 가로 flex 가 되지 않았다 (되면 검색 줄이 제 내용만큼만 늘어난다)')
  check(/\.srow-end\{[^}]*margin-left:auto/.test(readFileSync('./src/ui/searchRow.css', 'utf8').replace(/\s+/g, '')),
    '단추는 그 줄의 **맨 오른쪽 끝**에 붙는다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
