"""하이브리드 의도 분류기(이북판) — HELIX classifier 3단 구조 완전 이식.

1) 고신호 규칙(스키마 순서=우선순위) — 강한 패턴 즉시 확정(A).
2) 키워드 점수 — 뚜렷한 1등이면 확정(B).
3) 모호(1등-2등 점수차<2) → LLM 판별(상위 3후보). LLM 없으면(mock) 키워드 1등(C).
반환: {intent, source, confidence, scores}.
"""
from __future__ import annotations

import json
import re
from typing import Any, Callable, Optional

from server.intent.schemas import EbookSchema

# llm_fn(messages) -> str|None (동기). None 이면 mock(규칙만).
LlmFn = Callable[[list[dict]], Optional[str]]

_SYSTEM_CLASSIFY = (
    "당신은 이북 편집기 챗봇의 의도 분류기입니다. 사용자 명령을 아래 '후보 의도' 중 하나로만 "
    '분류하고 JSON 한 줄로만 답하세요. 반드시 {"intent": "<id>"} 형식. 목록 밖 의도·설명 금지.'
)


def _high_signal(q: str, schema: EbookSchema) -> Optional[str]:
    for spec in schema.intents:
        if spec.enabled and spec.high_signal and re.search(spec.high_signal, q, re.IGNORECASE):
            return spec.id
    return None


def _keyword_scores(q: str, schema: EbookSchema) -> dict[str, int]:
    ql = q.lower()
    scores: dict[str, int] = {}
    for spec in schema.intents:
        if not spec.enabled:
            continue
        s = 0
        for kw in spec.keywords:
            if kw and kw.lower() in ql:
                s += 2 if len(kw) >= 3 else 1
        if s:
            scores[spec.id] = s
    return scores


def _llm_disambiguate(q: str, candidates: list[str], schema: EbookSchema, llm_fn: Optional[LlmFn]) -> Optional[str]:
    if not llm_fn:
        return None
    desc = {i.id: i.title for i in schema.intents if i.id in candidates}
    prompt = (f"후보 의도: {json.dumps(desc, ensure_ascii=False)}\n"
              f"명령: {q}\n"
              'JSON 한 줄로만 답: {"intent": "..."}')
    try:
        raw = llm_fn([{"role": "system", "content": _SYSTEM_CLASSIFY},
                      {"role": "user", "content": prompt}])
        m = re.search(r"\{[^{}]*\}", raw or "")
        if m:
            got = json.loads(m.group(0)).get("intent", "")
            if got in candidates:
                return got
    except Exception:
        pass
    return None


def classify(question: str, schema: EbookSchema, llm_fn: Optional[LlmFn] = None) -> dict[str, Any]:
    q = (question or "").strip()

    # 1) 고신호 규칙 → A
    hs = _high_signal(q, schema)
    if hs:
        return {"intent": hs, "source": "high_signal", "confidence": "A", "scores": {}}

    # 2) 키워드 점수
    scores = _keyword_scores(q, schema)
    if not scores:
        return {"intent": schema.fallback, "source": "fallback", "confidence": "C", "scores": {}}

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_id, top_score = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0

    # 뚜렷한 1등 → B
    if top_score - second >= 2 or len(ranked) == 1:
        return {"intent": top_id, "source": "keyword", "confidence": "B", "scores": scores}

    # 3) 모호 → LLM 판별(상위 3), 실패/미가용 → 키워드 1등(C)
    cand = [iid for iid, _ in ranked[:3]]
    pick = _llm_disambiguate(q, cand, schema, llm_fn)
    if pick:
        return {"intent": pick, "source": "llm", "confidence": "B", "scores": scores}
    return {"intent": top_id, "source": "keyword", "confidence": "C", "scores": scores}
