# -*- coding: utf-8 -*-
"""덱 팔레트 드리프트 가드 (2단계) — 미리보기(PPTX)와 편집 캔버스가 같은 룩을 유지하도록 잠근다.

두 렌더러가 EVER-PEAK 팔레트를 각자 하드코딩한다:
  · PPTX 미리보기: server/deck/deck_builder.js  (LIGHT/DARK/cover)
  · 편집 캔버스   : src/import/deckToPages.ts    (LIGHT/DARK/COVER_L/COVER_D)
둘이 어긋나면 '미리보기 ≠ 캔버스' 버그가 재발한다. 이 테스트가 핵심 색을 대조해 실패시킨다.
(대소문자·'#' 차이는 정규화해서 비교.)
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
JS = HERE / "deck_builder.js"
TS = HERE.parent.parent / "src" / "import" / "deckToPages.ts"

fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


def norm(v):
    return (v or "").strip().lstrip("#").lower()


def block(text, name):
    """const <name> = { ... } 의 중괄호 블록 본문을 반환."""
    m = re.search(r"const\s+" + re.escape(name) + r"\s*=\s*\{", text)
    if not m:
        return ""
    i = m.end() - 1
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
    return ""


def field(blk, key):
    """key:"val" 또는 key:'val' 또는 key: '#val' 에서 값 추출(첫 매치)."""
    m = re.search(re.escape(key) + r"\s*:\s*['\"]([^'\"]*)['\"]", blk)
    return norm(m.group(1)) if m else None


js = JS.read_text(encoding="utf-8")
ts = TS.read_text(encoding="utf-8")

# ── deck_builder.js 값 ──
js_light = block(js, "LIGHT")
js_dark = block(js, "DARK")
# cover 서브블록: LIGHT/DARK 안의 cover:{...}
def cover_block(blk):
    m = re.search(r"cover\s*:\s*\{", blk)
    if not m:
        return ""
    i = m.end() - 1
    depth = 0
    for j in range(i, len(blk)):
        if blk[j] == "{":
            depth += 1
        elif blk[j] == "}":
            depth -= 1
            if depth == 0:
                return blk[i + 1:j]
    return ""
js_cov_l = cover_block(js_light)
js_cov_d = cover_block(js_dark)

# ── deckToPages.ts 값 ──
ts_light = block(ts, "LIGHT")
ts_dark = block(ts, "DARK")
ts_cov_l = block(ts, "COVER_L")
ts_cov_d = block(ts, "COVER_D")

# ── 대조 (deck_builder 키 → deckToPages 키) ──
# 본문 라이트
check(field(js_light, "ink") == field(ts_light, "ink") == "0f1b3d", "라이트 제목(ink) 동기화 = 0F1B3D")
check(field(js_light, "accent") == field(ts_light, "blue"), "라이트 강조(blue) 동기화")
check(field(js_light, "panel") == field(ts_light, "cardBg"), "라이트 카드면 동기화")
# 본문 다크
check(field(js_dark, "bg") == field(ts_dark, "pageBg"), "다크 페이지 배경 동기화")
check(field(js_dark, "accent") == field(ts_dark, "blue"), "다크 강조(blue) 동기화")
check(field(js_dark, "panel") == field(ts_dark, "cardBg"), "다크 카드면 동기화")
# 표지(네이비)
check(field(js_cov_l, "bg") == field(ts_cov_l, "pageBg") == "0f1b3d", "라이트 표지 배경 = 네이비 0F1B3D")
check(field(js_cov_d, "bg") == field(ts_cov_d, "pageBg"), "다크 표지 배경 동기화")
check(field(js_cov_l, "ink") == field(ts_cov_l, "ink") == "ffffff", "표지 글자 = 흰색")

# 값이 실제로 뽑혔는지(파싱 회귀 방지)
check(all([js_light, js_dark, js_cov_l, ts_light, ts_dark, ts_cov_l]), "두 파일 팔레트 블록 파싱됨")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}")
    print("→ deck_builder.js 와 deckToPages.ts 팔레트가 어긋났습니다. 둘을 같은 EVER-PEAK 값으로 맞추세요.")
    sys.exit(1)
print("\nALL PASS — 미리보기(PPTX)·편집 캔버스 팔레트 동기화 유지됨")
