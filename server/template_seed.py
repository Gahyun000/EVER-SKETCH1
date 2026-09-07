"""표준 템플릿 정본 v2.0 — Page JSON 생성기.

사양: start_docs/화면설계/표준템플릿_정본_사양_v2.0.md

v1.0 은 내가 상상한 양식이었다. v2.0 은 **실물에서 잰 값**이다.
(USDMPD215 2026년_20260814_유니에버 수행전략회의 — 10.83×7.5in, 로드맵 7행 18열)

v1.0 과 무엇이 다른가
    열 구성   20열(구분1 + 12개월 + 익년4분기 + M/M 2 + 비고) → **18열**
              (사업그룹 + 프로젝트 + 12개월 + 익년1 + 계획M/M + 투입M/M + 비고)
    진행 표시 4색 칠 → **가로 병합 + 단계 이름 + 색**. 셀 하나가 한 달이 아니라
              한 구간이다. 그래서 SLOT-A 는 병합이 필수 기능이다.
    하단 블록 3열 표 3개 → 진행현황/향후계획 **한 표(2열)** + 이슈 1열 표

왜 함수로 만드는가
    연도 헤더(2026 / 2027)와 Today 마커 열은 대상 연월(`period_ym`)에서 계산해야 한다.
    정적 JSON 이면 달마다 사람이 고쳐야 하고, 그 순간 "정본"이 여러 개가 된다.
    (`period_ym` 은 P2 전까지 회차 테이블이 들고 있었다. 지금은 만드는 사람이 직접 고른다.)

산출물은 프런트 `Page` 타입 그대로다(`src/state/store.ts`).
"""
from __future__ import annotations

from typing import Optional

TEMPLATE_VERSION = "v2.0"
TEMPLATE_NAME = "월간 임원보고 정본"

# ── 색 (실물 실측) ─────────────────────────────────────
# 머리글 색. 실물 로드맵의 2행짜리 머리글이 전부 이 색이다.
HEADER_BG = "#FFFFCC"

# 진행 구간 색 5종. **의미를 지어내지 않는다.**
# 실물에서 이 색들이 무엇을 뜻하는지는 셀 안의 글자(단계 이름)에 적혀 있다.
# 색에 '완료/지연' 같은 뜻을 임의로 붙이면, 임원이 쓰던 뜻과 어긋난 채로
# 취합 통계가 나온다 — 틀린 줄도 모르고 쓰이는 종류의 오류다.
STAGE_COLORS = ("#FBE5D6", "#DEEBF7", "#E2F0D9", "#FFFF00", "#92D050")
STAGE_LABELS = ("주황", "파랑", "연두", "노랑", "초록")

# ── 로드맵 표 열 구성 (사양 §3.1) — 총 18열 ──────────────
COL_GROUP = 0             # 사업 그룹 (세로 병합)
COL_PROJECT = 1           # 프로젝트명
COL_MONTH_FIRST = 2       # 1월
COL_MONTH_LAST = 13       # 12월
COL_NEXT_YEAR = 14        # 익년 (한 칸)
COL_PLAN_MM = 15
COL_ACTUAL_MM = 16
COL_NOTE = 17
ROADMAP_COLS = 18
ROADMAP_HEADER_ROWS = 2
DEFAULT_DATA_ROWS = 5     # 실물 슬라이드의 데이터 행 수

# 열 너비 비율 — 실물 실측(1.15in / 1.35in / 0.42in×12 / 0.62in×4)을
# 가장 좁은 칸(월) 기준으로 정규화한 값. 균등 분할이면 사업명이 세 줄로 접힌다.
ROADMAP_COLW = ([2.74, 3.21] + [1.0] * 12 + [1.48] * 4)

# ── 하단 블록 ────────────────────────────────────────
# 진행 현황 / 향후 계획은 **표 하나의 두 열**이다. 실물이 그렇다.
# 두 표로 쪼개면 행 높이가 서로 어긋나 좌우 줄이 안 맞는다.
STATUS_COLS = 2
STATUS_HEADS = ("진행 현황", "향후 계획")
ISSUE_COLS = 1
ISSUE_HEAD = "이슈 리스트  (미해결 · 필요 지원)"
LIST_DEFAULT_ROWS = 5     # 헤더 1 + 데이터 4

# ── 페이지 기하 ────────────────────────────────────────
# **캔버스 좌표계다.** src/cards/sizing.ts 의 DECK_W/DECK_H 와 반드시 같아야 한다.
# 다르면 배부된 양식이 종이 밖으로 나가 화면에 아무것도 안 보인다.
# (test_template_geometry.py 가 두 값의 일치와 요소가 종이 안에 있는지를 검사한다.)
PAGE_W = 1040
PAGE_H = 720
MARGIN = 24
CONTENT_W = PAGE_W - MARGIN * 2      # 992
# 행 높이는 실물 비율에서 역산한다.
#   로드맵 3.1in / 7.5in x 720px = 298px, 7행 -> 약 42px
#   하단 블록 1.9in / 7.5in x 720px = 182px, 5행 -> 약 36px
# 처음엔 30/28 로 잡았다가 종이 아래쪽 200px 가 통째로 비는 걸 미리보기에서 봤다.
# 칸이 낮으면 진행 구간 라벨('설계·구축')이 한 줄에 안 들어가 잘린다.
ROADMAP_ROW_H = 40
LIST_ROW_H = 34
LIST_GAP = 14
ROADMAP_Y = 94          # 로드맵 표 시작 y
BLOCK_GAP = 34          # 로드맵 표 ~ 하단 블록 사이
FOOT_GAP = 18           # 하단 블록 ~ 꼬리말 사이
FOOT_H = 16
BOTTOM_PAD = 16         # 꼬리말 아래 여백

# 하단 좌우 폭 — 실물 비율(6.6in : 3.4in)을 그대로 옮긴다.
STATUS_W = int((CONTENT_W - LIST_GAP) * 6.6 / 10.0)
ISSUE_W = CONTENT_W - LIST_GAP - STATUS_W


def _max_data_rows() -> int:
    """한 장에 들어가는 로드맵 데이터 행의 상한.

    종이 높이에서 아래 블록들이 쓰는 높이를 빼고 남는 만큼이다.
    상한을 넘겨도 조용히 그리면 표 아랫부분이 종이 밖으로 나가 **아무도 못 본다.**
    그래서 넘으면 만들지 않고 실패시킨다.
    """
    used = (ROADMAP_Y + BLOCK_GAP + LIST_ROW_H * LIST_DEFAULT_ROWS
            + FOOT_GAP + FOOT_H + BOTTOM_PAD)
    return max(1, (PAGE_H - used) // ROADMAP_ROW_H - ROADMAP_HEADER_ROWS)


MAX_DATA_ROWS = _max_data_rows()


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
        raise TemplateError("기간은 'YYYY-MM' 형식이어야 합니다: %r" % (period_ym,))
    if not (2000 <= year <= 2100) or not (1 <= month <= 12):
        raise TemplateError("기간 값이 범위를 벗어났습니다: %r" % (period_ym,))
    return year, month


def _blank_grid(rows: int, cols: int) -> list[list[str]]:
    return [["" for _ in range(cols)] for _ in range(rows)]


def build_roadmap_el(el_id: int, period_ym: str, data_rows: int = DEFAULT_DATA_ROWS) -> dict:
    """① 로드맵 / 마일스톤 표 (18열)."""
    year, month = parse_period(period_ym)
    if data_rows > MAX_DATA_ROWS:
        raise TemplateError(
            "로드맵 행이 너무 많습니다 — 한 장에 최대 %d행입니다 (요청 %d행). "
            "행을 줄이거나 장을 나눠 주세요." % (MAX_DATA_ROWS, data_rows))
    rows = ROADMAP_HEADER_ROWS + max(1, data_rows)
    cells = _blank_grid(rows, ROADMAP_COLS)

    # 헤더 0행 — 연도는 회차에서 계산한다. 사용자가 입력하지 않는다.
    cells[0][COL_GROUP] = "Project"
    cells[0][COL_MONTH_FIRST] = "%d년" % year
    cells[0][COL_NEXT_YEAR] = "%d년" % (year + 1)
    cells[0][COL_PLAN_MM] = "계획 M/M"
    cells[0][COL_ACTUAL_MM] = "투입 M/M"
    cells[0][COL_NOTE] = "비고(투입인원)"

    # 헤더 1행 — 월
    for i in range(12):
        cells[1][COL_MONTH_FIRST + i] = str(i + 1)

    merges = [
        {"r": 0, "c": COL_GROUP, "rs": 2, "cs": 2},          # 'Project' 2행 2열
        {"r": 0, "c": COL_MONTH_FIRST, "rs": 1, "cs": 12},   # 당해년도 12개월
        {"r": 0, "c": COL_NEXT_YEAR, "rs": 2, "cs": 1},
        {"r": 0, "c": COL_PLAN_MM, "rs": 2, "cs": 1},
        {"r": 0, "c": COL_ACTUAL_MM, "rs": 2, "cs": 1},
        {"r": 0, "c": COL_NOTE, "rs": 2, "cs": 1},
    ]

    # 머리글 색은 **구조**다(예시 데이터가 아니다). 어차피 잠긴 행이라 지울 일도 없다.
    cbg = {"%d_%d" % (r, c): HEADER_BG
           for r in range(ROADMAP_HEADER_ROWS) for c in range(ROADMAP_COLS)}

    calign: dict[str, str] = {}
    for r in range(rows):
        for c in range(ROADMAP_COLS):
            calign["%d_%d" % (r, c)] = "left" if c in (COL_GROUP, COL_PROJECT, COL_NOTE) else "center"

    return {
        "id": el_id, "type": "table", "slot": "SLOT-A",
        "x": MARGIN, "y": ROADMAP_Y, "w": CONTENT_W, "h": ROADMAP_ROW_H * rows,
        "text": "", "color": "transparent", "fs": 10.5,
        "rows": rows, "cols": ROADMAP_COLS, "cells": cells,
        "merges": merges, "calign": calign, "cbg": cbg,
        "colw": list(ROADMAP_COLW),
        "headRow": True,
        # Today 마커.
        # **기본은 자동이다** — 열 때마다 실제 오늘을 따라간다. 한 달 쓰고 버리는
        # 자료가 아니라서, 만든 달을 박아 두면 두 달 뒤에 연 사람이 지난 달을
        # 오늘로 믿게 된다. 계산은 화면이 한다(`src/template/slots.ts::todayColumn`).
        # 여기 `today` 는 고정 모드로 바꿨을 때의 출발점이고,
        # `todayYear` 는 자동 모드가 "이 해에만 그린다"를 판정하는 근거다.
        "today": COL_MONTH_FIRST + (month - 1),
        "todayMode": "auto",
        "todayYear": year,
        "locked": True,
    }


def _list_el(el_id: int, slot: str, heads: tuple[str, ...], x: int, y: int, w: int,
             rows: int = LIST_DEFAULT_ROWS) -> dict:
    cols = len(heads)
    cells = _blank_grid(rows, cols)
    cells[0] = list(heads)
    cbg = {"0_%d" % c: HEADER_BG for c in range(cols)}
    return {
        "id": el_id, "type": "table", "slot": slot,
        "x": x, "y": y, "w": w, "h": LIST_ROW_H * rows,
        "text": "", "color": "transparent", "fs": 11.5,
        "rows": rows, "cols": cols, "cells": cells,
        "merges": [], "calign": {}, "cbg": cbg,
        "headRow": True, "locked": True,
    }


def build_status_el(el_id: int, x: int, y: int, w: int, rows: int = LIST_DEFAULT_ROWS) -> dict:
    """② 진행 현황 / 향후 계획 — 표 하나의 두 열(실물 구조)."""
    return _list_el(el_id, "SLOT-B", STATUS_HEADS, x, y, w, rows)


def build_issue_el(el_id: int, x: int, y: int, w: int, rows: int = LIST_DEFAULT_ROWS) -> dict:
    """③ 이슈 리스트 — 1열."""
    return _list_el(el_id, "SLOT-C", (ISSUE_HEAD,), x, y, w, rows)


def _text_el(el_id: int, slot: str, text: str, x: int, y: int, w: int, h: int,
             fs: float, bold: bool = False, align: str = "left",
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
                 MARGIN, 24, 620, 32, 19, bold=True),
        _text_el(nid(), "head",
                 ("작성 %s" % who) if who else "작성자",
                 PAGE_W - MARGIN - 348, 26, 348, 18, 12, align="right", tcolor="#5b6270"),
        _text_el(nid(), "head",
                 "기간 %s%s" % (period_ym, ("  ·  제출기한 %s" % due_label) if due_label else ""),
                 PAGE_W - MARGIN - 348, 46, 348, 18, 12, align="right", tcolor="#98a1b2"),

        _text_el(nid(), "SLOT-A", "① 로드맵 / 마일스톤", MARGIN, 72, 400, 18, 13, bold=True),
        build_roadmap_el(nid(), period_ym, data_rows),
    ]

    list_y = ROADMAP_Y + ROADMAP_ROW_H * (ROADMAP_HEADER_ROWS + max(1, data_rows)) + BLOCK_GAP
    issue_x = MARGIN + STATUS_W + LIST_GAP

    els.append(_text_el(nid(), "SLOT-B", "② 진행 현황 · 향후 계획",
                        MARGIN, list_y - 22, STATUS_W, 18, 12.5, bold=True))
    els.append(build_status_el(nid(), MARGIN, list_y, STATUS_W))
    els.append(_text_el(nid(), "SLOT-C", "③ 이슈 · 필요 지원",
                        issue_x, list_y - 22, ISSUE_W, 18, 12.5, bold=True))
    els.append(build_issue_el(nid(), issue_x, list_y, ISSUE_W))

    els.append(_text_el(nid(), "foot",
                        "EVER-SKETCH · %s 임원회의%s" % (period_ym, ("  ·  " + dept) if dept else ""),
                        MARGIN, list_y + LIST_ROW_H * LIST_DEFAULT_ROWS + FOOT_GAP,
                        700, FOOT_H, 10.5, tcolor="#98a1b2"))

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
#
# SLOT-A 는 병합이 **필수**다. 실물에서 진행 구간은 색칠이 아니라
# '가로로 병합한 칸 + 단계 이름' 으로 표시된다. 병합을 막으면 로드맵을 그릴 수 없다.
# `edit` 는 **표를 다루는 동작만** 말한다(칸·병합·행·정렬·색·서식·오늘).
# head/foot 은 표가 아니라 글상자라서 `edit: []` 가 아무것도 막지 못했다 —
# 사양서를 읽으면 「머리글은 다 잠겼다」로 보이는데 실제로는 늘 고칠 수 있었다.
# 그런 항목은 없느니만 못하다. 그래서 글상자의 문구는 `text` 로 따로 적는다.
#
# `text: "open"` — 이름표 문구는 사람이 고친다(①의 결정: 문구는 다 연다).
# 이 값은 지금 어느 코드도 막는 데 쓰지 않는다. **사실을 적어 둔 것**이고,
# 나중에 다시 잠글 일이 생기면 여기 한 곳만 고치면 되게 자리를 만든 것이다.
SLOT_POLICY: dict[str, dict] = {
    "head": {"edit": [], "text": "open"},
    "foot": {"edit": [], "text": "open"},
    "SLOT-A": {
        "edit": ["cell", "merge", "row", "align", "cbg", "format", "today"],
        "cbgPalette": list(STAGE_COLORS),
        "lockedRows": ROADMAP_HEADER_ROWS,
        "text": "open",
    },
    "SLOT-B": {"edit": ["cell", "row", "format"], "lockedRows": 1, "text": "open"},
    "SLOT-C": {"edit": ["cell", "row", "format"], "lockedRows": 1, "text": "open"},
}


def slot_allows(slot: Optional[str], op: str) -> bool:
    """L2 가 이 슬롯에서 이 편집을 할 수 있는가. 모르는 슬롯은 거부(기본 거부)."""
    if not slot:
        return False
    policy = SLOT_POLICY.get(slot)
    if not policy:
        return False
    return op in policy.get("edit", [])
