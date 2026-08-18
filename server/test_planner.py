"""G3 하네스 단위검증 — planner.make_plan (mock llm_fn, 네트워크 없음)."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server.intent import planner  # noqa: E402

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


VALID = json.dumps({
    "title": "유니에버 AI팩토리 소개",
    "orientation": "portrait",
    "theme": "dark",
    "pages": [
        {"cardKey": "cover", "fields": {"title": "유니에버 AI팩토리", "sub": "현장 데이터로 품질을", "bogus": "x"}},
        {"cardKey": "toc", "fields": {}},
        {"cardKey": "nope", "fields": {}},
        {"cardKey": "kpi", "fields": {"title": "기대 성과", "k1": "불량률:-30%"}},
        {"cardKey": "closing", "fields": {"title": "함께 시작합시다"}},
    ],
}, ensure_ascii=False)

# 1) 정상 계획 + 보정(모르는 카드/필드 드롭) + 수치가드
m = MockLLM([VALID])
r = planner.make_plan("유니에버 AI팩토리 소개 이북 만들어줘", m)
keys = [p["cardKey"] for p in r["plan"]["pages"]]
check(r["source"] == "llm", "source=llm")
check(r["plan"]["theme"] == "dark" and r["plan"]["orientation"] == "portrait", "책 메타(theme/orientation) 반영")
check(keys == ["cover", "toc", "kpi", "closing"], f"모르는 카드 'nope' 드롭 → {keys}")
check("bogus" not in r["plan"]["pages"][0]["fields"], "cover 미지원 필드 'bogus' 드롭")
check(any("nope" in w for w in r["warnings"]), "경고: 알 수 없는 카드")
check(any("bogus" in w for w in r["warnings"]), "경고: 미지원 필드")
check(any("kpi" in w and "30" in w for w in r["warnings"]), "경고: 브리프에 없는 KPI 수치(환각 가드)")

# 2) 재시도 — 첫 응답 깨짐 → 둘째 정상
m2 = MockLLM(["여기 계획입니다: (JSON 아님)", VALID])
r2 = planner.make_plan("브리프", m2)
check(r2["source"] == "llm" and m2.calls == 2, f"깨진 출력 후 재시도로 성공 (calls={m2.calls})")

# 3) 계속 실패 → 폴백 골격
m3 = MockLLM(["nope", "still nope", "again nope"])
r3 = planner.make_plan("품질 AI 소개", m3)
check(r3["source"] == "fallback", "계속 실패 → source=fallback")
check([p["cardKey"] for p in r3["plan"]["pages"]] == planner.DEFAULT_SKELETON, "폴백 = 최소 골격(cover/toc/summary/closing)")
check(r3["plan"]["pages"][0]["fields"].get("title") == "품질 AI 소개", "폴백 표지 제목=브리프")
check(any("골격" in w for w in r3["warnings"]), "경고: 폴백 사용")

# 4) LLM 미설정(None) → 즉시 폴백, 재시도 없음
r4 = planner.make_plan("아무거나", None)
check(r4["source"] == "fallback", "llm_fn=None → 폴백")

# 5) 코드펜스 감싼 JSON 파싱
fenced = "```json\n" + VALID + "\n```"
m5 = MockLLM([fenced])
r5 = planner.make_plan("브리프", m5)
check(r5["source"] == "llm", "코드펜스(```json) 감싼 출력 파싱 성공")

# 6) 수치 grounding — 브리프에 값 있으면 경고 없음
grounded = json.dumps({"title": "t", "pages": [{"cardKey": "kpi", "fields": {"title": "성과", "k1": "불량률:-30%"}}]})
m6 = MockLLM([grounded])
r6 = planner.make_plan("불량률 30% 감축 목표 이북", m6)
check(not any("환각" in w or "예시일" in w for w in r6["warnings"]), "브리프에 있는 수치(30)는 경고 없음")

# 7) 페이지 상한
big = json.dumps({"title": "t", "pages": [{"cardKey": "note", "fields": {}} for _ in range(40)]})
m7 = MockLLM([big])
r7 = planner.make_plan("긴 이북", m7)
check(len(r7["plan"]["pages"]) == planner.MAX_PAGES, f"페이지 상한 {planner.MAX_PAGES} 적용 → {len(r7['plan']['pages'])}")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}")
    sys.exit(1)
print("\nALL PASS")
