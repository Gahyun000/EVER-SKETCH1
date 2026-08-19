"""표준 템플릿 정본 v1.0 — Page JSON 생성기.

사양: start_docs/화면설계/표준템플릿_정본_사양_v1.0.md

템플릿을 파일에 통째로 박아두지 않고 **함수로 만드는 이유**가 있다.
연도 헤더(2026 / 2027)와 Today 마커 열은 회차(`Cycles.period_ym`)에서 계산해야 한다.
정적 JSON 이면 회차마다 사람이 고쳐야 하고, 그 순간 "정본"이 여러 개가 된다.

산출물은 프런트 `Page` 타입 그대로다(`src/state/store.ts`).
슬롯 요소는 `slot` 으로 식별하고 `locked: true` 로 위치를 고정한다.
"""
from __future__ import annotations

from typing import Optional

TEMPLATE_VERSION = "v1.0"
TEMPLATE_NAME = "월간 임원보고 정본"

# 진행 셀 색 (사양 §3.3) — L2 는 이 넷 중에서만 고른다.
CBG = {
    "done": "#2462EB",   # 완료 구간
    "plan": "#EAF1FE",   # 계획 구간
    "risk": "#D98A2A",   # 지연·리스크
    "hold": "#EEF0F4",   # 보류
}

# 로드맵 표 열 구성 (사양 §3.1) — 총 20열
COL_LABEL = 0            # 구분
COL_MONTH_FIRST = 1      # 1월
COL_MONTH_LAST = 12      # 12월
COL_EXT_FIRST = 13       # 익년 1Q
COL_EXT_LAST = 16        # 익년 4Q
COL_PLAN_MM = 17
COL_ACTUAL_MM = 18
COL_NOTE = 19
ROADMAP_COLS = 20
ROADMAP_HEADER_ROWS = 2
DEFAULT_DATA_ROWS = 6    # 잠정값 — W5 리허설에서 실측 후 확정 (사양 §7.2)

# 목록 표 (사양 §4)
LIST_COLS = 3
LIST_DEFAULT_ROWS = 5    # 헤더 1 + 데이터 4

STATUS_CHOICES = ("완료", "진행", "지연", "보류")
SEVERITY_CHOICES = ("높음", "중간", "낮음")


class TemplateError(ValueError):
    pass


def parse_period(period_ym: str) -> tuple[int, int]:
    """'2026-10' → (2026, 10). 형식이 어긋나면 즉시 실패한다.

    조용히 기본값으로 넘어가면 전 임원에게 엉뚱한 연도의 표가 배부된다.
    """
    try:
        y, m = period_ym.split("-")
        year, month = int(y), int(m)
    except Exception:
        raise TemplateError("회차 기간은 'YYYY-MM' 형식이어야 합니다: %r" % (period_ym,))
    if not (2000 <= year <= 2100) or not (1 <= month <= 12):
        raise TemplateError("회차 기간 값이 범위를 벗어났습니다: %r" % (period_ym,))
    return year, month


def _blank_grid(rows: int, cols: int) -> list[list[str]]:
    return [["" for _ in range(cols)] for _ in range(rows)]


def build_roadmap_el(el_id: int, period_ym: str, data_rows: int = DEFAULT_DATA_ROWS) -> dict:
    """① 로드맵 / 마일스톤 표."""
    year, month = parse_period(period_ym)
    rows = ROADMAP_HEADER_ROWS + max(1, data_rows)
    cells = _blank_grid(rows, ROADMAP_COLS)

    # 헤더 0행 — 연도는 회차에서 계산한다. 사용자가 입력하지 않는다.
    cells[0][COL_LABEL] = "구분"
    cells[0][COL_MONTH_FIRST] = str(year)
    cells[0][COL_EXT_FIRST] = str(year + 1)
    cells[0][COL_PLAN_MM] = "계획 M/M"
    cells[0][COL_ACTUAL_MM] = "투입 M/M"
    cells[0][COL_NOTE] = "비고"

    # 헤더 1행 — 월/분기
    for i in range(12):
        cells[1][COL_MONTH_FIRST + i] = str(i + 1)
    for i in range(4):
        cells[1][COL_EXT_FIRST + i] = "%dQ" % (i + 1)

    merges = [
        {"r": 0, "c": COL_LABEL, "rs": 2, "cs": 1},
        {"r": 0, "c": COL_MONTH_FIRST, "rs": 1, "cs": 12},
        {"r": 0, "c": COL_EXT_FIRST, "rs": 1, "cs": 4},
        {"r": 0, "c": COL_PLAN_MM, "rs": 2, "cs": 1},
        {"r": 0, "c": COL_ACTUAL_MM, "rs": 2, "cs": 1},
        {"r": 0, "c": COL_NOTE, "rs": 2, "cs": 1},
    ]

    calign: dict[str, str] = {}
    for r in range(rows):
        for c in range(ROADMAP_COLS):
            if c == COL_LABEL or c == COL_NOTE:
                calign["%d_%d" % (r, c)] = "left"
            else:
                calign["%d_%d" % (r, c)] = "center"

    return {
        "id": el_id, "type": "table", "slot": "SLOT-A",
        "x": 24, "y": 96, "w": 1180, "h": 26 * rows,
        "text": "", "color": "transparent", "fs": 11.5,
        "rows": rows, "cols": ROADMAP_COLS, "cells": cells,
        "merges": merges, "calign": calign, "cbg": {},
        "headRow": True,
        # Today 마커 — 회차 기준월의 열 index. 사용자가 옮기지 않는다.
        "today": COL_MONTH_FIRST + (month - 1),
        "locked": True,
    }


def build_list_el(el_id: int, slot: str, title_col: str, third_col: str,
                  y: int, x: int, w: int, rows: int = LIST_DEFAULT_ROWS) -> dict:
    """② 진행 현황 / ③ 향후 계획 / ④ 이슈 리스트 — 구조가 같은 3열 표."""
    cells = _blank_grid(rows, LIST_COLS)
    cells[0] = ["#", title_col, third_col]
    for i in range(1, rows):
        cells[i][0] = str(i)      # 자동 채번 — L2 가 직접 입력하지 않는다
    calign = {"%d_0" % r: "center" for r in range(rows)}
    calign.update({"%d_2" % r: "center" for r in range(rows)})
    return {
        "id": el_id, "type": "table", "slot": slot,
        "x": x, "y": y, "w": w, "h": 24 * rows,
        "text": "", "color": "transparent", "fs": 11.5,
        "rows": rows, "cols": LIST_COLS, "cells": cells,
        "merges": [], "calign": calign, "cbg": {},
        "headRow": True, "locked": True,
    }


def _text_el(el_id: int, slot: str, text: str, x: int, y: int, w: int, h: int,
             fs: int, bold: bool = False, align: str = "left",
             tcolor: str = "#0F1B3D") -> dict:
    return {
        "id": el_id, "type": "text", "slot": slot,
        "x": x, "y": y, "w": w, "h": h,
        "text": text, "color": "transparent", "fs": fs,
        "bold": bold, "align": align, "tcolor": tcolor, "locked": True,
    }


def build_template_page(period_ym: str, owner_name: str = "", dept: str = "",
                        due_label: str = "", page_id: int = 1,
                        data_rows: int = DEFAULT_DATA_ROWS) -> dict:
    """임원 1인분 1장. `Page` 타입 그대로 돌려준다."""
    year, month = parse_period(period_ym)
    eid = 100001

    def nid() -> int:
        nonlocal eid
        eid += 1
        return eid

    who = " · ".join([x for x in (owner_name, dept) if x])
    els: list[dict] = [
        _text_el(nid(), "head", "%d년 %d월 임원회의 — 진행보고" % (year, month),
                 24, 28, 760, 34, 19, bold=True),
        _text_el(nid(), "head",
                 ("작성 %s" % who) if who else "작성자",
                 800, 30, 404, 18, 12, align="right", tcolor="#5b6270"),
        _text_el(nid(), "head",
                 "회차 %s%s" % (period_ym, ("  ·  제출기한 %s" % due_label) if due_label else ""),
                 800, 50, 404, 18, 12, align="right", tcolor="#98a1b2"),

        _text_el(nid(), "SLOT-A", "① 로드맵 / 마일스톤", 24, 74, 400, 20, 13, bold=True),
        build_roadmap_el(nid(), period_ym, data_rows),
    ]

    # 3단 하단 블록
    list_y = 96 + 26 * (ROADMAP_HEADER_ROWS + max(1, data_rows)) + 34
    col_w = 380
    gap = 12
    for i, (slot, head, title_col, third_col) in enumerate([
        ("SLOT-B", "② 진행 현황  (당월)", "사업 / 과제", "상태"),
        ("SLOT-C", "③ 향후 계획  (익월)", "계획 항목", "목표일"),
        ("SLOT-D", "④ 이슈 리스트  (미해결)", "이슈 · 리스크 / 필요 지원", "심각도"),
    ]):
        x = 24 + i * (col_w + gap)
        els.append(_text_el(nid(), slot, head, x, list_y - 22, col_w, 18, 12.5, bold=True))
        els.append(build_list_el(nid(), slot, title_col, third_col, list_y, x, col_w))

    els.append(_text_el(nid(), "foot",
                        "EVER-SKETCH · %s 임원회의%s" % (period_ym, ("  ·  " + dept) if dept else ""),
                        24, list_y + 24 * LIST_DEFAULT_ROWS + 18, 700, 16, 10.5,
                        tcolor="#98a1b2"))

    return {
        "id": page_id,
        "cardKey": "slide",
        "fields": {},
        "free": True,
        "els": els,
        "conns": [],
        "strokes": [],
        "blocks": [],
        "bg": "",
        "role": "content",
    }


def build_template_state(period_ym: str, owner_name: str = "", dept: str = "",
                         due_label: str = "", data_rows: int = DEFAULT_DATA_ROWS) -> dict:
    """프로젝트 `state` 로 저장할 전체 스냅샷 (1인 1장 원칙 — 페이지 1개)."""
    year, month = parse_period(period_ym)
    page = build_template_page(period_ym, owner_name, dept, due_label, data_rows=data_rows)
    title = "%d년 %d월 임원회의" % (year, month)
    if owner_name:
        title += " — %s" % owner_name
    return {
        "title": title,
        "orientation": "landscape",
        "theme": "light",
        "font": "auto",
        "size": "m",
        "pages": [page],
        "selectedPageId": page["id"],
    }


# ── 슬롯별 편집 정책 (사양 §5) ──────────────────────────
# 열(col) 추가·삭제가 **어느 슬롯에도 없다.** 임원마다 열 구성이 달라지면
# 회차 취합에서 표를 자동 병합할 수 없기 때문이다(설계사상 ④).
SLOT_POLICY: dict[str, dict] = {
    "head": {"edit": []},
    "foot": {"edit": []},
    "SLOT-A": {
        "edit": ["cell", "merge", "row", "align", "cbg", "format"],
        "cbgPalette": list(CBG.values()),
        "lockedRows": ROADMAP_HEADER_ROWS,
    },
    "SLOT-B": {"edit": ["cell", "row", "format"], "lockedRows": 1,
               "choices": {"2": list(STATUS_CHOICES)}},
    "SLOT-C": {"edit": ["cell", "row", "format"], "lockedRows": 1},
    "SLOT-D": {"edit": ["cell", "row", "format"], "lockedRows": 1,
               "choices": {"2": list(SEVERITY_CHOICES)}},
}


def slot_allows(slot: Optional[str], op: str) -> bool:
    """L2 가 이 슬롯에서 이 편집을 할 수 있는가. 모르는 슬롯은 거부(기본 거부)."""
    if not slot:
        return False
    policy = SLOT_POLICY.get(slot)
    if not policy:
        return False
    return op in policy.get("edit", [])
