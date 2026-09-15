// 검색 줄이 **한 벌인가.**
//
// 2026-09-15 · 전에는 세 벌이었다. 재 보니 이랬다.
//   · 자료 목록 — 검색어 칸 글자 14px · 테두리 1.4 · 둥글기 10 · 「검색」+「초기화」
//   · 팀 공유   — 글자 12.5px · 테두리 1 · 둥글기 8 · 「조회」만 (**초기화가 없었다**)
//   · 결재함   — 아예 없었다
// 저장소 주석끼리도 어긋나 있었다 — 한쪽은 「표준: 검색·초기화」, 다른 쪽은 「표준: 조회 버튼」.
//
// 사용자 결정: ①ㄴ 기간 먼저 · ②ㄱ 「검색」+「초기화」 · ③ㄱ 기간 셋 다 ·
//              ④ㄴ 건수는 목록 바로 위 · ⑤ㄱ 범위 표시는 없앤다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs search_row.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')

const { inRange, hits, rangeOf } = await import('./src/ui/searchFilter.ts')

// ── 범위 규칙 ───────────────────────────────────────
{
  const d = (s) => new Date(s).getTime()
  check(inRange(d('2026-09-08T09:00:00'), '2026-09-08', '2026-09-08'),
    '「9월 8일까지」는 **8일을 넣는다** — 자정으로 끊으면 그날 것이 통째로 빠진다')
  check(!inRange(d('2026-09-09T00:00:01'), '', '2026-09-08'), '9일은 안 들어온다')
  check(inRange(d('2026-09-08T23:59:59'), '2026-09-08', ''), '시작만 걸어도 된다')
  check(rangeOf().fromTs === -Infinity && rangeOf().toTs === Infinity, '안 걸면 열려 있다')

  // **값이 없는 줄**(아직 안 낸 자료)은 범위를 걸었을 때만 뺀다.
  check(inRange(null), '기간을 안 걸면 날짜 없는 것도 보인다 — 안 그러면 새 자료가 사라진다')
  check(!inRange(null, '2026-09-01'), '기간을 걸면 날짜 없는 것은 빠진다')
  check(!inRange(0, '2026-09-01'), '0 도 「없음」으로 본다')
}
{
  check(hits('', '아무거나'), '검색어가 비면 다 걸린다')
  check(hits('임원', '2026년 9월 임원회의', '김가현'), '여러 칸 중 **하나라도** 맞으면 된다')
  check(hits('김가현', '제목 없음', '김가현'), '낸 사람으로도 찾는다')
  check(hits('ABC', 'abc123'), '대소문자를 안 가린다 — 아이디를 어떻게 칠지는 그때그때다')
  check(!hits('없는말', '제목', '사람'), '없으면 안 걸린다')
  check(hits('임원', null, undefined, '임원회의'), '빈 칸이 섞여 있어도 안 터진다')
}

// ── 세 화면이 그 한 벌을 쓰는가 ─────────────────────
{
  const row = read('./src/ui/SearchRow.tsx')
  const css = read('./src/ui/searchRow.css')
  const lib = read('./src/persistence/LibraryScreen.tsx')
  const tl  = read('./src/teamlib/TeamLibraryPanel.tsx')
  const ap  = read('./src/approvals/ApprovalsPanel.tsx')

  for (const [name, src] of [['자료 목록', lib], ['팀 공유', tl], ['결재함', ap]]) {
    check(/<SearchRow/.test(src), `${name} 이 공통 검색 줄을 쓴다`)
    check((src.match(/<SearchRow/g) || []).length === 1, `${name} 에 검색 줄이 하나뿐이다`)
  }

  // ①ㄴ — 기간이 **먼저**다.
  const iFrom = row.indexOf('value={from}'), iQ = row.indexOf('className="srow-q"')
  check(iFrom > 0 && iFrom < iQ, '기간이 검색어보다 **앞**에 온다 (①ㄴ)')
  // ②ㄱ — 말은 「검색」·「초기화」.
  check(/>검색<\/button>/.test(row) && /># 초기화</.test(row) === false && />초기화<\/button>/.test(row),
    '단추는 「검색」과 「초기화」다 (②ㄱ)')
  // **화면에 찍히는 글자만** 본다. 주석에 옛 이름을 적어 두는 것은 사연을 남기는 일이지
  // 두 이름을 쓰는 것이 아니다 — 앞서 등급 표기 검사에서 같은 것으로 한 번 걸렸다.
  check(!/>조회</.test(row) && !/>조회</.test(tl),
    '「조회」라는 **단추**가 안 남아 있다 — 같은 일에 두 이름을 쓰지 않는다')
  // ③ㄱ — 기간이 셋 다 있고, **무엇의 날짜인지**를 말한다.
  check(/dateLabel="수정일"/.test(lib) && /dateLabel="승인일"/.test(tl) && /dateLabel="낸 날"/.test(ap),
    '기간이 셋 다 있고, 화면마다 **무엇의 날짜인지**를 적는다 (③ㄱ)')
  check(/aria-label={`\$\{dateLabel\} 시작`}/.test(row), '그 말이 보조 기술에도 간다')

  // 크기가 한 군데서 온다.
  check(/\.srow-date \{[^}]*height: 34px/.test(css)
     && /\.srow-q \{[^}]*height: 34px/.test(css)
     && /\.srow-btn \{[^}]*height: 34px/.test(css),
    '칸도 단추도 **높이 34** — 한 군데서 정한다')
  check(!/className="lib-search"/.test(lib) && !/className="tl-search"/.test(tl),
    '화면이 제 손으로 그리던 옛 줄이 안 남아 있다')
  check(!/\.tl-search \{/.test(read('./src/auth/auth.css')), '그 옛 CSS 도 안 남아 있다')

  // ④ㄴ — 건수는 목록 바로 위.
  check(/className="tl-count-row"/.test(tl) && /className="ap-count-row"/.test(ap),
    '건수가 목록 바로 위에 있다 (④ㄴ)')
  check(!/className="tl-count"/.test(tl), '검색 줄 오른쪽 끝에 붙던 옛 건수가 없다')

  // ⑤ㄱ — 범위 표시는 없앤다.
  check(!/lib-scope/.test(lib), '「내 자료 전체에서」가 없다 (⑤ㄱ)')

  // 부제목 셋.
  // 부제목은 `es-brand` 안의 `<span>` 이었다. **그 자리만** 본다 —
  // 「승인된 자료만 …」이라는 말 자체는 빈 화면 안내에 그대로 남아 있어야 한다
  // (오해가 생기는 순간에 말한다는 규칙은 그대로다).
  const brand = (src) => src.slice(src.indexOf('className="es-brand"'), src.indexOf('</div>', src.indexOf('className="es-brand"')))
  check(!/<span/.test(brand(ap)), '결재함 머리에 부제목이 없다')
  check(!/<span/.test(brand(tl)), '팀 공유 머리에 부제목이 없다')
  check(/승인된 자료만/.test(tl), '그 말은 빈 화면 안내에 그대로 남아 있다')

  // **그 화면에서만 하는 일**은 오른쪽 끝에.
  check(/<\/SearchRow>/.test(lib) && /새 이북/.test(lib.slice(lib.indexOf('<SearchRow'), lib.indexOf('</SearchRow>'))),
    '새 폴더·새 이북은 자료 목록의 검색 줄 오른쪽 끝에 있다')
  check(!/새 이북/.test(tl) && !/새 이북/.test(ap),
    '팀 공유·결재함에는 만드는 단추가 없다 — 보는 화면이다')

  // 검색 때문에 빈 것과 정말 없는 것을 갈라 말한다.
  check(/조건에 맞는 결재 건이 없습니다/.test(ap) && /\(q \|\| from \|\| to\)/.test(ap),
    '조건 때문에 빈 것을 「없습니다」로 적지 않는다 — 조건을 걸어 둔 줄 모르게 된다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
