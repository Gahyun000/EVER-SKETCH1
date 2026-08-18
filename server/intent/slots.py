"""결정론 슬롯 추출(이북판) — HELIX slot_extractor 의 '규칙 우선' 원칙 계승.

편집 명령에서 도형종류·테마·방향·정렬방향을 뽑는다. LLM 없이 동작.
"""
from __future__ import annotations

import re
from typing import Any

# 도형 키워드 → 캔버스 도구
_SHAPE = [
    (r"둥근\s*(사각|네모)", "round"),
    (r"(사각형|네모|박스)", "box"),
    (r"(동그라미|타원|원)", "ellipse"),
    (r"마름모", "diamond"),
    (r"삼각형", "triangle"),
    (r"(별|아이콘)", "icon"),
]


def extract(question: str) -> dict[str, Any]:
    q = question or ""
    slots: dict[str, Any] = {}

    for pat, tool in _SHAPE:
        if re.search(pat, q):
            slots["shape"] = tool
            break

    # 개수: '3개' 또는 한글 수사('세 개'). 도형 배치 개수로 쓴다.
    _KNUM = {"한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4,
             "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10}
    mnum = re.search(r"(\d+)\s*개", q)
    if mnum:
        slots["count"] = int(mnum.group(1))
    else:
        mk = re.search(r"(한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*개", q)
        if mk:
            slots["count"] = _KNUM[mk.group(1)]

    if re.search(r"(모두|전부|전체|싹|모든)", q) or re.search(r"다\s*(지워|없애|삭제|치워|제거)", q):
        slots["delete_all"] = True

    if re.search(r"(다크|어둡|어두운)", q):
        slots["theme"] = "dark"
    elif re.search(r"(라이트|밝게|밝은)", q):
        slots["theme"] = "light"

    if "가로" in q:
        slots["orientation"] = "landscape"
    elif "세로" in q:
        slots["orientation"] = "portrait"

    if re.search(r"(맨\s*앞|앞으로|위로\s*올려|위로)", q):
        slots["direction"] = "front"
    elif re.search(r"(맨\s*뒤|뒤로|아래로\s*내려|아래로)", q):
        slots["direction"] = "back"

    return slots
