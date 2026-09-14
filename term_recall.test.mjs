// **말 하나에 뜻 하나.** 「회수」·「거두」·「배부」가 다시 섞이지 않게 못박는다.
//
// **왜 생겼나.** 2026-09-08 에 화면 글자를 「거두기 → 회수」로 맞췄다. 그런데
// 주석과 검사 이름은 그대로여서, 같은 일을 코드에서는 「거두기」, 화면에서는
// 「회수」라고 부르는 상태가 남았다. 그 상태로 더 두면 다음 사람은 둘이 다른
// 일인 줄 안다. 2026-09-14 에 나머지를 정리하면서 **규칙 셋**을 세웠다.
//
//   ① 「회수」는 **결재 전용**이다 — 자료를 지우는 것은 「삭제」다.
//   ② 「거두」는 안 쓴다 — 단, 그게 **옛 말이었다는 기록**은 남긴다.
//   ③ 「배부」는 **과거형으로만** 쓴다 — 회차·배부는 2026-09-04 에 걷어냈고,
//      현재형으로 쓰면 없는 기능을 가리키게 된다.
//
// **예외는 목록으로 적는다.** 「이 자리는 왜 예외인가」를 적어 두지 않으면,
// 다음 사람이 예외를 하나 늘릴 때 아무도 못 본다. 목록에 한 줄을 적게 만드는 것이
// 이 검사가 하는 일의 절반이다. 그래서 **목록에 적힌 자리가 사라져도 검사가 운다** —
// 죽은 예외가 쌓이면 규칙이 조용히 헐거워진다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs term_recall.test.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 훑을 곳 ────────────────────────────────────────
// 착수 산출물(start_docs)·바깥 표준(skills)·작업이력(docs)은 **기록물**이다.
// 확정된 사양을 사후에 고치는 것은 정리가 아니라 기록 위조다.
const SKIP_DIR = new Set([
  'node_modules', '.git', 'dist', '_backup', 'docs', 'skills',
  'start_docs', 'qc_docs', 'end_docs', 'harness', 'tests',
  '.venv', '__pycache__',          // 남의 코드다. 우리 말투를 들이밀 곳이 아니다.
])
const EXT = /\.(py|ts|tsx|mjs|md)$/
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }   // 끊어진 링크에서 죽지 않는다
    if (st.isDirectory()) walk(p)
    else if (EXT.test(name)) files.push(p.replace(/^\.\//, ''))
  }
}
walk('.')

/** 낱말이 들어 있는 줄을 전부 모은다. */
const hits = (re) => {
  const out = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8').split('\n')
    src.forEach((line, i) => { if (re.test(line)) out.push({ f, n: i + 1, line: line.trim() }) })
  }
  return out
}

// ══════════ ① 「회수」는 결재 전용 ══════════
//
// 자료를 지우는 쪽 파일에 「회수」가 있으면, 같은 말이 두 가지 일을 가리킨다.
// 2026-09-14 이전에는 `projects.delete_project` 의 독스트링이 자료 삭제를
// 「회수」라고 불렀다 — 결재 회수와 한 화면에서 만나면 아무도 못 가른다.
{
  const DELETE_SIDE = ['server/projects.py', 'server/comments.py', 'server/test_comments.py']
  for (const f of DELETE_SIDE) {
    const bad = readFileSync(f, 'utf8').split('\n')
      .map((l, i) => ({ n: i + 1, l: l.trim() }))
      // 규칙을 적어 둔 줄 자체는 「회수」라는 말을 써야 한다.
      .filter((x) => /회수/.test(x.l) && !/결재 회수|「회수」/.test(x.l))
    check(bad.length === 0,
      `${f} 가 자료 삭제를 「회수」라고 부르지 않는다`,
      bad[0] && `${bad[0].n}: ${bad[0].l.slice(0, 60)}`)
  }
  // 딴 동네 말은 예외다 — 프로그래밍 용어이고 결재와 한 화면에서 안 만난다.
  const mem = readFileSync('src/canvas/history.ts', 'utf8')
  check(/메모리 회수/.test(mem),
    '예외가 살아 있다 — `history.ts` 「메모리 회수」(프로그래밍 용어라 그대로 둔다)')
}

// **규칙을 적어 둔 파일은 낱말을 써야 한다.** 규칙서가 제 규칙에 걸리면
// 규칙을 적을 길이 없어진다.
const RULEBOOK = new Set(['term_recall.test.mjs', 'docs_contract.test.mjs'])

// ══════════ ② 「거두」는 안 쓴다 ══════════
{
  // 이 자리만 예외다. **왜**까지 적어 둔다.
  const KEEP = [{
    f: 'page_shape.test.mjs',
    why: '그날 무슨 말을 쓰고 있었는지가 곧 내용이다 — 「회수 → 회수」로 바꾸면 문장이 뜻을 잃는다',
    mark: '「거두기 → 회수」',
  }]
  const all = hits(/거두|거둠|거둬|거둔|거둡/)
  const bad = all.filter((h) => !RULEBOOK.has(h.f) && !KEEP.some((k) => k.f === h.f))
  check(bad.length === 0, '「거두」를 쓰는 곳이 없다',
    bad.length ? `${bad.length}곳 — ${bad[0].f}:${bad[0].n}` : '')

  // **예외가 죽으면 운다.** 남겨 둔 자리가 사라졌는데 목록만 남으면,
  // 다음 사람은 있지도 않은 예외를 근거로 새 예외를 더한다.
  for (const k of KEEP) {
    const src = readFileSync(k.f, 'utf8')
    check(src.includes(k.mark),
      `예외가 실제로 그 자리에 있다 — ${k.f}`, k.why)
  }
}

// ══════════ ③ 「배부」는 과거형으로만 ══════════
//
// 회차·배부는 2026-09-04(P2)에 코드째 걷어냈다. 남은 것은 글자뿐이다.
// **과거형과 「없앴다」 문맥은 지우지 않는다** — 「배부를 눌렀다면 임원들에게는
// 빈 종이가 갔다」는 표를 왜 종이 안에 그려야 하는지의 **근거**다.
// 지우면 규칙만 남고 이유가 사라진다.
{
  const PAST = /~~|없앴|없다|없어졌|제거|걷어|사라|이었고|뿐이었|였다|했다면|눌렀다면|갔다|전에는|예전에는|때에는|시절|들어왔다|그렸고|그리던/
  const all = hits(/배부/)
  const live = all.filter((h) => !RULEBOOK.has(h.f) && !PAST.test(h.line))
  check(live.length === 0,
    '「배부」를 **현재형으로** 말하는 곳이 없다 (과거형·근거는 그대로 둔다)',
    live.length ? `${live.length}곳 — ${live[0].f}:${live[0].n} ${live[0].line.slice(0, 50)}` : '')

  // 근거가 살아 있는지 확인한다. 이게 없어지면 「표를 왜 종이 안에」가 사라진다.
  const geo = readFileSync('server/test_template_geometry.py', 'utf8')
  check(/배부를 눌렀다면/.test(geo) && /빈 종이/.test(geo),
    '근거는 남아 있다 — 「배부를 눌렀다면 … 빈 종이가 갔다」(규칙의 이유다)')
}

// ══════════ ④ 식별자는 안 건드렸다 ══════════
//
// 이건 **말 정리**이지 마이그레이션이 아니다. 영어 식별자·DB 값·API 경로를
// 건드리는 순간 이미 들어 있는 데이터와 바깥 계약이 흔들린다.
{
  const appr = readFileSync('server/approvals.py', 'utf8')
  check(/withdrawn/.test(appr), 'DB 값 `withdrawn` 이 그대로다')
  const routes = readFileSync('server/routes_approvals.py', 'utf8')
  check(/withdraw/.test(routes), 'API 경로 `withdraw` 가 그대로다')
  const api = readFileSync('src/approvals/approvalApi.ts', 'utf8')
  check(/withdrawn: '회수'/.test(api), '화면 이름표만 한국어다 — 열쇠는 영어 그대로')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
