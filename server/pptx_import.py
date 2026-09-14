"""PPTX → 편집 가능한 페이지 변환기.

무엇을 하는가
    임원회의 실물 PPT 를 올리면 슬라이드 한 장을 `Page`(src/state/store.ts) 한 장으로
    바꾼다. **이미지로 굽지 않는다.** 표는 표로, 글상자는 글상자로 들어와야
    작성자가 그 자리에서 고칠 수 있다. 그게 이 제품의 존재 이유다.

왜 '실물 그대로'인가
    기존 정본 v1.0 은 내가 상상한 양식이었다. 실물은 로드맵이 18열이고,
    진행 구간을 4색 칠이 아니라 **가로 병합 + 단계 이름**으로 표시한다.
    양식을 우리 쪽에 맞추라고 하면 임원 20명이 각자 자기 파일을 고쳐야 한다.
    그래서 반대로 우리가 실물을 읽는다.

무엇을 못 하는가 (조용히 버리지 않고 warnings 로 알린다)
    - 도형 연결선·화살표 커넥터
    - 차트·스마트아트 (그림으로도 안 들어온다)
    - 그라데이션·이미지 채우기 (단색만 가져온다)
    - 테마 색 참조 (RGB 로 지정된 색만 가져온다)
"""
from __future__ import annotations

import base64
import io
import zipfile
from dataclasses import dataclass, field
from typing import Optional

from server.template_seed import PAGE_H, PAGE_W

# ── 업로드 검증 상수 (UDS-107 §6) ──────────────────────────
MAX_UPLOAD_BYTES = 30 * 1024 * 1024        # 30MB — 임원 1인 자료로 충분하고도 남는다
MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024  # 압축 폭탄 방어 (압축비 10배까지 허용)
MAX_ZIP_ENTRIES = 5000
MAX_SLIDES = 60
MAX_IMAGE_BYTES = 4 * 1024 * 1024          # 이 크기를 넘는 그림은 넣지 않는다(문서가 못 열릴 만큼 무거워진다)
ZIP_MAGIC = b"PK\x03\x04"
ALLOWED_SUFFIX = ".pptx"

# 변환기 판. **변환 결과가 달라지는 수정을 하면 반드시 올린다.**
#
# 왜 필요한가: 표 크기·표지 배경·제목 뽑기를 고쳤는데, 화면에는 예전에 변환된
# 자료가 그대로 떠 있었다. 고쳤다고 말했는데 사용자 눈에는 똑같이 보였고,
# 사용자도 나도 무엇이 잘못됐는지 알 수 없었다. 판을 남겨두면 화면이 말해 준다.
#
#   v1.0  최초
#   v1.1  표 크기를 행·열 합에서 계산(도형에 적힌 ext 는 자주 낡아 있다)
#         슬라이드 번호·바닥글 자리표시자 제외
#   v1.2  슬라이드 배경(단색·그림) 가져오기, 슬라이드 제목은 가장 위 글자
#   v1.3  레이아웃·마스터의 장식 도형 가져오기(제목 뒤 색 띠 등).
#         이게 없으면 흰 제목이 흰 종이 위에서 사라진다.
CONVERTER_VERSION = "v1.3"

EMU_PER_PT = 12700
DEFAULT_FONT_PT = 11.0


class PptxImportError(ValueError):
    """사용자에게 그대로 보여줄 수 있는 문구만 담는다."""


class PptxDependencyError(PptxImportError):
    """읽기 모듈이 서버에 없다 — **올린 파일 잘못이 아니다.**

    이걸 PptxImportError 와 구분하는 이유: 400(당신 파일이 잘못됐다)으로 답하면
    사용자는 멀쩡한 파일을 몇 번씩 다시 저장해 보게 된다. 실제로는 서버를 고쳐야 한다.
    """


@dataclass
class SlideConversion:
    page: dict
    warnings: list[str] = field(default_factory=list)


# ── 1. 업로드 검증 ────────────────────────────────────────
def validate_upload(filename: str, data: bytes) -> None:
    """받은 파일이 정말 pptx 인지 **열기 전에** 확인한다.

    확장자만 믿으면 안 된다. 확장자는 올리는 쪽이 마음대로 붙인다.
    매직 넘버·압축 해제 크기·필수 파트까지 본 다음에야 python-pptx 에 넘긴다.
    """
    name = (filename or "").strip()
    if not name.lower().endswith(ALLOWED_SUFFIX):
        raise PptxImportError("PowerPoint 파일(.pptx)만 올릴 수 있습니다.")
    if not data:
        raise PptxImportError("빈 파일입니다.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise PptxImportError(
            "파일이 너무 큽니다 — 최대 %dMB 입니다 (올린 파일 %.1fMB)."
            % (MAX_UPLOAD_BYTES // (1024 * 1024), len(data) / 1024 / 1024))
    if not data.startswith(ZIP_MAGIC):
        raise PptxImportError("PowerPoint 파일이 아닙니다. 확장자만 .pptx 로 바뀐 파일 같습니다.")

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise PptxImportError("파일이 손상되어 열 수 없습니다.")
    with zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise PptxImportError("파일 구성이 비정상적으로 복잡합니다. 다른 이름으로 저장한 뒤 다시 올려 주세요.")
        total = 0
        for info in infos:
            # 경로 탈출(zip slip) — 우리는 풀지 않지만, 이런 파일은 정상 pptx 가 아니다.
            if info.filename.startswith("/") or ".." in info.filename.split("/"):
                raise PptxImportError("파일 구성이 비정상적입니다. 원본에서 다시 저장해 주세요.")
            total += info.file_size
            if total > MAX_UNCOMPRESSED_BYTES:
                raise PptxImportError("압축을 풀면 너무 커지는 파일입니다. 원본에서 다시 저장해 주세요.")
        names = {i.filename for i in infos}
        if "[Content_Types].xml" not in names or "ppt/presentation.xml" not in names:
            raise PptxImportError("PowerPoint 파일이 아닙니다(프레젠테이션 정보가 없습니다).")


def open_presentation(data: bytes):
    # 무거운 의존성 — 검증을 통과한 뒤에만 부른다.
    # **없을 때 그냥 터뜨리면 화면에는 'HTTP 500' 만 뜬다.** 무엇이 잘못됐는지
    # 알 수 없어서, 사용자는 멀쩡한 파일을 계속 다시 올려 보게 된다.
    # (가입이 통째로 막혔을 때 원인을 감췄던 것과 같은 실수다.)
    try:
        from pptx import Presentation
    except ImportError as e:
        raise PptxDependencyError(
            "서버에 PowerPoint 읽기 모듈(python-pptx)이 설치돼 있지 않습니다. "
            "서버에서 다음을 실행한 뒤 다시 시도해 주세요: "
            "server/.venv/bin/pip install python-pptx  (%s)" % e)
    try:
        prs = Presentation(io.BytesIO(data))
    except Exception:
        raise PptxImportError("파일을 열지 못했습니다. PowerPoint 에서 다시 저장한 뒤 올려 주세요.")
    n = len(prs.slides)
    if n == 0:
        raise PptxImportError("슬라이드가 없는 파일입니다.")
    if n > MAX_SLIDES:
        raise PptxImportError("슬라이드가 너무 많습니다 — 최대 %d장입니다 (올린 파일 %d장)." % (MAX_SLIDES, n))
    return prs


# ── 2. 좌표 변환 ──────────────────────────────────────────
class Frame:
    """슬라이드(EMU) → 페이지(px) 좌표 변환.

    가로세로 비율이 다르면 **꽉 채우지 않고 가운데에 맞춰 넣는다.**
    비율을 무시하고 늘리면 표 칸이 찌그러지고 글자가 눌린다.
    """

    def __init__(self, slide_w: int, slide_h: int,
                 page_w: int = PAGE_W, page_h: int = PAGE_H):
        if slide_w <= 0 or slide_h <= 0:
            raise PptxImportError("슬라이드 크기를 읽지 못했습니다.")
        self.scale = min(page_w / slide_w, page_h / slide_h)
        self.off_x = (page_w - slide_w * self.scale) / 2
        self.off_y = (page_h - slide_h * self.scale) / 2

    def x(self, emu: int) -> int:
        return int(round(self.off_x + (emu or 0) * self.scale))

    def y(self, emu: int) -> int:
        return int(round(self.off_y + (emu or 0) * self.scale))

    def size(self, emu: int) -> int:
        return max(1, int(round((emu or 0) * self.scale)))

    def page_box(self, slide_w: int, slide_h: int) -> tuple[int, int, int, int]:
        """슬라이드가 종이에서 차지하는 사각형(배경을 깔 자리)."""
        return (int(round(self.off_x)), int(round(self.off_y)),
                max(1, int(round(slide_w * self.scale))),
                max(1, int(round(slide_h * self.scale))))

    def font(self, pt: Optional[float]) -> float:
        """포인트 → 화면 px. 원본 글자 크기 비율이 유지된다."""
        p = DEFAULT_FONT_PT if pt is None else float(pt)
        return round(p * EMU_PER_PT * self.scale, 1)


# ── 3. 색·글꼴 뽑기 ───────────────────────────────────────
def _rgb(color_fmt) -> Optional[str]:
    """단색 RGB 만 '#RRGGBB' 로. 테마 색·그라데이션은 None(원래 색을 지어내지 않는다)."""
    try:
        rgb = color_fmt.rgb
    except Exception:
        return None
    if rgb is None:
        return None
    s = str(rgb).upper()
    return "#" + s if len(s) == 6 else None


def _solid_fill(shape_or_cell) -> Optional[str]:
    from pptx.enum.dml import MSO_FILL_TYPE
    try:
        fill = shape_or_cell.fill
        if fill.type != MSO_FILL_TYPE.SOLID:
            return None
        return _rgb(fill.fore_color)
    except Exception:
        return None


def _first_run(tf):
    for para in tf.paragraphs:
        for run in para.runs:
            return run
    return None


def _font_of(tf) -> tuple[Optional[float], bool, Optional[str]]:
    """(pt, bold, color) — 첫 글자 기준. 한 상자 안에서 크기가 섞이면 가장 큰 값을 쓴다."""
    biggest = None
    bold = False
    color = None
    run = _first_run(tf)
    if run is not None:
        bold = bool(run.font.bold)
        color = _rgb(run.font.color)
    for para in tf.paragraphs:
        for r in para.runs:
            sz = r.font.size
            if sz is not None:
                pt = sz.pt
                if biggest is None or pt > biggest:
                    biggest = pt
    return biggest, bold, color


_ALIGN = {1: "center", 2: "right", 3: "left"}   # PP_ALIGN CENTER/RIGHT/JUSTIFY


def _align_of(tf) -> Optional[str]:
    from pptx.enum.text import PP_ALIGN
    for para in tf.paragraphs:
        a = para.alignment
        if a is None:
            continue
        if a == PP_ALIGN.CENTER:
            return "center"
        if a == PP_ALIGN.RIGHT:
            return "right"
        if a == PP_ALIGN.LEFT:
            return "left"
    return None


def _norm_sizes(values: list[int]) -> list[float]:
    """EMU 크기 배열 → 가장 좁은 칸을 1 로 두는 비율.

    EMU 원값을 그대로 넣으면 CSS 트랙이 '1051560fr 1234440fr …' 이 된다.
    값은 맞지만 사람이 열어 보고 고칠 수 없는 숫자다. 비율만 남긴다.
    """
    base = min(values)
    if base <= 0:
        return []
    return [round(v / base, 3) for v in values]


# ── 4. 표 ────────────────────────────────────────────────
def table_to_el(shape, fr: Frame, el_id: int, warnings: list[str]) -> dict:
    tbl = shape.table
    R, C = len(tbl.rows), len(tbl.columns)
    cells = [["" for _ in range(C)] for _ in range(R)]
    merges: list[dict] = []
    cbg: dict[str, str] = {}
    calign: dict[str, str] = {}
    sizes: list[float] = []

    for r in range(R):
        for c in range(C):
            cell = tbl.cell(r, c)
            # 병합에 덮인 칸은 값이 없다. 앵커(origin)에만 글자와 색이 있다.
            if getattr(cell, "is_spanned", False):
                continue
            if getattr(cell, "is_merge_origin", False):
                rs, cs = cell.span_height, cell.span_width
                if rs > 1 or cs > 1:
                    merges.append({"r": r, "c": c, "rs": rs, "cs": cs})
            cells[r][c] = (cell.text or "").strip()
            bg = _solid_fill(cell)
            if bg:
                cbg["%d_%d" % (r, c)] = bg
            tf = cell.text_frame
            al = _align_of(tf)
            if al:
                calign["%d_%d" % (r, c)] = al
            pt, _bold, _color = _font_of(tf)
            if pt:
                sizes.append(pt)

    # 열 너비·행 높이는 EMU 값을 **비율 그대로** 쓴다(sizeTracks 가 fr 트랙으로 편다).
    colw = [int(col.width or 0) for col in tbl.columns]
    rowh = [int(row.height or 0) for row in tbl.rows]
    if any(v <= 0 for v in colw):
        colw = []
        warnings.append("표의 열 너비를 읽지 못해 균등 분할로 넣었습니다.")
    if any(v <= 0 for v in rowh):
        rowh = []

    # 글자 크기는 표 안에서 가장 흔한 크기가 아니라 **가장 작은 크기**를 쓴다.
    # 큰 쪽에 맞추면 촘촘한 칸의 글자가 칸을 넘쳐 잘린다.
    fs = fr.font(min(sizes) if sizes else None)

    # 표의 크기는 **행·열 크기의 합**에서 구한다. 도형에 적힌 크기(graphicFrame 의
    # a:ext)는 표에서 자주 낡아 있다 — PowerPoint 는 표를 그릴 때 행·열 크기에서
    # 매번 다시 계산하므로 파일에 적힌 ext 를 갱신하지 않는 경우가 많다.
    #
    # 실제로 이걸로 사고가 났다. 임원회의 실물 파일을 올렸더니 표 3개가 전부
    # w=315 h=315 인 똑같은 정사각형으로 들어왔다(글상자는 멀쩡했다). 위치(a:off)는
    # 맞고 크기만 낡은 값이었다. 받는 사람은 열 때마다 표를 손으로 늘려야 했다.
    sum_w, sum_h = sum(colw), sum(rowh)
    w = fr.size(sum_w) if sum_w > 0 else fr.size(shape.width)
    h = fr.size(sum_h) if sum_h > 0 else fr.size(shape.height)

    el = {
        "id": el_id, "type": "table",
        "x": fr.x(shape.left), "y": fr.y(shape.top),
        "w": w, "h": h,
        "text": "", "color": "transparent", "fs": fs,
        "rows": R, "cols": C, "cells": cells,
        "merges": merges, "calign": calign, "cbg": cbg,
        "headRow": False,     # 어느 행이 머리글인지는 실물에서 색으로만 구분된다 — 지어내지 않는다
    }
    if colw:
        el["colw"] = _norm_sizes(colw)
    if rowh:
        el["rowh"] = _norm_sizes(rowh)
    return el


# ── 5. 그림·글상자 ────────────────────────────────────────
def picture_to_el(shape, fr: Frame, el_id: int, warnings: list[str]) -> Optional[dict]:
    try:
        image = shape.image
        blob = image.blob
        ctype = image.content_type or "image/png"
    except Exception:
        warnings.append("그림 하나를 읽지 못해 건너뛰었습니다.")
        return None
    if len(blob) > MAX_IMAGE_BYTES:
        warnings.append("그림 하나가 너무 커서(%.1fMB) 넣지 않았습니다."
                        % (len(blob) / 1024 / 1024))
        return None
    src = "data:%s;base64,%s" % (ctype, base64.b64encode(blob).decode("ascii"))
    return {
        "id": el_id, "type": "image",
        "x": fr.x(shape.left), "y": fr.y(shape.top),
        "w": fr.size(shape.width), "h": fr.size(shape.height),
        "text": "", "color": "transparent", "fs": 12, "src": src,
    }


def text_to_el(shape, fr: Frame, el_id: int) -> Optional[dict]:
    tf = shape.text_frame
    text = (tf.text or "").strip()
    fill = _solid_fill(shape)
    if not text and not fill:
        return None          # 빈 자리표시자 — 넣어봐야 클릭만 방해한다
    pt, bold, color = _font_of(tf)
    el = {
        "id": el_id, "type": "box" if fill else "text",
        "x": fr.x(shape.left), "y": fr.y(shape.top),
        "w": fr.size(shape.width), "h": fr.size(shape.height),
        "text": text, "color": fill or "transparent", "fs": fr.font(pt),
        "bold": bold,
    }
    al = _align_of(tf)
    if al:
        el["align"] = al
    if color:
        el["tcolor"] = color
    return el


# ── 6. 슬라이드 한 장 ─────────────────────────────────────
def _walk(shapes, fr: Frame, out: list[dict], warnings: list[str], next_id,
          chrome: bool = False) -> None:
    """`chrome=True` 면 레이아웃·마스터에서 가져온 장식이다 — 잠가서 넣는다.

    자리표시자는 건너뛴다. 레이아웃의 자리표시자에는 '마스터 제목 스타일 편집'
    같은 안내 문구가 들어 있어서, 옮기면 종이에 그 글자가 그대로 찍힌다.
    """
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    for shape in shapes:
        if chrome and getattr(shape, "is_placeholder", False):
            continue
        st = shape.shape_type
        if st == MSO_SHAPE_TYPE.GROUP:
            _walk(shape.shapes, fr, out, warnings, next_id, chrome)
            continue
        if getattr(shape, "has_table", False):
            out.append(table_to_el(shape, fr, next_id(), warnings))
            continue
        if getattr(shape, "has_chart", False):
            warnings.append("차트는 아직 가져오지 못합니다 — 그림으로 붙여 주세요.")
            continue
        if st == MSO_SHAPE_TYPE.PICTURE:
            el = picture_to_el(shape, fr, next_id(), warnings)
            if el:
                if chrome:
                    el["locked"] = True
                out.append(el)
            continue
        if st == MSO_SHAPE_TYPE.LINE or shape.__class__.__name__ == "Connector":
            warnings.append("연결선 하나는 가져오지 않았습니다.")
            continue
        if _is_chrome_placeholder(shape):
            # 슬라이드 번호(‹#›)·바닥글·날짜 자리표시자. PowerPoint 가 자동으로
            # 채우는 값이라 옮겨봐야 '#' 같은 기호만 종이 한복판에 떠 있게 된다.
            continue
        if getattr(shape, "has_text_frame", False):
            el = text_to_el(shape, fr, next_id())
            if el:
                if chrome:
                    el["locked"] = True
                out.append(el)
            continue
        if chrome:
            continue        # 장식은 못 가져와도 경고하지 않는다 — 본문이 아니다
        warnings.append("가져오지 못한 개체가 있습니다(%s)." % (st,))


def _background_of(owner) -> Optional[dict]:
    """슬라이드/레이아웃/마스터의 배경. 못 읽으면 None(색을 지어내지 않는다).

    python-pptx 에 배경을 바로 주는 API 가 없어서 XML 을 직접 본다.
    테마 참조(p:bgRef)는 건너뛴다 — 테마 색표를 따라가야 하는데, 잘못 따라가서
    엉뚱한 색을 칠하느니 안 칠하는 편이 낫다(그건 경고로 알린다).
    """
    from pptx.oxml.ns import qn

    try:
        csld = owner._element.find(qn("p:cSld"))
        if csld is None:
            return None
        bg = csld.find(qn("p:bg"))
        if bg is None:
            return None
        bgpr = bg.find(qn("p:bgPr"))
        if bgpr is None:
            return None
        solid = bgpr.find(qn("a:solidFill"))
        if solid is not None:
            srgb = solid.find(qn("a:srgbClr"))
            if srgb is not None and srgb.get("val"):
                return {"color": "#" + srgb.get("val").upper()}
        blip_fill = bgpr.find(qn("a:blipFill"))
        if blip_fill is not None:
            blip = blip_fill.find(qn("a:blip"))
            rid = blip.get(qn("r:embed")) if blip is not None else None
            if rid:
                part = owner.part.related_part(rid)
                return {"image": part.blob, "ctype": part.content_type or "image/png"}
    except Exception:
        return None
    return None


def slide_background(slide) -> Optional[dict]:
    """슬라이드 → 레이아웃 → 마스터 순으로 배경을 찾는다."""
    layout = getattr(slide, "slide_layout", None)
    master = getattr(layout, "slide_master", None) if layout is not None else None
    for owner in (slide, layout, master):
        if owner is None:
            continue
        found = _background_of(owner)
        if found:
            return found
    return None


def _is_chrome_placeholder(shape) -> bool:
    """슬라이드 번호·바닥글·날짜 자리표시자인가."""
    from pptx.enum.shapes import PP_PLACEHOLDER

    try:
        if not shape.is_placeholder:
            return False
        return shape.placeholder_format.type in (
            PP_PLACEHOLDER.SLIDE_NUMBER, PP_PLACEHOLDER.FOOTER, PP_PLACEHOLDER.DATE)
    except Exception:
        return False


def convert_slide(prs, index: int, page_id: int = 1) -> SlideConversion:
    """슬라이드 1장 → Page 1장."""
    slides = list(prs.slides)
    if not (0 <= index < len(slides)):
        raise PptxImportError("%d번째 슬라이드가 없습니다." % (index + 1))
    fr = Frame(prs.slide_width, prs.slide_height)
    warnings: list[str] = []
    els: list[dict] = []

    counter = {"n": 200000}

    def next_id() -> int:
        counter["n"] += 1
        return counter["n"]

    slide = slides[index]

    # 레이아웃·마스터의 장식을 **먼저** 넣는다 — PowerPoint 가 그리는 순서와 같다
    # (마스터 → 레이아웃 → 슬라이드). 여기 있는 색 띠가 제목 뒤를 받친다.
    #
    # 이걸 빼먹어서 흰 제목이 흰 종이 위에서 통째로 사라졌다. 글자는 멀쩡히
    # 들어와 있었고(tcolor=#FFFFFF), 뒤를 받치던 띠만 없었다.
    chrome_count = 0
    if _shows_master_shapes(slide):
        layout = getattr(slide, "slide_layout", None)
        master = getattr(layout, "slide_master", None) if layout is not None else None
        for owner in (master, layout):
            if owner is None:
                continue
            before = len(els)
            try:
                _walk(owner.shapes, fr, els, warnings, next_id, chrome=True)
            except Exception:
                pass        # 장식을 못 읽는다고 본문까지 못 가져오면 안 된다
            chrome_count += len(els) - before

    _walk(slide.shapes, fr, els, warnings, next_id)
    if not els:
        warnings.append("가져올 내용이 없는 슬라이드입니다.")

    # 배경을 안 가져오면 **표지의 흰 글자가 흰 종이 위에서 사라진다.**
    # 실제로 그랬다 — 표지 제목(tcolor #FFFFFF)이 통째로 안 보였다.
    page_bg = ""
    bg = slide_background(slide)
    if bg and bg.get("color"):
        page_bg = bg["color"]
    elif bg and bg.get("image"):
        blob = bg["image"]
        if len(blob) > MAX_IMAGE_BYTES:
            warnings.append("배경 그림이 너무 커서(%.1fMB) 넣지 않았습니다."
                            % (len(blob) / 1024 / 1024))
        else:
            x, y, w, h = fr.page_box(prs.slide_width, prs.slide_height)
            els.insert(0, {          # 맨 앞 = 가장 아래에 깔린다
                "id": next_id(), "type": "image",
                "x": x, "y": y, "w": w, "h": h,
                "text": "", "color": "transparent", "fs": 12,
                "src": "data:%s;base64,%s" % (bg["ctype"],
                                              base64.b64encode(blob).decode("ascii")),
                "locked": True,      # 배경은 실수로 끌려다니면 안 된다
            })

    # 배경을 못 가져왔는데 흰 글자가 있으면 그 글자는 화면에서 사라진다.
    # 조용히 두면 "글자가 없어졌다" 로만 보인다 — 무엇이 일어났는지 말해 준다.
    if _is_pale(page_bg or "#FFFFFF") and not (bg and bg.get("image")) and chrome_count == 0:
        if any(_is_pale(e.get("tcolor")) for e in els if e["type"] in ("text", "box")):
            warnings.append(
                "배경을 가져오지 못했습니다. 흰색 글자가 흰 종이 위에서 보이지 않을 수 있습니다 "
                "— 글자색을 바꾸거나 배경을 직접 넣어 주세요.")

    page = {
        "id": page_id, "cardKey": "slide", "fields": {}, "free": True,
        "els": els, "conns": [], "strokes": [], "blocks": [],
        "bg": page_bg, "role": "content",
    }
    return SlideConversion(page=page, warnings=_dedupe(warnings))


def _shows_master_shapes(slide) -> bool:
    """슬라이드가 '배경 그래픽 숨기기' 로 설정돼 있으면 장식을 넣지 않는다."""
    try:
        return slide._element.get("showMasterSp") not in ("0", "false")
    except Exception:
        return True


def _is_pale(hexs: Optional[str]) -> bool:
    """흰 종이 위에서 사라질 만큼 밝은 글자색인가."""
    if not hexs or len(hexs) != 7 or hexs[0] != "#":
        return False
    try:
        r, g, b = (int(hexs[i:i + 2], 16) for i in (1, 3, 5))
    except ValueError:
        return False
    return (0.299 * r + 0.587 * g + 0.114 * b) > 226


def _dedupe(items: list[str]) -> list[str]:
    seen, out = set(), []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


# ── 7. 슬라이드 목록 (불러오기 미리보기용) ────────────────
def slide_infos(prs) -> list[dict]:
    """불러온 파일에서 어느 슬라이드를 쓸지 고르는 화면에 쓸 요약.

    제목은 자리표시자(title)를 우선 쓰고, 없으면 가장 위에 있는 글자를 쓴다.
    """
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    out = []
    for i, slide in enumerate(prs.slides):
        title = ""
        try:
            if slide.shapes.title is not None:
                title = (slide.shapes.title.text or "").strip()
        except Exception:
            title = ""
        tables = texts = images = 0
        best_y = None
        best_text = ""
        for shape in slide.shapes:
            if getattr(shape, "has_table", False):
                tables += 1
            elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                images += 1
            elif getattr(shape, "has_text_frame", False):
                # 슬라이드 번호(‹#›)·바닥글은 제목 후보가 아니다.
                if _is_chrome_placeholder(shape):
                    continue
                t = (shape.text_frame.text or "").strip()
                if t:
                    texts += 1
                    # **가장 위에 있는 글자**를 고른다.
                    # 예전에는 조건이 `if not title and ...` 이라, 맨 처음 만난 글자가
                    # 제목으로 굳어 버렸다. 도형 순서는 위치 순이 아니어서, 아래쪽에 있는
                    # 슬라이드 번호가 첫 도형이면 제목이 '‹#›' 이 됐다 — 실제로 그랬다.
                    if best_y is None or (shape.top or 0) < best_y:
                        best_y = shape.top or 0
                        best_text = t.splitlines()[0][:60]
        out.append({
            "index": i,
            "title": title or best_text or "슬라이드 %d" % (i + 1),
            "tables": tables, "texts": texts, "images": images,
        })
    return out


def pptx_to_pages(data: bytes, filename: str = "upload.pptx") -> dict:
    """검증 → 열기 → 전 슬라이드 변환. 라우터가 쓰는 한 줄짜리 입구."""
    validate_upload(filename, data)
    prs = open_presentation(data)
    pages, warnings = [], []
    for i in range(len(prs.slides)):
        conv = convert_slide(prs, i, page_id=i + 1)
        pages.append(conv.page)
        warnings.extend(conv.warnings)
    return {
        "pages": pages,
        "slides": slide_infos(prs),
        "warnings": _dedupe(warnings),
        "slide_size": {"w": prs.slide_width, "h": prs.slide_height},
    }
