"""ebook_html 의도 엔진 — HELIX_AI_Agent 의도 오케스트레이션을 이북 도메인으로 재조준 이식.

HELIX 원본 구조(classify → slots → action → reply)와 '결정론 우선 + 규칙 폴백' 원칙을 계승하되,
대시보드 의도(trend/predict/…) 대신 이북 편집 의도(슬라이드·도형·표·배경·발표·이북생성)를 다룬다.
LLM 게이트웨이가 없어도 규칙만으로 동작한다(HELIX의 mock 폴백 철학).
"""
