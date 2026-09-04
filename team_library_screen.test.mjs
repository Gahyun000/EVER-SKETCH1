// 팀 공유 화면(P6)의 **확정된 규칙**을 계산과 소스 양쪽에서 지킨다.
//
// 앞부분은 순수 계산(`teamLibraryModel.ts`)을 실제로 돌린다 — 묶음·검색·쪽 나눔은
// 눈으로 보면 맞아 보이다가 3쪽에서 틀어지는 종류의 코드라, 돌려 보는 것 말고는
// 확인할 방법이 없다.
// 뒷부분은 장치 VM 에 브라우저가 없어 눈으로 못 보는 규칙을 소스에서 못박는다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs team_library_screen.test.mjs

import { readFileSync } from 'node:fs'
import {
  PAGE_SIZE, RELATION_LABEL, RELATION_HINT, flatten, matches, monthLabel, pageOf, pickTeam,
} from './src/teamlib/teamLibraryModel.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

// ── 만들기 도구 ─────────────────────────────
let n = 0
const item = (name, extra = {}) => ({
  id: 'a' + (++n), project_id: 'p' + n, project_name: name, folder_path: '',
  round: 1, status: 'approved', requester: 'u', page_count: 3,
  created_at: 1, updated_at: 1, decided_at: 1, ...extra,
})
const author = (id, name, months, extra = {}) => ({
  id, name, dept: '사업본부', is_me: false, count: months.reduce((a, m) => a + m.items.length, 0),
  months, ...extra,
})
const team = (authors, extra = {}) => ({
  id: 't1', name: '영업1팀', relation: 'current', readonly: false,
  count: authors.reduce((a, x) => a + x.count, 0), authors, ...extra,
})

// ══════════ 한 줄로 펴기 ══════════
{
  const t = team([
    author('u1', '김가현', [
      { ym: '2026-09', items: [item('9월 보고'), item('9월 부록')] },
      { ym: '2026-08', items: [item('8월 보고')] },
    ]),
    author('u2', '이나연', [{ ym: '2026-09', items: [item('영업 현황')] }]),
  ])
  const flat = flatten(t)
  check(flat.length === 4, '세 겹으로 접힌 나무가 한 줄로 펴진다')
  check(flat[0].authorName === '김가현' && flat[0].ym === '2026-09',
    '항목이 **어느 작성자·어느 달의 것인지를 들고 다닌다** — 잘라도 맥락이 안 사라진다')
  check(flatten(null).length === 0 && flatten(undefined).length === 0,
    '팀이 없으면 빈 줄 — 화면이 먼저 터지지 않는다')

  const seq = flat.map((f) => f.item.project_name)
  check(JSON.stringify(seq) === JSON.stringify(['9월 보고', '9월 부록', '8월 보고', '영업 현황']),
    '서버가 준 순서를 그대로 지킨다 — 여기서 다시 정렬하면 서버와 화면이 다른 순서를 갖는다')
}

// ══════════ 묶음 머리글은 **자른 뒤에** 끼운다 ══════════
{
  // 한 작성자가 25건 — 12건씩 세 쪽으로 갈린다.
  const many = Array.from({ length: 25 }, (_, i) => item('자료 ' + (i + 1)))
  const t = team([author('u1', '김가현', [{ ym: '2026-09', items: many }])])
  const flat = flatten(t)

  const p1 = pageOf(flat, '', 1)
  const p2 = pageOf(flat, '', 2)
  const p3 = pageOf(flat, '', 3)

  const items = (p) => p.rows.filter((r) => r.kind === 'item')
  check(items(p1).length === 12 && items(p2).length === 12 && items(p3).length === 1,
    '**모든 쪽이 꽉 찬다** — 머리글이 쪽 수를 잡아먹지 않는다')
  check(p1.totalPages === 3 && p1.total === 25, '쪽 수와 건수는 **자료 기준**이다(줄 수가 아니다)')

  for (const [i, p] of [p1, p2, p3].entries()) {
    check(p.rows[0].kind === 'author' && p.rows[1].kind === 'month',
      `${i + 1}쪽 첫 줄이 작성자·월 머리글이다 — 3쪽만 열어도 누가 낸 몇 월 자료인지 안다`)
  }
  check(p3.rows.find((r) => r.kind === 'author').count === 1,
    '머리글의 「N건」은 **이 쪽에 보이는 수**다 — 3건이라 적혀 있는데 1건만 보이면 안 된다')
}

// ══════════ 묶음이 바뀌는 자리 ══════════
{
  const t = team([
    author('u1', '김가현', [
      { ym: '2026-09', items: [item('구월')] },
      { ym: '2026-08', items: [item('팔월')] },
    ]),
    author('u2', '이나연', [{ ym: '2026-09', items: [item('나연 구월')] }]),
  ])
  const kinds = pageOf(flatten(t), '', 1).rows.map((r) => r.kind)
  check(JSON.stringify(kinds) === JSON.stringify(
    ['author', 'month', 'item', 'month', 'item', 'author', 'month', 'item']),
    '같은 작성자의 달이 바뀌면 **월 머리글만** 다시 나온다')
  const rows = pageOf(flatten(t), '', 1).rows
  const idxA2 = rows.findIndex((r) => r.kind === 'author' && r.name === '이나연')
  check(rows[idxA2 + 1].kind === 'month',
    '작성자가 바뀌면 월 머리글도 **반드시** 다시 나온다 — 앞사람의 달이 이어지면 안 된다')
}

// ══════════ 검색 ══════════
{
  const t = team([
    author('u1', '김가현', [{ ym: '2026-09', items: [item('9월 임원보고', { folder_path: '영업/9월' })] }]),
    author('u2', '이나연', [{ ym: '2026-09', items: [item('기술 현황')] }]),
  ])
  const flat = flatten(t)
  check(pageOf(flat, '임원', 1).total === 1, '자료 이름으로 걸린다')
  check(pageOf(flat, '이나연', 1).total === 1, '**작성자 이름으로도** 걸린다 — 「그 사람이 낸 것」을 찾는다')
  check(pageOf(flat, '영업/9월', 1).total === 1, '폴더 경로로도 걸린다 — 이름보다 서랍이 기억날 때가 있다')
  check(pageOf(flat, '사업본부', 1).total === 2, '부서로도 걸린다')
  check(pageOf(flat, '없는말', 1).total === 0, '안 걸리면 0건 — 빈 화면을 화면이 따로 판단한다')
  check(pageOf(flat, '  ', 1).total === 2, '공백만 넣으면 검색이 아니다')
  check(matches(flat[0], '임원보고') && matches(flat[0], '임원'), '부분 일치로 걸린다')

  const empty = pageOf(flat, '없는말', 1)
  check(empty.rows.length === 0, '걸린 게 없으면 **머리글도 안 남는다** — 이름만 뜬 빈 묶음이 생기지 않는다')
}

// ══════════ 쪽 번호가 범위를 벗어나면 ══════════
{
  const t = team([author('u1', '김가현', [{ ym: '2026-09', items: [item('하나')] }])])
  const flat = flatten(t)
  check(pageOf(flat, '', 99).page === 1, '없는 쪽을 요구하면 **마지막 쪽으로 되돌린다** — 빈 화면을 주지 않는다')
  check(pageOf(flat, '', 0).page === 1 && pageOf(flat, '', -3).page === 1, '0쪽·음수쪽도 1쪽이다')
  check(pageOf([], '', 1).totalPages === 1, '자료가 없어도 쪽 수는 1이다 — 0/0 페이지가 화면에 뜨지 않는다')
}

// ══════════ 달 이름 ══════════
check(monthLabel('2026-09') === '2026년 9월', '「2026-09」를 사람 말로 읽는다')
check(monthLabel('2026-10') === '2026년 10월', '10월이 「2026년 10월」이다(0 이 안 붙는다)')
check(monthLabel('') === '승인일 미상' && monthLabel('이상한값') === '승인일 미상',
  '**없는 달을 지어내지 않는다** — 승인 시각이 없으면 없다고 적는다')

// ══════════ 팀 고르기 ══════════
{
  const a = team([], { id: 't1', name: '영업1팀' })
  const b = team([], { id: 't2', name: '기술2팀', relation: 'past' })
  check(pickTeam([a, b], 't2').id === 't2', '고른 팀을 그대로 준다')
  check(pickTeam([a, b], '없는팀').id === 't1',
    '사라진 팀을 고르고 있었으면 **첫 팀**으로 되돌린다 — 빈 화면에 갇히지 않는다')
  check(pickTeam([], 't1') === null && pickTeam(null, null) === null, '팀이 없으면 null')
}

// ══════════ 「현재」·「이전」은 글자다 (D19) ══════════
check(RELATION_LABEL.current === '현재' && RELATION_LABEL.past === '이전',
  'D19 — 관계를 **글자로** 붙인다 (색으로만 상태를 구분하지 않는다 · 표준)')
check(RELATION_LABEL.other === '다른 팀',
  '관리자가 보는 남의 팀은 「이전」이 아니다 — 있었던 적 없을 수 있고, 알 방법도 없다')
for (const k of ['current', 'past', 'other']) {
  check(typeof RELATION_HINT[k] === 'string' && RELATION_HINT[k].length > 0,
    `「${RELATION_LABEL[k]}」이 무슨 뜻인지 한 줄로 설명이 붙는다`)
}
check(/읽기만/.test(RELATION_HINT.past) && /내가 낸 자료만/.test(RELATION_HINT.past),
  'D23 — 이전 팀에서는 본인 것만, 읽기만 된다고 **말해 준다**')

// ══════════ 소스에서 못박는 규칙 ══════════
const model = read('./src/teamlib/teamLibraryModel.ts')
const panel = read('./src/teamlib/TeamLibraryPanel.tsx')
const api = read('./src/teamlib/teamLibraryApi.ts')
const lib = read('./src/persistence/LibraryScreen.tsx')
const npd = read('./src/persistence/NewProjectDialog.tsx')
const css = read('./src/auth/auth.css')

/** 주석을 걷어낸 코드. 「거르지 않는다」는 **설명**이 「거른다」로 읽히면 안 된다. */
const bare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const panelCode = bare(panel)

check(PAGE_SIZE === 12, '한 쪽 12건 — 자료 목록과 **같은 눈금**을 쓴다')
// 「…」은 **쪽 번호 자리에만** 없으면 된다 — 「불러오는 중…」 같은 문구까지 잡으면
// 테스트가 자기 말을 못 알아듣는다(folder_screen 에서 두 번 겪은 함정).
const pager = (panelCode.split('tl-pager')[1] || '').slice(0, 500)
check(/pageWindow\(/.test(pager), '팀 공유도 자료 목록과 같은 다섯 칸 창(pageWindow)을 쓴다')
check(pager.length > 0 && !/…/.test(pager),
  'D25 — 쪽 번호에 「…」이 없다 (창을 고정해 끊길 자리를 없앴다)')

// **화면이 다시 거르지 않는다** — 규칙이 두 벌이 되면 언젠가 어긋난다.
check(!/role\s*===\s*['"]viewer|role\s*===\s*['"]admin/.test(panelCode),
  '화면이 등급으로 다시 거르지 않는다 — 무엇이 보이는지는 서버가 건마다 정한다')
check(!/team_id\s*===|team_ids/.test(panelCode),
  '화면이 팀을 직접 비교하지 않는다 — 「같은 팀인가」는 서버의 판정이다')

// 팀 공유는 등급으로 가리지 않는다 — 열람자가 이 도구를 쓰는 주된 이유다.
check(/setShared\(true\)/.test(lib), '자료 화면에 「팀 공유」로 들어가는 길이 있다')
check(!/canSubmit && \([\s\S]{0,80}setShared/.test(lib),
  '**팀 공유 버튼은 등급으로 가리지 않는다** — 열람자도 팀의 승인본을 본다')
check(/canSubmit && \([\s\S]{0,120}setInbox/.test(lib),
  '결재함은 등급으로 가린다 — 열람자는 낼 것이 없다(D13)')

// 승인본만 올라온다는 사실을 **화면이 말한다**.
check(/승인된 자료만/.test(panel), '「승인된 자료만 올라옵니다」를 화면이 말한다(D6)')
check(/오류가 아니라 빈 화면|es-empty tl-empty/.test(panel), '볼 게 없으면 오류가 아니라 빈 화면이다')
check(/관리자에게 팀 편성을 요청/.test(panel),
  '빈 화면이 **다음에 할 일**을 알려준다 — 「없습니다」로 끝내면 사람이 멈춘다')

// 결재 대화는 당사자만 — 가린 것을 가렸다고 말한다.
check(/comments_hidden/.test(panel) && /낸 사람과 결재자만 봅니다/.test(panel),
  '결재 의견을 가리되 **몇 건인지는 남긴다** — 감춘 사실 자체는 감추지 않는다')
check(/comments_hidden/.test(read('./src/approvals/approvalApi.ts')),
  '가려졌다는 사실이 타입에 있다 — 화면이 빈 배열을 「의견이 없다」로 오해하지 않는다')

// 지난 승인본 — 목록에서 뺀 것이지 지운 것이 아니다.
check(/apiTeamHistory/.test(panelCode) && /지난 승인본/.test(panel),
  '최신 1건만 뜨는 목록에서 **지난 승인본으로 거슬러 올라갈 수 있다**')

// 열람자의 개인 스케치 (D13)
check(/canTemplate/.test(npd) && /canTemplate=\{canSubmit\}/.test(lib),
  'D13 — 열람자에게는 회사 서식 칸이 아예 안 뜬다 (서버도 TEMPLATE_USE 로 막는다)')
check(/나만 봅니다/.test(npd), '개인 스케치가 **나만 보는 것**임을 만들기 전에 말한다')
check(/개인 스케치/.test(lib),
  '열람자 화면 제목이 「내 이북」이 아니다 — 결재에 낼 것으로 오해하고 만들면 안 된다')

// 두 줄 깨짐 방지 (표준 공통 UI 기준)
for (const k of ['tl-author b', 'tl-me', 'tl-dept', 'tl-count', 'tl-rel']) {
  const sel = '\\.' + k.replace(' ', '\\s+')
  check(new RegExp(`${sel}\\s*\\{[^}]*white-space:\\s*nowrap`).test(css),
    `.${k} 는 낱말이 안 끊긴다`)
}

// API 는 읽기 전용이다 — 팀 공유에서 남의 자료를 건드릴 길이 없어야 한다.
check(!/method:\s*['"](POST|PUT|PATCH|DELETE)/.test(api),
  '팀 공유 API 에는 **쓰는 길이 없다** — 남의 승인본은 읽기만 한다(D19)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
