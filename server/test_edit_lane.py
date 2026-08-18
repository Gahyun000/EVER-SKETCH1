"""G5 편집 레인 검증 — chat.respond 가 편집 명령을 감지해 apply_page_edits 액션을 내는가.
editor.make_edits 를 목(mock)으로 대체하고 LLM 미설정으로 네트워크를 차단한다."""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server import chat  # noqa: E402
import server.intent.editor as editor_mod  # noqa: E402

chat.load_llm_settings = lambda: {"configured": False}

BOOK = {
    "selectedPageId": 12,
    "pages": [
        {"id": 11, "cardKey": "cover", "title": "표지", "fields": {"title": "표지"}},
        {"id": 12, "cardKey": "kpi", "title": "기대 성과", "fields": {"title": "기대 성과", "k1": "불량률:-30%"}},
    ],
}

_captured = {"op": None}


def _fake_make_edits(op, message, llm_fn, book_state=None, retries=2):
    _captured["op"] = op
    if op["op"] == "add":
        return {"ok": True, "op": "add", "edits": [], "adds": [{"cardKey": "roadmap", "fields": {"title": "로드맵"}}],
                "warnings": [], "summary": "1장을 이북 끝에 추가했어요.", "source": "llm"}
    if op["op"] == "tone":
        return {"ok": True, "op": "tone", "edits": [{"pageId": 11, "fields": {"title": "T"}}, {"pageId": 12, "fields": {"title": "성과"}}],
                "adds": [], "warnings": ["필드 없는 페이지 1장은 톤 통일에서 제외"], "summary": "2개 페이지의 어조를 통일했어요.", "source": "llm"}
    return {"ok": True, "op": "polish", "edits": [{"pageId": 12, "fields": {"k1": "불량률 30% 감축"}}],
            "adds": [], "warnings": [], "summary": "‘기대 성과’ 페이지 문구를 다듬었어요.", "source": "llm"}


editor_mod.make_edits = _fake_make_edits

fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


# ── 폴리시 → apply_page_edits(edits) ──
r = chat.respond("이 장 다듬어줘", None, book_state=BOOK)
ui = r.get("ui_action")
check(bool(ui) and ui["type"] == "apply_page_edits", "폴리시 → ui_action apply_page_edits")
check(ui["payload"]["edits"] and ui["payload"]["edits"][0]["pageId"] == 12, "payload.edits 에 대상 pageId")
check("다듬" in r["answer"], f"답변에 다듬기 안내: {r['answer'][:30]}")
check(_captured["op"]["op"] == "polish", "editor 에 polish op 전달")

# ── N장 추가 → apply_page_edits(adds), add_slide 로 새지 않음 ──
r2 = chat.respond("로드맵 3장 추가해줘", None, book_state=BOOK)
ui2 = r2.get("ui_action")
check(bool(ui2) and ui2["type"] == "apply_page_edits", "'3장 추가' → apply_page_edits(add_slide 아님)")
check(ui2["payload"]["adds"] and not ui2["payload"]["edits"], "payload.adds 채움, edits 비움")
check(_captured["op"]["op"] == "add" and _captured["op"]["n"] == 3, "editor 에 add n=3 전달")

# ── 톤 통일 → 경고 노출 ──
r3 = chat.respond("전체 톤 통일해줘", None, book_state=BOOK)
check((r3.get("ui_action") or {}).get("type") == "apply_page_edits", "톤 통일 → apply_page_edits")
check("⚠" in r3["answer"], "경고 있으면 답변에 ⚠ 노출")

# ── 빈 이북의 '3장 추가'는 편집 레인 안 탐(생성/일반 라우팅) ──
r4 = chat.respond("3장 추가", None, book_state={"pages": []})
check((r4.get("ui_action") or {}).get("type") != "apply_page_edits", "빈 이북 '3장 추가' → 편집 레인 아님")

# ── 생성 명시어는 편집보다 생성 레인 우선(내용 있어도) ──
r5 = chat.respond("초안 다시 짜줘", None, book_state=BOOK)
check((r5.get("ui_action") or {}).get("type") == "apply_book_plan", "'초안' → 생성 레인(apply_book_plan) 우선")

# ── 편집 아닌 명령(도형)은 기존 라우팅 유지 ──
r6 = chat.respond("도형 넣어줘", None, book_state=BOOK)
check((r6.get("ui_action") or {}).get("type") == "insert_element", "'도형' → insert_element(편집 레인 안 탐)")

# ── 숫자 붙은 도형 요청도 페이지추가로 오인 금지(회귀: '사각형 3개 넣어줘'가 3장 추가로 새던 버그) ──
r7 = chat.respond("사각형 박스 3개 넣어줘", None, book_state=BOOK)
ui7 = r7.get("ui_action") or {}
check(ui7.get("type") == "insert_element", "'사각형 3개' → insert_element(페이지추가 아님)")
check((ui7.get("payload") or {}).get("tool") == "box", "'사각형' → box 도구")
check((ui7.get("payload") or {}).get("count") == 3, "'3개' → payload.count=3(실제 배치)")

# ── 진짜 페이지 추가는 그대로 동작('개'가 카드에 붙으면 페이지) ──
r8 = chat.respond("카드 3개 추가해줘", None, book_state=BOOK)
check((r8.get("ui_action") or {}).get("type") == "apply_page_edits", "'카드 3개 추가' → 페이지추가 유지")

# ── 문맥 위임(③): '너가 추가해줘'는 직전 반복이 아니라 구체적으로 되묻기 ──
r9 = chat.respond("너가 추가해주면 안돼?", None, book_state=BOOK)
check((r9.get("ui_action") or {}) .get("type") is None, "위임 발화 → 액션 없음(임의 실행 안 함)")
check("구체적으로" in (r9.get("answer") or ""), "위임 발화 → 도형·개수 구체화 되묻기")

# ── 되묻기 이어받기(③+): 위임 되물은 뒤 '3개'만 답해도 도형 배치 ──
chat.respond("너가 추가해줘", "SESSF", book_state=BOOK)   # awaiting 세움
r10 = chat.respond("3개", "SESSF", book_state=BOOK)      # 숫자만 답
ui10 = r10.get("ui_action") or {}
check(ui10.get("type") == "insert_element", "위임→'3개' → insert_element 실행")
check((ui10.get("payload") or {}).get("count") == 3, "이어받기 개수=3")
check((ui10.get("payload") or {}).get("tool") == "box", "도형 미지정 → 기본 사각형")

# ── '원' 도형 인식 보강(‘지원/원인/5000원’ 오탐 없이) ──
r11 = chat.respond("원 넣어줘", None, book_state=BOOK)
check((r11.get("ui_action") or {}).get("type") == "insert_element", "'원 넣어줘' → 도형 인식")
check(((r11.get("ui_action") or {}).get("payload") or {}).get("tool") == "ellipse", "'원' → ellipse")
r12 = chat.respond("지원 넣어줘", None, book_state=BOOK)
check((r12.get("ui_action") or {}).get("type") != "insert_element", "'지원'은 도형 오탐 아님")

# ── '표지'는 표(table)로 오탐되지 않아야 / '표'는 여전히 표 ──
from server.intent import classifier as _clf
from server.intent.schema_ebook import EBOOK_SCHEMA as _SCH
check(_clf.classify("표 넣어줘", _SCH)["intent"] == "insert_table", "'표 넣어줘' → insert_table 유지")
check(_clf.classify("표지 만들어줘", _SCH)["intent"] != "insert_table", "'표지 만들어줘' → 표 오탐 아님")

# ── 카드 backstop: '표지 만들어줘' → 표지 카드 추가 ──
r13 = chat.respond("표지 만들어줘", None, book_state=BOOK)
ui13 = r13.get("ui_action") or {}
check(ui13.get("type") == "add_card", "'표지 만들어줘' → add_card")
check((ui13.get("payload") or {}).get("cardKey") == "cover", "표지 → cover 카드")

# ── 스케치 우선: 도형 놓은 뒤 '너가 N개 추가'는 페이지가 아니라 도형 N개 ──
chat.respond("사각형 3개 넣어줘", "SESSG", book_state=BOOK)   # _LAST_SHAPE=box
r14 = chat.respond("너가 3개 추가해줘", "SESSG", book_state=BOOK)
ui14 = r14.get("ui_action") or {}
check(ui14.get("type") == "insert_element", "'너가 3개 추가' → 도형(페이지 아님)")
check((ui14.get("payload") or {}).get("count") == 3, "도형 3개")
check(chat.respond("3장 추가해줘", "SESSH", book_state=BOOK).get("ui_action",{}).get("type") == "apply_page_edits", "'3장 추가'는 페이지 유지")

# ── 도형 삭제: 실제 delete_elements 액션(환각 아님) ──
rd = chat.respond("원 3개 없애줘", "SESSD", book_state=BOOK)
uid = rd.get("ui_action") or {}
check(uid.get("type") == "delete_elements", "'원 3개 없애줘' → delete_elements 액션")
check((uid.get("payload") or {}).get("tool") == "ellipse", "삭제 대상 = 원(ellipse)")
check(chat.respond("도형 다 지워줘", "SESSD", book_state=BOOK).get("ui_action",{}).get("payload",{}).get("all") == True, "'다 지워줘' → 전체 삭제")
check(chat.respond("슬라이드 삭제해줘", "SESSD", book_state=BOOK).get("ui_action",{}).get("type") == "delete_slide", "'슬라이드 삭제'는 슬라이드 유지")

if fails:
    print(f"\n{len(fails)} FAIL: {fails}")
    sys.exit(1)
print("\nALL PASS")
