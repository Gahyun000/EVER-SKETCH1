// 결재 의견은 **언제 열려 있나.**
//
// 2026-09-15 · 전에는 「수정 요청이 아니면 무조건」 입력칸이 떴고, 서버는 상태를
// 아예 안 봤다 — 승인이든 회수든 그냥 받았다. 사용자가 짚었다: 「승인이랑 회수는
// 슬라이드 의견 없어도 되는 거 아님?」
//
// 상태마다 **그 글을 읽을 사람이 있는지**로 갈랐다.
//   · 대기 — 결재자가 지적하고 낸 사람이 답한다 (열림)
//   · 반려 — 낸 사람이 고치려고 읽는다. 되물을 자리도 필요하다 (열림)
//   · 승인 — 얼었고, 팀은 못 보고, 낸 사람도 손댈 수 없다 (닫힘)
//   · 회수 — 결재자는 보지도 않았다 (닫힘)
//
// 여기서 지키는 것.
//   · 닫는 것은 **쓰기·지우기**고 **읽기는 남는다** — 무엇을 왜 고쳤는지의 기록이다
//   · 규칙은 **서버가 정한다.** 화면 목록이 서버 목록과 어긋나면 안 된다
//   · 잠갔으면 **이유와 다음 길**을 말한다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs comment_gate.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')

const { COMMENT_OPEN, canWriteComment, commentLockReason } =
  await import('./src/approvals/commentGate.ts')
const { STATUS_ORDER } = await import('./src/approvals/approvalApi.ts')

// ── 어느 상태가 열려 있나 ───────────────────────────
check(canWriteComment('pending'), '대기 — 열림 (이 자리의 본래 일)')
check(canWriteComment('rejected'), '반려 — 열림 (낸 사람이 고치려고 읽고 되묻는다)')
check(!canWriteComment('approved'), '승인 — 닫힘')
check(!canWriteComment('withdrawn'), '회수 — 닫힘')

// **반려를 닫으면 안 된다.** 결정이 났다고 뭉뚱그려 닫으면 반려까지 걸려서,
// 고칠 사람이 무엇을 고쳐야 하는지 되물을 자리를 잃는다.
check(COMMENT_OPEN.includes('rejected'),
  '「결정 났으면 닫는다」가 아니다 — 반려는 결정이 났어도 열려 있다')

// 빠진 상태가 없다 — 새 상태가 생기면 여기서 걸린다.
for (const st of STATUS_ORDER) {
  check(typeof canWriteComment(st) === 'boolean', `${st} 에 답이 있다`)
}
check(COMMENT_OPEN.length === 2, '열린 것은 둘뿐이다', COMMENT_OPEN.join(','))

// **수정 요청에는 슬라이드가 없다**(P7 · D8) — 대기 중이어도 붙일 자리가 없다.
check(!canWriteComment('pending', 'revision'), '수정 요청은 대기 중이어도 닫힘')
check(canWriteComment('pending', 'approval'), '보통 제출본은 대기 중에 열림')

// ── 잠갔으면 이유를 말한다 ──────────────────────────
// 「입력칸만 잠그고 이유를 말하지 않으면 '왜 안 써지지' 로 끝난다」 —
// 편집기 앵커 메모(CommentsPanel.tsx)가 같은 일을 하며 적어 둔 말이다.
for (const st of ['approved', 'withdrawn']) {
  const r = commentLockReason(st)
  check(r.length > 10, `${st} — 왜 닫혔는지 적는다`, r)
  check(/수정 요청|다시 내면/.test(r), `${st} — **다음 길**을 가리킨다`, r)
}
// 열린 상태에서는 빈 글자다. 「닫혔나」를 판단하는 곳이 둘이 되면 언젠가 어긋난다 —
// 판단은 canWriteComment 하나만 한다.
check(commentLockReason('pending') === '' && commentLockReason('rejected') === '',
  '열려 있으면 잠금 글이 없다 (판단하는 곳은 하나다)')

// ── 서버와 화면이 같은 말을 하는가 ──────────────────
//
// 이 규칙은 **서버가 정하고 화면은 그대로 그린다.** 말이 다른 두 곳에 같은 목록이
// 있어야 해서, 한쪽만 고치면 화면은 열어 두고 서버가 400 을 주는 꼴이 된다.
{
  const py = read('./server/approvals.py')
  const m = py.match(/^COMMENT_OPEN = \(([^)]*)\)/m)
  check(!!m, '서버에 COMMENT_OPEN 이 있다')
  const server = (m ? m[1].match(/"([a-z_]+)"/g) || [] : []).map((x) => x.slice(1, -1))
  check(server.join(',') === [...COMMENT_OPEN].join(','),
    '서버 목록과 화면 목록이 같다', `서버=${server} 화면=${COMMENT_OPEN}`)

  // 서버가 **먼저** 막는다. 세 길(쓰기·고치기·지우기)이 다 같은 문을 지나야 한다.
  for (const fn of ['def add_comment', 'def update_comment', 'def delete_comment']) {
    const body = py.slice(py.indexOf(fn), py.indexOf(fn) + 900)
    check(body.includes('_require_comment_open'), `${fn.slice(4)} 가 문을 지난다`)
  }
  // 막을 때 이유를 말한다 — 화면과 같은 다음 길을 가리킨다.
  check(/수정 요청을 내 주세요/.test(py) && /새 회차에서 이어집니다/.test(py),
    '서버도 이유와 다음 길을 말한다 (400 본문이 그대로 뜬다)')
}

// ── 화면이 정말 그 답을 쓰는가 ──────────────────────
{
  const ap = read('./src/approvals/ApprovalsPanel.tsx')
  const css = read('./src/auth/auth.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

  check(/canWriteComment\(detail\.status, detail\.kind\)/.test(ap),
    '화면이 제 손으로 상태를 안 따진다 — 한 군데서 온 답을 쓴다')

  // **읽기는 남는다.** 의견 줄을 그리는 곳에 canCmt 가 걸리면 안 된다.
  const list = ap.slice(ap.indexOf('byPage.here.map'), ap.indexOf('ap-cmt-new'))
  check(!/canCmt &&\s*<div key/.test(list), '의견 줄 자체는 잠금과 무관하게 그려진다')

  // 지우기는 두 군데(슬라이드별 · 전체)에 있다. **둘 다** 닫혀야 한다 —
  // 한쪽만 닫으면 「전체 의견」으로 옮겨 가 지우면 그만이다.
  const del = (ap.match(/canCmt && c\.author === me\?\.id/g) || []).length
  check(del === 2, '「지우기」가 두 자리 모두에서 닫힌다', String(del))
  // **세는 방식이 중요하다.** 「앞에 canCmt 가 없는 것」을 정규식으로 찾으려 했더니
  // 잠금을 **거친** 쪽까지 걸렸다(앞 글자가 공백이라서). 전체 수와 잠긴 수를 맞댄다.
  const all = (ap.match(/c\.author === me\?\.id/g) || []).length
  check(all === del, '잠금을 안 거친 「지우기」가 남아 있지 않다', `전체=${all} 잠김=${del}`)

  // 입력칸은 갈래로 갈린다 — 닫히면 **이유 한 줄**이 그 자리에 온다.
  check(/\{canCmt \? \(/.test(ap) && /ap-cmt-lock/.test(ap),
    '닫히면 입력칸 자리에 이유가 온다')
  check(/\{cmtLock\}/.test(ap), '그 글은 commentLockReason 이 준다')

  // 결정된 회차에 의견이 0건이면 덩어리 자체가 없다.
  check(/\{!isRevision && \(canCmt \|\| byPage\.here\.length > 0 \|\| byPage\.whole\.length > 0\) && \(/.test(ap),
    '읽을 것도 쓸 것도 없으면 의견 덩어리가 아예 없다')

  check(/\.ap-cmt-lock\{/.test(css) && /\.ap-cmt-ro\{/.test(css),
    '잠금 줄과 「읽기 전용」 표시에 모양이 있다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
