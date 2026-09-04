// 문서가 **실제 코드와 어긋나지 않는지** 지킨다 (P8).
//
// 왜 필요한가 — 계획서가 코드보다 뒤처지면 다음 사람은 계획서를 안 믿게 되고,
// 그때부터 계획서는 **아무것도 안 지킨다.** 이번 전환에서만 세 번 겪었다:
//   · `AGENTS.md` 가 「팀은 아직 가시성에 안 쓰인다」고 말하는 동안 P6 이 끝나 있었다
//   · `README.md` 가 「Lv3 은 발행본 읽기 전용」이라 적혀 있는 동안 개인 스케치가 생겼다
//   · 계획서 상태표에 `revision·rejected` 칸이 아예 없었다(구현하면 반드시 만나는 칸)
//
// 문서 전체를 검사하지는 않는다 — 그건 못 한다. **틀리면 사람이 실제로 다치는
// 몇 줄**만 못박는다: 사라진 개념을 살아 있다고 말하지 않는가, 게이트 명령이
// 실제로 있는가, 단일 판정 지점의 이름이 문서와 코드에서 같은가.
//
// 실행: node docs_contract.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// **`.pathname` 을 쓰지 않는다** — 한글 파일 이름이 퍼센트 인코딩된 채로 나와
// 「없는 파일」이 된다. `fileURLToPath` 가 그걸 되돌린다.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const readme = read('./README.md')
const agents = read('./AGENTS.md')
const index = read('./docs/index.md')
const plan = read('./docs/전환계획_결재중심_v0.2_20260903.md')
const pkg = JSON.parse(read('./package.json'))

const perms = read('./server/permissions.py')
const docState = read('./server/doc_state.py')
const teamLib = read('./server/team_library.py')

// ══════════ ① 사라진 개념을 살아 있다고 말하지 않는다 ══════════
// 「회차·배부」는 P2 에서 걷어냈다. 문서가 그걸 기능으로 소개하면 다음 사람은
// 없는 화면을 찾아 헤맨다. **취소선(~~)과 「없앴다/제거했다」 문맥은 괜찮다** —
// 사라졌다는 사실 자체는 기록으로 남아야 한다.
{
  const liveMention = (doc, word) => doc.split('\n').filter((l) =>
    l.includes(word) && !l.includes('~~') && !/없앴|없다|제거|걷어|사라|삭제/.test(l))
  for (const [name, doc] of [['README.md', readme], ['AGENTS.md', agents]]) {
    for (const word of ['배부']) {
      const bad = liveMention(doc, word)
      check(bad.length === 0, `${name} 이 「${word}」를 살아 있는 기능으로 말하지 않는다`,
        bad[0]?.trim().slice(0, 70))
    }
  }
  // 서버 코드에도 남아 있으면 안 된다 — 문서만 고치고 코드가 남으면 더 헷갈린다.
  check(!/\bcycle_id\b|\bdistribution\b/.test(perms),
    'permissions.py 에 회차·배부 흔적이 없다')
}

// ══════════ ② 지금 있는 역할·권한을 문서가 안다 ══════════
{
  // README 의 권한 표가 세 등급을 모두 말한다.
  for (const lv of ['Lv1', 'Lv2', 'Lv3']) {
    check(readme.includes(lv), `README 권한 표에 ${lv} 이 있다`)
  }
  // **D13 — 열람자에게 개인 스케치가 생겼다.** 「발행본 읽기 전용」으로 적혀 있으면
  // 다음 사람은 열람자가 아무것도 못 만든다고 믿고 그렇게 고친다.
  check(/개인 스케치/.test(readme),
    'README 가 열람자의 개인 스케치를 말한다 (D13)')
  check(/decide\(actor/.test(perms) || /def decide/.test(perms), 'permissions.decide 가 있다')
}

// ══════════ ③ 단일 판정 지점의 이름이 문서와 코드에서 같다 ══════════
// 이름이 어긋나면 문서를 보고 코드를 찾을 수 없다 — 그 순간 문서는 장식이 된다.
{
  const singles = [
    ['permissions.decide', /def decide\(/, perms],
    ['can_see_approval', /def can_see_approval\(/, perms],
    ['can_see_approval_thread', /def can_see_approval_thread\(/, perms],
    ['doc_state', /def derive\(/, docState],
    ['is_locked', /def is_locked\(/, docState],
    ['has_approval_history', /has_approval_history/, perms],
  ]
  for (const [name, re, src] of singles) {
    check(re.test(src), `코드에 ${name} 이 있다`)
    check(agents.includes(name.split('.').pop()) || readme.includes(name.split('.').pop()),
      `문서가 ${name} 을 이름으로 가리킨다`)
  }
}

// ══════════ ④ 게이트 명령이 실제로 있다 ══════════
// 문서에 적힌 명령이 안 돌면, 다음 사람은 게이트를 **건너뛴다.**
{
  for (const cmd of ['test:unit', 'build', 'e2e:all']) {
    check(!!pkg.scripts?.[cmd], `package.json 에 \`npm run ${cmd}\` 이 있다`)
    check(readme.includes(cmd), `README 가 \`${cmd}\` 을 안내한다`)
  }
  check(/pytest server/.test(readme), 'README 가 서버 테스트 명령을 안내한다')
  check(/PW_CHROME/.test(readme) && /PW_CHROME/.test(agents),
    '브라우저를 못 내려받는 곳에서 e2e 를 어떻게 돌리는지 적혀 있다')
}

// ══════════ ⑤ 계획서의 단계표가 코드와 같은 말을 한다 ══════════
// 끝난 단계가 안 끝난 것처럼 적혀 있으면 다음 사람이 **다시 만든다.**
{
  const done = ['P2', 'P3', 'P4', 'P5', 'P6', 'P7']
  for (const ph of done) {
    const row = plan.split('\n').find((l) => l.includes(`**${ph}**`) && l.includes('|'))
    check(!!row, `계획서에 ${ph} 행이 있다`)
    check(!!row && (row.includes('완료') || row.includes('~~')),
      `${ph} 이 완료로 적혀 있다 (코드에는 이미 있다)`, row?.slice(0, 60))
  }
  // 상태표의 여섯 상태가 코드의 여섯 상태와 같다.
  const codeStates = [...docState.matchAll(/^([A-Z_]+) = "([a-z_]+)"$/gm)].map((m) => m[2])
  check(codeStates.length === 6, 'doc_state 가 여섯 상태를 갖는다', codeStates.join(','))
  for (const st of codeStates) {
    check(plan.includes(st), `계획서 상태표에 \`${st}\` 이 있다`)
  }
}

// ══════════ ⑥ 문서 인덱스가 실제 파일을 가리킨다 ══════════
{
  check(index.includes('전환계획_결재중심_v0.2_20260903.md'),
    'docs/index.md 가 전환 계획을 가리킨다')
  check(index.includes('작업이력대장_2026-09-03_결재전환'),
    'docs/index.md 가 작업 이력대장을 가리킨다')
}

// ══════════ ⑦ 팀 공유가 승인본만 읽는다는 사실이 문서에 있다 ══════════
// 이 한 줄을 모르고 손대면 **작업본을 팀에 노출시킨다.** 가장 비싼 실수다.
{
  check(/status="approved"/.test(teamLib) && /kind"\) == "approval"|kind"\) === "approval"|"approval"/.test(teamLib),
    'team_library 가 승인된 approval 행만 읽는다')
  check(/Approvals\.snapshot|Approvals\[승인\]\.snapshot/.test(agents),
    'AGENTS 가 「팀이 보는 것은 Approvals.snapshot」을 못박는다')
  check(/얼어붙|얼린|snapshot/.test(readme), 'README 가 승인본이 얼어붙는다고 말한다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
