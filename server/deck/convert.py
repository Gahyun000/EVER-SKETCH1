# -*- coding: utf-8 -*-
"""HTML → 편집 가능한 덱 PPTX(+PDF·썸네일). html_pdf_agent 변환 이식.

'HTML 가져오기' 버튼이 호출한다. extractor(범용 파서) → 덱 IR → deck_builder.js(pptxgenjs)
→ PPTX. LibreOffice(soffice)+PyMuPDF 가 있으면 PDF·슬라이드 썸네일까지 만든다(없으면 생략).
"""
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import pathlib

from .extractor import extract

HERE = pathlib.Path(__file__).resolve().parent
EB_ROOT = HERE.parent.parent                 # ebook_html 루트
DECK_BUILDER = HERE / "deck_builder.js"
MEASURE_B = HERE / "measure_b.py"            # 섹션 스크린샷(픽셀 페이지)용
NODE_MODULES = EB_ROOT / "node_modules"      # pptxgenjs 위치
OUT = EB_ROOT / "_deck_out"
OUT.mkdir(parents=True, exist_ok=True)

PX2IN = 7.5 / 1500.0
PT_PER_PX = 7.5 * 72 / 1500                  # 0.36


def _has_playwright() -> bool:
    try:
        import importlib.util
        return importlib.util.find_spec("playwright") is not None
    except Exception:
        return False


def _hex(css):
    m = re.findall(r"[\d.]+", css or "")
    if len(m) >= 3:
        return "%02X%02X%02X" % (int(float(m[0])), int(float(m[1])), int(float(m[2])))
    return "1C2433"


def _overlay(boxes):
    ov = []
    for b in boxes:
        runs = []
        for r in b["runs"]:
            if r.get("br"):
                runs.append({"t": "", "br": True}); continue
            if not r["t"]:
                continue
            runs.append({"t": r["t"], "color": _hex(r.get("color")),
                         "bold": int(r.get("weight", 400)) >= 600})
        if not runs:
            continue
        ov.append({"x": round(b["x"] * PX2IN, 3), "y": round(b["y"] * PX2IN, 3),
                   "w": round((b["w"] + 3) * PX2IN, 3), "h": round((b["h"] + 2) * PX2IN, 3),
                   "size": round(b["size"] * PT_PER_PX, 1), "align": b.get("align", "left"),
                   "runs": runs})
    return ov


def _augment_pixel(ir: dict, html: str, workdir: pathlib.Path, token: str) -> int:
    """mode=='pixel' 섹션에 글자없는 배경 PNG(서빙 URL)+편집 오버레이를 붙인다.
    실패하거나 playwright 가 없으면 조용히 건너뛴다 → 그 페이지는 네이티브 표로 폴백."""
    if not MEASURE_B.exists() or not _has_playwright():
        return 0
    try:
        src = workdir / "_src.html"
        src.write_text(html, encoding="utf-8")
        mdir = workdir / "_measure"
        subprocess.run([__import__("sys").executable, str(MEASURE_B), str(src), str(mdir)],
                       check=True, capture_output=True, text=True)
        md = json.load(open(mdir / "boxes.json", encoding="utf-8"))
        by_page = {}
        for b in md["boxes"]:
            by_page.setdefault(b["page"], []).append(b)
        sec_i = 0; n = 0
        for pg in ir["pages"]:
            if pg.get("type") != "section":
                continue
            unit = sec_i + 2                   # measure_b 유닛: [cover, toc, sec0, ...]
            if pg.get("mode") == "pixel":
                srcpng = mdir / ("bg_%d.png" % unit)
                if srcpng.exists():
                    dest = workdir / ("bg_%d.png" % unit)
                    shutil.copyfile(srcpng, dest)
                    pg["bgImagePath"] = str(dest.resolve())                 # node 빌드용(로컬 경로)
                    pg["bgImage"] = "/deck_out/%s/bg_%d.png" % (token, unit)  # 프론트 캔버스용(URL)
                    pg["overlay"] = _overlay(by_page.get(unit, []))
                    n += 1
            sec_i += 1
        return n
    except Exception:
        return 0


def _which(*names):
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    return None


def _find_soffice():
    p = _which("soffice", "libreoffice")
    if p:
        return p
    for c in ["/Applications/LibreOffice.app/Contents/MacOS/soffice",
              os.path.expanduser("~/Applications/LibreOffice.app/Contents/MacOS/soffice"),
              "/opt/homebrew/bin/soffice", "/usr/local/bin/soffice"]:
        if os.path.exists(c):
            return c
    return None


NODE = _which("node")
SOFFICE = _find_soffice()


def _slug(name: str) -> str:
    base = re.sub(r"\.html?$", "", name or "", flags=re.I)
    base = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", base).strip("_")
    return base[:60] or "deck"


def convert(html: str, theme: str, source_name: str, summarize_fn=None) -> dict:
    if NODE is None:
        raise RuntimeError("node 를 찾을 수 없습니다. run.command 로 실행하세요.")
    if not DECK_BUILDER.exists():
        raise RuntimeError("deck_builder.js 가 없습니다.")
    # summarize_fn(title, text)->{headline,bullets} 이 있으면 섹션을 성글게 요약(없으면 휴리스틱 압축).
    ir = extract(html, theme=("dark" if theme == "dark" else "light"),
                 title=source_name, summarize_fn=summarize_fn)
    base = _slug(source_name)
    token = time.strftime("%Y%m%d_%H%M%S") + "_" + secrets.token_hex(2)
    workdir = OUT / token
    workdir.mkdir(parents=True, exist_ok=True)

    _augment_pixel(ir, html, workdir, token)   # 픽셀 페이지: 배경 스샷 URL+오버레이(가능할 때)

    ir_path = workdir / "deck.ir.json"
    json.dump(ir, open(ir_path, "w", encoding="utf-8"), ensure_ascii=False)
    pptx = workdir / (base + ".pptx")
    env = dict(os.environ)
    env["NODE_PATH"] = str(NODE_MODULES)
    r = subprocess.run([NODE, str(DECK_BUILDER), str(ir_path), str(pptx)],
                       capture_output=True, text=True, env=env)
    if r.returncode != 0 or not pptx.exists():
        raise RuntimeError("덱 빌드 실패: " + (r.stderr or r.stdout or "")[-400:])

    result = {"token": token, "pptx": pptx.name, "pdf": None, "thumbs": [],
              "pages": len(ir["pages"]), "ir": ir}

    if SOFFICE:
        try:
            import fitz  # PyMuPDF
            tmp = tempfile.mkdtemp(prefix="deck_")
            tp = f"{tmp}/{base}.pptx"
            shutil.copyfile(pptx, tp)
            subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", tmp, tp],
                           capture_output=True, text=True)
            pdf = f"{tmp}/{base}.pdf"
            if os.path.exists(pdf):
                shutil.copyfile(pdf, workdir / (base + ".pdf"))
                result["pdf"] = base + ".pdf"
                doc = fitz.open(pdf)
                for i, page in enumerate(doc, 1):
                    pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6))   # 캔버스 표시용 고해상
                    fn = "%02d.png" % i
                    pix.save(str(workdir / fn))
                    result["thumbs"].append(fn)
                doc.close()
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass

    return result


def convert_stream(html: str, theme: str, source_name: str, summarize_fn=None):
    """convert 의 스트리밍판 — 진행 이벤트를 순서대로 yield 한다(SSE 로 그대로 흘려보냄).
    이벤트: extract/build/pdf/render(슬라이드별)/warn/done/error. done.result 는 프론트가 쓸 최종 형태.
    """
    if NODE is None:
        yield {"stage": "error", "error": "node 를 찾을 수 없습니다. run.command 로 실행하세요."}
        return
    if not DECK_BUILDER.exists():
        yield {"stage": "error", "error": "deck_builder.js 가 없습니다."}
        return

    yield {"stage": "extract", "pct": 6, "msg": "HTML을 분석하고 있어요"}
    try:
        ir = extract(html, theme=("dark" if theme == "dark" else "light"),
                     title=source_name, summarize_fn=summarize_fn)
    except Exception as e:  # noqa: BLE001
        yield {"stage": "error", "error": "분석 실패: %s" % e}
        return

    total = len(ir["pages"])
    base = _slug(source_name)
    token = time.strftime("%Y%m%d_%H%M%S") + "_" + secrets.token_hex(2)
    workdir = OUT / token
    workdir.mkdir(parents=True, exist_ok=True)
    npix = _augment_pixel(ir, html, workdir, token)   # 픽셀 페이지 배경 스샷+오버레이(가능할 때)
    json.dump(ir, open(workdir / "deck.ir.json", "w", encoding="utf-8"), ensure_ascii=False)

    yield {"stage": "build", "pct": 24, "pages": total,
           "msg": "%d장 구성 완료 · 슬라이드 빌드 중%s" % (total, (" · 픽셀 %d장" % npix) if npix else "")}
    pptx = workdir / (base + ".pptx")
    env = dict(os.environ)
    env["NODE_PATH"] = str(NODE_MODULES)
    r = subprocess.run([NODE, str(DECK_BUILDER), str(workdir / "deck.ir.json"), str(pptx)],
                       capture_output=True, text=True, env=env)
    if r.returncode != 0 or not pptx.exists():
        yield {"stage": "error", "error": "덱 빌드 실패: " + (r.stderr or r.stdout or "")[-300:]}
        return

    result = {"ok": True, "pages": total, "ir": ir, "thumbs": [],
              "pptx_url": "/deck_out/%s/%s" % (token, pptx.name), "pdf_url": None}

    if not SOFFICE:
        yield {"stage": "done", "pct": 100, "msg": "완료(미리보기 렌더 없음)", "result": result}
        return

    yield {"stage": "pdf", "pct": 40, "msg": "PDF로 변환하는 중"}
    try:
        import fitz  # PyMuPDF
        tmp = tempfile.mkdtemp(prefix="deck_")
        tp = f"{tmp}/{base}.pptx"
        shutil.copyfile(pptx, tp)
        subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", tmp, tp],
                       capture_output=True, text=True)
        pdf = f"{tmp}/{base}.pdf"
        if os.path.exists(pdf):
            shutil.copyfile(pdf, workdir / (base + ".pdf"))
            result["pdf_url"] = "/deck_out/%s/%s.pdf" % (token, base)
            doc = fitz.open(pdf)
            P = doc.page_count or total or 1
            for i, page in enumerate(doc, 1):
                pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6))
                fn = "%02d.png" % i
                pix.save(str(workdir / fn))
                url = "/deck_out/%s/%s" % (token, fn)
                result["thumbs"].append(url)
                pct = 45 + int(53 * i / max(1, P))
                yield {"stage": "render", "pct": pct, "i": i, "total": P, "thumb": url,
                       "msg": "슬라이드 렌더링 %d/%d" % (i, P)}
            doc.close()
        shutil.rmtree(tmp, ignore_errors=True)
    except Exception as e:  # noqa: BLE001
        yield {"stage": "warn", "msg": "미리보기 렌더 생략: %s" % e}

    yield {"stage": "done", "pct": 100, "msg": "완료", "result": result}
