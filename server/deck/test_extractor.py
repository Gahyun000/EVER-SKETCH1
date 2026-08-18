# -*- coding: utf-8 -*-
"""덱 변환기 밀도 정리 검증 — extractor 자동 압축(휴리스틱) + LLM 요약(mock)."""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import extractor as ex  # noqa: E402

fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


HTML = """<!doctype html><html><head><title>솔루션 상세</title></head><body>
<h1>솔루션 상세</h1><p class="lede">제조 현장의 흩어진 데이터를 하나의 흐름으로 모아 품질·설비·경영 전 영역에서 사람의 판단을 돕는 실행형 AI 에이전트를 제공하며 이미 보유한 자산으로 시작해 검증된 범위만 넓힙니다</p>
<h2>제조 현장의 활용 분야</h2>
<h3>품질</h3><p>결함 이미지를 자동으로 검출하고 발생 원인을 데이터로 추적하며 보고서 초안까지 자동 생성한 뒤 최종 판정을 사람에게 넘겨 검사 시간을 크게 줄이면서 누락을 방지합니다</p>
<h3>지식</h3><p>사내에 흩어진 매뉴얼과 규정과 과거 사례를 색인화하여 질문 한 줄로 근거가 달린 답을 즉시 제공하여 신입도 베테랑의 지식에 바로 접근할 수 있습니다</p>
<h3>설비</h3><p>센서와 가동 데이터로 이상 징후를 사전에 예측하고 정비가 필요한 시점과 작업 지시서를 자동으로 만들어 다운타임을 줄입니다</p>
<h3>경영</h3><p>여러 시스템에 흩어진 지표를 매일 아침 한 장의 요약으로 정리하여 경영진이 즉시 판단할 수 있게 돕습니다</p>
<h3>물류</h3><p>재고와 흐름을 예측합니다</p><h3>안전</h3><p>위험을 예측합니다</p><h3>구매</h3><p>발주를 최적화합니다</p>
<h2>왜 유니에버인가</h2><ul><li>현장 특화 데이터로 학습</li><li>작게 시작해 검증만 확산</li><li>ERP·MES 연동</li></ul>
</body></html>"""


def _sections(ir):
    return [p for p in ir["pages"] if p["type"] == "section"]


def _maxdesc(ir):
    m = 0
    for p in _sections(ir):
        for c in p.get("cards", []):
            m = max(m, len(c.get("desc", "")))
    return m


# ── 1) 휴리스틱 압축 ──────────────────────────────────────────────
ir = ex.extract(HTML, title="솔루션 상세")
check(_maxdesc(ir) <= ex.DESC_CHARS + 2, f"카드 설명 ≤ {ex.DESC_CHARS}자 (최대 {_maxdesc(ir)})")
sec0 = _sections(ir)[0]
check(len(sec0["cards"]) <= ex.MAX_CARDS, f"페이지당 카드 ≤ {ex.MAX_CARDS} (제조분야 {len(sec0['cards'])}장)")
check(len(ir["pages"][0]["cards"]) <= ex.COVER_CARDS, "표지 카드 ≤ 3")
check(all(len(p["sub"]) <= ex.LEAD_CHARS + 2 for p in _sections(ir)), "섹션 리드 ≤ LEAD_CHARS")

# ── 2) _condense: 첫 문장 우선 + 상한 ──────────────────────────────
c = ex._condense("첫 문장입니다. 둘째 문장은 버려야 합니다.")
check(c == "첫 문장입니다.", f"첫 문장만: {c}")
long = "가" * 200
check(len(ex._condense(long)) <= ex.DESC_CHARS + 1 and ex._condense(long).endswith("…"), "긴 문장 상한+말줄임")

# ── 3) LLM 요약 경로(mock) — 섹션 카드가 bullets 에서 나옴 ──────────
def mock(title, text):
    return {"headline": f"{title} 요약", "bullets": ["핵심 하나", "핵심 둘", "핵심 셋"]}

irl = ex.extract(HTML, title="솔루션 상세", summarize_fn=mock)
s0 = _sections(irl)[0]
check([c["desc"] for c in s0["cards"]] == ["핵심 하나", "핵심 둘", "핵심 셋"], f"LLM bullets→카드: {[c['desc'] for c in s0['cards']]}")
check("요약" in s0["sub"], "LLM headline→리드")

# ── 4) summarize_fn 실패/빈값 → 휴리스틱 폴백(무크래시) ────────────
irn = ex.extract(HTML, title="x", summarize_fn=lambda t, x: None)
check(len(_sections(irn)) == len(_sections(ir)), "summarize None → 휴리스틱 폴백")
irb = ex.extract(HTML, title="x", summarize_fn=lambda t, x: (_ for _ in ()).throw(RuntimeError("boom")))
check(len(_sections(irb)) > 0, "summarize 예외 → 폴백(크래시 없음)")

# ── 5) 원본 목차/Contents 슬라이드 제외 — 자동 목차와 중복 방지 ──────
TOC_HTML = """<!doctype html><html><head><title>AX</title></head><body>
<h1>표지</h1><p class="lede">리드</p>
<h2>Contents</h2><ul><li>A</li><li>B</li></ul>
<h2>우리의 AX</h2><p>본문A.</p>
<h2>PM 업무</h2><p>본문B.</p></body></html>"""
irt = ex.extract(TOC_HTML, title="AX")
sec_titles = [p.get("heading") for p in _sections(irt)]
check("Contents" not in sec_titles, f"원본 Contents 섹션 제외 (섹션: {sec_titles})")
check(sum(1 for p in irt["pages"] if p["type"] == "toc") == 1, "목차 페이지는 정확히 1장")
toc0 = [p for p in irt["pages"] if p["type"] == "toc"][0]
check(toc0["items"][0][1] == "우리의 AX" and toc0["items"][0][3] == "03",
      f"목차 첫 항목=본문 첫 섹션·3쪽 ({toc0['items'][0]})")
check(ex._is_toc_title("목차") and ex._is_toc_title("TABLE OF CONTENTS") and not ex._is_toc_title("우리의 AX"),
      "_is_toc_title 판별")

# ── 6) 기본 덱 변환은 편집 가능한 네이티브 PPTX여야 함 ─────────────
# 태그·코드칩이 많은 HTML도 기본 출력에서 스크린샷 배경(pixel)으로 굳히지 않는다.
RICH_HTML = """<!doctype html><html><head><title>리치</title></head><body>
<h1>리치 표지</h1><p class="lede">복잡한 스타일이 있어도 편집 가능한 슬라이드가 기본입니다.</p>
<h2>리치 섹션</h2>
<p><span class="tag">A</span><span class="tag">B</span><span class="tag">C</span><span class="tag">D</span><span class="tag">E</span><span class="tag">F</span><span class="tag">G</span></p>
<p><code>alpha</code> <code>beta</code> <code>gamma</code></p>
<h3>핵심</h3><p>텍스트와 카드 도형은 PowerPoint와 캔버스에서 수정 가능해야 합니다.</p>
</body></html>"""
irr = ex.extract(RICH_HTML, title="리치")
rich_modes = [p.get("mode") for p in _sections(irr)]
check(rich_modes == ["native"], f"리치 HTML도 기본 mode=native (modes={rich_modes})")

# ── 7) Slide IR v1 계약 — 목차/편집 가능 렌더러의 정본 ─────────────
irc = ex.extract(TOC_HTML, title="AX")
check(irc["meta"].get("irVersion") == "slide-ir-v1", "IR 버전 = slide-ir-v1")
check([p.get("role") for p in irc["pages"][:3]] == ["cover", "toc", "content"],
      f"페이지 role 계약: {[p.get('role') for p in irc['pages'][:3]]}")
check([p.get("pageNo") for p in irc["pages"][:4]] == ["01", "02", "03", "04"],
      f"pageNo 계약: {[p.get('pageNo') for p in irc['pages'][:4]]}")
content_ids = [p.get("sectionId") for p in irc["pages"] if p.get("role") == "content"]
check(content_ids == ["sec-01", "sec-02"], f"본문 sectionId 안정화: {content_ids}")
toc_page = next((p for p in irc["pages"] if p.get("role") == "toc"), {})
toc_items = toc_page.get("tocItems") or []
check([x.get("sectionId") for x in toc_items] == content_ids,
      f"tocItems.sectionId가 본문과 연결: {toc_items}")
check([x.get("pageNo") for x in toc_items] == ["03", "04"],
      f"tocItems.pageNo 계약: {toc_items}")
check(all(p.get("editable") is True for p in irc["pages"]), "모든 페이지 editable=True")
check(all(p.get("objects") for p in irc["pages"]), "모든 페이지 objects 계약 존재")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}")
    sys.exit(1)
print("\nALL PASS")
