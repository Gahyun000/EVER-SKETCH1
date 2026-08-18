# -*- coding: utf-8 -*-
"""자동선택 하이브리드 드라이버(기존 convert.py 무훼손 · 실험용 병행 경로).

extractor 의 page.mode(리치밀도 기반)를 따른다:
  · mode == 'native' → deck_builder.js 가 네이티브 카드/표로 렌더(가볍고 완전편집).
  · mode == 'pixel'  → 그 섹션 HTML을 3:4 스크린샷으로 떠 배경에 깔고, 편집 텍스트를
                       오버레이(pg.bgImage + pg.overlay)해 deck_builder 의 pixelSlide 로 렌더.
표지·목차는 항상 네이티브. 임계값은 extractor.RICH_THRESH(색태그·코드칩·표셀 가중).

경로 계약은 convert.py 와 동일: HERE=server/deck, EB_ROOT=ebook_html, node_modules=EB_ROOT.
사용: python server/deck/convert_hybrid.py <src.html> <out.pptx>
"""
import sys, os, json, subprocess, re, pathlib

HERE = pathlib.Path(__file__).resolve().parent      # server/deck
EB_ROOT = HERE.parent.parent                        # ebook_html
sys.path.insert(0, str(HERE))
from extractor import extract                        # 같은 폴더

NODE_MODULES = EB_ROOT / "node_modules"
DECK = HERE / "deck_builder.js"
MEASURE_B = HERE / "measure_b.py"
NODE = __import__("shutil").which("node") or "node"
PX2IN = 7.5 / 1500.0
PT_PER_PX = 7.5 * 72 / 1500                          # 0.36


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


def build_hybrid(src_html_path, out_pptx, title="문서", theme="light"):
    html = open(src_html_path, encoding="utf-8").read()
    ir = extract(html, theme, title)

    mdir = EB_ROOT / "_deck_out" / "_measure_tmp"
    subprocess.run([sys.executable, str(MEASURE_B), src_html_path, str(mdir)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    md = json.load(open(mdir / "boxes.json", encoding="utf-8"))
    by_page = {}
    for b in md["boxes"]:
        by_page.setdefault(b["page"], []).append(b)

    sec_i = 0; log = []
    for pg in ir["pages"]:
        if pg["type"] != "section":
            continue
        unit = sec_i + 2                               # measure_b 유닛: [cover,toc,sec0,...]
        if pg.get("mode") == "pixel":
            bg = (mdir / ("bg_%d.png" % unit)).resolve()
            if bg.exists():
                pg["bgImage"] = str(bg)
                pg["overlay"] = _overlay(by_page.get(unit, []))
                log.append((pg["markN"], "B·픽셀", pg.get("dense", 0)))
            else:
                log.append((pg["markN"], "A(bg없음)", pg.get("dense", 0)))
        else:
            log.append((pg["markN"], "A·네이티브", pg.get("dense", 0)))
        sec_i += 1

    ir_path = pathlib.Path(out_pptx).with_suffix(".ir.json")
    json.dump(ir, open(ir_path, "w", encoding="utf-8"), ensure_ascii=False)
    env = dict(os.environ); env["NODE_PATH"] = str(NODE_MODULES)
    r = subprocess.run([NODE, str(DECK), str(ir_path), str(out_pptx)], env=env,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("덱 빌드 실패: " + (r.stderr or r.stdout)[-400:])
    return {"pptx": str(out_pptx), "pages": len(ir["pages"]), "log": log,
            "stdout": r.stdout.strip()}


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    res = build_hybrid(src, out, title=os.path.splitext(os.path.basename(src))[0])
    print(res["stdout"])
    for m, mode, d in res["log"]:
        print("  %-4s → %-10s (dense %2d)" % (m, mode, d))
