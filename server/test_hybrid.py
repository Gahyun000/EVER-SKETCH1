"""하이브리드 토대 검증 — 카탈로그·검증·LLM 구조화 폴백. 네트워크 없이 mock LLM."""
import sys
from server.intent import catalog, hybrid
import server.chat as chat

fails = []
def check(cond, msg):
    print(("✓ " if cond else "✗ ") + msg)
    if not cond:
        fails.append(msg)

# 1) 카탈로그 검증
ok, sl = catalog.validate("insert_shape", {"shape": "세모", "count": "3"})
check(ok and sl == {"shape": "triangle", "count": 3}, "세모→triangle, count 정수화")
check(catalog.validate("launch", {})[0] is False, "카탈로그에 없는 intent 거부")
check(catalog.validate("set_theme", {"theme": "보라"})[0] is False, "잘못된 enum 거부")
check(catalog.validate("insert_card", {"card": "표지"}) == (True, {"card": "cover"}), "표지→cover 카드")
check(catalog.validate("delete_element", {"delete_all": "true"}) == (True, {"delete_all": True}), "전체삭제 검증")

# 2) hybrid.resolve (mock)
mk = lambda js: (lambda msgs: js)
check(hybrid.resolve("세모 3개", mk('{"intent":"insert_shape","slots":{"shape":"triangle","count":3}}')) == ("insert_shape", {"shape": "triangle", "count": 3}), "hybrid: 세모 3개 → 삼각형")
check(hybrid.resolve("춤춰", mk('{"intent":"dance","slots":{}}')) is None, "hybrid: 없는 액션(환각) → None")
check(hybrid.resolve("고마워", mk('{"intent":"none"}')) is None, "hybrid: none → None")
check(hybrid.resolve("음", mk('그냥 텍스트')) is None, "hybrid: 비JSON → None")

# 3) chat.respond 통합 — LLM 강제 mock
chat.load_llm_settings = lambda: {"configured": True, "provider": "self", "base_url": "x", "api_key": "x", "model": "m", "enabled": True, "timeout": 45.0}
BOOK = {"pages": [{"id": "p1", "cardKey": "cover", "fields": {"title": "t"}}]}
def resp(m, js):
    chat._call_llm = lambda msgs, s: js
    return chat.respond(m, None, book_state=BOOK).get("ui_action") or {}

u = resp("세모 3개 그려줘", '{"intent":"insert_shape","slots":{"shape":"triangle","count":3}}')
check(u.get("type") == "insert_element" and (u.get("payload") or {}).get("tool") == "triangle", "chat: 세모 3개 → 삼각형 3개(하이브리드)")
u = resp("성과 카드 추가", '{"intent":"insert_card","slots":{"card":"kpi"}}')
check(u.get("type") == "add_card" and (u.get("payload") or {}).get("cardKey") == "kpi", "chat: 성과 카드 → kpi")
u = resp("사각형 3개 넣어줘", '{"intent":"none"}')  # 규칙이 처리 → LLM 무시돼야
check(u.get("type") == "insert_element" and (u.get("payload") or {}).get("tool") == "box", "chat: 규칙 빠른 경로 유지(LLM none이어도 사각형)")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}"); sys.exit(1)
print("\nALL PASS")
