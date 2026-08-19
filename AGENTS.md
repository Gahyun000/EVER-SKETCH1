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

## 불변 계약
- `uniever_ebook`은 수정하지 않는다. 연결은 PNG 폴더 산출 → `generator.py` CLI.
- 각 페이지는 이북 한 장(PNG). 카드 + 자유 캔버스 요소는 한 장에 합쳐 렌더.
- **저장소 위치** — `server/app.py`가 `GIT_ROOT / "uniever_ebook"`로 생성기를 찾는다.
  EVER-SKETCH는 `ebook_html`과 같은 부모 폴더(`Desktop/git/`)에 있어야 한다. 이동 금지.
- **권한은 화면이 아니라 데이터에 붙는다** — 모든 읽기·쓰기·삭제는 서버에서 소유자·역할을 검증한다.
  프런트 가드는 보조 수단. 서버 가드는 **단일 지점**에서만 판정한다.
- **메모 노출** — 메모는 관리자 전원 + 해당 이북의 작성자 소유자에게만. 열람자에게는 존재 자체를 노출하지 않는다.
- **1인 1장** — 회차 템플릿은 임원 1인당 1장. 페이지 추가·삭제는 관리자 승인 예외만 허용.

## 폴더 구조 (UDS-110) 및 승인된 이탈

표준 골격은 `start_docs/ qc_docs/ docs/ harness/ end_docs/ SKILL/ frontend/ backend/ scripts/ tests/`.
본 저장소는 이미 동작 중인 스택 관례를 유지하고(UDS-105 §4.1 "기존 구조·명명 준수"),
아래 이탈을 **승인된 이탈**로 기록한다(UDS-110 §4). 상위 표준을 약화하지 않는다.

| 표준 폴더 | 본 저장소 | 이탈 사유 |
|---|---|---|
| frontend/ | `src/` | Vite/React 표준 관례. 이동 시 vite.config·index.html·import 경로 파손 |
| backend/ | `server/` | FastAPI 패키지(`server.app`). 이동 시 import·실행기 경로 파손 |
| tests/ | `e2e/`, `server/test_*.py`, `tests/harness/` | 노드 스모크 + pytest 병행. 하네스 테스트만 `tests/harness/` |
| SKILL/ | `skills/` | default_skill 표준팩 7종 이식(`UNIEVER_SKILL_MANIFEST.txt`) |
| scripts/ | 루트 `run.command`, `run.cmd` | 원클릭 실행기(단일 파일). 별도 scripts/ 미사용 |

최종 문서(`end_docs/`)는 G6 준비 또는 책임자 지시 시 작성한다.

## 승계된 이름 부채 (의도적 보류)

`ebook_html`에서 복사한 식별자 중 아래는 **바꾸지 않는다.** 계약 테스트가 값을 검사하거나
사용자 데이터가 그 이름에 묶여 있어, 개명은 마이그레이션을 동반해야 한다.

| 식별자 | 위치 | 보류 사유 |
|---|---|---|
| `ebook_html_workspace` | `src/persistence/draftStorage.ts` (IndexedDB 이름) | 사용자 로컬 작업본이 이 DB에 있다. 개명 = 데이터 유실 |
| `app: 'ebook_html'` | `src/persistence/draftStorage.ts` | `tests/harness/draft_storage_contract.mjs`가 값을 검사 |
| `EBOOK_HTML_DB` / `ebook_html.db` | `server/{projects,notes,conversations,settings_store}.py` | W1 사용자·소유권 마이그레이션과 함께 처리 |

W1에서 DB 마이그레이션을 할 때 함께 정리한다. 그 전에는 건드리지 않는다.
