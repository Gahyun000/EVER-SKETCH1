"""오케스트레이터(이북판) — classify → slots → 확신 게이팅 → action/clarify 조립.

HELIX orchestrator 의 '확신 강등 → 되묻기(clarify)' 커널을 이식.
- 필수 슬롯 없음 → X 로 강등 → 되묻기.
- 키워드 모호(C) 액션 → 되묻기(잘못 실행 대신 확인).
- 고신호(A)·뚜렷한 키워드(B)·LLM 판별 → 즉시 실행.
LLM 게이트웨이가 없으면 규칙만으로 동작(mock 폴백).
"""
from __future__ import annotations

from typing import Callable, Optional

from server.intent import action_mapper, classifier, confidence
from server.intent import slots as slot_mod
from server.intent.schema_ebook import EBOOK_SCHEMA
from server.intent.schemas import ClassifyResult, EbookAction

SUGGESTIONS = ["새 슬라이드 추가해줘", "도형 넣어줘", "다크 배경으로 바꿔줘", "이북 만들어줘"]

# 대화형(액션 없음) 의도
_CONVERSATIONAL = {"help", "smalltalk"}
# 실행에 특정 슬롯이 반드시 필요한 의도
_NEEDS = {"set_theme": "theme", "set_orientation": "orientation", "z_order": "direction"}
# 되묻기 문구
_CLARIFY = {
    "set_theme": "배경을 어떻게 바꿀까요? ‘다크’ 또는 ‘라이트’라고 말씀해 주세요.",
    "set_orientation": "‘세로 이북’으로 할까요, ‘가로 덱’으로 할까요?",
    "z_order": "선택한 요소를 ‘맨 앞’으로 보낼까요, ‘맨 뒤’로 보낼까요?",
}
_GENERIC_CLARIFY = ("무엇을 할지 조금만 더 구체적으로 알려주세요. "
                    "예: ‘도형 넣어줘’, ‘다크 배경으로 바꿔줘’, ‘이북 만들어줘’.")


def route(message: str, llm_fn: Optional[Callable[[list[dict]], Optional[str]]] = None) -> ClassifyResult:
    cls = classifier.classify(message, EBOOK_SCHEMA, llm_fn)
    intent = cls["intent"]
    conf = cls["confidence"]
    scores = cls.get("scores", {})
    sl = slot_mod.extract(message)

    # 대화형 → 액션 없음(챗 엔진이 LLM/폴백으로 응답)
    if intent in _CONVERSATIONAL or intent == EBOOK_SCHEMA.fallback:
        return ClassifyResult(intent=intent, slots=sl, action=EbookAction("none"), reply="",
                              needs_confirm=False, source=cls["source"], confidence=conf, scores=scores)

    # 필수 슬롯 확인 → 강등
    need = _NEEDS.get(intent)
    missing = bool(need and need not in sl)
    grade = confidence.downgrade_if_missing(conf, missing=missing)

    # 실행 불가(X) 또는 모호(C) → 되묻기
    if not confidence.is_actionable(grade):
        reply = _CLARIFY.get(intent, _GENERIC_CLARIFY) if missing else _GENERIC_CLARIFY
        return ClassifyResult(intent="clarify", slots=sl, action=EbookAction("none"), reply=reply,
                              needs_confirm=False, source=cls["source"], confidence=grade,
                              clarify=True, scores=scores)

    # 실행
    action, reply, needs_confirm = action_mapper.build(intent, sl)
    return ClassifyResult(intent=intent, slots=sl, action=action, reply=reply,
                          needs_confirm=needs_confirm, source=cls["source"], confidence=grade, scores=scores)
