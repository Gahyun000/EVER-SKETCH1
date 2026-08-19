"""표준 템플릿 정본 v1.0 생성기 검증.

사양서(start_docs/화면설계/표준템플릿_정본_사양_v1.0.md)의 확정 사항을 그대로 못 박는다.
사양이 바뀌면 여기가 먼저 실패해야 한다.
"""
import pytest

from server import template_seed as T


def page(period="2026-10", **kw):
    return T.build_template_page(period, **kw)


def el_of(pg, slot, type_="table"):
    return [e for e in pg["els"] if e.get("slot") == slot and e["type"] == type_][0]


# ══════════ 회차 기간 파싱 ══════════
def test_기간에서_연도와_월을_읽는다():
    assert T.parse_period("2026-10") == (2026, 10)
    assert T.parse_period("2027-01") == (2027, 1)


@pytest.mark.parametrize("bad", ["2026", "2026/10", "26-10", "2026-13", "2026-00",
                                 "1999-05", "", "abc", "2026-1x"])
def test_잘못된_기간은_즉시_실패한다(bad):
    """조용히 기본값으로 넘어가면 전 임원에게 엉뚱한 연도의 표가 배부된다."""
    with pytest.raises(T.TemplateError):
        T.parse_period(bad)


# ══════════ 로드맵 표 (사양 §3) ══════════
def test_로드맵은_20열이다():
    el = el_of(page(), "SLOT-A")
    assert el["cols"] == 20
    assert all(len(row) == 20 for row in el["cells"])


def test_헤더는_2행이고_연도가_자동으로_들어간다():
    el = el_of(page("2026-10"), "SLOT-A")
    assert el["cells"][0][T.COL_LABEL] == "구분"
    assert el["cells"][0][T.COL_MONTH_FIRST] == "2026"
    assert el["cells"][0][T.COL_EXT_FIRST] == "2027"      # 익년
    assert el["cells"][0][T.COL_PLAN_MM] == "계획 M/M"
    assert el["cells"][0][T.COL_ACTUAL_MM] == "투입 M/M"
    assert el["cells"][0][T.COL_NOTE] == "비고"


def test_연도는_회차마다_달라진다():
    """정적 JSON 이면 사람이 매번 고쳐야 하고, 그 순간 정본이 여러 개가 된다."""
    assert el_of(page("2027-03"), "SLOT-A")["cells"][0][T.COL_MONTH_FIRST] == "2027"
    assert el_of(page("2027-03"), "SLOT-A")["cells"][0][T.COL_EXT_FIRST] == "2028"


def test_월과_분기_라벨():
    el = el_of(page(), "SLOT-A")
    months = el["cells"][1][T.COL_MONTH_FIRST:T.COL_MONTH_LAST + 1]
    assert months == [str(i) for i in range(1, 13)]
    ext = el["cells"][1][T.COL_EXT_FIRST:T.COL_EXT_LAST + 1]
    assert ext == ["1Q", "2Q", "3Q", "4Q"]


def test_병합은_사양대로_6건():
    el = el_of(page(), "SLOT-A")
    m = {(x["r"], x["c"]): (x["rs"], x["cs"]) for x in el["merges"]}
    assert m[(0, 0)] == (2, 1)      # 구분
    assert m[(0, 1)] == (1, 12)     # 당해년도 12개월
    assert m[(0, 13)] == (1, 4)     # 익년 4분기
    assert m[(0, 17)] == (2, 1)     # 계획 M/M
    assert m[(0, 18)] == (2, 1)     # 투입 M/M
    assert m[(0, 19)] == (2, 1)     # 비고
    assert len(el["merges"]) == 6


def test_병합이_표_범위를_벗어나지_않는다():
    el = el_of(page(), "SLOT-A")
    for x in el["merges"]:
        assert x["r"] + x["rs"] <= el["rows"]
        assert x["c"] + x["cs"] <= el["cols"]


def test_Today_마커가_회차_기준월을_가리킨다():
    """사용자가 옮기지 않는다 — 회차에서 계산한다(사양 §3.4)."""
    assert el_of(page("2026-01"), "SLOT-A")["today"] == T.COL_MONTH_FIRST      # 1월 = 열 1
    assert el_of(page("2026-10"), "SLOT-A")["today"] == T.COL_MONTH_FIRST + 9  # 10월 = 열 10
    assert el_of(page("2026-12"), "SLOT-A")["today"] == T.COL_MONTH_LAST       # 12월 = 열 12


def test_Today_마커는_항상_월_열_안에_있다():
    for m in range(1, 13):
        t = el_of(page("2026-%02d" % m), "SLOT-A")["today"]
        assert T.COL_MONTH_FIRST <= t <= T.COL_MONTH_LAST


def test_진행_셀은_비어서_배부된다():
    """예시 색이 들어 있으면 임원이 지우는 것부터 시작한다."""
    assert el_of(page(), "SLOT-A")["cbg"] == {}


def test_데이터_행_수를_조절할_수_있다():
    assert el_of(page(data_rows=3), "SLOT-A")["rows"] == 2 + 3
    assert el_of(page(), "SLOT-A")["rows"] == 2 + T.DEFAULT_DATA_ROWS


# ══════════ 목록 표 (사양 §4) ══════════
@pytest.mark.parametrize("slot,third", [
    ("SLOT-B", "상태"), ("SLOT-C", "목표일"), ("SLOT-D", "심각도"),
])
def test_목록표는_3열이고_헤더가_사양대로(slot, third):
    el = el_of(page(), slot)
    assert el["cols"] == 3
    assert el["cells"][0][0] == "#"
    assert el["cells"][0][2] == third


def test_번호는_자동_채번된다():
    """L2 가 직접 입력하지 않는다."""
    el = el_of(page(), "SLOT-B")
    for i in range(1, el["rows"]):
        assert el["cells"][i][0] == str(i)


# ══════════ 페이지 구조 ══════════
def test_1인_1장이다():
    st = T.build_template_state("2026-10", "김OO", "사업본부")
    assert len(st["pages"]) == 1
    assert st["orientation"] == "landscape"


def test_4개_슬롯이_모두_있다():
    slots = {e.get("slot") for e in page()["els"]}
    assert {"SLOT-A", "SLOT-B", "SLOT-C", "SLOT-D", "head", "foot"} <= slots


def test_모든_슬롯_요소가_잠겨_있다():
    """위치·크기는 L3 만 바꾼다. 잠그지 않으면 임원마다 레이아웃이 달라져 취합이 깨진다."""
    for e in page()["els"]:
        assert e.get("locked") is True, "잠기지 않은 요소: %s" % e.get("slot")
        assert e.get("slot"), "slot 없는 요소가 있습니다: %s" % e["type"]


def test_슬롯이_겹치지_않는다():
    """표 4개가 서로 포개지면 화면에서 가려진다."""
    tables = [e for e in page()["els"] if e["type"] == "table"]
    for i, a in enumerate(tables):
        for b in tables[i + 1:]:
            overlap_x = a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"]
            overlap_y = a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]
            assert not (overlap_x and overlap_y), \
                "%s 와 %s 가 겹칩니다" % (a["slot"], b["slot"])


def test_작성자_이름이_들어간다():
    txt = " ".join(e["text"] for e in page(owner_name="김가현", dept="AI팀")["els"])
    assert "김가현" in txt and "AI팀" in txt


def test_작성자가_없어도_생성된다():
    """회차를 먼저 만들고 대상자를 나중에 정하는 경우."""
    pg = page(owner_name="", dept="")
    assert pg["els"]


# ══════════ 슬롯 정책 (사양 §5) ══════════
def test_열_추가삭제는_어느_슬롯에도_없다():
    """핵심 제약 — 임원마다 열이 달라지면 회차 취합에서 자동 병합이 불가능하다."""
    for slot, policy in T.SLOT_POLICY.items():
        assert "col" not in policy.get("edit", []), "%s 가 열 편집을 허용합니다" % slot


def test_로드맵만_셀_배경색과_병합을_허용한다():
    assert T.slot_allows("SLOT-A", "cbg") is True
    assert T.slot_allows("SLOT-A", "merge") is True
    for slot in ("SLOT-B", "SLOT-C", "SLOT-D"):
        assert T.slot_allows(slot, "cbg") is False
        assert T.slot_allows(slot, "merge") is False


def test_행_추가는_네_표_모두_허용():
    for slot in ("SLOT-A", "SLOT-B", "SLOT-C", "SLOT-D"):
        assert T.slot_allows(slot, "row") is True


def test_머리글과_꼬리말은_편집_불가():
    for slot in ("head", "foot"):
        for op in ("cell", "row", "format", "cbg", "merge"):
            assert T.slot_allows(slot, op) is False


def test_모르는_슬롯은_거부된다():
    """기본 거부 — 새 슬롯을 추가하고 정책을 안 적으면 열리는 게 아니라 막힌다."""
    assert T.slot_allows("SLOT-Z", "cell") is False
    assert T.slot_allows(None, "cell") is False
    assert T.slot_allows("", "cell") is False


def test_팔레트는_4색으로_고정():
    assert T.SLOT_POLICY["SLOT-A"]["cbgPalette"] == ["#2462EB", "#EAF1FE", "#D98A2A", "#EEF0F4"]


def test_상태칩은_4종_심각도는_3종():
    assert T.SLOT_POLICY["SLOT-B"]["choices"]["2"] == ["완료", "진행", "지연", "보류"]
    assert T.SLOT_POLICY["SLOT-D"]["choices"]["2"] == ["높음", "중간", "낮음"]


def test_헤더_행이_잠금_대상으로_표시된다():
    assert T.SLOT_POLICY["SLOT-A"]["lockedRows"] == 2      # 연도행 + 월행
    for slot in ("SLOT-B", "SLOT-C", "SLOT-D"):
        assert T.SLOT_POLICY[slot]["lockedRows"] == 1
