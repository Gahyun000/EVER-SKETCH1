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
check(/tm-pager/.test(tsx) && /페이지/.test(tsx) && /명씩/.test(tsx),
  '개수 · 페이지 이동이 있다')
check(/phase === 'loading'/.test(tsx) && /불러오는 중/.test(tsx), '로딩 상태가 있다')
check(/phase === 'error'/.test(tsx) && /다시 시도/.test(tsx), '오류 상태와 되돌아갈 길이 있다')
check(/아직 팀도 편성할 사람도 없습니다/.test(tsx), '빈 데이터 상태가 있다')
check(/찾는 결과가 없습니다/.test(tsx) && /조건 초기화/.test(tsx),
  '검색 0건을 빈 데이터와 **구분해서** 말한다 — 같은 문구면 무엇을 해야 할지 모른다')

// ── 확정된 배치 ──
check(/tm-new[\s\S]{0,200}새 팀/.test(tsx), '「＋ 새 팀」이 머리줄에 있다')
check(/tm-close[\s\S]{0,80}닫기|닫기[\s\S]{0,80}tm-close/.test(tsx), '「닫기」가 있다')
check(/from 'lucide-react'/.test(tsx) && /Search/.test(tsx) && /Plus/.test(tsx),
  '아이콘은 lucide — 「내 이북」과 같은 것을 쓴다(글자로 때우지 않는다)')

// ── 조작 두 칸 : 사람 줄과 팀 줄이 같은 칸을 쓴다 ──
check((tsx.match(/className="tm-assign"/g) || []).length >= 2,
  '사람 줄과 팀 줄이 **같은 조작 상자**를 쓴다')
check((tsx.match(/className="tm-a"/g) || []).length >= 2 &&
      (tsx.match(/className="tm-b"/g) || []).length >= 2,
  'A칸·B칸이 양쪽에 다 있다 — 그래야 세로줄이 맞는다')
check(/--tm-a:\s*96px/.test(css) && /--tm-b:\s*84px/.test(css), 'A칸 96 · B칸 84 (확정값)')
check(/\.tm-a select[\s\S]{0,200}text-align:\s*center/.test(css), '「팀 선택」 글자는 가운데')

// ── 「팀원이 없습니다」는 권한 칸 ──
check(/<td \/>\s*<td><span className="tm-empty">팀원이 없습니다<\/span><\/td>\s*<td \/>/.test(tsx),
  '「팀원이 없습니다」가 가운데(권한) 칸에 앉는다 — 빈 팀이 여럿이어도 같은 자리')

// ── 묶음 줄 : 색 + 위쪽 굵은 선 (v2.3 ㉰) ──
check(/\.tm-grp td[\s\S]{0,160}border-top:\s*2px/.test(css), '묶음 줄에 위쪽 굵은 선')
check(/\.tm-grp td[\s\S]{0,160}background:\s*#eef3fc/.test(css), '팀 묶음은 남색')
check(/\.tm-grp\.tm-none td[\s\S]{0,120}background:\s*#fff4e3/.test(css), '미배정 묶음은 주황')
check(/아직 팀이 없는 사람/.test(read('./src/teams/teamModel.ts')),
  '색만으로 말하지 않는다 — 묶음 이름이 **글자**로 먼저 말한다')

// ── 개수 배지 버그 (「사람 1」로 읽히던 것) ──
check(/^\.es-badge \{/m.test(css),
  '.es-badge 가 홀로 선다 — 예전엔 .es-linkbtn 안에서만 배지가 됐다')
check(/\.tm-cnt[\s\S]{0,140}position:\s*absolute/.test(css),
  '개수 배지는 칸 오른쪽 끝에 고정 — 이름 옆에 붙이면 묶음 이름이 왼쪽으로 밀린다')

// ── 두 줄 깨짐 방지 (표준 공통 UI 기준) ──
for (const k of ['tm-who', 'tm-dept', 'tm-lv', 'tm-empty']) {
  check(new RegExp(`\\.${k}[\\s\\S]{0,220}white-space:\\s*nowrap`).test(css),
    `.${k} 는 낱말이 안 끊긴다`)
}

// ── 팀에서 빼는 길이 있다 ──
check(/apiRemoveMember/.test(tsx) && /팀에서 빼기/.test(tsx),
  '팀에서 빼는 길이 있다 — 옮기기만 있으면 미배정으로 되돌릴 방법이 없다')

// ── 되돌릴 수 없는 일은 자체 확인창 ──
check(/es-confirm-box[\s\S]{0,600}팀 삭제/.test(tsx),
  '팀 삭제는 자체 확인창으로 한 번 더 묻는다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
