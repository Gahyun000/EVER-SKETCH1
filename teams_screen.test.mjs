// 팀 관리 화면(SCR-TEAM-01)의 **승인된 설계**를 소스에서 지킨다.
//
// 왜 이 검사가 따로 있는가:
// 이 화면은 시안 v0.1 → v2.3 까지 열 번 넘게 오가며 정해졌다. 정해진 것 하나하나가
// 이유를 가진 결론인데, **코드만 봐서는 그 이유가 안 보인다.** 다음에 누가
// 「날짜 칸이 없네」 하고 되돌리면 그때는 아무도 왜 뺐는지 모른다.
// 장치 VM 에 브라우저가 없어 화면을 눈으로 못 보므로, 눈 대신 여기서 못박는다.
//
// 실행: node teams_screen.test.mjs

import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

const tsx = read('./src/teams/TeamsAdmin.tsx')
const css = read('./src/auth/auth.css')

// ── 조회줄 (표준 261행: 필요한 검색조건 · 조회 · 페이지 이동 · 로딩 · 빈값 · 오류) ──
check(!/type="date"|type=\{?['"]date/.test(tsx),
  '날짜 칸이 없다 — 표준 267행은 「행 클릭 상세 진입」 조회 화면을 말한다. 이 화면은 그게 아니다')
check(/>조회</.test(tsx), '「조회」 버튼이 있다 — 치는 대로가 아니라 눌러야 걸린다(「내 이북」과 같은 손놀림)')
check(/>초기화</.test(tsx), '「초기화」가 있다')
// **이름이 `tm-` 에서 `adm-` 로 옮겨졌다**(2026-09-18). 사용자 관리와 팀 관리가
// 머리줄·검색줄·건수줄을 **같이 쓰게** 되면서, 한쪽 화면 이름을 붙여 두면 나중에
// 「팀 관리 것이니 팀 관리만 보고 고치면 되겠지」가 된다. 규칙은 그대로다 — 이름만 옮겼다.
check(/adm-pager/.test(tsx) && /페이지/.test(tsx) && /명씩/.test(tsx),
  '개수 · 페이지 이동이 있다')
check(/phase === 'loading'/.test(tsx) && /불러오는 중/.test(tsx), '로딩 상태가 있다')
check(/phase === 'error'/.test(tsx) && /다시 시도/.test(tsx), '오류 상태와 되돌아갈 길이 있다')
check(/아직 팀도 편성할 사람도 없습니다/.test(tsx), '빈 데이터 상태가 있다')
check(/찾는 결과가 없습니다/.test(tsx) && /조건 초기화/.test(tsx),
  '검색 0건을 빈 데이터와 **구분해서** 말한다 — 같은 문구면 무엇을 해야 할지 모른다')

// ── 확정된 배치 — 마스터·디테일 (2026-09-21 · 시안 docs/화면시안_팀관리_마스터디테일_v1.0.html) ──
// 왼쪽 팀 목록 · 오른쪽 고른 팀의 팀원 표. 뼈대는 결재함·팀 공유와 **같은 것**을 쓴다.
check(/md-screen/.test(tsx) && /className="ap-body md-body"/.test(tsx) && /className="md-grip"/.test(tsx),
  '결재함·팀 공유와 같은 마스터·디테일 뼈대(md-screen · ap-body · md-grip)')
check(/masterWidth\('tm'\)/.test(tsx) && /rememberMasterWidth\('tm'/.test(tsx), '목록 폭은 제 이름(tm)으로 따로 기억한다')
check(!/adm-left/.test(tsx) && !/mkOpen/.test(tsx), '「＋ 새 팀」 단추를 눌러 여는 방식은 걷었다')
check(/className="tm-add"[\s\S]{0,400}placeholder="새 팀 이름/.test(tsx), '새 팀 입력칸이 팀 목록 맨 위에 **늘 열려** 있다')
check(/setSel\(t\.id\)/.test(tsx), '만든 팀이 곧바로 골라진다 — 다음 할 일(팀원 넣기)이 바로 보인다')
check(/t\.some\(\(x\) => x\.id === s\)/.test(tsx),
  '없어진 팀을 고르고 있으면 「전체」로 — **받아 온 목록으로** 판단한다(방금 만든 팀을 튕기지 않게)')
check(/＋ 팀원 넣기/.test(tsx) && /addCandidates/.test(tsx), '오른쪽 머리에 「＋ 팀원 넣기」가 있다')
check(/className="tm-d-act"[\s\S]{0,2400}이름 변경[\s\S]{0,800}팀 삭제/.test(tsx), '이름 변경·팀 삭제는 오른쪽 머리로 올라갔다')
check(/adm-right[\s\S]{0,80}닫기|닫기[\s\S]{0,80}adm-right/.test(tsx), '「닫기」가 있다')

// **두 화면이 정말 같은 것을 쓰는지 본다.** 이름만 옮겨 놓고 한쪽이 제 것을 따로
// 만들면, 이름은 같은데 모양이 갈린다 — 그게 원래 고치려던 병이다.
{
  const ua = read('./src/auth/UsersAdmin.tsx')
  for (const k of ['adm-head', 'adm-srch', 'adm-qbox', 'adm-sbtn']) {
    check(tsx.includes(k) && ua.includes(k), `팀 관리와 사용자 관리가 **${k}** 를 같이 쓴다`)
  }
  check(!/tm-head|tm-srch|tm-qbox|tm-sbtn|tm-new|tm-close/.test(tsx + ua),
    '옛 이름(tm-)이 남아 있지 않다 — 둘이 섞이면 어느 쪽이 참인지 모른다')
}
check(/from 'lucide-react'/.test(tsx) && /Search/.test(tsx) && /Plus/.test(tsx),
  '아이콘은 lucide — 「내 이북」과 같은 것을 쓴다(글자로 때우지 않는다)')

// ── 조작 두 칸 : 사람 줄의 A칸 · B칸 ──
// 팀 줄은 표에서 빠졌다(마스터·디테일) — 표에는 사람 줄만 있어 세로줄이 절로 맞는다.
check(/className="tm-assign"/.test(tsx) && /className="tm-a"/.test(tsx) && /className="tm-b"/.test(tsx),
  '사람 줄은 A칸(팀 고르기) · B칸(넣기/옮기기/빼기)')
check(!/tm-grp/.test(tsx), '표에 팀 줄(묶음 줄)이 섞이지 않는다 — 팀 인원이 권한 칸에 걸쳐 열이 어긋나던 원인')
check(/--tm-a:\s*96px/.test(css) && /--tm-b:\s*84px/.test(css), 'A칸 96 · B칸 84 (확정값)')
check(/\.tm-a select[\s\S]{0,200}text-align:\s*center/.test(css), '「팀 선택」 글자는 가운데')

// ── 빈 팀 · 미배정 ──
check(/아직 팀원이 없습니다/.test(tsx) && /팀원 넣기/.test(tsx),
  '빈 팀은 「팀원이 없습니다」로 끝내지 않고 **다음 할 일**(＋ 팀원 넣기)을 말한다')
check(/SEL_NONE && s\.count > 0 \? ' warn'/.test(tsx) && /\.es-badge\.tm-n\.warn \{[^}]*var\(--amber\)/.test(css),
  '미배정이 1명 이상이면 주황 배지 — 글자 「팀 미배정」이 먼저 말하고 색은 거든다')
check(/'팀 미배정'/.test(read('./src/teams/teamModel.ts')), '색만으로 말하지 않는다 — 목록 이름이 **글자**로 먼저 말한다')

// ── 개수 배지 버그 (「사람 1」로 읽히던 것) ──
check(/^\.es-badge \{/m.test(css),
  '.es-badge 가 홀로 선다 — 예전엔 .es-linkbtn 안에서만 배지가 됐다')
check(/className=\{'es-badge tm-n'/.test(tsx), '팀 인원 배지는 왼쪽 목록 항목 오른쪽 끝(ap-item-top) — 표 칸에 걸치지 않는다')

// ── 두 줄 깨짐 방지 (표준 공통 UI 기준) ──
for (const k of ['tm-who', 'tm-dept', 'tm-lv']) {
  check(new RegExp(`\\.${k}[\\s\\S]{0,220}white-space:\\s*nowrap`).test(css),
    `.${k} 는 낱말이 안 끊긴다`)
}

// ── 팀에서 빼는 길이 있다 ──
check(/apiRemoveMember/.test(tsx) && /팀에서 빼기/.test(tsx),
  '팀에서 빼는 길이 있다 — 옮기기만 있으면 미배정으로 되돌릴 방법이 없다')

// ── 되돌릴 수 없는 일은 자체 확인창 ──
// 2026-09-08: 껍데기를 ui/Modal 로 옮기며 `es-confirm-box` 가 제목 **뒤로** 갔다.
// 순서가 아니라 **무엇을 쓰는가**를 본다.
check(/<Modal title="팀 삭제"/.test(tsx), '팀 삭제는 공용 껍데기(ui/Modal)로 한 번 더 묻는다')
check(/scrimClassName="es-confirm"/.test(tsx), '화면 검사가 찾던 선택자를 그대로 넘겨 준다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
