"""표준 양식이 **종이 안에 있는가**를 강제하는 회귀 테스트.

이 파일이 생긴 이유
  정본 v1.0 은 x=24..1204, w=1180 좌표로 만들어져 있었다.
  그런데 실제 캔버스(src/cards/sizing.ts)의 가로 덱 페이지는 640×482 였다.
  배부를 눌렀다면 임원들에게는 **빈 종이**가 갔다. 표는 종이 밖 오른쪽에 그려진다.
  단위 테스트가 전부 통과하고 있었는데도 그랬다 — 아무도 좌표를 검사하지 않았기 때문이다.

그래서 두 가지를 못 박는다.
  1) 파이썬 쪽 PAGE_W/PAGE_H 가 프런트 sizing.ts 의 DECK_W/DECK_H 와 같다.
  2) 생성된 모든 요소가 그 종이 안에 들어온다.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from server import template_seed as ts

SIZING_TS = Path(__file__).resolve().parents[1] / "src" / "cards" / "sizing.ts"


def _ts_const(name: str) -> int:
    src = SIZING_TS.read_text(encoding="utf-8")
    m = re.search(r"export const %s\s*=\s*(\d+)" % name, src)
    assert m, "%s 를 sizing.ts 에서 찾지 못했습니다 — 상수 이름이 바뀌었나요?" % name
    return int(m.group(1))


def test_page_size_matches_frontend():
    """서버가 만드는 좌표계와 프런트가 그리는 종이 크기는 하나여야 한다."""
    assert ts.PAGE_W == _ts_const("DECK_W")
    assert ts.PAGE_H == _ts_const("DECK_H")


@pytest.mark.parametrize("data_rows", [1, ts.DEFAULT_DATA_ROWS, ts.MAX_DATA_ROWS])
def test_all_elements_inside_page(data_rows):
    """**모든 쪽의** 모든 요소가 종이 안에 있다.

    2026-09-07 에 양식이 두 장이 되었다. 한 쪽만 보고 통과시키면 나머지 쪽이
    종이 밖으로 나가도 아무도 모른다 — 이 파일이 생긴 사고와 똑같은 모양이다."""
    pages = ts.build_template_pages("2026-10", "홍길동", "SI개발본부",
                                    data_rows=data_rows)
    assert len(pages) == 2, "쪽이 %d개입니다 — 정본은 두 장입니다." % len(pages)
    for pg in pages:
        assert pg["els"], "%d쪽에 요소가 하나도 없습니다." % pg["id"]
        for el in pg["els"]:
            x, y, w, h = el["x"], el["y"], el["w"], el["h"]
            where = "%d쪽 %s(%s)" % (pg["id"], el.get("slot"),
                                    el.get("text", "")[:16] or el["type"])
            assert x >= 0 and y >= 0, "%s 가 종이 왼쪽/위로 나갔습니다: (%s,%s)" % (where, x, y)
            assert x + w <= ts.PAGE_W, \
                "%s 가 종이 오른쪽으로 %dpx 나갔습니다 (끝 %d > %d)" % (
                    where, x + w - ts.PAGE_W, x + w, ts.PAGE_W)
            assert y + h <= ts.PAGE_H, \
                "%s 가 종이 아래로 %dpx 나갔습니다 (끝 %d > %d)" % (
                    where, y + h - ts.PAGE_H, y + h, ts.PAGE_H)


@pytest.mark.parametrize("list_rows", [2, ts.LIST_DEFAULT_ROWS, ts.MAX_LIST_ROWS])
def test_second_page_inside_page(list_rows):
    """2쪽 목록도 상한까지 종이 안에 있다 — 1쪽과 따로 잰다."""
    pages = ts.build_template_pages("2026-10", list_rows=list_rows)
    for el in pages[1]["els"]:
        assert el["y"] + el["h"] <= ts.PAGE_H, \
            "%s 가 종이 아래로 나갔습니다 (끝 %d)" % (el.get("slot"), el["y"] + el["h"])


def test_elements_do_not_overlap_within_a_page():
    """한 쪽 안에서 요소가 서로를 가리지 않는다.

    예전에는 「로드맵 표와 아래 3단 목록이 겹치지 않는다」였다. 두 장으로 나눈 뒤
    그 둘은 **다른 쪽**에 있어서 그 검사는 늘 참이 되어 버렸다 —
    통과하지만 아무것도 안 지키는 검사가 되는 것을 막으려고 다시 적는다."""
    for pg in ts.build_template_pages("2026-10"):
        boxes = [e for e in pg["els"] if e["type"] == "table"]
        for i, a in enumerate(boxes):
            for b in boxes[i + 1:]:
                ox = a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"]
                oy = a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]
                assert not (ox and oy), \
                    "%d쪽에서 %s 와 %s 가 겹칩니다" % (pg["id"], a["slot"], b["slot"])


def test_bottom_tables_do_not_overlap_horizontally():
    """진행현황과 이슈는 2쪽에서 좌우로 나란히 선다."""
    pages = ts.build_template_pages("2026-10")
    tables = sorted(
        [e for e in pages[1]["els"] if e["type"] == "table"], key=lambda e: e["x"])
    assert len(tables) == 2
    for a, b in zip(tables, tables[1:]):
        assert a["x"] + a["w"] <= b["x"], "목록 표가 가로로 겹칩니다."


def test_too_many_rows_fails_loudly():
    """상한을 넘으면 조용히 잘리지 않고 실패해야 한다.

    조용히 그리면 표 아랫부분이 종이 밖으로 나가고, 작성자는 자기가 쓴 줄이
    사라진 걸 발행 후에야 안다.
    """
    with pytest.raises(ts.TemplateError):
        ts.build_template_pages("2026-10", data_rows=ts.MAX_DATA_ROWS + 1)
    with pytest.raises(ts.TemplateError):
        ts.build_template_pages("2026-10", list_rows=ts.MAX_LIST_ROWS + 1)


def test_splitting_actually_bought_room():
    """나눈 이유를 숫자로 못 박는다.

    한 장일 때 로드맵이 쓸 수 있던 높이는 종이에서 아래 두 블록과 꼬리말을 뺀
    나머지였다. 지금은 꼬리말만 빼면 된다. 이 여유가 줄어들면 나눈 의미가 없다.
    """
    한장_상한 = (ts.PAGE_H - ts.ROADMAP_Y - ts.LIST_ROW_H * ts.LIST_DEFAULT_ROWS
              - 34 - ts.FOOT_ZONE) // ts.ROADMAP_ROW_H - ts.ROADMAP_HEADER_ROWS
    assert ts.MAX_DATA_ROWS > 한장_상한, \
        "나눴는데 로드맵 자리가 안 늘었습니다 (%d → %d)" % (한장_상한, ts.MAX_DATA_ROWS)
    assert ts.MAX_LIST_ROWS > ts.LIST_DEFAULT_ROWS
