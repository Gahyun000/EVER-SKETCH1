"""확신 등급 A/B/C/X (이북판) — HELIX confidence 커널 이식.

HELIX 원본은 상류 소스(model/dataset) 상태로 강등한다. 이북엔 상류 데이터가 없으므로,
'분류 확신 × 필수 슬롯 충족'으로 강등한다:
  · A: 고신호 규칙 확정
  · B: 키워드 뚜렷한 1등(또는 LLM 판별)
  · C: 키워드 모호 / 폴백
  · X: 실행 불가(필수 슬롯 없음) → 되묻기(clarify)
"""
from __future__ import annotations

_ORDER = {"X": 0, "C": 1, "B": 2, "A": 3}


def min_grade(a: str, b: str) -> str:
    return a if _ORDER.get(a, 0) <= _ORDER.get(b, 0) else b


def downgrade_if_missing(base: str, *, missing: bool) -> str:
    """필수 슬롯이 없으면 X(실행 불가)로 강등."""
    return "X" if missing else base


def is_actionable(grade: str) -> bool:
    """A/B 만 즉시 실행. C/X 는 되묻기 대상."""
    return _ORDER.get(grade, 0) >= _ORDER["B"]
