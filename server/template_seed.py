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
# 다르면 표준 양식으로 만든 자료가 종이 밖으로 나가 화면에 아무것도 안 보인다.
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


# 꼬리말이 쓰는 아래쪽 높이. 두 쪽이 똑같이 쓴다.
FOOT_ZONE = FOOT_GAP + FOOT_H + BOTTOM_PAD          # 50

# 2쪽 본문이 시작하는 y. **1쪽 로드맵과 같은 선**에 둔다 —
# 장을 넘길 때 본문 시작선이 튀면 눈이 흔들린다.
BLOCK_Y = ROADMAP_Y


def _max_data_rows() -> int:
    """1쪽(로드맵 전용)에 들어가는 데이터 행의 상한.

    상한을 넘겨도 조용히 그리면 표 아랫부분이 종이 밖으로 나가 **아무도 못 본다.**
    그래서 넘으면 만들지 않고 실패시킨다.

    2026-09-07 에 양식을 두 장으로 나누면서 **7 → 12** 로 늘었다. 예전에는
    같은 종이에 진행현황·이슈가 함께 있어서 로드맵이 쓸 수 있는 높이가
    108px(=2.7행) 밖에 남지 않았다. 두 블록이 같은 여백을 놓고 다투던 것이다.
    """
    return max(1, (PAGE_H - ROADMAP_Y - FOOT_ZONE) // ROADMAP_ROW_H - ROADMAP_HEADER_ROWS)


def _max_list_rows() -> int:
    """2쪽(진행현황 · 이슈) 표의 상한. **머리글 행을 포함한** 전체 행 수다."""
    return max(2, (PAGE_H - BLOCK_Y - FOOT_ZONE) // LIST_ROW_H)


MAX_DATA_ROWS = _max_data_rows()
MAX_LIST_ROWS = _max_list_rows()

# ②③ 이름표가 표 위에서 차지하는 높이. 두 장 배치가 `BLOCK_Y - 22` 로 쓰던 그 값이다.
LIST_LABEL_H = 22
# 로드맵 표 아래와 ②③ 이름표 사이. 실물에서 두 덩어리가 붙어 보이지 않을 만큼만 띄운다.
ONE_PAGE_GAP = 22


def one_page_list_y(data_rows: int) -> int:
    """한 장에 셋을 다 둘 때 ②③ **표**가 시작하는 y."""
    rm_bottom = ROADMAP_Y + ROADMAP_ROW_H * (ROADMAP_HEADER_ROWS + data_rows)
    return rm_bottom + ONE_PAGE_GAP + LIST_LABEL_H


def fits_one_page(data_rows: int, list_rows: int) -> bool:
    """①②③ 가 **한 장에** 들어가는가.

    실물 파워포인트는 셋이 한 장이다. 2026-09-07 에 두 장으로 나눈 것은 자리가
    모자라서였는데(로드맵을 늘리면 아래 목록이 못 늘었다), 그건 **양이 많을 때**
    이야기다. 기본값(로드맵 5 · 목록 4)은 한 장에 넉넉히 들어간다.

    그래서 규칙을 뒤집는다 — **들어가면 한 장, 안 들어가면 그때 두 장.**
    쪽수는 계약이 아니다(server/template_guard.py — 지키는 것은 세트다).
    """
    return one_page_list_y(data_rows) + LIST_ROW_H * list_rows + FOOT_ZONE <= PAGE_H


class TemplateError(ValueError):
    pass


def parse_period(period_ym: str) -> tuple[int, int]:
    """'2026-10' → (2026, 10). 형식이 어긋나면 즉시 실패한다.

    조용히 기본값으로 넘어가면 엉뚱한 연도의 표로 전 임원의 자료가 만들어진다.
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
        "headRow": True,
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
        "bold": bold, "align": align, "tcolor": tcolor,
    }


def _page(page_id: int, els: list[dict]) -> dict:
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


def build_template_pages(period_ym: str, owner_name: str = "", dept: str = "",
                         due_label: str = "",
                         data_rows: int = DEFAULT_DATA_ROWS,
                         list_rows: int = LIST_DEFAULT_ROWS) -> list[dict]:
    """임원 1인분. **두 장**이다 — 1쪽 로드맵, 2쪽 진행현황 · 이슈.

    ── 왜 두 장인가 ─────────────────────────────────
    한 장일 때 로드맵과 아래 두 블록은 **같은 108px 여백을 나눠 썼다.**
    로드맵을 두 행 늘리면 아래 목록은 한 행도 못 늘렸다. 임원마다 적는 양이
    다른데 자리는 한 벌뿐이라, 자리가 부족한 사람은 행 높이를 줄여 쓰다가
    글자가 안 보이는 지경이 됐다(34px → 18px).

    나누면 각자 제 종이를 쓴다. 로드맵 5 → **12행**, 진행현황·이슈 4 → **15행**.

    ── 쪽수를 계약에서 뺀 것 ──────────────────────────
    예전 계약은 「1인 1장」이었다. 그게 지키려던 것은 쪽수가 아니라 「취합 단위 =
    사람」이었고, 취합은 슬롯 이름으로 찾지 쪽 번호로 찾지 않는다. 그래서 계약을
    **「1인 1세트」**로 다시 적었다(AGENTS.md · server/template_guard.py).
    사람마다 쪽수가 달라도 된다 — 내용이 많은 임원은 늘려 쓴다.

    ── 기본 행 수는 그대로 둔다 ────────────────────────
    자리가 넓어졌다고 기본 행을 늘리지 않는다. 지금 값(로드맵 5 · 목록 4)은
    **실물에서 잰 것**이고, 새 값을 정할 근거는 아직 없다. 사양 v1.0 §7.2 도
    기본 행 수를 「리허설 실측으로 확정」으로 열어 뒀다. 상한만 넓히고
    기본은 근거가 생길 때 옮긴다 — 행 추가는 작성자가 언제든 할 수 있으므로
    부족해도 위험이 낮다.
    """
    year, month = parse_period(period_ym)
    eid = 100001

    def nid() -> int:
        nonlocal eid
        eid += 1
        return eid

    who = " · ".join([x for x in (owner_name, dept) if x])

    def head_els() -> list[dict]:
        """머리글은 **두 쪽에 다 붙인다.** 2쪽만 열어 본 사람도 누구 자료인지
        알아야 한다. 슬롯 세트 검사는 표만 세므로 글상자가 둘이어도 문제없다."""
        return [
            _text_el(nid(), "head", "%d년 %d월 임원회의 — 진행보고" % (year, month),
                     MARGIN, 24, 620, 32, 19, bold=True),
            _text_el(nid(), "head",
                     ("작성 %s" % who) if who else "작성자",
                     PAGE_W - MARGIN - 348, 26, 348, 18, 12, align="right", tcolor="#5b6270"),
            _text_el(nid(), "head",
                     "기간 %s%s" % (period_ym,
                                  ("  ·  제출기한 %s" % due_label) if due_label else ""),
                     PAGE_W - MARGIN - 348, 46, 348, 18, 12, align="right", tcolor="#98a1b2"),
        ]

    def foot_el(y: int) -> dict:
        return _text_el(nid(), "foot",
                        "EVER-SKETCH · %s 임원회의%s" % (period_ym,
                                                     ("  ·  " + dept) if dept else ""),
                        MARGIN, y, 700, FOOT_H, 10.5, tcolor="#98a1b2")

    if list_rows > MAX_LIST_ROWS:
        raise TemplateError(
            "진행현황·이슈 표가 너무 깁니다 — 한 장에 최대 %d행입니다 (요청 %d행)."
            % (MAX_LIST_ROWS, list_rows))

    issue_x = MARGIN + STATUS_W + LIST_GAP

    def list_els(y: int) -> list[dict]:
        """②③ 한 벌. 어느 쪽에 놓든 모양이 같아야 해서 한 곳에서 만든다."""
        return [
            _text_el(nid(), "SLOT-B", "② 진행 현황 · 향후 계획",
                     MARGIN, y - LIST_LABEL_H, STATUS_W, 18, 12.5, bold=True),
            build_status_el(nid(), MARGIN, y, STATUS_W, rows=list_rows),
            _text_el(nid(), "SLOT-C", "③ 이슈 · 필요 지원",
                     issue_x, y - LIST_LABEL_H, ISSUE_W, 18, 12.5, bold=True),
            build_issue_el(nid(), issue_x, y, ISSUE_W, rows=list_rows),
        ]

    rows1 = ROADMAP_HEADER_ROWS + max(1, data_rows)
    p1 = head_els()
    p1.append(_text_el(nid(), "SLOT-A", "① 로드맵 / 마일스톤", MARGIN, 72, 400, 18, 13,
                       bold=True))
    p1.append(build_roadmap_el(nid(), period_ym, data_rows))

    # ── 들어가면 **한 장** ──
    # 실물 파워포인트가 그렇다. 사용자 판단(2026-09-16): 처음엔 한 쪽으로 두고,
    # 넘칠 때만 ②③ 를 **통째로** 다음 쪽으로 보낸다(줄을 쪼개 잇지 않는다).
    if fits_one_page(data_rows, list_rows):
        ls_y = one_page_list_y(data_rows)
        p1.extend(list_els(ls_y))
        p1.append(foot_el(ls_y + LIST_ROW_H * list_rows + FOOT_GAP))
        return [_page(1, p1)]

    # ── 안 들어가면 두 장 ── 1쪽 로드맵, 2쪽 ②③ 통째로 ──
    p1.append(foot_el(ROADMAP_Y + ROADMAP_ROW_H * rows1 + FOOT_GAP))
    p2 = head_els()
    p2.extend(list_els(BLOCK_Y))
    p2.append(foot_el(BLOCK_Y + LIST_ROW_H * list_rows + FOOT_GAP))

    return [_page(1, p1), _page(2, p2)]


def build_template_state(period_ym: str, owner_name: str = "", dept: str = "",
                         due_label: str = "", data_rows: int = DEFAULT_DATA_ROWS) -> dict:
    """프로젝트 `state` 로 저장할 전체 스냅샷.

    **두 장**이다(「1인 1세트」 — 쪽수는 계약이 아니다). 자세한 것은
    build_template_pages 의 설명을 보라."""
    year, month = parse_period(period_ym)
    pages = build_template_pages(period_ym, owner_name, dept, due_label,
                                 data_rows=data_rows)
    title = "%d년 %d월 임원회의" % (year, month)
    if owner_name:
        title += " — %s" % owner_name
    return {
        "title": title,
        "orientation": "landscape",
        "theme": "light",
        "font": "auto",
        "size": "m",
        "pages": pages,
        "selectedPageId": pages[0]["id"],
    }


# ── 자리 잠금을 풀었다 (2026-09-07) ──────────────────
# 예전에는 모든 슬롯 요소에 `locked: True` 를 박았다. 근거는 「잠그지 않으면
# 임원마다 레이아웃이 달라져 취합이 깨진다」였는데, **사실이 아니었다.**
# 취합은 슬롯 이름과 칸 값을 읽지 x/y 를 읽지 않는다. 좌표가 달라서 깨지는 것은
# 취합이 아니라 여러 사람 자료를 이어 봤을 때의 **보기 좋음**이고, 그건
# 내용이 자리에 안 들어가 글자가 잘리는 것보다 덜 중요하다.
#
# 대신 진짜 지켜야 하는 것을 남긴다: **요소는 종이 안에 있어야 한다.**
# 종이 밖으로 나간 표는 아무도 못 보고, 작성자는 결재에 올린 뒤에야 안다.
# 화면이 끌 때 막고(FreeLayer), 서버가 저장할 때 다시 본다(template_guard).


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
        "headerEdit": True,
    },
    # **2026-09-16 · ②③ 에도 병합·칸 색·정렬을 연다.**
    # 사용자: 「로드맵은 셀 병합이 가능한데 왜 진행현황·향후 계획, 이슈는 병합이 안 되는지」.
    # 고장이 아니라 처음에 그렇게 적어 둔 것이었다 — 로드맵은 진행 구간이 「가로 병합 +
    # 단계 이름」이라 병합이 **필수**였고, ②③ 는 그냥 목록이라 필요 없다고 본 것이다.
    #
    # 열어도 안 깨진다. **병합은 열 수를 바꾸지 않는다** — template_guard 가 거부하는 것은
    # 「표가 없어지거나 둘이 되거나 **열 수가 다르면**」이고, 취합도 열 번호로 표를 잇는다.
    # 표마다 되는 게 다른 편이 오히려 「왜 여기만 안 되지」를 만든다.
    #
    # 칸 색은 팔레트를 두지 않는다 — 로드맵의 색은 **상태를 가리키는 약속**이지만
    # ②③ 의 색은 그냥 색이다. 약속이 없는 자리에 팔레트를 두면 뜻이 있는 것처럼 읽힌다.
    "SLOT-B": {"edit": ["cell", "merge", "row", "align", "cbg", "format"], "lockedRows": 1, "text": "open",
               "headerEdit": True},
    "SLOT-C": {"edit": ["cell", "merge", "row", "align", "cbg", "format"], "lockedRows": 1, "text": "open",
               "headerEdit": True},
}

# ── `lockedRows` 와 `headerEdit` 은 다른 것을 말한다 ──────
# lockedRows  머리글이 **몇 행인가**. 색과 굵기를 그 행에 입히고, 행 삭제를 막는다.
# headerEdit  그 행의 **글자를 고칠 수 있는가**.
#
# 예전에는 하나가 둘을 겸했다. 그래서 「진행 현황」이나 「사업그룹」 같은 이름표를
# 자기 부서 말로 바꾸려 해도 방법이 없었다 — 사용자가 「글씨 정도는 바꿀 수 있는 거
# 아니냐」고 물은 자리가 여기다.
#
# 열어도 취합은 안 깨진다. 취합이 표를 잇는 근거는 **열 번호**지 열 이름이 아니다
# (COL_GROUP=0, COL_MONTH_FIRST=2 ...). 열 **수**는 여전히 못 바꾼다 —
# 그건 template_guard 가 저장할 때 막는다.
#
# 머리글 **행 자체를 지우는 것**은 계속 막는다. 이름표 글자를 고치는 것과 머리글이
# 통째로 없어지는 것은 다른 일이다.


def slot_allows(slot: Optional[str], op: str) -> bool:
    """L2 가 이 슬롯에서 이 편집을 할 수 있는가. 모르는 슬롯은 거부(기본 거부)."""
    if not slot:
        return False
    policy = SLOT_POLICY.get(slot)
    if not policy:
        return False
    return op in policy.get("edit", [])
