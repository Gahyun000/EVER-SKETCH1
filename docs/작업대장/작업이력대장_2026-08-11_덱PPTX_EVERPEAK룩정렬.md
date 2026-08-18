# 작업이력대장 — 2026-08-11 · 덱→PPTX 템플릿 EVER-PEAK 룩 정렬

> 'HTML 가져오기 → 편집 가능 PPTX' 변환기(`server/deck/deck_builder.js`)의 팔레트·표지·간격을
> EVER-PEAK 룩(`src/design/tokens.ts` 정본)에 맞춘다. **텍스트·도형은 네이티브(편집 가능) 유지** — 옵션(2).
> 활동 기록이며 정본 문서를 대체하지 않는다.

## 배경
- 미리보기(HTML)는 브라우저가 CSS 를 그대로 렌더 → 예쁨. 실제 PPT 는 `extractor` 가 서식을 버리고
  텍스트만 추출 → 고정 템플릿(`deck_builder.js`, pptxgenjs)으로 재작도 → 디자인이 미리보기와 달랐다.
- 옵션(1) 이미지 통짜 굽기(편집 불가) 대신 **옵션(2)**: 편집성을 유지한 채 템플릿 색·간격·카드 스타일만 EVER-PEAK 로 정교화.

## 적용 스킬(사전 선언)
- uniever-development-standard — 작업대장.
- karpathy-guidelines — 팔레트·표지·섹션번호까지만. 레이아웃 골격·IR 계약·extractor 는 무변경(과잉구현 금지).
- verification-before-completion — 실제 파이프라인 렌더 + python-pptx 색·편집성 검증.
- 미적용: TDD(시각 산출물·단위테스트 부적합 → 렌더 대조로 대체), UI_개발표준(화면 아님).

## 변경
- `server/deck/deck_builder.js` — `LIGHT`/`DARK` 팔레트를 `tokens.ts` EVER-PEAK 값으로 재정의:
  - 라이트: 배경 **순백 #FFFFFF**, 제목 **네이비 #0F1B3D**, 본문 #1C2433, 강조/키커/목차번호 **블루 #2462EB**,
    카드면 #F6F8FC·테두리 #E6E8EE, 브랜드 그린/앰버/블루 = #3E9E6E/#D98A2A/#2462EB.
  - 다크: 배경 **딥네이비 #0B1626**, 본문 #E7EDF6, 블루 **#4D86FF**, 카드 #141F30/테두리 #24303F.
  - **표지 = 네이비**(EVER-PEAK 표지): `T.cover` 서브팔레트 추가 → 표지 배경 네이비 + 흰 워드마크/제목 +
    네이비 카드(흰 제목·컬러 닷). `coverSlide`/`coverCards` 분리, 공통 레일은 `railChrome(팔레트)` 로 일반화.
  - 섹션 번호 태그: `markEn` 이 없는 본문 섹션도 `head()` 가 **블루 markN(01·02…)** 을 노출(EVER-PEAK 넘버링).
  - 그림자 톤을 네이비(0F1B3D)·약하게(opacity 0.08). 카드 radius 0.08 통일.
- IR 스키마·`extractor.py`·`convert.py`·프론트는 **무변경**. 빌더 내부 색/표지만 정렬.

## 검증 증적(2026-08-11, 컨테이너 = 실제 파이프라인: bs4 extractor + pptxgenjs 3.12.0 + soffice)
- `node --check deck_builder.js` 통과. 샘플 HTML → extractor → 빌더 → soffice PDF → PNG 렌더(라이트/다크 4장) 정상.
- **육안 대조**: 표지 네이비 전환, 본문 순백+네이비 제목, 블루 키커/섹션번호/목차번호, 연블루 카드 — EVER-PEAK 정렬 확인(before/after 비교 이미지 첨부).
- **python-pptx 검증**: 덱당 편집 가능한 **텍스트런 59개**(이미지 아님 → PowerPoint 편집 유지). 토큰 실제 반영 —
  라이트 0F1B3D·2462EB·1C2433, 다크 4D86FF·E7EDF6·FFFFFF, 표지 배경 0F1B3D/0B1626, 본문 배경 FFFFFF.
- 디바이스 `node --check`(실제 node) 통과.

## 남은 여지(원하면 다음)
- 브랜드 폰트(Pretendard 등) 임베드 시 타이포까지 EVER-PEAK 근접 — 단 PowerPoint 폰트 설치/치환 이슈로 현재는 안전값(맑은 고딕) 유지.
- `extractor` 가 KPI 수치를 `stat` 카드로 승격하면 성과 페이지가 EVER-PEAK KPI 칩처럼 표현됨(IR 확장, 별도 과제).
- 통짜 이미지(옵션 1) 혼용 옵션: '편집 불가·픽셀 100%' 내보내기를 별 버튼으로 병행 제공.
