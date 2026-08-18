"""G6 자기검증 하네스 단위검증 — self_check.check_plan / scan_fields."""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server.intent import self_check as sc  # noqa: E402

fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


def codes(findings):
    return sorted({f["code"] for f in findings})


# ── 1) 정상 계획 → 경고 없음 ────────────────────────────────────────────────
clean = {"pages": [
    {"cardKey": "cover", "fields": {"title": "유니에버 AI팩토리", "sub": "2026"}},
    {"cardKey": "toc", "fields": {}},
    {"cardKey": "kpi", "fields": {"title": "기대 성과", "k1": "불량률:-30%"}},
    {"cardKey": "closing", "fields": {"title": "함께 시작합시다"}},
]}
check(sc.check_plan(clean) == [], "정상 계획 → findings 없음")

# ── 2) 과장 문구 탐지 ───────────────────────────────────────────────────────
ex = {"pages": [{"cardKey": "summary", "fields": {"title": "요약", "body": "업계 최고의 완벽한 솔루션"}}]}
f = sc.check_plan(ex)
check("exaggeration" in codes(f), "과장('업계 최고') 탐지")
check(any("업계 최고" in m for m in sc.messages(f)), "메시지에 과장 표현 노출")

# ── 3) 빈 핵심 필드 ─────────────────────────────────────────────────────────
empty = {"pages": [
    {"cardKey": "cover", "fields": {"title": ""}},
    {"cardKey": "kpi", "fields": {"title": "성과", "k1": "", "k2": "", "k3": ""}},
]}
f2 = sc.check_plan(empty)
check("empty" in codes(f2), "빈 필드 탐지")
check(any("표지 제목" in m for m in sc.messages(f2)), "표지 제목 빈칸 경고")
check(any("내용이 비어" in m for m in sc.messages(f2)), "KPI 빈내용 경고")

# ── 4) 중복 표지/목차/제목 ──────────────────────────────────────────────────
dup = {"pages": [
    {"cardKey": "cover", "fields": {"title": "A"}},
    {"cardKey": "cover", "fields": {"title": "B"}},
    {"cardKey": "toc", "fields": {}},
    {"cardKey": "toc", "fields": {}},
    {"cardKey": "kpi", "fields": {"title": "성과", "k1": "x"}},
    {"cardKey": "kpi", "fields": {"title": "성과", "k1": "y"}},
]}
f3 = sc.check_plan(dup)
cs = codes(f3)
check("dup_cover" in cs, "표지 중복 탐지")
check("dup_toc" in cs, "목차 중복 탐지")
check("dup_title" in cs, "동일 제목 중복 탐지")

# ── 5) scan_fields 단독 + messages 상한/중복제거 ────────────────────────────
sf = sc.scan_fields("kpi", {"title": "성과", "k1": "무조건 100% 보장"}, "성과")
check(any("과장" in m for m in sc.messages(sf)), "scan_fields 과장 탐지")
many = [{"msg": "m1", "code": "x", "level": "warn", "where": ""}] * 10
check(len(sc.messages(many)) == 1, "messages 중복 제거")
mixed = [{"msg": f"m{i}", "code": "x", "level": "warn", "where": ""} for i in range(10)]
check(len(sc.messages(mixed, limit=4)) == 4, "messages 상한 4")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}")
    sys.exit(1)
print("\nALL PASS")
