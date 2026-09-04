// 결재 화면의 규칙을 소스에서 지킨다 (P5).
//
// 이 화면이 다루는 것은 **되돌릴 수 없는 일**이다 — 승인하면 팀에 공유되고,
// 제출하면 자료를 지울 수 없게 된다. 규칙이 흐려지면 사람이 모르고 누른다.
// 장치 VM 에 브라우저가 없어 눈으로 못 보므로, 눈 대신 여기서 못박는다.
//
// 실행: node approvals_screen.test.mjs

import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

const panel = read('./src/approvals/ApprovalsPanel.tsx')
const api = read('./src/approvals/approvalApi.ts')
const lib = read('./src/persistence/LibraryScreen.tsx')
const libCode = bare(lib)

// ── 되돌릴 수 없는 일은 먼저 말한다 ──
check(/es-confirm-box[\s\S]{0,600}결재 승인/.test(panel), '승인은 자체 확인창으로 한 번 더 묻는다')
check(/같은 팀에 바로 공유/.test(panel), '승인하면 무슨 일이 생기는지 확인창이 말한다')
check(/이 문서가 그대로 얼어붙습니다/.test(lib), '제출하면 문서가 얼어붙는다고 미리 말한다')
check(/지울 수 없습니다/.test(lib), '제출하면 자료를 못 지우게 된다고 미리 말한다 (D16)')
check(/결재 이력에는 남습니다/.test(panel), '거둬도 이력에 남는다고 말한다')

// ── 누가 무엇을 하는가 ──
check(/isAdmin\(me\)/.test(panel), '결정 권한은 서버 판정과 같은 근거(역할)로 그린다')
check(/canDecide = admin && detail\?\.status === 'pending'/.test(panel),
  '대기 중인 건만 결정할 수 있다 — 되돌리기는 P7 의 수정 요청이 한다')
check(/mine && detail\?\.status === 'pending'/.test(panel), '거두기는 낸 사람만, 대기 중일 때만')
check(/me\?\.role === 'writer' \|\| me\?\.role === 'admin'/.test(libCode),
  '열람자에게는 결재함도 제출 버튼도 없다 (D13)')
check(/c\.author === me\?\.id/.test(panel), '제 코멘트만 지운다 — 남의 말은 못 건드린다')

// ── 얼린 문서를 본다 ──
check(/detail\.snapshot/.test(panel), '상세는 제출 시점 스냅샷을 그린다')
check(/snapshot\?: DraftStateSnapshot/.test(api) && /상세에서만 온다/.test(api),
  '목록에는 스냅샷을 싣지 않는다 — 문서 전체가 응답에 딸려 나간다')

// ── 한 번에 받아 온다 ──
check(/apiStatusMap\(\)/.test(libCode), '상태 칩을 한 번에 받는다 — 자료마다 되물으면 12건에 13번 나간다')
check(/status-map/.test(api), '상태표 엔드포인트를 쓴다')

// ── 색만으로 말하지 않는다 ──
const css = read('./src/auth/auth.css') + read('./src/index.css')
check(/STATUS_LABEL/.test(panel) && /STATUS_LABEL\[chips\[p\.id\]\.status\]/.test(libCode),
  '상태는 **글자**로 먼저 말한다 (표준: 색상만으로 상태를 구분하지 않는다)')
for (const st of ['pending', 'approved', 'rejected', 'withdrawn']) {
  check(new RegExp(`\\.ap-st\\.${st}`).test(css) && new RegExp(`\\.lib-chip\\.${st}`).test(css),
    `${st} 상태에 색이 있다 (글자를 거든다)`)
}

// ── 두 줄 깨짐 방지 ──
for (const k of ['ap-item-name', 'ap-item-sub', 'ap-st', 'lib-chip']) {
  check(new RegExp(`\\.${k}[^{]*\\{[^}]*white-space: ?nowrap`).test(css), `.${k} 는 낱말이 안 끊긴다`)
}

// ── 상태 목록의 순서 ──
check(/STATUS_ORDER[\s\S]{0,120}'pending'/.test(api), '대기가 맨 앞 — 할 일이 먼저 온다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
