"""의도 + 슬롯 → 이북 UI 액션 매핑(HELIX action_mapper 이북판).

프론트 applyUiAction 이 소비하는 EbookAction{type,payload} 과, 사람이 읽는 응답 문장을 만든다.
"""
from __future__ import annotations

from typing import Any

from server.intent.schemas import EbookAction
from server.intent.catalog import CARD_LABEL

_SHAPE_LABEL = {"box": "사각형", "round": "둥근 사각형", "ellipse": "원", "diamond": "마름모",
                "triangle": "삼각형", "icon": "아이콘", "text": "텍스트 상자", "table": "표",
                "image": "이미지", "wordart": "글맵시", "connect": "화살표"}

def _josa_eul(word: str) -> str:
    """목적격 조사: 받침 있으면 '을', 없으면 '를'. 한글 음절만 판정, 그 외엔 '을'."""
    if not word:
        return "을"
    code = ord(word[-1])
    if 0xAC00 <= code <= 0xD7A3:
        return "를" if (code - 0xAC00) % 28 == 0 else "을"
    return "을"


def build(intent: str, slots: dict[str, Any]) -> tuple[EbookAction, str, bool]:
    """(action, reply, needs_confirm)"""
    if intent == "add_slide":
        return EbookAction("add_slide"), "새 슬라이드를 추가했어요. 캔버스에서 바로 편집하세요.", False
    if intent == "duplicate_slide":
        return EbookAction("duplicate_slide"), "현재 슬라이드를 복제했어요.", False
    if intent == "delete_slide":
        return EbookAction("delete_slide"), "현재 슬라이드를 삭제했어요.", False

    if intent == "delete_element":
        tool = slots.get("shape")
        count = slots.get("count")
        payload: dict[str, Any] = {}
        if slots.get("delete_all"): payload["all"] = True
        if tool: payload["tool"] = tool
        if count: payload["count"] = count
        if payload.get("all"):
            reply = "캔버스의 도형을 모두 지웠어요."
        elif tool:
            label = _SHAPE_LABEL.get(tool, "도형")
            reply = f"‘{label}’ {count}개를 지웠어요." if count else f"‘{label}’ 도형을 지웠어요."
        else:
            reply = "선택한(또는 방금 놓은) 도형을 지웠어요."
        return EbookAction("delete_elements", payload), reply, False
    if intent == "insert_text":
        return EbookAction("insert_element", {"tool": "text"}), "텍스트 도구를 켰어요. 캔버스를 클릭해 글상자를 놓으세요.", False
    if intent == "insert_card":
        ck = slots.get("card")
        label = CARD_LABEL.get(ck, "카드")
        return EbookAction("add_card", {"cardKey": ck, "label": label}), f"‘{label}’ 카드를 추가했어요. 오른쪽에서 내용을 채워보세요.", False
    if intent == "insert_shape":
        tool = slots.get("shape", "box")
        label = _SHAPE_LABEL.get(tool, "도형")
        raw = slots.get("count")
        n = max(1, min(20, int(raw))) if raw else 1
        # 화살표·이미지는 상호작용이 필요해 별도 분기가 처리한다. 도형은 캔버스에 바로 배치.
        obj = f"‘{label}’ {n}개를" if n > 1 else f"‘{label}’{_josa_eul(label)}"
        return (EbookAction("insert_element", {"tool": tool, "count": n}),
                f"{obj} 캔버스에 놓았어요. 위치·크기는 드래그로 바꿀 수 있어요.", False)
    if intent == "insert_arrow":
        return EbookAction("insert_element", {"tool": "connect"}), "화살표 연결 도구를 켰어요. 도형 두 개를 차례로 클릭하세요.", False
    if intent == "insert_table":
        return EbookAction("insert_element", {"tool": "table"}), "표 도구를 켰어요. 캔버스를 클릭해 표를 놓으세요.", False
    if intent == "insert_image":
        return EbookAction("insert_element", {"tool": "image"}), "이미지 도구를 켰어요. 자리를 클릭해 놓으세요.", False
    if intent == "insert_wordart":
        return EbookAction("insert_element", {"tool": "wordart"}), "글맵시 도구를 켰어요. 캔버스를 클릭해 꾸민 글자를 놓으세요.", False

    if intent == "set_theme":
        theme = slots.get("theme", "dark")
        return EbookAction("set_theme", {"theme": theme}), f"이 슬라이드 배경을 {'다크' if theme == 'dark' else '라이트'}로 바꿨어요.", False
    if intent == "set_orientation":
        o = slots.get("orientation", "portrait")
        return EbookAction("set_orientation", {"orientation": o}), f"{'가로 덱' if o == 'landscape' else '세로 이북'}으로 바꿨어요.", False

    if intent == "import_html":
        return EbookAction("import_html"), "HTML 가져오기 창을 열게요. 파일을 고르면 미리보기 후 캔버스로 들어옵니다.", False
    if intent == "make_ebook":
        return EbookAction("make_ebook"), "지금 페이지로 이북(PDF)을 만들까요? 아래 ‘확인’을 누르면 진행할게요.", True

    if intent == "z_order":
        d = slots.get("direction", "front")
        return EbookAction("z_order", {"dir": d}), f"선택한 요소를 {'맨 앞' if d == 'front' else '맨 뒤'}으로 보냈어요.", False
    if intent == "present":
        return EbookAction("present"), "슬라이드쇼를 시작할게요. → 다음, ← 이전, Esc 종료.", False
    if intent == "undo":
        return EbookAction("undo"), "방금 작업을 되돌렸어요.", False
    if intent == "redo":
        return EbookAction("redo"), "되돌린 작업을 다시 실행했어요.", False

    # help / smalltalk / 그 외 → 텍스트 응답(액션 없음)
    return EbookAction("none"), "", False
