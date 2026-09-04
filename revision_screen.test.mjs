// 수정 요청 화면(P7 · D8)의 **확정된 규칙**을 소스에서 지킨다.
//
// 장치 VM 에 브라우저가 없어 눈으로 못 보므로, 눈 대신 여기서 못박는다.
// 특히 **확인창 문구**를 지킨다 — 되돌리기 어려운 일에서 문구가 한 줄 틀리면
// 사람은 자기가 무엇을 한 건지 모른 채 누르게 된다.
//
// 실행: node revision_screen.test.mjs

import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

const api = read('./src/approvals/approvalApi.ts')
const panel = read('./src/approvals/ApprovalsPanel.tsx')
const lib = read('./src/persistence/LibraryScreen.tsx')
const tl = read('./src/teamlib/TeamLibraryPanel.tsx')
const css = read('./src/auth/auth.css') + read('./src/index.css')
const ds = read('./server/doc_state.py')

/** 주석을 걷어낸 코드. **설명**이 코드로 읽히면 테스트가 자기 말을 못 알아듣는다. */
const bare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const panelCode = bare(panel)
const libCode = bare(lib)

// ══════════ 상태는 서버가 정한다 ══════════
check(/DocState/.test(api) && /DOC_STATE_LABEL/.test(api),
  '파생 상태 타입과 배지 글자가 한곳에 있다')
check(/state: DocState/.test(api) && /locked: boolean/.test(api),
  '상태표가 파생 상태와 잠금을 함께 준다 — 화면이 짜맞추지 않는다')
check(!/kind === 'revision' \? '수정 중'/.test(libCode),
  '화면이 kind·status 로 상태를 **직접 짜맞추지 않는다** — 서버와 두 벌이 되면 어긋난다')

// 서버의 배지 글자와 화면의 배지 글자가 **같은 말**이어야 한다.
for (const [key, word] of [['pending', '결재 중'], ['rejected', '반려'],
  ['revision_pending', '수정 요청 중'], ['revising', '수정 중']]) {
  check(new RegExp(`${key}:\\s*['"]${word}['"]`).test(api),
    `「${word}」 — 화면 글자가 서버(doc_state.py)와 같다`)
  check(new RegExp(`${key.toUpperCase()}:\\s*"${word}"`).test(ds),
    `「${word}」 — 서버가 같은 글자를 쓴다`)
}
check(/draft:\s*''/.test(api) && /approved:\s*''/.test(api),
  '기본 상태(초안·승인됨)에는 배지가 없다 — 모든 줄에 붙으면 배지가 아니라 배경이다')

// ══════════ 왜 안 고쳐지는지 목록에서 보인다 ══════════
check(/chips\[p\.id\]\?\.locked/.test(libCode) && /lib-lock/.test(libCode),
  '잠긴 자료에 자물쇠가 붙는다 — 배지가 없는 「승인됨」일수록 이게 유일한 설명이다')
check(/잠김/.test(lib), '자물쇠 **그림만** 두지 않고 글자를 함께 둔다')
check(/\.lib-lock\{[^}]*white-space:nowrap/.test(css), '.lib-lock 은 낱말이 안 끊긴다')
for (const st of ['revision_pending', 'revising']) {
  check(new RegExp(`\\.lib-chip\\.${st}\\{`).test(css), `.lib-chip.${st} 색이 있다`)
}

// ══════════ 한 자리에 한 가지 일만 ══════════
check(/chips\[p\.id\]\?\.state === 'approved'[\s\S]{0,200}setRevising/.test(libCode),
  '승인된 자료에는 「수정 요청」이 온다')
check(/!chips\[p\.id\]\?\.locked[\s\S]{0,200}setSubmitting/.test(libCode),
  '잠긴 자료에는 「제출」이 안 뜬다 — 눌러 보고 400 을 받게 하지 않는다')

// ══════════ 수정 요청은 문서가 아니다 ══════════
check(/isRevision/.test(panelCode), '수정 요청과 제출본이 갈리는 지점이 **한 줄**에 모여 있다')
check(/isRevision \?[\s\S]{0,400}ap-rev[\s\S]{0,600}SlideViewer/.test(panelCode),
  '수정 요청에는 빈 뷰어 대신 **무엇을 정하는 자리인지** 적는다 (얼릴 문서가 없다)')
check(/!isRevision && \(/.test(panelCode),
  '수정 요청에 「3번 슬라이드 의견」 같은 빈 칸을 띄우지 않는다')
check(/ap-kind/.test(panelCode) && /수정 요청/.test(panel),
  '목록에서 **무엇에 대한 결재인지**를 먼저 말한다')

// ══════════ 「승인」과 「허락」은 다른 말이다 ══════════
check(/canDecideRevision \? '허락' : '승인'/.test(panelCode),
  '요청에 찍는 도장은 「허락」이다 — 문서에 찍는 「승인」과 같은 말을 쓰지 않는다')
check(/canDecideRevision \? '거절' : '반려'/.test(panelCode),
  '요청을 물리는 것은 「거절」, 문서를 물리는 것은 「반려」')

// ══════════ 확인창이 **되는 일**을 말한다 ══════════
check(/승인본은 안 바뀝니다/.test(panel),
  '수정 허락 확인창 — 「승인본은 안 바뀝니다」(D8 을 사람 말로 적는다)')
check(/다시 승인을 받아야/.test(panel), '허락만으로는 팀 화면이 안 바뀐다고 말한다')
check(/승인된 채로 그대로/.test(panel), '거절 확인창 — 자료는 승인된 채로 남는다')
check(/고친 내용은 지워지지 않습니다/.test(panel),
  '수정 그만두기 확인창 — **남의 작업을 대신 버리지 않는다**고 말한다')
check(/같은 팀에 바로 공유/.test(panel), '결재 승인 확인창은 P6 문구 그대로다')
check(/es-confirm/.test(panelCode) && !/window\.confirm|[^.]\bconfirm\(/.test(panelCode),
  '자체 확인창을 쓴다 (표준: 브라우저 confirm 금지)')

// 수정 요청 창(자료 목록)도 **제출 창과 다른 말**을 해야 한다.
check(/팀이 보는 화면은 지금 그대로입니다/.test(lib),
  '수정 요청 창 — 제출과 달리 **아무것도 안 얼린다**고 말한다')
check(/지금 이 문서가 그대로 얼어붙습니다/.test(lib), '제출 창은 얼어붙는다고 말한다(P5 그대로)')

// ══════════ 「수정 중」이 영원히 남지 않는다 ══════════
check(/canEndRevision/.test(panelCode) && /apiEndRevision/.test(panelCode),
  '「수정 그만두기」 길이 있다 — 없으면 「수정 중」이 영원히 남는다')
check(/canEndRevision = mine/.test(panelCode),
  '**낸 사람만** 그만둔다 — 「안 고치겠다」는 판단은 고치는 사람 몫이다')

// ══════════ 팀 화면은 글자만 얹는다 ══════════
check(/doc_state_label/.test(tl), '팀 공유가 파생 상태 글자를 그린다')
check(/직전 승인본/.test(tl),
  '「수정 중」이 무슨 뜻인지 한 줄로 말한다 — 배지만 있으면 「곧 바뀐다는 건가」에서 멈춘다')
check(!/snapshot[\s\S]{0,60}doc_state/.test(tl),
  '상태에 따라 **그림을 바꾸지 않는다** — 얹히는 것은 글자뿐이다(D8)')
check(/\.tl-ds\{[^}]*white-space:\s*nowrap/.test(css.replace(/\n\s+/g, '')) ||
      /\.tl-ds \{[^}]*white-space: nowrap/.test(css),
  '.tl-ds 는 낱말이 안 끊긴다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
