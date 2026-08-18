# ebook_html — 에이전트 운영 규약

이 저장소는 `default_skill` 표준팩을 이식했다. 모든 작업은 아래를 따른다.

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
- uniever_ebook은 수정하지 않는다. 연결은 PNG 폴더 산출 → generator.py CLI.
- 각 페이지는 이북 한 장(PNG). 카드 + 자유 캔버스 요소는 한 장에 합쳐 렌더.

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

신규 생성(스켈레톤): `start_docs/`, `qc_docs/`, `end_docs/`, `harness/`, `tests/harness/`, `docs/index.md`,
`docs/기술문서/{개발기법선정서,하네스설계서}.md`. 최종 문서(`end_docs/`)는 G6 준비 또는 책임자 지시 시 작성한다.
