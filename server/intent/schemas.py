"""의도 엔진 계약 — HELIX contracts/schemas 를 이북용으로 경량화(표준 라이브러리만).

HELIX 원본: IntentSpec/CompiledSchema/DashboardAction.
이북판: IntentSpec/EbookSchema/EbookAction/ClassifyResult.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IntentSpec:
    id: str
    title: str
    keywords: list[str] = field(default_factory=list)
    high_signal: str = ""          # 고신호 정규식(강한 패턴 즉시 확정). 비어 있으면 미사용.
    enabled: bool = True


@dataclass
class EbookSchema:
    intents: list[IntentSpec]
    fallback: str = "help"


@dataclass
class EbookAction:
    """프론트 applyUiAction 이 소비하는 UI 액션 계약."""
    type: str                       # 'add_slide' | 'insert_element' | 'set_theme' | ...
    payload: dict[str, Any] = field(default_factory=dict)

    def as_ui_action(self) -> dict[str, Any] | None:
        if self.type == "none":
            return None
        return {"type": self.type, "payload": self.payload, "auto_apply": True}


@dataclass
class ClassifyResult:
    intent: str
    slots: dict[str, Any]
    action: EbookAction
    reply: str
    needs_confirm: bool = False
    source: str = "rule"            # 분류 근거: 'high_signal' | 'keyword' | 'llm' | 'fallback'
    confidence: str = "B"           # A/B/C/X
    clarify: bool = False           # 되묻기 여부(실행 대신 확인 질문)
    scores: dict[str, int] = field(default_factory=dict)
