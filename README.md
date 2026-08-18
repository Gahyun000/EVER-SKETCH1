# ebook_html — 경영진 스케치 빌더 (React + TypeScript)

경영진이 사업모델을 카드로 조립하고(필요 시 자유 캔버스로 자유 편집) 이북/덱으로 내보내는 도구.
산출물(PNG 폴더)은 기존 `uniever_ebook`의 `generator.py`로 이북 빌드 — **uniever_ebook 무수정**.

## 실행
```bash
npm install
npm run dev
```

## 상태
- [x] M0 셋업(스캐폴드 + default_skill 표준 스킬 이식 + 디자인 토큰)
- [ ] M1 종단 슬라이스: 카드 1장 → PNG(html-to-image) → 폴더 → generator.py → 이북
- [ ] M2 카드 카탈로그 13종 · M3 자유 캔버스 · M4 발표/내보내기 · M5 검증 · M6 파일럿

## 연결 계약 (불변)
PNG 폴더 규칙 → `python3 generator.py build <폴더> --style card --title "..."`
파일명: `표지.png` / `00. 목차.png` / `NN. 제목.png` / `뒷표지.png`

## 문서
- `docs/ebook_html_개발계획서.html` — 개발 계획(G0~G6)
- `docs/틀빌더_목업_카드플러스자유캔버스_2.html` — 최신 UX 목업
- `skills/` — default_skill에서 이식한 표준 스킬 7종 (`UNIEVER_SKILL_MANIFEST.txt`)
