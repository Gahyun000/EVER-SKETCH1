"""PPTX 변환기 회귀 테스트.

지키려는 것은 하나다 — **실물 PPT 의 구조가 손실 없이 편집 가능한 표로 들어온다.**
표가 이미지로 굽히거나, 병합이 풀리거나, 색이 사라지면 이 제품은 의미가 없다.
(임원은 자기 파일을 그대로 열어 고칠 수 있어야 한다.)

업로드 검증(UDS-107 §6)도 여기서 못 박는다. 확장자만 믿고 열면
zip 폭탄 하나로 서버가 멈춘다.
"""
from __future__ import annotations

import io
import zipfile

import pytest

from server import pptx_import as pi
from server.template_seed import PAGE_H, PAGE_W
from server.testdata import exec_fixture as fx


@pytest.fixture(scope="module")
def data() -> bytes:
    return fx.build()


@pytest.fixture(scope="module")
def result(data) -> dict:
    return pi.pptx_to_pages(data, "exec_roadmap.pptx")


@pytest.fixture(scope="module")
def roadmap(result) -> dict:
    tables = [e for e in result["pages"][0]["els"] if e["type"] == "table"]
    return max(tables, key=lambda t: t["rows"] * t["cols"])


# ── 1. 업로드 검증 ────────────────────────────────────────
def test_rejects_wrong_extension(data):
    with pytest.raises(pi.PptxImportError, match="pptx"):
        pi.validate_upload("보고서.ppt", data)


def test_rejects_disguised_extension():
    """확장자만 .pptx 로 바꾼 파일 — 확장자는 올리는 쪽이 마음대로 붙인다."""
    with pytest.raises(pi.PptxImportError):
        pi.validate_upload("악성.pptx", b"MZ\x90\x00 not a zip at all")


def test_rejects_empty():
    with pytest.raises(pi.PptxImportError):
        pi.validate_upload("a.pptx", b"")


def test_rejects_oversize():
    big = b"PK\x03\x04" + b"\0" * (pi.MAX_UPLOAD_BYTES + 1)
    with pytest.raises(pi.PptxImportError, match="너무 큽니다"):
        pi.validate_upload("a.pptx", big)


def test_rejects_zip_that_is_not_pptx():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "hi")
    with pytest.raises(pi.PptxImportError, match="PowerPoint"):
        pi.validate_upload("a.pptx", buf.getvalue())


def test_rejects_zip_bomb():
    """압축비가 큰 파일 — 풀면 상한을 넘는다."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", "<x/>")
        zf.writestr("ppt/presentation.xml", "<x/>")
        zf.writestr("bomb.bin", b"\0" * (pi.MAX_UNCOMPRESSED_BYTES + 1))
    with pytest.raises(pi.PptxImportError, match="압축"):
        pi.validate_upload("a.pptx", buf.getvalue())


def test_rejects_path_escape():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<x/>")
        zf.writestr("ppt/presentation.xml", "<x/>")
        zf.writestr("../../etc/passwd", "x")
    with pytest.raises(pi.PptxImportError):
        pi.validate_upload("a.pptx", buf.getvalue())


def test_accepts_real_pptx(data):
    pi.validate_upload("exec_roadmap.pptx", data)     # 예외가 없어야 한다


def test_rejects_too_many_slides():
    many = fx.build_many(pi.MAX_SLIDES + 1)
    with pytest.raises(pi.PptxImportError, match="너무 많습니다"):
        pi.open_presentation(many)


# ── 2. 구조 보존 ──────────────────────────────────────────
def test_slide_becomes_one_page(result):
    assert len(result["pages"]) == 1
    assert result["pages"][0]["cardKey"] == "slide"
    assert result["pages"][0]["free"] is True


def test_three_tables_survive(result):
    """로드맵 1 + 진행현황/향후계획 1 + 이슈 1 = 표 3개. 이미지로 굽히지 않는다."""
    tables = [e for e in result["pages"][0]["els"] if e["type"] == "table"]
    assert len(tables) == 3
    assert not [e for e in result["pages"][0]["els"] if e["type"] == "image"]


def test_roadmap_shape(roadmap):
    assert (roadmap["rows"], roadmap["cols"]) == (fx.ROWS, fx.COLS)


def test_header_merges_preserved(roadmap):
    got = {(m["r"], m["c"], m["rs"], m["cs"]) for m in roadmap["merges"]}
    for want in fx.EXPECTED_MERGES:
        assert want in got, "병합 %s 이(가) 사라졌습니다 — 머리글이 어긋납니다." % (want,)


def test_progress_bars_preserved(roadmap):
    """진행 구간은 가로 병합 + 단계 이름이다. 둘 중 하나만 살아도 뜻이 깨진다."""
    got = {(m["r"], m["c"], m["rs"], m["cs"]) for m in roadmap["merges"]}
    for r, c0, span, label, color in fx.BARS:
        if span > 1:
            assert (r, c0, 1, span) in got, "%d행 %d열 진행 구간 병합이 풀렸습니다." % (r, c0)
        assert roadmap["cells"][r][c0] == label
        assert roadmap["cbg"]["%d_%d" % (r, c0)] == "#" + color


def test_header_fill_preserved(roadmap):
    for c in range(fx.COLS):
        for r in (0, 1):
            key = "%d_%d" % (r, c)
            if key in roadmap["cbg"]:
                assert roadmap["cbg"][key] == "#" + fx.HEADER_BG


def test_spanned_cells_are_empty(roadmap):
    """병합에 덮인 칸에 글자가 남으면 화면에서 겹쳐 보인다."""
    covered = set()
    for m in roadmap["merges"]:
        for r in range(m["r"], m["r"] + m["rs"]):
            for c in range(m["c"], m["c"] + m["cs"]):
                if (r, c) != (m["r"], m["c"]):
                    covered.add((r, c))
    assert covered, "병합이 하나도 없습니다 — 견본이 잘못됐습니다."
    for r, c in covered:
        assert roadmap["cells"][r][c] == "", "덮인 칸 (%d,%d) 에 글자가 남았습니다." % (r, c)


def test_column_widths_are_ratios(roadmap):
    """'구분' 열은 월 칸보다 넓어야 한다. 균등 분할이면 사업명이 접힌다."""
    colw = roadmap["colw"]
    assert len(colw) == fx.COLS, "열 수와 너비 배열 길이가 다르면 표 전체 폭이 밀린다."
    assert min(colw) == 1.0, "가장 좁은 칸이 1 이 되게 정규화한다."
    assert colw[0] > colw[5] * 2, "구분 열이 월 칸보다 충분히 넓어야 합니다."
    assert max(colw) < 100, "EMU 원값이 그대로 들어왔습니다(비율이어야 합니다)."


def test_row_heights_length(roadmap):
    assert roadmap.get("rowh") is None or len(roadmap["rowh"]) == fx.ROWS


def test_no_fabricated_head_row(roadmap):
    """어느 행이 머리글인지는 색으로만 알 수 있다 — 지어내지 않는다."""
    assert roadmap["headRow"] is False


def test_title_textbox_survives(result):
    texts = [e for e in result["pages"][0]["els"] if e["type"] in ("text", "box")]
    assert any("수행전략회의" in e["text"] for e in texts)
    title = next(e for e in texts if "수행전략회의" in e["text"])
    assert title["bold"] is True
    assert title["fs"] > 20, "20pt 제목이 본문 크기로 눌렸습니다."


# ── 3. 좌표 ──────────────────────────────────────────────
def test_everything_inside_page(result):
    for el in result["pages"][0]["els"]:
        assert el["x"] >= 0 and el["y"] >= 0
        assert el["x"] + el["w"] <= PAGE_W + 1
        assert el["y"] + el["h"] <= PAGE_H + 1


def test_aspect_is_preserved():
    """비율이 다른 슬라이드는 늘리지 않고 가운데 맞춘다 — 늘리면 표가 찌그러진다."""
    fr = pi.Frame(9906000, 5568950, page_w=1040, page_h=720)   # 16:9
    assert fr.off_y > 0 and abs(fr.off_x) < 0.01
    w = 9906000 * fr.scale
    h = 5568950 * fr.scale
    assert abs(w / h - 9906000 / 5568950) < 1e-6


def test_frame_rejects_zero_size():
    with pytest.raises(pi.PptxImportError):
        pi.Frame(0, 100)


# ── 4. 목록·경고 ──────────────────────────────────────────
def test_slide_infos(result):
    info = result["slides"][0]
    assert info["index"] == 0
    assert info["tables"] == 3
    assert "수행전략회의" in info["title"]


def test_no_silent_loss(result):
    """가져오지 못한 것이 있으면 반드시 알린다. 조용히 사라지면 발행 후에 안다."""
    assert result["warnings"] == []


def test_slide_index_out_of_range(data):
    prs = pi.open_presentation(data)
    with pytest.raises(pi.PptxImportError):
        pi.convert_slide(prs, 99)
