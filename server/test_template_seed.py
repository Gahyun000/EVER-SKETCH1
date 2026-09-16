"""표준 템플릿 정본 v2.0 생성기 검증.

사양서(start_docs/화면설계/표준템플릿_정본_사양_v2.0.md)의 확정 사항을 못 박는다.
**여기 적힌 숫자는 우리가 정한 게 아니라 실물에서 잰 값이다.**
사양이 바뀌면 여기가 먼저 실패해야 한다.
"""
import pytest

from server import template_seed as T


def page(period="2026-10", **kw):
    """두 쪽의 요소를 **한 자루에 담아** 돌려준다.

    이 스위트가 묻는 것은 대부분 「어떤 요소가 어떤 값으로 있는가」지
    「몇 쪽에 있는가」가 아니다. 쪽 배치는 test_template_geometry.py 가 본다.
    (2026-09-07 에 양식이 두 장이 되면서 이 자루가 생겼다.)
    """
    pages = T.build_template_pages(period, **kw)
    return {"els": [e for pg in pages for e in pg["els"]], "pages": pages}


def el_of(pg, slot, type_="table"):
    return [e for e in pg["els"] if e.get("slot") == slot and e["type"] == type_][0]


# ══════════ 회차 기간 파싱 ══════════
def test_기간에서_연도와_월을_읽는다():
    assert T.parse_period("2026-10") == (2026, 10)
    assert T.parse_period("2027-01") == (2027, 1)


@pytest.mark.parametrize("bad", ["2026", "2026/10", "26-10", "2026-13", "2026-00",
                                 "1999-05", "", "abc", "2026-1x"])
def test_잘못된_기간은_즉시_실패한다(bad):
    """조용히 기본값으로 넘어가면 엉뚱한 연도의 표로 전 임원의 자료가 만들어진다."""
    with pytest.raises(T.TemplateError):
        T.parse_period(bad)


# ══════════ 로드맵 표 (사양 §3) ══════════
def test_로드맵은_18열이다():
    """실측값이다. 20열이던 v1.0 은 내가 상상한 구성이었다."""
    el = el_of(page(), "SLOT-A")
    assert el["cols"] == 18
    assert all(len(row) == 18 for row in el["cells"])


def test_헤더는_2행이고_연도가_자동으로_들어간다():
    el = el_of(page("2026-10"), "SLOT-A")
    assert el["cells"][0][T.COL_GROUP] == "Project"
    assert el["cells"][0][T.COL_MONTH_FIRST] == "2026년"
    assert el["cells"][0][T.COL_NEXT_YEAR] == "2027년"
    assert el["cells"][0][T.COL_PLAN_MM] == "계획 M/M"
    assert el["cells"][0][T.COL_ACTUAL_MM] == "투입 M/M"
    assert el["cells"][0][T.COL_NOTE] == "비고(투입인원)"


def test_연도는_회차마다_달라진다():
    """정적 JSON 이면 사람이 매번 고쳐야 하고, 그 순간 정본이 여러 개가 된다."""
    el = el_of(page("2027-03"), "SLOT-A")
    assert el["cells"][0][T.COL_MONTH_FIRST] == "2027년"
    assert el["cells"][0][T.COL_NEXT_YEAR] == "2028년"


def test_월_라벨():
    el = el_of(page(), "SLOT-A")
    months = el["cells"][1][T.COL_MONTH_FIRST:T.COL_MONTH_LAST + 1]
    assert months == [str(i) for i in range(1, 13)]


def test_익년은_분기가_아니라_한_칸이다():
    """v1.0 은 익년을 4분기로 쪼갰다. 실물은 한 칸이다."""
    assert T.COL_NEXT_YEAR + 1 == T.COL_PLAN_MM


def test_병합은_사양대로_6건():
    el = el_of(page(), "SLOT-A")
    m = {(x["r"], x["c"]): (x["rs"], x["cs"]) for x in el["merges"]}
    assert m[(0, T.COL_GROUP)] == (2, 2)          # 'Project' 2행 2열
    assert m[(0, T.COL_MONTH_FIRST)] == (1, 12)   # 당해년도 12개월
    assert m[(0, T.COL_NEXT_YEAR)] == (2, 1)
    assert m[(0, T.COL_PLAN_MM)] == (2, 1)
    assert m[(0, T.COL_ACTUAL_MM)] == (2, 1)
    assert m[(0, T.COL_NOTE)] == (2, 1)
    assert len(el["merges"]) == 6


def test_병합이_표_범위를_벗어나지_않는다():
    el = el_of(page(), "SLOT-A")
    for x in el["merges"]:
        assert x["r"] + x["rs"] <= el["rows"]
        assert x["c"] + x["cs"] <= el["cols"]


def test_열너비가_열_수와_같고_사업명_열이_넓다():
    """균등 분할이면 'Project' 칸이 월 칸과 같은 폭이 되어 사업명이 세 줄로 접힌다."""
    el = el_of(page(), "SLOT-A")
    assert len(el["colw"]) == el["cols"]
    assert min(el["colw"]) == 1.0
    assert el["colw"][T.COL_GROUP] > 2 and el["colw"][T.COL_PROJECT] > 2
    assert el["colw"][T.COL_MONTH_FIRST] == 1.0


def test_Today_마커가_회차_기준월을_가리킨다():
    """사용자가 옮기지 않는다 — 회차에서 계산한다(사양 §3.4)."""
    assert el_of(page("2026-01"), "SLOT-A")["today"] == T.COL_MONTH_FIRST
    assert el_of(page("2026-10"), "SLOT-A")["today"] == T.COL_MONTH_FIRST + 9
    assert el_of(page("2026-12"), "SLOT-A")["today"] == T.COL_MONTH_LAST


def test_Today_마커는_항상_월_열_안에_있다():
    for m in range(1, 13):
        t = el_of(page("2026-%02d" % m), "SLOT-A")["today"]
        assert T.COL_MONTH_FIRST <= t <= T.COL_MONTH_LAST


def test_머리글에만_색이_들어간다():
    """머리글 색은 구조다. 데이터 행에 예시 색이 있으면 임원이 지우는 것부터 시작한다."""
    el = el_of(page(), "SLOT-A")
    for r in range(T.ROADMAP_HEADER_ROWS):
        for c in range(T.ROADMAP_COLS):
            assert el["cbg"]["%d_%d" % (r, c)] == T.HEADER_BG
    for r in range(T.ROADMAP_HEADER_ROWS, el["rows"]):
        for c in range(T.ROADMAP_COLS):
            assert "%d_%d" % (r, c) not in el["cbg"]


def test_데이터_행_수를_조절할_수_있다():
    assert el_of(page(data_rows=3), "SLOT-A")["rows"] == 2 + 3
    assert el_of(page(), "SLOT-A")["rows"] == 2 + T.DEFAULT_DATA_ROWS


# ══════════ 하단 블록 (사양 §4) ══════════
def test_진행현황과_향후계획은_한_표의_두_열이다():
    """두 표로 쪼개면 행 높이가 어긋나 좌우 줄이 안 맞는다(실물은 한 표다)."""
    el = el_of(page(), "SLOT-B")
    assert el["cols"] == 2
    assert el["cells"][0] == ["진행 현황", "향후 계획"]


def test_이슈_리스트는_1열이다():
    el = el_of(page(), "SLOT-C")
    assert el["cols"] == 1
    assert "이슈" in el["cells"][0][0]


def test_번호_열이_없다():
    """v1.0 의 자동 채번 '#' 열은 실물에 없다."""
    for slot in ("SLOT-B", "SLOT-C"):
        assert el_of(page(), slot)["cells"][0][0] != "#"


def test_하단_두_표의_폭_비율이_실물과_같다():
    b, c = el_of(page(), "SLOT-B"), el_of(page(), "SLOT-C")
    assert b["w"] > c["w"]
    assert abs(b["w"] / (b["w"] + c["w"]) - 0.66) < 0.05   # 실물 6.6 : 3.4


# ══════════ 페이지 구조 ══════════
def test_기본값은_한_장이고_슬롯은_한_세트다():
    """예전 이름은 「1인 1장」이었다가 「두 장」이었다. 계약이 지키려던 것은 쪽수가 아니라
    「취합 단위 = 사람」이었고, 취합은 슬롯 이름으로 찾지 쪽 번호로 찾지 않는다.
    그래서 **세는 것을 쪽에서 세트로 옮겼다**(AGENTS.md · template_guard.py).

    **2026-09-16 · 기본값이 다시 한 장이 됐다.** 실물 파워포인트가 한 장이고,
    기본값(로드맵 5 · 목록 4)은 한 장에 넉넉히 들어간다. 검사를 지우지 않고 고쳐 쓴다 —
    지키려던 것(세트가 온전하다)은 그대로 보고, **쪽수는 들어가는지에 맡긴다.**
    """
    st = T.build_template_state("2026-10", "김OO", "사업본부")
    assert len(st["pages"]) == 1, "기본값은 한 장입니다 (%d쪽)" % len(st["pages"])
    assert st["orientation"] == "landscape"
    tables = [e for pg in st["pages"] for e in pg["els"] if e["type"] == "table"]
    assert sorted(e["slot"] for e in tables) == ["SLOT-A", "SLOT-B", "SLOT-C"]


def test_들어가면_한_장_안_들어가면_두_장():
    """쪽수는 **재 보고** 정한다. 규칙과 결과가 어긋나면 안 된다.

    안 들어갈 때는 ②③ 가 **통째로** 다음 쪽으로 간다 — 줄을 쪼개 잇지 않는다
    (사용자 판단 2026-09-16). 그래서 두 장일 때 1쪽에는 로드맵만 남는다."""
    def slots(pg):
        return {e["slot"] for e in pg["els"] if e["type"] == "table"}

    one = T.build_template_pages("2026-10")                      # 기본값
    assert T.fits_one_page(T.DEFAULT_DATA_ROWS, T.LIST_DEFAULT_ROWS)
    assert len(one) == 1
    assert slots(one[0]) == {"SLOT-A", "SLOT-B", "SLOT-C"}

    two = T.build_template_pages("2026-10", data_rows=T.MAX_DATA_ROWS)
    assert not T.fits_one_page(T.MAX_DATA_ROWS, T.LIST_DEFAULT_ROWS)
    assert len(two) == 2
    assert slots(two[0]) == {"SLOT-A"}
    assert slots(two[1]) == {"SLOT-B", "SLOT-C"}, "②③ 는 통째로 넘어갑니다"


def test_머리글은_두_쪽에_다_있다():
    """2쪽만 열어 본 사람도 누구 자료인지 알아야 한다."""
    for pg in T.build_template_pages("2026-10", "김가현", "AI팀"):
        txt = " ".join(e.get("text", "") for e in pg["els"])
        assert "김가현" in txt and "임원회의" in txt


def test_나누고_나서_자리가_넓어졌다():
    """이 숫자가 이번 변경의 전부다. 줄어들면 나눈 의미가 없다."""
    assert T.MAX_DATA_ROWS == 12          # 한 장일 때는 7
    assert T.MAX_LIST_ROWS == 16          # 한 장일 때는 5 (머리글 포함)


def test_기본_행_수는_실물_그대로_둔다():
    """자리가 넓어졌다고 기본값을 늘리지 않는다 — 지금 값은 실물에서 잰 것이고
    새 값을 정할 근거가 아직 없다(사양 v1.0 §7.2 「리허설 실측으로 확정」)."""
    assert T.DEFAULT_DATA_ROWS == 5
    assert T.LIST_DEFAULT_ROWS == 5


def test_세_슬롯이_모두_있다():
    slots = {e.get("slot") for e in page()["els"]}
    assert {"SLOT-A", "SLOT-B", "SLOT-C", "head", "foot"} <= slots
    assert "SLOT-D" not in slots


def test_모든_요소에_슬롯이_있다():
    """slot 이 없으면 어떤 규칙도 걸 수 없다 — 편집 정책도, 세트 검사도, 자리 검사도."""
    for e in page()["els"]:
        assert e.get("slot"), "slot 없는 요소가 있습니다: %s" % e["type"]


def test_자리를_잠그지_않는다():
    """예전에는 모든 슬롯 요소가 `locked: True` 였다. 근거는 「잠그지 않으면 임원마다
    레이아웃이 달라져 취합이 깨진다」였는데 **사실이 아니었다** — 취합은 슬롯 이름과
    칸 값을 읽지 x/y 를 읽지 않는다.

    그리고 임원마다 적는 양이 다르다. 자리를 못 옮기면 내용이 자리에 안 들어가는
    사람은 글자가 잘리는 것으로 대가를 치른다. 그게 좌표가 가지런한 것보다 나쁘다.

    잠금을 푼 대신 **종이 밖으로 못 나가게** 한다 — 화면(FreeLayer.penIn)과
    서버(template_guard) 두 곳에서.
    """
    for e in page()["els"]:
        assert not e.get("locked"), "%s 가 아직 잠겨 있습니다" % e.get("slot")


def test_모든_슬롯_요소가_종이_안에_있다():
    """잠금을 푼 뒤 이것이 유일하게 남은 자리 규칙이다.
    종이 밖으로 나간 표는 아무에게도 안 보인다."""
    from server import template_guard as guard
    assert guard.check_state(T.build_template_state("2026-10", "김OO", "본부")) is None


def test_슬롯이_겹치지_않는다():
    """표가 서로 포개지면 화면에서 가려진다.

    **쪽 안에서만** 본다. 다른 쪽 요소는 같은 좌표를 써도 겹치지 않는다 —
    두 장이 된 뒤 1쪽 로드맵과 2쪽 진행현황이 둘 다 y=94 에서 시작한다."""
    for pg in page()["pages"]:
        _no_overlap([e for e in pg["els"] if e["type"] == "table"])


def _no_overlap(tables):
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
    assert page(owner_name="", dept="")["els"]


# ══════════ 슬롯 정책 (사양 §5) ══════════
def test_열_추가삭제는_어느_슬롯에도_없다():
    """핵심 제약 — 임원마다 열이 달라지면 회차 취합에서 자동 병합이 불가능하다."""
    for slot, policy in T.SLOT_POLICY.items():
        assert "col" not in policy.get("edit", []), "%s 가 열 편집을 허용합니다" % slot


def test_로드맵만_셀_배경색과_병합을_허용한다():
    """로드맵의 병합은 장식이 아니다 — 진행 구간 자체가 '가로 병합 + 단계 이름'이다."""
    assert T.slot_allows("SLOT-A", "cbg") is True
    assert T.slot_allows("SLOT-A", "merge") is True
    for slot in ("SLOT-B", "SLOT-C"):
        assert T.slot_allows(slot, "cbg") is False
        assert T.slot_allows(slot, "merge") is False


def test_행_추가는_세_표_모두_허용():
    for slot in ("SLOT-A", "SLOT-B", "SLOT-C"):
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


def test_팔레트는_실물_5색():
    assert T.SLOT_POLICY["SLOT-A"]["cbgPalette"] == [
        "#FBE5D6", "#DEEBF7", "#E2F0D9", "#FFFF00", "#92D050"]


def test_색에_뜻을_붙이지_않는다():
    """색 이름은 색 이름이다. '완료·지연' 같은 뜻을 지어 붙이면
    임원이 쓰던 뜻과 어긋난 채로 취합 통계가 나온다."""
    assert set(T.STAGE_LABELS) == {"주황", "파랑", "연두", "노랑", "초록"}
    assert len(T.STAGE_LABELS) == len(T.STAGE_COLORS)


def test_헤더_행이_잠금_대상으로_표시된다():
    assert T.SLOT_POLICY["SLOT-A"]["lockedRows"] == 2      # 연도행 + 월행
    for slot in ("SLOT-B", "SLOT-C"):
        assert T.SLOT_POLICY[slot]["lockedRows"] == 1


def test_버전이_v2다():
    assert T.TEMPLATE_VERSION == "v2.0"


# ══════════ TODAY 마커 ══════════

def test_새_양식은_TODAY를_자동으로_둔다():
    """만든 달을 박아 두면 두 달 뒤에 연 사람이 지난 달을 오늘로 믿는다."""
    el = el_of(page("2026-09"), "SLOT-A")
    assert el["todayMode"] == "auto"


def test_TODAY_자동_계산의_근거가_함께_저장된다():
    """기준 연도가 없으면 화면이 '이 해가 맞는지'를 판정할 수 없다."""
    el = el_of(page("2026-09"), "SLOT-A")
    assert el["todayYear"] == 2026
    assert el["today"] == T.COL_MONTH_FIRST + 8      # 고정 모드로 바꿨을 때의 출발점


def test_TODAY를_옮기는_것은_허용된_편집이다():
    """도구모음의 버튼은 슬롯 정책을 보고 켜진다. 정책에 없으면 버튼이 죽는다."""
    assert T.slot_allows("SLOT-A", "today")
