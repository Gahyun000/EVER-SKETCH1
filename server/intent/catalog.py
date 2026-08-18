"""Action Catalog — EVER-SKETCH가 실행할 수 있는 모든 동작의 단일 원천(source of truth).

세 곳에서 공유한다:
  1) 실행기(action_mapper) — 라벨 등,
  2) LLM 프롬프트(build_prompt) — "네가 할 수 있는 것",
  3) 검증기(validate) — LLM 출력이 실제 동작·유효 파라미터인지.
카탈로그에 도구를 추가하면 규칙·LLM·검증이 한 번에 그 도구를 알게 된다.
"""
from __future__ import annotations

from typing import Any

# 도형 tool -> (라벨, [동의어])
SHAPES: dict[str, tuple[str, list[str]]] = {
    "box": ("사각형", ["사각형", "네모", "박스", "사각", "직사각형", "네모칸"]),
    "round": ("둥근 사각형", ["둥근 사각형", "라운드", "둥근네모", "둥근 박스"]),
    "ellipse": ("원", ["원", "동그라미", "타원", "원형", "동글"]),
    "diamond": ("마름모", ["마름모", "다이아", "다이아몬드", "마름모꼴"]),
    "triangle": ("삼각형", ["삼각형", "세모", "삼각"]),
    "icon": ("아이콘", ["아이콘", "별", "스타", "심볼"]),
}
# 카드 cardKey -> (라벨, [동의어])
CARDS: dict[str, tuple[str, list[str]]] = {
    "cover": ("표지", ["표지", "커버", "타이틀"]),
    "toc": ("목차", ["목차", "차례"]),
    "summary": ("한 줄 요약", ["요약", "한줄요약", "서머리"]),
    "kpi": ("성과·KPI", ["성과", "kpi", "지표", "실적"]),
    "roadmap": ("로드맵", ["로드맵", "일정", "타임라인"]),
    "market": ("시장·경쟁", ["시장", "경쟁", "시장분석", "경쟁사"]),
    "flow": ("프로세스", ["프로세스", "플로우", "흐름", "공정"]),
    "mindmap": ("마인드맵", ["마인드맵", "마인드", "생각지도"]),
    "closing": ("마무리", ["마무리", "엔딩", "클로징"]),
    "note": ("빈 페이지", ["빈 페이지", "빈페이지", "블록", "토글"]),
    "sticky": ("스티키 메모", ["스티키", "포스트잇", "메모"]),
    "board": ("자유 메모 보드", ["보드", "메모 보드", "화이트보드"]),
}

SHAPE_LABEL = {k: v[0] for k, v in SHAPES.items()}
CARD_LABEL = {k: v[0] for k, v in CARDS.items()}

# 실행 가능한 동작(intent) + slot 설명. content 생성(이북 초안/편집)은 별도 레인이 담당한다.
INTENTS: list[dict[str, Any]] = [
    {"id": "insert_shape", "desc": "캔버스에 도형을 놓는다", "slots": {"shape": "SHAPE(필수)", "count": "1~20 정수(기본1)"}},
    {"id": "insert_text", "desc": "텍스트 상자", "slots": {}},
    {"id": "insert_arrow", "desc": "화살표/연결선", "slots": {}},
    {"id": "insert_table", "desc": "표", "slots": {}},
    {"id": "insert_image", "desc": "이미지 자리", "slots": {}},
    {"id": "insert_wordart", "desc": "글맵시(꾸민 글자)", "slots": {}},
    {"id": "insert_card", "desc": "내용 카드 추가(표지/목차/성과 등)", "slots": {"card": "CARD(필수)"}},
    {"id": "delete_element", "desc": "도형 삭제", "slots": {"shape": "SHAPE(선택)", "count": "정수(선택)", "delete_all": "true면 전체"}},
    {"id": "add_slide", "desc": "새 슬라이드 추가", "slots": {}},
    {"id": "duplicate_slide", "desc": "현재 슬라이드 복제", "slots": {}},
    {"id": "delete_slide", "desc": "현재 슬라이드 삭제", "slots": {}},
    {"id": "set_theme", "desc": "슬라이드 배경", "slots": {"theme": "dark|light"}},
    {"id": "set_orientation", "desc": "문서 방향", "slots": {"orientation": "portrait|landscape"}},
    {"id": "z_order", "desc": "선택 요소 앞/뒤로", "slots": {"direction": "front|back"}},
    {"id": "present", "desc": "발표(슬라이드쇼) 시작", "slots": {}},
    {"id": "make_ebook", "desc": "이북(PDF) 만들기", "slots": {}},
    {"id": "undo", "desc": "실행취소", "slots": {}},
    {"id": "redo", "desc": "다시실행", "slots": {}},
]
EXECUTABLE = {it["id"] for it in INTENTS}

# 동의어 → 정규 키 역인덱스
_SHAPE_LOOKUP: dict[str, str] = {}
for _t, (_l, _syns) in SHAPES.items():
    _SHAPE_LOOKUP[_t] = _t
    for _s in _syns:
        _SHAPE_LOOKUP[_s.replace(" ", "")] = _t
_CARD_LOOKUP: dict[str, str] = {}
for _c, (_l, _syns) in CARDS.items():
    _CARD_LOOKUP[_c] = _c
    for _s in _syns:
        _CARD_LOOKUP[_s.replace(" ", "")] = _c


def canon_shape(x: Any) -> str | None:
    if not x:
        return None
    return _SHAPE_LOOKUP.get(str(x).strip().replace(" ", "").lower()) or _SHAPE_LOOKUP.get(str(x).strip().replace(" ", ""))


def canon_card(x: Any) -> str | None:
    if not x:
        return None
    return _CARD_LOOKUP.get(str(x).strip().replace(" ", "").lower()) or _CARD_LOOKUP.get(str(x).strip().replace(" ", ""))


def _clamp_count(x: Any) -> int:
    try:
        n = int(x)
    except (TypeError, ValueError):
        return 1
    return max(1, min(20, n))


def validate(intent: Any, slots: Any) -> tuple[bool, dict]:
    """(ok, cleaned_slots). intent가 실행 가능하고 slot이 유효할 때만 ok=True.
    검증 실패면 실행하지 않고 되묻게 한다(환각 차단)."""
    if intent not in EXECUTABLE:
        return False, {}
    slots = slots if isinstance(slots, dict) else {}
    out: dict[str, Any] = {}
    if intent == "insert_shape":
        sh = canon_shape(slots.get("shape") or slots.get("tool"))
        if not sh:
            return False, {}
        out["shape"] = sh
        out["count"] = _clamp_count(slots.get("count", 1))
    elif intent == "insert_card":
        cd = canon_card(slots.get("card") or slots.get("shape"))
        if not cd:
            return False, {}
        out["card"] = cd
    elif intent == "delete_element":
        sh = canon_shape(slots.get("shape") or slots.get("tool"))
        if sh:
            out["shape"] = sh
        if slots.get("count"):
            out["count"] = _clamp_count(slots.get("count"))
        if slots.get("delete_all") in (True, "true", "True", "전체", "전부", "모두", 1):
            out["delete_all"] = True
    elif intent == "set_theme":
        t = str(slots.get("theme", "")).lower()
        if t not in ("dark", "light"):
            return False, {}
        out["theme"] = t
    elif intent == "set_orientation":
        o = str(slots.get("orientation", "")).lower()
        if o not in ("portrait", "landscape"):
            return False, {}
        out["orientation"] = o
    elif intent == "z_order":
        d = str(slots.get("direction", "")).lower()
        if d not in ("front", "back"):
            return False, {}
        out["direction"] = d
    # 그 외(add_slide/present/undo 등)는 slot 불필요
    return True, out


def build_prompt() -> str:
    lines = [
        "당신은 EVER-SKETCH(경영진용 스케치 도구)의 명령 해석기입니다.",
        "사용자 문장을 아래 '가능한 동작' 중 정확히 하나로 바꿔 JSON으로만 답하세요.",
        '형식: {"intent":"<id>","slots":{...}}  / 해당 없으면 {"intent":"none"}',
        "설명·문장·코드펜스 금지. JSON 한 줄만 출력.",
        "",
        "가능한 동작(intent : 설명 : slots):",
    ]
    for it in INTENTS:
        sl = ", ".join(f"{k}={v}" for k, v in it["slots"].items()) or "없음"
        lines.append(f'- {it["id"]} : {it["desc"]} : {sl}')
    lines.append("")
    lines.append("SHAPE 값은 왼쪽 키만 사용(오른쪽은 같은 뜻):")
    for tool, (label, syns) in SHAPES.items():
        lines.append(f"  {tool} = {label}, {', '.join(syns)}")
    lines.append("CARD 값은 왼쪽 키만 사용:")
    for ck, (label, syns) in CARDS.items():
        lines.append(f"  {ck} = {label}, {', '.join(syns)}")
    lines += [
        "",
        "예시:",
        '  "세모 3개 그려줘" -> {"intent":"insert_shape","slots":{"shape":"triangle","count":3}}',
        '  "동그라미 다 지워" -> {"intent":"delete_element","slots":{"shape":"ellipse","delete_all":true}}',
        '  "방금 거 지워" -> {"intent":"delete_element","slots":{}}',
        '  "표지 만들어줘" -> {"intent":"insert_card","slots":{"card":"cover"}}',
        '  "배경 어둡게 해줘" -> {"intent":"set_theme","slots":{"theme":"dark"}}',
        '  "가로로 바꿔" -> {"intent":"set_orientation","slots":{"orientation":"landscape"}}',
        '  "발표 시작" -> {"intent":"present","slots":{}}',
        '  "고마워" -> {"intent":"none"}',
    ]
    return "\n".join(lines)
