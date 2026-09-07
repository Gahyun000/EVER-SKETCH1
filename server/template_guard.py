"""표준 양식이 **표준 양식인 채로 남아 있는가**를 저장할 때 확인한다.

── 왜 이 파일이 생겼는가 ────────────────────────────────
사양서와 AGENTS.md 에는 표준 양식의 제약이 여럿 적혀 있었지만, **저장 경로는
보내온 state 를 그대로 받아 적었다.** `slot_allows()` 는 테스트에서만 불렸다.
「문서에는 잠겨 있다고 적혀 있는데 실제로는 안 잠긴」 상태였고, 그런 잠금은
없느니만 못하다 — 사람이 지켜지고 있다고 믿기 때문이다.

── 무엇을 지키는가: 쪽수가 아니라 **세트** ────────────────
예전 계약은 「1인 1장」이었다. 그런데 그게 지키려던 것은 쪽수가 아니라
**사람마다 구조가 같다**는 것이었다(사양 v2.0 「취합 단위 = 사람」).
취합은 SLOT-A/B/C 를 슬롯 이름으로 찾지, 몇 쪽인지로 찾지 않는다.
그래서 계약을 「1인 1세트」로 다시 적는다.

    지킨다   SLOT-A · SLOT-B · SLOT-C 가 각각 하나씩 있다
             각 표의 **열 수**가 정본과 같다
    안 지킨다 쪽수. 몇 장이든 좋다. 내용이 많은 임원은 늘려 쓴다.

**조각을 미리 허용해 둔다.** 나중에 표가 종이 끝에서 다음 장으로 이어지게 되면
한 표가 여러 조각으로 나뉜다. 그때 「SLOT-A 는 정확히 하나」라고 못 박아 두면
그 규칙을 어겨야 한다. 그래서 처음부터 **조각들을 하나로 센다** —
`contFrom` 이 있는 조각은 이어진 것으로 보고 세지 않는다.

── 왜 거부가 맞는가 ───────────────────────────────────
조용히 고쳐 주는 길도 있지만, 그러면 사용자가 지운 표가 말없이 되살아난다.
무슨 일이 벌어졌는지 모르는 채로 자료가 달라지는 것보다, 왜 저장이 안 되는지
알려 주고 되돌릴 기회를 주는 편이 낫다.
"""
from __future__ import annotations

from typing import Optional

from server import template_seed as ts

# 슬롯별로 있어야 하는 표의 열 수. 열 구성이 임원마다 달라지면 취합에서
# 표를 자동으로 잇지 못한다(설계사상 ④) — 이 저장소에서 가장 오래된 제약이다.
REQUIRED_TABLES: dict[str, int] = {
    "SLOT-A": ts.ROADMAP_COLS,
    "SLOT-B": ts.STATUS_COLS,
    "SLOT-C": ts.ISSUE_COLS,
}

# 종이 밖으로 나가면 안 되는 슬롯. **이름표 글상자도 포함한다** —
# 세는 것(표)과 자리를 보는 것(표 + 이름표)은 대상이 다르다.
_BOUNDED_SLOTS = frozenset(list(REQUIRED_TABLES) + ["head", "foot"])

# 이름표(글상자)는 세지 않는다. SLOT-A 라는 slot 을 표와 제목 글상자가 함께 쓰기
# 때문이다 — 둘을 같이 세면 「SLOT-A 가 둘」이 되어 정본조차 거부당한다.


def _tables_by_slot(state: dict) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for page in (state or {}).get("pages") or []:
        for el in (page or {}).get("els") or []:
            if not isinstance(el, dict) or el.get("type") != "table":
                continue
            slot = el.get("slot")
            if slot in REQUIRED_TABLES:
                out.setdefault(slot, []).append(el)
    return out


def _heads(els: list[dict]) -> list[dict]:
    """이어진 조각을 뺀 **머리 조각**들. 지금은 조각이 없으니 전부 머리다."""
    return [e for e in els if not e.get("contFrom")]


def check_state(state: dict) -> Optional[str]:
    """어긋난 이유 한 줄, 문제가 없으면 None.

    **사람에게 그대로 보여 줄 문장으로 쓴다.** 「검증 실패」 같은 말은
    무엇을 어떻게 되돌려야 하는지 알려 주지 않는다.
    """
    found = _tables_by_slot(state)
    for slot, cols in REQUIRED_TABLES.items():
        heads = _heads(found.get(slot, []))
        if not heads:
            return ("표준 양식의 '%s' 표가 없어졌어요. 지우기 전으로 되돌리거나 "
                    "실행 취소(Ctrl+Z) 해 주세요." % _label(slot))
        if len(heads) > 1:
            return ("표준 양식의 '%s' 표가 %d개예요 — 한 사람 자료에 하나만 있어야 "
                    "합니다(같은 표가 여러 장에 이어진 것은 괜찮아요). "
                    "복사된 표를 지워 주세요." % (_label(slot), len(heads)))
        got = heads[0].get("cols")
        if got != cols:
            return ("표준 양식의 '%s' 표는 %d칸이어야 하는데 %s칸이에요. "
                    "열 구성이 사람마다 다르면 취합할 때 표를 이을 수 없어요."
                    % (_label(slot), cols, got))
    return _outside_page(state)


def _outside_page(state: dict) -> Optional[str]:
    """슬롯 요소가 **종이 안에** 있는가.

    자리 잠금을 풀면서(2026-09-07) 대신 생긴 규칙이다. 예전에는 좌표를 아예 못
    건드리게 해서 이 문제가 없었다. 이제 사람이 끌 수 있으므로, 끌다가 종이 밖으로
    나가면 그 표는 **아무도 못 본다** — 그리고 작성자는 결재에 올린 뒤에야 안다.
    화면도 끌 때 막지만(FreeLayer), 화면만 믿지 않는다.

    슬롯이 없는 요소(사람이 따로 붙인 메모 같은 것)는 보지 않는다. 그건 양식이
    아니라 그 사람의 물건이고, 살짝 걸쳐 두는 것도 그 사람 선택이다.
    """
    for page in (state or {}).get("pages") or []:
        for el in (page or {}).get("els") or []:
            if not isinstance(el, dict) or el.get("slot") not in _BOUNDED_SLOTS:
                continue
            x, y = el.get("x") or 0, el.get("y") or 0
            w, h = el.get("w") or 0, el.get("h") or 0
            if x < 0 or y < 0 or x + w > ts.PAGE_W or y + h > ts.PAGE_H:
                return ("표준 양식의 '%s' 이(가) 종이 밖으로 나갔어요 "
                        "(가로 %d~%d · 세로 %d~%d, 종이는 %d×%d). "
                        "종이 안으로 옮겨 주세요 — 밖으로 나간 부분은 아무에게도 안 보입니다."
                        % (_label(el.get("slot")), x, x + w, y, y + h,
                           ts.PAGE_W, ts.PAGE_H))
    return None


def _label(slot: Optional[str]) -> str:
    return {"SLOT-A": "① 로드맵 / 마일스톤",
            "SLOT-B": "② 진행 현황 · 향후 계획",
            "SLOT-C": "③ 이슈 · 필요 지원",
            "head": "머리글",
            "foot": "꼬리말"}.get(slot or "", slot or "요소")
