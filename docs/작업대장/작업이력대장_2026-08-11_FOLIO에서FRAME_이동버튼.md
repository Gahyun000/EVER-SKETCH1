# 작업이력대장 — 2026-08-11 · EVER-FOLIO → EVER-FRAME 이동 버튼(양방향 완성)

> EVER-FOLIO(uniever_ebook 라이브러리·8811) 상단바 `★ 즐겨찾기` 왼쪽에 EVER-FRAME(8820)로 가는 칩 추가.
> FRAME→FOLIO(TitleBar 칩)와 대칭. 활동 기록이며 정본 문서를 대체하지 않는다.

## ⚠ 불변 계약 예외(사용자 승인)
- 원칙: `uniever_ebook` 은 **무수정**(구상안 §6, CLAUDE.md). 이번은 **사용자 명시 요청**에 따른 예외.
- 범위 최소화: `webapp/app.html` 상단바에 **링크 앵커 1개만** 삽입(로직·API·생성 파이프라인 무관, 되돌리기 쉬움).
- 코드 결합은 여전히 없음 — 단순 `<a href>` 네비게이션뿐.

## 변경
- `ebook-generator/webapp/app.html` — `.top` 바의 `favBtn`(★ 즐겨찾기) **앞**에 `frameBtn` 앵커 추가:
  `<a class="btn ghost" id="frameBtn" href="http://127.0.0.1:8820" target="_blank">↗ EVER-FRAME</a>`,
  EVER-PEAK 블루 인라인 강조(테두리 rgba(36,98,235,.45)·글자 #2462EB). 기존 `.btn.ghost` 알약 스타일 재사용.
- 그 외 파일·로직 무변경. 새 탭 이동(라이브러리 유지).

## 검증 증적(2026-08-11)
- 삽입 후 파일 무결성: `</html>` 1개·`frameBtn` 1개, favBtn 앵커 유일(중복 삽입 방지 assert 통과).
- 실제 `.top`/`.btn.ghost` 스타일로 목업 렌더 — `↗ EVER-FRAME` 칩이 `★ 즐겨찾기` 왼쪽에 동일 알약으로 정렬(첨부).
- FOLIO 는 서버가 app.html 을 그대로 서빙 → **빌드 불필요**, 8811 새로고침 시 즉시 반영.

## 양방향 요약
- EVER-FRAME(8820) 상단 TitleBar: `↗ EVER-FOLIO`(슬라이드쇼 왼쪽) → 8811.
- EVER-FOLIO(8811) 상단바: `↗ EVER-FRAME`(즐겨찾기 왼쪽) → 8820.
- `ebook_html/run.command` 가 두 서버를 함께 기동.
