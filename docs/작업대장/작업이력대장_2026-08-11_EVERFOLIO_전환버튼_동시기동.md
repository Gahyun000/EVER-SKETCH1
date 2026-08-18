# 작업이력대장 — 2026-08-11 · EVER-FOLIO 이동 칩 + 런처 동시 기동

> EVER-FRAME(ebook_html·8820) 상단바에서 EVER-FOLIO(uniever_ebook 이북 라이브러리·8811)로 바로 가는
> 라벨 칩을 추가하고, `run.command` 가 두 앱을 함께 띄우도록 한다. 사용자 선택: **옵션 1 · 라벨 칩**.
> 활동 기록이며 정본 문서를 대체하지 않는다.

## 결정
- 배치/형태: **좌상단 브랜드 옆 라벨 칩**(한 번 클릭 = 바로 이동). 목업 3안 비교 후 사용자 선택.
- 대상: **EVER-FOLIO = uniever_ebook 라이브러리** `http://127.0.0.1:8811`(serve.py, `EBOOK_PORT` 기본 8811).
- 이동은 **새 탭**(target=_blank) — 빌더 작업 상태 유지.

## 적용 스킬(사전 선언)
- uniever-development-standard — 상단바 변경 + 작업대장.
- karpathy-guidelines — 칩 1개 + 런처 기동 블록까지만(제품 스위처 드롭다운은 제품 3개↑ 때, 과잉구현 금지).
- verification-before-completion — tsc·bash 검증.
- 미적용: UI_개발표준(신규 목록/모달 화면 아님), TDD(정적 링크·셸).

## 변경
- `src/builder/TopBar.tsx` — 브랜드 옆에 `↗ EVER-FOLIO` 칩(`<a href="http://127.0.0.1:8811" target="_blank">`),
  EVER-PEAK 블루 인라인 스타일(테두리 #cfe0ff·배경 #eef4ff·글자 #2462EB). 다른 로직 무변경.
- `run.command` — FastAPI(8820) 기동 전에 **EVER-FOLIO(8811) 동시 기동** 블록 추가:
  `../uniever_ebook/ebook-generator/serve.py` 를 백그라운드로(이미 8811 응답하면 재실행 안 함).
  최초엔 그 폴더 `.venv` 생성 + `pillow` 설치로 자립 기동(없으면 `python3` 폴백). 로그 `/tmp/everfolio.log`.
  `uniever_ebook` 코드는 **무수정**(실행만).

## 검증 증적(2026-08-11)
- `bash -n run.command` 통과(컨테이너·디바이스). `chmod +x` 유지.
- `tsc --noEmit`(디바이스 실제 node_modules) 오류 0 — 칩 추가 후 프론트 컴파일 통과.
- FOLIO 경로 확인: `../uniever_ebook/ebook-generator/serve.py` 존재(디바이스), `EBOOK_PORT=8811`.

## 사용법/주의
- `run.command` 더블클릭 → EVER-FRAME(8820) + EVER-FOLIO(8811) 둘 다 뜸. 상단바 `↗ EVER-FOLIO` 칩으로 새 탭 이동.
- `npm run dev` 로 개발 기동 시에는 8811 이 자동으로 안 뜨므로, 칩을 쓰려면 uniever_ebook 을 따로 실행하거나 run.command 사용.
- FOLIO 백그라운드 프로세스는 터미널 종료 후에도 남을 수 있음 — 필요 시 `lsof -ti:8811 | xargs kill` 로 정리.

## 남은 여지
- 칩에 FOLIO 기동 여부 점 표시(초록/회색), 제품 3개↑ 시 드롭다운 스위처로 승격, 포트 환경변수화.
