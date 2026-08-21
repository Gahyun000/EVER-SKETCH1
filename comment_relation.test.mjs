// 지적과 나의 **관계** — 등급이 아니라 관계로 가른다.
//
// 왜 따로 검사하는가:
// 이 규칙이 틀리면 화면은 멀쩡한데 **내가 답해야 할 지적이 남의 것처럼 보인다.**
// 그러면 스무 건 쌓인 목록에서 내 몫을 눈으로 찾게 되고, 몇 건은 못 보고 지나간다.
// 회의 전날 "왜 답을 안 했느냐" 가 되는 종류의 조용한 실패다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs comment_relation.test.mjs

import { countToMe, relationOf, sortThreads } from './src/comments/relation.ts'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  if (got === want) { pass++; console.log(`✓ ${label} — ${JSON.stringify(got)}`) }
  else { fail++; console.log(`✗ ${label}\n    받은 값: ${JSON.stringify(got)}\n    기대값: ${JSON.stringify(want)}`) }
}

const ME = 'u_me'
const t = (author, resolved = null) => ({ author_id: author, resolved_at: resolved })

// ── 내 자료를 열었을 때 ──
console.log('\n── 내 자료 ──')
eq(relationOf(t('u_admin'), ME, true), 'to-me', '남이 내 자료에 단 지적 = 내가 답할 것')
eq(relationOf(t(ME), ME, true), 'mine', '내 자료에 내가 단 것 = 내가 기다리는 것')

// ── 동료 자료를 열었을 때 ──
console.log('\n── 동료 자료 ──')
eq(relationOf(t('u_admin'), ME, false), 'other', '남의 자료에 남이 단 것')
eq(relationOf(t(ME), ME, false), 'mine', '남의 자료에 **내가** 단 것도 내 것이다')

// ── 답해야 할 건수 ──
console.log('\n── 답해야 할 건수 ──')
const mixed = [t('u_admin'), t('u_lee'), t(ME), t('u_admin', 123)]
eq(countToMe(mixed, ME, true), 2, '내 자료: 남이 단 미해결만 센다')
eq(countToMe(mixed, ME, false), 0, '동료 자료에는 내가 답할 것이 없다')
eq(countToMe([], ME, true), 0, '없으면 0')
eq(countToMe(mixed, undefined, true), 0,
   '로그인 정보가 아직 없으면 0 — 남의 것을 내 몫으로 세는 쪽보다 낫다')

// ── 관리자도 같은 규칙으로 갈린다 ───────────────────────
// 등급으로 갈랐다면 관리자에게는 전부 똑같이 보이고, 정작 **자기 자료에 달린**
// 지적을 못 찾는다. 관계로 가르면 관리자든 작성자든 같은 방식으로 통한다.
console.log('\n── 등급과 무관하다 ──')
const ADMIN = 'u_admin'
eq(relationOf(t('u_lee'), ADMIN, true), 'to-me', '관리자 자기 자료에 달린 남의 지적')
eq(relationOf(t(ADMIN), ADMIN, false), 'mine', '관리자가 남의 자료에 단 지적')

// ── 목록 순서 ────────────────────────────────────────
// **내가 쓴 것이 먼저 달린 경우**로 검사한다. 남이 먼저 단 자료로 검사하면
// 정렬을 아예 빼도 통과한다 — 그러면 테스트가 아무것도 지키지 않는다.
console.log('\n── 목록 순서 ──')
const th = (id, author, at, resolved = null) =>
  ({ id, author_id: author, created_at: at, resolved_at: resolved })
const list = [
  th('a', ME, 100),            // 내가 먼저 썼고
  th('b', 'u_admin', 200),     // 남의 지적이 나중에 왔다
  th('c', ME, 300),
  th('d', 'u_admin', 50, 999), // 해결된 것은 가장 오래됐어도 맨 아래
]
eq(sortThreads(list, ME, true).map((x) => x.id).join(''), 'bacd',
   '답할 것 → 내가 쓴 것(시간순) → 해결된 것')
eq(sortThreads(list, ME, false).map((x) => x.id).join(''), 'acbd',
   '동료 자료에서는 내가 쓴 것이 위로 (답할 것이 없다)')
eq(sortThreads([], ME, true).length, 0, '빈 목록')
eq(list.map((x) => x.id).join(''), 'abcd', '원본 배열을 건드리지 않는다')

console.log(`\n${fail ? '=== FAIL' : '=== ALL PASS'} (통과 ${pass} / 실패 ${fail}) ===`)
process.exit(fail ? 1 : 0)
