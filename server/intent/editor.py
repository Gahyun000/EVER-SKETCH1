"""부분 수정 레인 하네스 (G5).

현재 이북(book_state) 컨텍스트를 기준으로 **대상 페이지만** 고쳐 쓰거나(폴리시/톤 통일),
장을 몇 개 더 붙인다(추가). planner(G3) 와 같은 구조를 따른다:
명령 → (카탈로그 + 현재 내용 주입) LLM → JSON → 검증·보정·재시도·폴백.

- 정본 카드 스펙은 card_catalog(G2). 모르는 카드/필드는 드롭한다.
- LLM 호출은 llm_fn 의존성 주입(테스트·오프라인 가능). 미설정(None)이면 폴백.
- 여기는 '검증된 편집 계획'까지만 만든다. 실제 적용(updateField/append)은 프론트 브리지(store.applyPageEdits).
- 불변: note/toc/slide 등 필드 없는 페이지는 폴리시/톤 대상에서 제외(경고). 이번 게이트는 필드형 카드 대상.

반환(make_edits): {ok, op, edits:[{pageId, fields}], adds:[{cardKey, fields}], warnings, summary, source}
"""
from __future__ import annotations

import re
from typing import Callable, Optional

from server.intent import card_catalog as cc
from server.intent import planner  # _extract_json / _coerce_page 재사용(드리프트 방지: 검증 한 곳)
from server.intent import self_check as sc  # G6 자기검증(과장 문구 등)

LlmFn = Callable[[list[dict]], Optional[str]]

MAX_ADD = 12  # 한 번에 붙일 수 있는 최대 장수(폭주 방지)

# ── 명령 감지 정규식 ─────────────────────────────────────────────────────────
_NUM = r"(\d+)\s*(?:장|개|페이지|쪽|슬라이드)"
_ADD_VERB = r"(?:더|추가|덧붙|붙여|넣|만들|늘려|확장)"
_RE_ADD = re.compile(_NUM + r"\s*" + _ADD_VERB)            # "3장 추가/3장 더/2페이지 넣어"
_RE_ADD_REV = re.compile(_ADD_VERB + r"\s*" + _NUM)        # "추가로 3장"
# 캔버스 요소(도형/화살표/글맵시/텍스트상자) 키워드 — 있으면 개수의 '개'를 'N장 추가'로 보지 않는다.
_RE_ELEMENT = re.compile(r"(사각형|네모|박스|동그라미|타원|마름모|삼각형|도형|화살표|연결선|글맵시|워드아트|word\s*art|글상자|텍스트\s*상자|(?<![가-힣])원(?=[\s\d을를이가]|$))")
_RE_TONE = re.compile(r"(?:톤|어투|문체|말투|스타일|어조)\s*(?:을|를|이|가)?\s*"
                      r"(?:통일|맞춰|맞추|일관|정리|가다듬|다듬|통합|고르게)")
_POLISH_VERB = re.compile(r"(다듬|매끄럽게|매끈|개선|고쳐|고치|강하게|세게|보완|윤문|"
                          r"풍부|자연스럽|손봐|손 봐|다시 써|다시써|바꿔 써|고급스럽|정돈)")
_RE_THIS = re.compile(r"(이|현재|선택(?:한|된)?|지금)\s*(?:장|페이지|카드|이거|것|슬라이드)|이거|이걸|이 페이지|이 장")
_RE_ORD = re.compile(r"(\d+)\s*(?:장|페이지|번째|쪽)")

# 이름으로 페이지를 지목할 때(부분 수정 대상). 더 구체적인 것을 앞에.
_NAMED: list[tuple[str, str]] = [
    ("표지", "cover"), ("목차", "toc"), ("마무리", "closing"), ("클로징", "closing"),
    ("요약", "summary"), ("성과", "kpi"), ("지표", "kpi"), ("kpi", "kpi"),
    ("로드맵", "roadmap"), ("시장", "market"), ("경쟁", "market"),
    ("프로세스", "flow"), ("플로우", "flow"), ("마인드맵", "mindmap"),
    ("스티키", "sticky"), ("보드", "board"),
]


def _pages(book_state: Optional[dict]) -> list[dict]:
    return list((book_state or {}).get("pages") or [])


def _find_by_cardkey(pages: list[dict], cardkey: str) -> Optional[dict]:
    for p in pages:
        if p.get("cardKey") == cardkey:
            return p
    return None


def _resolve_target(message: str, book_state: Optional[dict]) -> Optional[dict]:
    """폴리시 대상 페이지 한 장을 고른다. 이 장/선택 > 서수(N장) > 이름(표지·성과…) > 선택페이지 폴백."""
    pages = _pages(book_state)
    if not pages:
        return None
    s = message or ""
    sel = (book_state or {}).get("selectedPageId")

    def by_id(pid):
        for p in pages:
            if p.get("id") == pid:
                return p
        return None

    # 1) 이 장/현재/선택
    if _RE_THIS.search(s):
        return by_id(sel) or pages[0]
    # 2) 서수(N장/N페이지/N번째)
    mo = _RE_ORD.search(s)
    if mo:
        idx = int(mo.group(1)) - 1
        if 0 <= idx < len(pages):
            return pages[idx]
    # 3) 이름(표지/성과/로드맵…)
    low = s.lower()
    for kw, ck in _NAMED:
        if kw.lower() in low:
            hit = _find_by_cardkey(pages, ck)
            if hit:
                return hit
    # 4) 폴백: 선택된 페이지(있으면)
    return by_id(sel)


def detect_edit(message: str, book_state: Optional[dict]) -> Optional[dict]:
    """편집 레인 트리거. 내용이 있는 이북에서만 동작. 우선순위: 추가 > 톤 통일 > 폴리시.
    반환 op 서술자 또는 None(레인 미해당 → 기존 라우팅으로)."""
    s = (message or "").strip()
    if not s:
        return None
    pages = _pages(book_state)
    if not pages:
        return None  # 빈 이북은 생성 레인(G4) 담당

    # 캔버스 요소(도형/화살표/글맵시/텍스트상자) 요청이면 개수의 '개'가 'N장 추가'로 오인되지
    # 않도록 편집 레인에서 제외하고 의도 엔진(insert_shape 등)이 처리하게 넘긴다.
    is_element_req = bool(_RE_ELEMENT.search(s))

    # 1) N장 추가 (숫자 + 추가동사) — orchestrator 의 add_slide('장 추가')보다 먼저 가로챈다.
    #    단, 캔버스 요소 요청은 제외한다(도형 의도로 넘김).
    if not is_element_req:
        mo = _RE_ADD.search(s) or _RE_ADD_REV.search(s)
        if mo:
            n = max(1, min(MAX_ADD, int(mo.group(1))))
            return {"op": "add", "n": n}

    # 2) 톤 통일 (책 전체 어조 일관화)
    if _RE_TONE.search(s):
        return {"op": "tone"}

    # 3) 폴리시(이 장/특정 장 다듬기) — 폴리시 동사 + 대상 지목 가능해야
    if _POLISH_VERB.search(s):
        tgt = _resolve_target(s, book_state)
        if tgt is not None:
            return {"op": "polish", "pageId": tgt.get("id"), "cardKey": tgt.get("cardKey")}
    return None


# ── 프롬프트 ────────────────────────────────────────────────────────────────
_EDIT_SYS = (
    "너는 유니에버 경영진 보고용 '이북'의 편집자다. 주어진 페이지의 필드 문구를 더 낫게 고쳐 쓴다.\n"
    "규칙:\n"
    "- 카드 종류(cardKey)와 필드 키는 절대 바꾸지 않는다. 주어진 필드 키에 대해서만 값을 다시 쓴다.\n"
    "- 숫자·KPI 값은 원문에 있는 값만 유지한다. 없는 수치를 새로 지어내지 않는다.\n"
    "- 한국어. 짧고 임팩트 있게. 과장·군더더기 없이.\n"
    "- 설명·말머리·코드펜스 없이 JSON 하나만 출력한다.\n"
    "형식: {\"pages\": [{\"pageId\": <정수>, \"fields\": {필드키: 값}}]}"
)
_ADD_SYS = (
    "너는 유니에버 경영진 보고용 '이북' 기획자다. 이미 있는 이북에 이어질 새 페이지 몇 장을 설계한다.\n"
    "규칙:\n"
    "- 아래 '사용 가능 카드'의 cardKey 만 쓴다. 각 페이지는 {\"cardKey\": <id>, \"fields\": {필드키: 값}}.\n"
    "- 현재 이북의 흐름·주제를 이어가되 이미 있는 내용과 중복되지 않게 보완한다.\n"
    "- KPI 등 수치는 주어진 값만. 없으면 지어내지 말고 비운다. 한국어, 짧게.\n"
    "- 설명·코드펜스 없이 JSON 하나만: {\"pages\": [{\"cardKey\": \"...\", \"fields\": {...}}]}\n"
    "사용 가능 카드: {catalog}"
)
_RETRY_NUDGE = ("JSON 형식이 아니었어요. 설명 없이 반드시 "
                "{\"pages\":[...]} 형태의 JSON 객체 하나만 출력하세요.")


def _page_full(book_state: Optional[dict], pid) -> dict:
    for p in _pages(book_state):
        if p.get("id") == pid:
            return p
    return {}


def _fields_of_page(page: dict) -> dict:
    """스냅샷 페이지의 현재 필드(문자열 맵). fields 우선, 없으면 title 만이라도."""
    f = page.get("fields")
    if isinstance(f, dict) and f:
        return {k: str(v) for k, v in f.items() if isinstance(v, (str, int, float, bool))}
    t = page.get("title")
    return {"title": str(t)} if t else {}


def _numbers(*texts: str) -> set[str]:
    out: set[str] = set()
    for t in texts:
        out |= set(re.findall(r"\d+", t or ""))
    return out


def _editable(page: dict) -> bool:
    """필드형 카드만 폴리시/톤 대상(note/toc/slide 등 필드 없는 카드 제외)."""
    ck = page.get("cardKey") or ""
    return cc.is_card(ck) and bool(cc.fields_of(ck))


def _coerce_edit(pid, cardkey: str, raw_fields, ground: set[str], warnings: list[str]) -> Optional[dict]:
    """LLM이 낸 한 페이지 편집을 카탈로그에 맞게 보정. 반환 {pageId, fields} 또는 None(빈 편집)."""
    allowed = set(cc.fields_of(cardkey))
    fields: dict[str, str] = {}
    if isinstance(raw_fields, dict):
        for k, v in raw_fields.items():
            if k in allowed and isinstance(v, (str, int, float, bool)):
                val = str(v).strip()
                if not val:
                    continue
                if cardkey == "kpi" and k != "title":
                    nums = re.findall(r"\d+", val)
                    if nums and not any(nn in ground for nn in nums):
                        warnings.append(f"[kpi] 새 수치 '{val}' 는 원문에 없던 값 — 확인 필요")
                fields[k] = val
            elif k not in allowed:
                warnings.append(f"[{cardkey}] 미지원 필드 '{k}' 제외")
    if not fields:
        return None
    return {"pageId": pid, "fields": fields}


def _run_llm(messages, llm_fn: Optional[LlmFn], retries: int):
    """공통 LLM 루프: 파싱 성공한 dict 반환 또는 None(폴백)."""
    msgs = messages
    for _ in range(max(1, retries + 1)):
        text = llm_fn(msgs) if llm_fn else None
        if text:
            obj = planner._extract_json(text)
            if isinstance(obj, dict):
                return obj
        if not llm_fn:
            return None
        msgs = msgs + [{"role": "user", "content": _RETRY_NUDGE}]
    return None


def _edit_targets(op: dict, book_state: Optional[dict], warnings: list[str]) -> list[dict]:
    """폴리시=대상 1장, 톤=필드형 전체."""
    pages = _pages(book_state)
    if op["op"] == "polish":
        pg = _page_full(book_state, op.get("pageId"))
        if not pg:
            return []
        if not _editable(pg):
            warnings.append("이 페이지는 자유 텍스트/자동 카드라 이번엔 문구 다듬기 대상이 아니에요.")
            return []
        return [pg]
    # tone
    tgt = [p for p in pages if _editable(p)]
    skipped = len(pages) - len(tgt)
    if skipped:
        warnings.append(f"필드 없는 페이지 {skipped}장은 톤 통일에서 제외")
    return tgt


def _make_field_edits(op: dict, message: str, llm_fn, book_state, retries: int) -> dict:
    """폴리시/톤 → edits:[{pageId, fields}]."""
    warnings: list[str] = []
    targets = _edit_targets(op, book_state, warnings)
    if not targets:
        return {"ok": True, "op": op["op"], "edits": [], "adds": [], "warnings": warnings,
                "summary": "다듬을 대상 페이지를 찾지 못했어요.", "source": "fallback"}

    payload_pages = [{"pageId": p.get("id"), "cardKey": p.get("cardKey"),
                      "fields": _fields_of_page(p)} for p in targets]
    import json as _json
    instr = ("아래 페이지들의 문구를 더 매끄럽고 임팩트 있게 다듬어 주세요."
             if op["op"] == "polish" else
             "아래 페이지들의 어조·문체를 하나로 일관되게 통일해 주세요(내용·수치는 유지).")
    user = (f"{instr} 원하는 방향: {message}\n"
            f"대상 페이지(JSON): {_json.dumps(payload_pages, ensure_ascii=False)}\n"
            "각 페이지는 같은 pageId·같은 필드 키로만, fields 값을 다시 써서 JSON 하나로 출력.")
    obj = _run_llm([{"role": "system", "content": _EDIT_SYS}, {"role": "user", "content": user}],
                   llm_fn, retries)

    edits: list[dict] = []
    source = "llm"
    if obj is not None:
        by_id = {p["pageId"]: p for p in payload_pages}
        raw_pages = obj.get("pages") if isinstance(obj.get("pages"), list) else []
        for rp in raw_pages:
            if not isinstance(rp, dict):
                continue
            pid = rp.get("pageId")
            base = by_id.get(pid)
            if base is None:  # 대상 밖 pageId 는 무시(환각 방지)
                continue
            ground = _numbers(*[str(v) for v in base["fields"].values()])
            ce = _coerce_edit(pid, base["cardKey"], rp.get("fields"), ground, warnings)
            if ce:
                edits.append(ce)
    if not edits:
        source = "fallback"
        if llm_fn:
            warnings.append("문구 다듬기 결과를 만들지 못했어요(LLM 응답 확인).")
        else:
            warnings.append("LLM이 연결되지 않아 문구를 다듬지 못했어요(환경설정에서 LLM 등록).")
    else:
        # G6 자기검증 — 다듬은 문구에 과장 표현이 섞였는지(부분 편집이라 빈내용 검사는 끔).
        checked = {p["pageId"]: p["cardKey"] for p in payload_pages}
        found: list[dict] = []
        for e in edits:
            found += sc.scan_fields(checked.get(e["pageId"], ""), e.get("fields"), empty_check=False)
        warnings.extend(sc.messages(found, limit=3))

    if op["op"] == "polish":
        summary = (f"‘{targets[0].get('title') or targets[0].get('cardKey')}’ 페이지 문구를 다듬었어요."
                   if edits else "이 페이지를 다듬지 못했어요.")
    else:
        summary = (f"{len(edits)}개 페이지의 어조를 통일했어요." if edits else "톤 통일을 적용하지 못했어요.")
    return {"ok": True, "op": op["op"], "edits": edits, "adds": [], "warnings": warnings,
            "summary": summary, "source": source}


def _make_adds(op: dict, message: str, llm_fn, book_state, retries: int) -> dict:
    """N장 추가 → adds:[{cardKey, fields}]."""
    import json as _json
    warnings: list[str] = []
    n = int(op.get("n") or 1)
    catalog = _json.dumps(cc.catalog_for_prompt(), ensure_ascii=False)
    sys = _ADD_SYS.replace("{catalog}", catalog)
    cur = [{"cardKey": p.get("cardKey"), "title": p.get("title")} for p in _pages(book_state)]
    user = (f"요청: {message}\n현재 이북(참고): {_json.dumps(cur, ensure_ascii=False)}\n"
            f"이어질 새 페이지 정확히 {n}장을 설계해 JSON 하나로만 출력.")
    obj = _run_llm([{"role": "system", "content": sys}, {"role": "user", "content": user}],
                   llm_fn, retries)

    adds: list[dict] = []
    source = "llm"
    ground = _numbers(message)
    if obj is not None and isinstance(obj.get("pages"), list):
        for rp in obj["pages"]:
            cp = planner._coerce_page(rp, warnings, ground)  # 카탈로그 검증 재사용
            if cp:
                adds.append(cp)
    adds = adds[:n]
    if not adds:  # 폴백: 빈 note 골격
        source = "fallback"
        warnings.append("새 장 설계를 만들지 못해 빈 페이지로 대체했어요." if llm_fn
                        else "LLM이 연결되지 않아 빈 페이지로 추가했어요(환경설정에서 LLM 등록).")
        adds = [{"cardKey": "note", "fields": {"title": "새 페이지"}} for _ in range(n)]
    else:
        # G6 자기검증 — 새로 지은 장에 과장 표현·빈내용이 있는지.
        found: list[dict] = []
        for a in adds:
            found += sc.scan_fields(a["cardKey"], a.get("fields"))
        warnings.extend(sc.messages(found, limit=3))
    summary = f"{len(adds)}장을 이북 끝에 추가했어요."
    return {"ok": True, "op": "add", "edits": [], "adds": adds, "warnings": warnings,
            "summary": summary, "source": source}


def make_edits(op: dict, message: str, llm_fn: Optional[LlmFn],
               book_state: Optional[dict] = None, retries: int = 2) -> dict:
    """편집 op 서술자 → 검증된 편집 계획(edits/adds). detect_edit 이 준 op 를 받는다."""
    if op.get("op") == "add":
        return _make_adds(op, message, llm_fn, book_state, retries)
    return _make_field_edits(op, message, llm_fn, book_state, retries)
