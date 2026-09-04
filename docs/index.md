# ebook_html 문서 인덱스 (UDS-110 §3)

경영진 스케치 빌더(EVER-SKETCH). 카드 조립 + 자유 캔버스로 사업모델을 이북/덱으로 내보낸다.
산출물(PNG 폴더)은 `uniever_ebook`의 `generator.py`로 이북 빌드 — **uniever_ebook 무수정**.

## 표준 폴더 (UDS-110)
| 표준 폴더 | 위치 | 상태 |
|---|---|---|
| start_docs | `start_docs/` | 스켈레톤 (착수 문서) |
| qc_docs | `qc_docs/` | 스켈레톤 (품질 증적) |
| docs | `docs/` | 사용 중 |
| harness | `harness/` | 스켈레톤 (T1+ 계약) |
| end_docs | `end_docs/` | 빈 구조 (G6 시 작성) |
| SKILL | `skills/` | 이식된 표준팩 7종 (이탈: 아래 참조) |
| frontend | `src/` | 이탈: Vite 관례 (아래 참조) |
| backend | `server/` | 이탈: FastAPI 관례 |
| tests | `e2e/` + 루트 `*.test.mjs` + `server/test_*.py` + `tests/harness/` | 이탈: 분산 |
| scripts | `run.command` / `run.cmd` (루트) | 원클릭 실행기 |

표준 대비 이탈과 승인 기록은 `AGENTS.md`의 "폴더 구조 (UDS-110) 및 승인된 이탈" 참조.

## 주요 문서
- 개발 계획(G0~G6): `docs/ebook_html_개발계획서.html`
- 최신 UX 목업: `docs/틀빌더_목업_카드플러스자유캔버스_2.html`
- 개발일지: `docs/개발일지.md`
- 설계: `docs/design.md`, `docs/start_docs/덱편집에이전트_설계안_v1.md`
- 기획/핸드오버: `docs/2차_기획서.html`, `docs/3차_기획서.html`, `docs/5차 기획안.html`, `docs/핸드오버.html`
- 마일스톤: `docs/M2_착수계획.html`, `docs/M5_검증증적.html`, `docs/M6_파일럿가이드.html`
- 기술문서(하네스): `docs/기술문서/개발기법선정서.md`, `docs/기술문서/하네스설계서.md`

## 결재 전환 (2026-09-03 ~ 09-04)
- 전환 계획 · 결정 근거(D1~D33) · 단계표(P0~P8): `docs/전환계획_결재중심_v0.2_20260903.md`
- 단계별 작업 기록: `docs/작업대장/작업이력대장_2026-09-03_결재전환_표준팩재이식_P0_P1.md`
- 화면 시안(검토 이력): `docs/화면시안_*.html`

## 작업 이력대장
사용자 요청별 작업 기록: `docs/작업대장/작업이력대장_<YYYY-MM-DD>_<작업명>.md` (UDS 필수 활동증적)

## 연결 계약 (불변)
PNG 폴더 규칙 → `python3 generator.py build <폴더> --style card --title "..."`
파일명: `표지.png` / `00. 목차.png` / `NN. 제목.png` / `뒷표지.png`
