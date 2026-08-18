# 작업이력대장 — 2026-08-11 · G4 apply_book_plan 브리지 (말로 초안 뽑기)

> 구상안 `docs/이북생성_에이전트_고도화_구상안.md` 의 게이트 G4. 활동 기록이며 정본 문서를 대체하지 않는다.

## 적용 스킬(사전 선언)
- uniever-development-standard — 작업대장·거버넌스(프론트 store/actions 변경).
- karpathy-guidelines — 브리지 + 생성 트리거까지만. 스마트 레인 분류/부분수정은 G5(과잉구현 금지).
- test-driven-development — applyPlan 매핑 미러 + 생성 레인 python(mock).
- verification-before-completion — 완료 전 실행 증거.
- 미적용: UI_개발표준(신규 목록/모달/버튼 화면 아님).

## 항목

- [x] **apply_book_plan 브리지 + 생성 레인(G4)**
  - `년월일`: 2026-08-11
  - `요청내용`: "이어서 진행" — G4. planner 의 BookPlan 을 실제 카드로 꽂아 "말로 초안 뽑기"를 화면에서 동작시킨다.
  - `작업내용`:
    - `src/state/store.ts` — `BookPlan`/`PlanPage` 타입 + `applyPlan(plan)`. pages 전체 교체(빈 이북에서 한 번에 초안 완성), 카드별 필드키는 존재시키되 **미채운 값은 예시 대신 빈칸**(가짜 KPI 수치 주입 방지), note 는 제목 h1 블록, 미지원 카드 필터, title/orientation/theme 반영, 첫 페이지 선택.
    - `src/chat/actions.ts` — `apply_book_plan` 케이스 → `store.applyPlan(payload.plan)`.
    - `server/chat.py` — **생성 레인**: 빈 이북 + '이북 만들어/초안/기획' 감지(`_detect_create_brief`) 시 `planner.make_plan` 호출 → `apply_book_plan` ui_action + 요약·경고 답변. 내용 있는 이북의 '이북 만들어/뽑아'는 기존 make_ebook(PDF 빌드)로 두어 충돌 회피.
    - 신규 `server/test_create_lane.py` — 생성 레인 단위테스트(mock planner).
  - `결과`: 아래 검증 통과. 잔여: 실제 gemma 라이브 + 브라우저 UI 확인은 서버 기동 상태에서. 승인: 초안.

## 검증 증적(2026-08-11)
- `server/test_create_lane.py` → **ALL PASS (12)**: 트리거 감지(빈/내용/초안/기획/인사/편집), 생성→apply_book_plan+plan 동봉+답변, 경고 노출(⚠), 충돌 회피(내용 있으면 make_ebook 확인), 편집 명령 유지(insert_element). **컨테이너+디바이스.**
- `applyPlan.mirror.test.mjs` (node) → **ALL PASS (9)**: 미지원 카드 필터, 미채운 필드 빈칸(예시/가짜수치 미주입), note 제목 블록, 메타 반영, 첫 페이지 선택.
- `tsc --noEmit`(디바이스 실제 저장소) → 오류 0(프론트 컴파일 통과).

## 다음
- G5 부분 수정 루프 — edit_content 레인 + `apply_page_edits`(‘이 장 다듬어/3장 추가/톤 통일’). 이후 G6 자동 export + 자기검증.
