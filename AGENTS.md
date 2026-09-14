# EVER-SKETCH — 에이전트 운영 규약

이 저장소는 `ebook_html`을 통째 복사해 출발했고(2026-08-18, W0), `default_skill` 표준팩을 이식했다.
모든 작업은 아래를 따른다.

## 우선순위
1. 시스템·개발자·사용자 지시 > 저장소 코어 표준(skills/) > 외부 확장. 스킬은 권한을 확대하지 않는다.
2. 법·보안·개인정보 > 승인된 요구·설계 > uniever-development-standard > 이 AGENTS.md > 개별 지시 > 모델 판단.

## 스킬 사용 사전 선언
작업 실행 전 선택한 스킬명·정확한 SKILL.md 경로·선택 이유·적용 범위·미적용 후보를 먼저 출력한다.
선언한 SKILL.md를 실제로 읽고 적용한 스킬만 사용 증적으로 인정한다.

## 프로젝트 라우팅
- 화면(카드/캔버스/버튼/모달) 개발·리뷰: uniever-development-standard (필수)
- 코딩 안전(추측·과잉구현 방지): karpathy-guidelines
- 테스트 우선: test-driven-development
- 완료 전 검증: verification-before-completion
- UI/디자인: frontend-design (DESIGN 토큰 준수)
- 로컬 웹앱 UI 검증: webapp-testing
- 게이트·문서·포트: dev-standard-control-tower
- 코드베이스 구조 파악(착수 전): understand-codebase
- 다단계 작업 진행 순서: superpowers-workflow
- 버그 재현·근본 원인 좁히기: systematic-debugging
- 변경 영향·위험 분석(diff/PR): understand-diff
- 리뷰 의견 검증(맹목 수용 금지): receiving-code-review
- 화면 리뷰·시각 자료: screen-review, visualize

## 불변 계약
- `uniever_ebook`은 수정하지 않는다. 연결은 PNG 폴더 산출 → `generator.py` CLI.
- 각 페이지는 이북 한 장(PNG). 카드 + 자유 캔버스 요소는 한 장에 합쳐 렌더.
- **저장소 위치** — `server/app.py`가 `GIT_ROOT / "uniever_ebook"`로 생성기를 찾는다.
  EVER-SKETCH는 `ebook_html`과 같은 부모 폴더(`Desktop/git/`)에 있어야 한다. 이동 금지.
- **권한은 화면이 아니라 데이터에 붙는다** — 모든 읽기·쓰기·삭제는 서버에서 소유자·역할을 검증한다.
  프런트 가드는 보조 수단. 서버 가드는 **단일 지점**에서만 판정한다.
- **메모 노출** — 메모는 관리자 전원 + 해당 이북의 작성자 소유자에게만. 열람자에게는 존재 자체를 노출하지 않는다.
- **1인 1세트** — 표준 양식 한 사람 자료에 `SLOT-A`/`SLOT-B`/`SLOT-C` 표가 각각 하나씩,
  열 수는 정본과 같다. **쪽수는 세지 않는다** — 내용이 많은 임원은 장을 늘려 쓴다.
  (2026-09-07 에 「1인 1장」에서 고쳐 적었다. 그 규칙이 지키려던 것은 쪽수가 아니라
  「취합 단위 = 사람」이었고, 취합은 슬롯 이름으로 찾지 쪽 번호로 찾지 않는다.
  사양 v1.0 §7.2 가 「1인 1장이 충분한지」를 리허설 확정 항목으로 열어 뒀던 그 질문이다.)
  **말만 있는 계약이 아니다** — `server/template_guard.py` 가 저장할 때 거부한다.
  같은 표가 여러 장에 이어진 조각(`contFrom`)은 하나로 센다.
- **회차·배부는 없다** — 2026-09-04(P2)에 제거했다. 표준 양식은
  `POST /api/projects/from-template` 으로 개인이 직접 만든다(`TEMPLATE_USE`).
  `server/template_seed.py` 는 정본이므로 삭제 금지.

### 결재 전환 이후의 불변 계약 (2026-09-04, P3~P7 완료)

- **팀이 가시성의 단위다**(P3). `server/teams.py` + `routes_teams.py`(L1 전용).
  한 사람은 **한 팀**에만 속한다(다른 팀에 넣으면 이전 팀에서 빠진다). 팀 소속은 세션이 아니라
  `auth.actor_of()` 가 **매 요청 DB 에서 다시 읽는다** — 넣어 두면 옮긴 뒤에도 옛 팀이 계속 보인다.
- **팀이 보는 것은 `Projects` 가 아니라 `Approvals.snapshot` 이다**(P6, 전환계획 §3.1).
  ```
  Projects.state            ← 작성자가 지금 고치는 살아 있는 문서. 요동친다.
  Approvals[승인].snapshot   ← 제출 순간에 얼어붙은 승인본. 팀이 보는 것.
  ```
  작업본을 보여 주면 「어제 승인한 것과 다른 게 떠 있다」가 매일 난다.
  이 분리 하나가 D8(「수정 중에 보던 자료가 사라지면 안 된다」)을 **추가 장치 없이** 푼다.
- **결재 가시성은 `permissions.can_see_approval()` 하나가 정한다** —
  관리자 전부 / 내가 낸 건 / **지금 내 팀의 승인본**. 결재 API 와 팀 공유가 같은 함수를 쓴다.
  두 벌이 되면 「팀 공유에는 뜨는데 열면 404」가 생긴다.
  **대화(코멘트)는 한 칸 더 좁다**(`can_see_approval_thread`) — 당사자만.
  자료가 팀의 것이 된다고 그 자료를 두고 오간 지적까지 팀의 것은 아니다.
- **자료 상태는 저장하지 않는다**(P7). `server/doc_state.py` 가 **최신 결재 행 하나**에서
  파생한다. `Projects` 에 칼럼을 두면 진실이 두 곳이 되고, 둘은 반드시 어긋나며,
  어긋나면 어느 쪽이 맞는지 알 방법이 없다. 이력 전체를 훑지 않는다 —
  훑으면 같은 이력으로도 순서에 따라 다른 답이 나온다.
- **잠금·삭제·이력은 서로 다른 근거를 쓴다.** 헷갈리면 하나로 합치고 싶어지는데, 합치면 안 된다.
  · 편집 잠금 = 「지금 결재자·팀이 보고 있는가」(`doc_state.is_locked`)
  · 삭제 금지 = 「결재를 한 번이라도 탔는가」(D16 · `has_approval_history`) — **회수한 것도 이력이다**
  · 반려된 자료는 **고칠 수는 있어도 못 지운다**(열림 + 이력 있음)
- **`Resource` 의 위험한 기본값 둘** — `has_approval_history` 와 `locked` 는 기본이 `False` 이고,
  `decide()` 는 그 값에서 **허용하는 쪽**으로 떨어진다. `authdeps._resource_of` 가 반드시 채우고,
  `test_permissions.py` 가 그 배선을 지킨다. 새 판정 필드를 늘릴 때 같은 함정을 반복하지 말 것.
- **폴더는 개인 것이다**(P4 · D20). `FOLDER_MANAGE` 는 `decide()` 의 **유일한 관리자 예외**로,
  관리자 전면 허용보다 **위에** 있다. 남의 폴더는 403 이 아니라 **404** — 403 은 「그 id 는 있다」를
  확인해 준다. 폴더 삭제는 **빈 것만**(원본은 하위와 자료를 통째로 지웠다).
- **새 라우터 파일을 만들면 `test_endpoint_coverage.ROUTER_FILES` 에 적는다.**
  안 적으면 그 파일이 **통째로 무검사**가 된다(P6 에서 실제로 한 번 놓쳤다).
  `test_라우터_파일을_빠뜨리지_않았다` 가 이제 그걸 막는다.

## 폴더 구조 (UDS-110) 및 승인된 이탈

표준 골격은 `start_docs/ qc_docs/ docs/ harness/ end_docs/ SKILL/ frontend/ backend/ scripts/ tests/`.
본 저장소는 이미 동작 중인 스택 관례를 유지하고(UDS-105 §4.1 "기존 구조·명명 준수"),
아래 이탈을 **승인된 이탈**로 기록한다(UDS-110 §4). 상위 표준을 약화하지 않는다.

| 표준 폴더 | 본 저장소 | 이탈 사유 |
|---|---|---|
| frontend/ | `src/` | Vite/React 표준 관례. 이동 시 vite.config·index.html·import 경로 파손 |
| backend/ | `server/` | FastAPI 패키지(`server.app`). 이동 시 import·실행기 경로 파손 |
| tests/ | `e2e/`, 루트 `*.test.mjs`, `server/test_*.py`, `tests/harness/` | 노드 스모크 + pytest 병행. 하네스 테스트만 `tests/harness/` |
| SKILL/ | `skills/` | default_skill 표준팩 14종 이식(`skills/UNIEVER_SKILL_MANIFEST.json`) |
| scripts/ | 루트 `run.command`, `run.cmd` | 원클릭 실행기(단일 파일). 별도 scripts/ 미사용 |

최종 문서(`end_docs/`)는 G6 준비 또는 책임자 지시 시 작성한다.

## 게이트 — 무엇을 어디서 돌리는가

| 게이트 | 명령 | 브라우저 |
|---|---|---|
| 서버 전량 | `python -m pytest server -q` | 불필요 |
| 화면 규칙·순수 계산·모의 서버 계약 | `npm run test:unit` | 불필요 |
| 타입 | `npx tsc --noEmit` | 불필요 |
| 번들 | `npm run build` | 불필요 |
| 브라우저 6종 | `npm run e2e:all` | **필요** (`PW_CHROME` 로 기존 크로미움 지정 가능) |

**브라우저 없이 잡을 수 있는 것은 브라우저 밖에서 잡는다.** 2026-09-04(P8)에
e2e 를 처음 다시 돌려 보니 여섯 스위트 중 **다섯이 죽어 있었고**, 원인은 셋 다
모의 서버였다(선언이 지워져 프로세스가 죽거나, 새 엔드포인트를 `{ok:true}` 로
때워 화면이 undefined 를 만지거나). 브라우저가 있어야만 도는 곳에 검사를 두면
**아무도 안 돌리고, 죽어도 모른다.** 그래서 `e2e_mock_contract.test.mjs` 가
모의 서버를 띄워 모양까지 확인하고, 이건 `test:unit` 안에서 돈다.

**모의 서버(`e2e/es_mock.mjs`)에 새 엔드포인트를 더할 때** — 화면이 응답의
**값을 읽는** 엔드포인트라면 catch-all 의 `{ok:true}` 로 때우지 말고 모양을 맞춰
답한다. 그리고 `e2e_mock_contract.test.mjs` 에 한 줄 적는다.

## 승계된 이름 부채 (의도적 보류)

`ebook_html`에서 복사한 식별자 중 아래는 **바꾸지 않는다.** 계약 테스트가 값을 검사하거나
사용자 데이터가 그 이름에 묶여 있어, 개명은 마이그레이션을 동반해야 한다.

| 식별자 | 위치 | 보류 사유 |
|---|---|---|
| `ebook_html_workspace` | `src/persistence/draftStorage.ts` (IndexedDB 이름) | 사용자 로컬 작업본이 이 DB에 있다. 개명 = 데이터 유실 |
| `app: 'ebook_html'` | `src/persistence/draftStorage.ts` | `tests/harness/draft_storage_contract.mjs`가 값을 검사 |
| `EBOOK_HTML_DB` / `ebook_html.db` | `server/{projects,notes,conversations,settings_store}.py` | W1 사용자·소유권 마이그레이션과 함께 처리 |

W1에서 DB 마이그레이션을 할 때 함께 정리한다. 그 전에는 건드리지 않는다.
