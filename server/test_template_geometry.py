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
    page = ts.build_template_page("2026-10", "홍길동", "SI개발본부",
                                  data_rows=data_rows)
    assert page["els"], "요소가 하나도 없습니다."
    for el in page["els"]:
        x, y, w, h = el["x"], el["y"], el["w"], el["h"]
        where = "%s(%s)" % (el.get("slot"), el.get("text", "")[:16] or el["type"])
        assert x >= 0 and y >= 0, "%s 가 종이 왼쪽/위로 나갔습니다: (%s,%s)" % (where, x, y)
        assert x + w <= ts.PAGE_W, \
            "%s 가 종이 오른쪽으로 %dpx 나갔습니다 (끝 %d > %d)" % (where, x + w - ts.PAGE_W, x + w, ts.PAGE_W)
        assert y + h <= ts.PAGE_H, \
            "%s 가 종이 아래로 %dpx 나갔습니다 (끝 %d > %d)" % (where, y + h - ts.PAGE_H, y + h, ts.PAGE_H)


def test_elements_do_not_overlap_vertically_between_blocks():
    """로드맵 표와 아래 3단 목록이 겹치지 않는다 — 겹치면 글자가 서로를 가린다."""
    page = ts.build_template_page("2026-10")
    road = next(e for e in page["els"] if e.get("slot") == "SLOT-A" and e["type"] == "table")
    lists = [e for e in page["els"] if e.get("slot") in ("SLOT-B", "SLOT-C")]
    road_bottom = road["y"] + road["h"]
    for el in lists:
        assert el["y"] >= road_bottom, \
            "%s 가 로드맵 표(끝 %d)와 겹칩니다 (시작 %d)" % (el.get("slot"), road_bottom, el["y"])


def test_bottom_tables_do_not_overlap_horizontally():
    page = ts.build_template_page("2026-10")
    tables = sorted(
        [e for e in page["els"] if e["type"] == "table" and e.get("slot") in ("SLOT-B", "SLOT-C")],
        key=lambda e: e["x"])
    assert len(tables) == 2
    for a, b in zip(tables, tables[1:]):
        assert a["x"] + a["w"] <= b["x"], "목록 표가 가로로 겹칩니다."


def test_too_many_rows_fails_loudly():
    """상한을 넘으면 조용히 잘리지 않고 실패해야 한다.

    조용히 그리면 표 아랫부분이 종이 밖으로 나가고, 작성자는 자기가 쓴 줄이
    사라진 걸 발행 후에야 안다.
    """
    with pytest.raises(ts.TemplateError):
        ts.build_template_page("2026-10", data_rows=ts.MAX_DATA_ROWS + 1)
