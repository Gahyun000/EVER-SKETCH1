"""하이브리드 해석기 — 규칙이 확신 못 한 명령을 LLM으로 구조화(검증된 액션)한다.

흐름: LLM에게 카탈로그를 주고 {"intent","slots"} JSON을 받아 catalog.validate 로 검증.
검증을 통과한 (intent, slots) 만 반환한다. 통과 못 하면 None → 실행하지 않고 되묻게 한다.
자유 텍스트 액션 주장(환각)은 여기서 실행되지 않으므로 화면에 반영될 수 없다.
"""
from __future__ import annotations

import json
import re
from typing import Callable, Optional

from server.intent import catalog

LlmFn = Callable[[list[dict]], Optional[str]]


def resolve(message: str, llm_fn: Optional[LlmFn]) -> Optional[tuple[str, dict]]:
    if not llm_fn or not (message or "").strip():
        return None
    sys = catalog.build_prompt()
    user = (f'명령: "{message}"\n'
            '위 목록에서 하나만 골라 JSON 한 줄로만 답하세요. 해당 동작이 없으면 {"intent":"none"}.')
    try:
        raw = llm_fn([{"role": "system", "content": sys}, {"role": "user", "content": user}])
    except Exception:
        return None
    if not raw:
        return None
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except Exception:
        return None
    intent = obj.get("intent")
    if not intent or intent == "none":
        return None
    ok, clean = catalog.validate(intent, obj.get("slots") or {})
    if not ok:
        return None
    return intent, clean
