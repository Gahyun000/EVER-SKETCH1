"""BookPlan 생성 + 검증 하네스 (G3).

브리프 → (카드 카탈로그 주입) LLM → JSON BookPlan → 검증·보정·재시도·폴백.
- 정본 카드 스펙은 card_catalog(G2). 모르는 카드/필드는 드롭한다.
- LLM 호출은 llm_fn 의존성 주입(테스트·오프라인 가능). 미설정(None)이면 폴백 골격.
- 여기는 '검증된 계획'까지만 만든다. 실제 적용(카드 생성)은 G4 프론트 브리지.
"""
from __future__ import annotations

import json
import re
from typing import Callable, Optional

from server.intent import card_catalog as cc

# llm_fn(messages) -> text | None (동기). None 이면 폴백.
LlmFn = Callable[[list[dict]], Optional[str]]

ORIENTATIONS = {"portrait", "landscape"}
THEMES = {"light", "dark"}
DEFAULT_SKELETON = ["cover", "toc", "summary", "closing"]
MAX_PAGES = 24

PLAN_SYS = (
    "너는 유니에버 경영진 보고용 '이북' 기획자다. 사용자의 브리프를 받아 이북 한 권의 설계를 JSON 하나로만 출력한다.\n"
    "규칙:\n"
    "- 아래 '사용 가능 카드'의 cardKey 만 쓴다. 목록 밖 카드·필드는 절대 쓰지 않는다.\n"
    "- 각 페이지는 {\"cardKey\": <id>, \"fields\": {필드키: 값}} 형식. 필드키는 그 카드에 정의된 것만.\n"
    "- 표지(cover)로 시작하고 목차(toc)를 넣고 마무리(closing)로 끝내는 흐름을 권장한다.\n"
    "- 한국어. 문구는 짧고 임팩트 있게. 시각 스타일(테마)은 브리프 성격에 맞게 theme 로만 고른다.\n"
    "- KPI 등 수치는 브리프에 주어진 값만 쓴다. 없으면 지어내지 말고 비우거나 일반 표현을 쓴다.\n"
    "- 설명·말머리·코드펜스 없이 JSON 객체 하나만 출력한다.\n"
    "형식: {\"title\": \"...\", \"orientation\": \"portrait|landscape\", \"theme\": \"light|dark\", "
    "\"pages\": [{\"cardKey\": \"...\", \"fields\": {...}}]}\n"
    "사용 가능 카드: {catalog}"
)

_RETRY_NUDGE = (
    "JSON 형식이 아니었어요. 설명 없이 반드시 "
    "{\"title\":\"...\",\"orientation\":\"portrait\",\"theme\":\"light\","
    "\"pages\":[{\"cardKey\":\"cover\",\"fields\":{...}}]} 형태의 JSON 객체 하나만 출력하세요."
)


def _extract_json(text: str):
    """코드펜스·앞뒤 잡텍스트를 걷어내고 첫 JSON 객체를 파싱(app.summarize 와 동일 전략)."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t).rstrip("`").strip()
    m = re.search(r"\{.*\}", t, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _build_messages(brief: str, book_state: Optional[dict]) -> list[dict]:
    catalog = json.dumps(cc.catalog_for_prompt(), ensure_ascii=False)
    sys = PLAN_SYS.replace("{catalog}", catalog)
    ctx = ""
    if book_state and book_state.get("pages"):
        cur = [{"cardKey": p.get("cardKey"), "title": p.get("title")} for p in book_state["pages"]]
        ctx = "\n참고(현재 이북 상태): " + json.dumps(cur, ensure_ascii=False)
    user = f"브리프: {brief}{ctx}\nJSON 하나만 출력."
    return [{"role": "system", "content": sys}, {"role": "user", "content": user}]


def _coerce_page(rp, warnings: list[str], brief_numbers: set[str]):
    """한 페이지 스펙을 카탈로그에 맞게 보정. 모르는 카드/필드는 드롭."""
    if not isinstance(rp, dict):
        return None
    key = rp.get("cardKey") or rp.get("card") or ""
    if not cc.is_card(key):
        warnings.append(f"알 수 없는 카드 '{key}' 제외")
        return None
    allowed = set(cc.fields_of(key))
    raw_fields = rp.get("fields") or {}
    fields: dict[str, str] = {}
    if isinstance(raw_fields, dict):
        for k, v in raw_fields.items():
            if k in allowed and isinstance(v, (str, int, float, bool)):
                fields[k] = str(v).strip()
            elif k not in allowed:
                warnings.append(f"[{key}] 미지원 필드 '{k}' 제외")
    # 수치 환각 가드(kpi) — 브리프에 없는 숫자는 경고만(파괴하지 않음).
    if key == "kpi":
        for fk, val in fields.items():
            if fk == "title":
                continue
            nums = re.findall(r"\d+", val)
            if nums and not any(n in brief_numbers for n in nums):
                warnings.append(f"[kpi] 수치 '{val}' 는 브리프에 없는 값 — 예시일 수 있으니 확인 필요")
    return {"cardKey": key, "fields": fields}


def validate_plan(raw, brief: str = "", warnings: Optional[list[str]] = None):
    """LLM 원출력(dict)을 검증·보정된 BookPlan 으로. 실패하면 None."""
    if warnings is None:
        warnings = []
    if not isinstance(raw, dict):
        return None
    pages_raw = raw.get("pages")
    if not isinstance(pages_raw, list):
        return None
    brief_numbers = set(re.findall(r"\d+", brief or ""))
    pages = []
    for rp in pages_raw:
        cp = _coerce_page(rp, warnings, brief_numbers)
        if cp:
            pages.append(cp)
    if not pages:
        return None
    if len(pages) > MAX_PAGES:
        warnings.append(f"페이지 {len(pages)}장 → {MAX_PAGES}장으로 축소")
        pages = pages[:MAX_PAGES]
    title = (str(raw.get("title") or "").strip() or "새 이북")[:80]
    orientation = raw.get("orientation") if raw.get("orientation") in ORIENTATIONS else "portrait"
    theme = raw.get("theme") if raw.get("theme") in THEMES else "light"
    return {"title": title, "orientation": orientation, "theme": theme, "pages": pages}


def _skeleton(brief: str, warnings: list[str]) -> dict:
    warnings.append("LLM 계획 생성에 실패해 최소 골격으로 대체했어요.")
    title = ((brief or "새 이북").strip() or "새 이북")[:40]
    pages = [{"cardKey": k, "fields": {}} for k in DEFAULT_SKELETON]
    pages[0]["fields"] = {"title": title}
    return {"title": title, "orientation": "portrait", "theme": "light", "pages": pages}


def make_plan(brief: str, llm_fn: Optional[LlmFn], book_state: Optional[dict] = None,
              retries: int = 2) -> dict:
    """브리프 → 검증된 BookPlan. 반환: {ok, plan, warnings, source:'llm'|'fallback'}."""
    warnings: list[str] = []
    messages = _build_messages(brief, book_state)
    for _ in range(max(1, retries + 1)):
        text = llm_fn(messages) if llm_fn else None
        if text:
            obj = _extract_json(text)
            if obj is not None:
                plan = validate_plan(obj, brief, warnings)
                if plan:
                    return {"ok": True, "plan": plan, "warnings": warnings, "source": "llm"}
        if not llm_fn:
            break  # 미설정이면 재시도 의미 없음
        # 재시도: 형식 강조 넛지 추가
        messages = messages + [{"role": "user", "content": _RETRY_NUDGE}]
    return {"ok": True, "plan": _skeleton(brief, warnings), "warnings": warnings, "source": "fallback"}
