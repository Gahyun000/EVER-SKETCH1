"""G5 편집 하네스 단위검증 — editor.detect_edit / make_edits (mock llm_fn, 네트워크 없음)."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server.intent import editor  # noqa: E402

fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


class MockLLM:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def __call__(self, msgs):
        self.calls += 1
        return self.responses.pop(0) if self.responses else None


BOOK = {
    "title": "유니에버 AI팩토리", "orientation": "portrait", "theme": "dark", "selectedPageId": 12,
    "pages": [
        {"id": 11, "cardKey": "cover", "title": "유니에버 AI팩토리", "fields": {"title": "유니에버 AI팩토리", "sub": "2026 경영보고"}},
        {"id": 12, "cardKey": "kpi", "title": "기대 성과", "fields": {"title": "기대 성과", "k1": "불량률:-30%", "k2": "검사시간:-40%"}},
        {"id": 13, "cardKey": "note", "title": "메모", "fields": {}},
    ],
}
EMPTY = {"pages": []}

# ── 1) detect_edit 우선순위·감지 ────────────────────────────────────────────
d = editor.detect_edit
check((d("3장 추가해줘", BOOK) or {}).get("op") == "add", "'3장 추가' → add")
check(d("3장 추가해줘", BOOK)["n"] == 3, "add n=3")
check((d("2개 더 넣어줘", BOOK) or {}).get("op") == "add", "'2개 더 넣어' → add")
check((d("톤 통일해줘", BOOK) or {}).get("op") == "tone", "'톤 통일' → tone")
p = d("이 장 다듬어줘", BOOK)
check(p and p["op"] == "polish" and p["pageId"] == 12, f"'이 장 다듬어'(선택=12) → polish 12 :: {p}")
p2 = d("표지 더 강하게", BOOK)
check(p2 and p2["op"] == "polish" and p2["pageId"] == 11, f"'표지 더 강하게' → polish cover(11) :: {p2}")
p3 = d("2장 다듬어줘", BOOK)
check(p3 and p3["op"] == "polish" and p3["pageId"] == 12, f"'2장 다듬어'(서수) → polish 2번째(12) :: {p3}")
check(d("안녕", BOOK) is None, "인사 → None")
check(d("도형 넣어줘", BOOK) is None, "'도형 넣어'(숫자 없음) → None(편집 아님)")
check(d("3장 추가", EMPTY) is None, "빈 이북 → None(생성 레인 담당)")
check(d("이 장 다듬어", {"pages": [{"id": 1, "cardKey": "cover"}], "selectedPageId": None}) is not None,
      "선택 없음+내용 있음 → 폴백 대상(첫 장)")

# ── 2) 폴리시: 대상 1장, 필드 보정 + 수치가드 ───────────────────────────────
polish_out = json.dumps({"pages": [{"pageId": 12, "fields": {
    "title": "기대 성과", "k1": "불량률 30% 감축", "k2": "검사시간 40% 단축",
    "k3": "ROI:99개월", "bogus": "x"}}]}, ensure_ascii=False)
m = MockLLM([polish_out])
r = editor.make_edits({"op": "polish", "pageId": 12, "cardKey": "kpi"}, "이 장 다듬어", m, BOOK)
check(r["source"] == "llm" and len(r["edits"]) == 1, "폴리시 → edits 1건")
ed = r["edits"][0]
check(ed["pageId"] == 12, "edits pageId=12")
check("bogus" not in ed["fields"], "미지원 필드 'bogus' 드롭")
check(any("bogus" in w for w in r["warnings"]), "경고: 미지원 필드")
check(any("99" in w for w in r["warnings"]), "경고: 원문에 없던 수치 99(환각 가드)")
check(not any("30" in w and "kpi" in w for w in r["warnings"]), "원문 수치 30/40 은 경고 없음")
check(not r["adds"], "폴리시는 adds 없음")

# ── 3) 톤 통일: 필드형 전체(note 제외) ──────────────────────────────────────
tone_out = json.dumps({"pages": [
    {"pageId": 11, "fields": {"sub": "현장 데이터로 품질을 바꾸다"}},
    {"pageId": 12, "fields": {"title": "이렇게 좋아집니다"}},
]}, ensure_ascii=False)
m2 = MockLLM([tone_out])
r2 = editor.make_edits({"op": "tone"}, "톤 통일", m2, BOOK)
ids = sorted(e["pageId"] for e in r2["edits"])
check(ids == [11, 12], f"톤: 필드형 2장 편집(note 제외) → {ids}")
check(any("note" in w or "제외" in w for w in r2["warnings"]), "경고: 필드 없는 페이지 제외")

# ── 4) N장 추가: 카탈로그 검증(모르는 카드 드롭) ────────────────────────────
add_out = json.dumps({"pages": [
    {"cardKey": "roadmap", "fields": {"title": "로드맵", "p1": "PoC : 1분기"}},
    {"cardKey": "nope", "fields": {}},
    {"cardKey": "closing", "fields": {"title": "함께 시작합시다"}},
]}, ensure_ascii=False)
m3 = MockLLM([add_out])
r3 = editor.make_edits({"op": "add", "n": 3}, "3장 추가", m3, BOOK)
keys = [a["cardKey"] for a in r3["adds"]]
check(keys == ["roadmap", "closing"], f"모르는 카드 'nope' 드롭 → {keys}")
check(not r3["edits"], "add 는 edits 없음")
check(any("nope" in w for w in r3["warnings"]), "경고: 알 수 없는 카드")

# ── 5) add 폴백(LLM 없음) → 빈 note n장 ─────────────────────────────────────
r4 = editor.make_edits({"op": "add", "n": 2}, "2장 추가", None, BOOK)
check(r4["source"] == "fallback" and len(r4["adds"]) == 2, "llm=None → 빈 note 2장 폴백")
check(all(a["cardKey"] == "note" for a in r4["adds"]), "폴백 카드=note")

# ── 6) 폴리시 폴백(LLM 없음) → edits 비고 경고 ──────────────────────────────
r5 = editor.make_edits({"op": "polish", "pageId": 12, "cardKey": "kpi"}, "다듬어", None, BOOK)
check(r5["source"] == "fallback" and not r5["edits"], "폴리시 llm=None → edits 없음(폴백)")
check(any("LLM" in w for w in r5["warnings"]), "경고: LLM 미연결 안내")

# ── 7) 폴리시 대상이 note(필드 없음) → 제외 안내 ────────────────────────────
r6 = editor.make_edits({"op": "polish", "pageId": 13, "cardKey": "note"}, "이 장 다듬어", MockLLM(["{}"]), BOOK)
check(not r6["edits"] and any("자동" in w or "자유" in w for w in r6["warnings"]),
      "note 폴리시 → 제외 + 안내")

# ── 8) 폴리시 재시도: 첫 응답 깨짐 → 둘째 정상 ──────────────────────────────
m8 = MockLLM(["설명뿐(JSON 아님)", json.dumps({"pages": [{"pageId": 11, "fields": {"sub": "새 부제"}}]})])
r8 = editor.make_edits({"op": "polish", "pageId": 11, "cardKey": "cover"}, "표지 다듬어", m8, BOOK)
check(r8["edits"] and m8.calls == 2, f"깨진 출력 후 재시도 성공(calls={m8.calls})")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}")
    sys.exit(1)
print("\nALL PASS")
