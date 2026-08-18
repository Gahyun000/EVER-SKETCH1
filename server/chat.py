"""ebook_html 채팅 코어 (P2) — Agentic-PM chat_engine의 '재사용 코어'만 이식하고
PM 도메인 계층(recipes·navigation·ui_actions)은 중립화한 대화형 엔진.

- 설정된 LLM이 있으면 실제 호출(OpenAI 호환 / Anthropic), 없으면 친절한 폴백 응답.
- ChatAnswer 계약(answer/answer_kind/status/session_id/suggested_questions/...)은 원본과 동일.
- 세션 히스토리는 로컬 단일 사용자용으로 메모리에 보관(재시작 시 초기화).
- ebook 액션(ui_action)으로 화면을 대신 조작하는 건 P5(브리지)에서 켠다.
"""
from __future__ import annotations

import json
import re
import uuid
import urllib.request
import urllib.error
from typing import Iterator, Optional

from server.settings_store import load_llm_settings, llm_endpoint
from server.intent import orchestrator
from server import conversations as _conv
from server.intent import slots as _slots
from server.intent import action_mapper as _am
from server.intent import hybrid as _hybrid
from server.intent.action_mapper import _SHAPE_LABEL as _ELEM_LABEL, _josa_eul

# 세션별 대화 히스토리(메모리). 로컬 단일 사용자 전제.
_SESSIONS: dict[str, list[dict]] = {}

# 세션별 문서(이북) 스냅샷 — G1 문서 컨텍스트 계약.
# 프론트가 매 턴 보낸 현재 이북 상태를 보관만 한다. LLM 프롬프트 주입은 G3에서 켠다.
_DOC: dict[str, dict] = {}


def get_doc(session_id: str) -> Optional[dict]:
    """세션에 보관된 최신 이북 스냅샷(없으면 None). G3/G5 생성·수정 레인이 소비한다."""
    return _DOC.get(session_id)


def _remember_doc(sid: str, book_state: Optional[dict]) -> None:
    """프론트가 보낸 현재 이북 스냅샷을 세션에 보관하고, 매 턴 페이지 목록을 로그한다."""
    if not book_state:
        return
    _DOC[sid] = book_state
    pages = book_state.get("pages") or []
    titles = ", ".join(
        f"{i + 1}.{(p.get('title') or p.get('cardKey') or '?')}" for i, p in enumerate(pages)
    )
    print(
        f"[book_state] sid={sid} pages={len(pages)} "
        f"theme={book_state.get('theme')} orient={book_state.get('orientation')} :: {titles}",
        flush=True,
    )

SYSTEM_PROMPT = (
    "당신은 'EVER-SKETCH' 스케치 빌더의 친절한 챗봇입니다. 사용자는 디지털에 익숙하지 않을 수 있는 "
    "경영진입니다. 카드로 사업모델 이북을 만들고, 자유 캔버스로 도형·화살표를 그리고, 발표 모드로 "
    "넘겨보고, '이북 만들기'로 실제 이북을 생성합니다. 항상 쉽고 짧게, 한국어로 답하세요. "
    "슬라이드 추가·도형/표/글맵시 삽입·배경 전환·발표·이북 만들기 같은 명령은 제가 화면을 직접 조작해 실행합니다. "
    "당신은 화면을 실제로 조작할 수 있으니, 절대 '직접 조작할 수 없다'거나 '제가 못 한다'고 말하지 마세요. "
    "사용자가 '네가 해줘/추가해줘'처럼 부탁하면, 무엇을(예: 도형 종류·개수) 놓을지 한 문장으로 되묻거나 바로 실행하세요. "
    "단, 실제 화면 변경은 시스템이 인식한 명령만 수행합니다. 삭제·이동·배치 등을 실제로 하지 않았다면 '했다'고 지어내지 말고, 못 알아들은 요청은 '어떻게 해드릴까요?'처럼 되물으세요."
)

DEFAULT_SUGGESTIONS = orchestrator.SUGGESTIONS

# ── P5: 챗 액션 브리지 (스캐폴드) ─────────────────────────────────────────
# 안전한 몇 가지 인텐트만 ui_action으로 변환한다(플래그로 on/off). 나머지는 대화.
ACTIONS_ENABLED = True

# (키워드, cardKey, 라벨) — 더 구체적인 것을 앞에 둔다. (BMC 9블록 제외)
CARD_KEYWORDS: list[tuple[str, str, str]] = [
    ("빈 페이지", "note", "빈 페이지"), ("토글", "note", "빈 페이지"), ("블록", "note", "빈 페이지"),
    ("표지", "cover", "표지"), ("목차", "toc", "목차"), ("마무리", "closing", "마무리"),
    ("요약", "summary", "한 줄 요약"),
    ("성과", "kpi", "성과·KPI"), ("kpi", "kpi", "성과·KPI"), ("지표", "kpi", "성과·KPI"),
    ("로드맵", "roadmap", "로드맵"), ("시장", "market", "시장·경쟁"), ("경쟁", "market", "시장·경쟁"),
    ("프로세스", "flow", "프로세스"), ("플로우", "flow", "프로세스"), ("마인드맵", "mindmap", "마인드맵"),
    ("스티키", "sticky", "스티키 메모"), ("메모 보드", "board", "자유 메모 보드"),
]
_ADD_VERBS = ("추가", "넣어", "넣기", "만들", "생성")
_PENDING: dict[str, dict] = {}

# ── 문맥 위임(③) 감지 ───────────────────────────────────────────────
# '너가 추가해줘'처럼 주어(위임)만 있고 대상(도형·개수)이 없는 발화. 직전 것을 임의로
# 반복하지 않고, 무엇을·몇 개 놓을지 구체적으로 되묻는다. 대화형 폴백 직전에만 판정한다.
_RE_DELEGATE_SUBJ = re.compile(r"(너가|넌|네가|니가|당신이|자기가|대신|직접|그거|그걸|그것|이거|이걸|방금|아까)")
_RE_DELEGATE_VERB = re.compile(r"(해\s*줘|해\s*주|해줄|해볼|추가|넣어|넣|놔|놓|그려|만들어|처리|실행)")
# 도형·요소 키워드가 이미 있으면 위임이 아니라 구체 명령 → 오케스트레이터가 처리(여기선 제외)
_RE_ELEMENT_KW = re.compile(r"(사각형|네모|박스|동그라미|타원|마름모|삼각형|도형|화살표|연결선|글맵시|워드아트|글상자|텍스트\s*상자|표|이미지|아이콘|카드|슬라이드|(?<![가-힣])원(?=[\s\d을를이가]|$))")

def _is_delegate(message: str) -> bool:
    s = (message or "").strip()
    if not s:
        return False
    if _RE_ELEMENT_KW.search(s):
        return False
    return bool(_RE_DELEGATE_SUBJ.search(s) and _RE_DELEGATE_VERB.search(s))

# ── 되묻기 이어받기(③+) 상태 ─────────────────────────────────────────
# '무엇을 놓을까요'로 되물은 뒤, 사용자가 '3개'/'사각형'처럼 짧게 답하면 이어서 실행한다.
_PENDING_ELEMENT: dict[str, dict] = {}   # sid -> {'awaiting': True}
_LAST_SHAPE: dict[str, str] = {}         # sid -> 마지막으로 놓은 도형(숫자만 답할 때 이어받음)
_SHAPE_TOOLS = {"box", "round", "ellipse", "diamond", "triangle", "icon"}

def _element_answer(sid: str, message: str):
    """awaiting 상태의 짧은 답을 (tool, count)로 해석. 도형·개수가 하나도 없으면 None(답 아님)."""
    sl = _slots.extract(message)
    shape = sl.get("shape")
    count = sl.get("count")
    if shape is None and count is None:
        return None
    tool = shape or _LAST_SHAPE.get(sid) or "box"
    n = int(count) if count else 1
    return tool, max(1, min(20, n))

# 스케치 우선: 장/페이지·도형명 없는 'N개 추가/넣기'는 페이지가 아니라 도형 N개로 본다.
_RE_PAGEWORD = re.compile(r"(장|페이지|쪽)")
_RE_SHAPEADD_VERB = re.compile(r"(추가|넣|놓|더|그려)")
def _shape_add_context(message: str, sid: str):
    s = message or ""
    if _RE_ELEMENT_KW.search(s):
        return None            # 도형명·카드·표 등 명시 → 다른 경로가 처리
    if _RE_PAGEWORD.search(s):
        return None            # 장/페이지/쪽 → 페이지 의도
    if not _RE_SHAPEADD_VERB.search(s):
        return None
    count = _slots.extract(s).get("count")
    if not count:
        return None
    # 알 수 없는 명사(예: '세모')가 남아 있으면 규칙으로 단정하지 말고 LLM에 맡긴다.
    _stripped = re.sub(r"[0-9]|개|번|씩|더|또|좀|정도|만큼|추가|넣어|넣기|넣|놓아|놓|그려|만들어|만들|해줘|해주세요|해|주세요|줘|줄래|너가|네가|니가|당신이|자기가|그거|그걸|그것|이거|이걸|대신|직접|여기|저기|캔버스|에다|에|를|을|이|가|은|는|도|만|과|와|랑|하고|의|로|으로|\s|[.,!?~…]", "", s)
    if _stripped:
        return None
    tool = _LAST_SHAPE.get(sid) or "box"
    return tool, max(1, min(20, int(count)))


def detect_action(msg: str):
    """(type, payload, say) 또는 None. 카드추가 > 방향전환 > 이북만들기 순."""
    s = (msg or "").strip()
    low = s.lower()
    has_add = any(v in s for v in _ADD_VERBS)
    # 1) 특정 카드 추가
    for kw, ck, label in CARD_KEYWORDS:
        if kw.lower() in low and (has_add or "카드" in s):
            return ("add_card", {"cardKey": ck, "label": label}, f"‘{label}’ 카드를 추가했어요. 오른쪽에서 내용을 채워보세요.")
    # 2) 방향 전환
    if "가로" in s and any(v in s for v in ("바꿔", "전환", "변경", "로", "으로", "해")):
        return ("set_orientation", {"orientation": "landscape"}, "가로 덱으로 바꿨어요.")
    if "세로" in s and any(v in s for v in ("바꿔", "전환", "변경", "로", "으로", "해")):
        return ("set_orientation", {"orientation": "portrait"}, "세로 이북으로 바꿨어요.")
    # 3) 일반 '카드 추가' (특정 없음) → 표지
    if "카드" in s and has_add:
        return ("add_card", {"cardKey": "cover", "label": "표지"}, "‘표지’ 카드를 추가했어요. 다른 카드도 이름만 말씀해 주세요.")
    # 4) 이북 만들기 (확인 필요)
    if "이북" in s and any(v in s for v in ("만들", "생성", "출간", "제작", "뽑")):
        return ("make_ebook", {}, "지금 페이지로 이북을 만들까요? 아래 ‘확인’을 누르면 진행할게요.")
    return None


# 실행 투명성: ui_action → 사람이 읽는 트레이스 라벨 + 되돌리기 가능 여부.
_UNDOABLE = {"insert_element", "delete_elements"}  # 캔버스 요소 op — pushSnap 으로 되돌림 확실
def _trace_for(ui):
    if not ui:
        return None
    t = ui.get("type"); pl = ui.get("payload") or {}
    lab = None
    if t == "insert_element":
        nm = _ELEM_LABEL.get(pl.get("tool"), "도형"); n = pl.get("count")
        lab = f"{nm} {n}개 추가" if isinstance(n, int) and n > 1 else f"{nm} 추가"
    elif t == "delete_elements":
        lab = "도형 전체 삭제" if pl.get("all") else (f"{_ELEM_LABEL.get(pl.get('tool'), '도형')} 삭제" if pl.get("tool") else "도형 삭제")
    elif t == "add_card":
        lab = f"{pl.get('label', '카드')} 카드 추가"
    elif t == "add_slide":
        lab = "슬라이드 추가"
    elif t == "duplicate_slide":
        lab = "슬라이드 복제"
    elif t == "delete_slide":
        lab = "슬라이드 삭제"
    elif t == "set_theme":
        lab = "배경 다크" if pl.get("theme") == "dark" else "배경 라이트"
    elif t == "set_orientation":
        lab = "가로 덱" if pl.get("orientation") == "landscape" else "세로 이북"
    elif t == "z_order":
        lab = "맨 앞으로" if pl.get("dir") == "front" else "맨 뒤로"
    elif t == "apply_book_plan":
        lab = "이북 초안 생성"
    elif t == "apply_page_edits":
        lab = "페이지 편집"
    elif t == "make_ebook":
        lab = "이북 만들기"
    elif t == "present":
        lab = "발표 시작"
    elif t == "undo":
        lab = "실행취소"
    elif t == "redo":
        lab = "다시실행"
    elif t == "import_html":
        lab = "HTML 가져오기"
    if not lab:
        return None
    return {"label": lab, "undoable": t in _UNDOABLE}


def _pack(sid: str, answer: str, answer_kind: str = "chat", status=None, pending_action_id=None, ui_action=None) -> dict:
    return {
        "answer": answer, "answer_kind": answer_kind, "status": status, "session_id": sid,
        "suggested_questions": DEFAULT_SUGGESTIONS, "pending_action_id": pending_action_id, "ui_action": ui_action,
        "action_trace": _trace_for(ui_action),
    }


def _reply(sid: str, answer: str, **kw) -> dict:
    _SESSIONS.setdefault(sid, []).append({"role": "assistant", "content": answer})
    _conv.append(sid, "assistant", answer)
    return _pack(sid, answer, **kw)


def _new_session_id() -> str:
    # 충돌 없는 랜덤 ID. (예전엔 메모리 카운터 s1,s2… 라 서버 재시작 시
    # DB의 옛 대화 ID와 겹쳐 새 대화가 옛 대화에 섞여 붙는 버그가 있었음.)
    return "c" + uuid.uuid4().hex[:16]


def ensure_session(session_id: Optional[str]) -> str:
    if session_id and session_id in _SESSIONS:
        return session_id
    sid = session_id or _new_session_id()
    _SESSIONS.setdefault(sid, [])
    return sid

def reset_session(session_id: Optional[str]) -> dict:
    """대화 기록 + 에이전트 기억(직전 도형·대기 상태 등)만 초기화. 캔버스는 건드리지 않는다."""
    sid = session_id or _new_session_id()
    for d in (_SESSIONS, _DOC, _PENDING, _PENDING_ELEMENT, _LAST_SHAPE):
        d.pop(sid, None)
    _SESSIONS.setdefault(sid, [])
    return {"ok": True, "session_id": sid}

def list_conversations() -> list:
    return _conv.list_all()

def get_conversation(cid: str) -> dict:
    return _conv.get(cid)

def delete_conversation(cid: str) -> dict:
    return _conv.delete(cid)


def _fallback_reply(message: str) -> str:
    m = (message or "").strip().lower()
    def has(*ks): return any(k in m for k in ks)
    if not m:
        return "무엇을 도와드릴까요? 이북 만드는 법을 안내해 드릴 수 있어요."
    if has("안녕", "하이", "hi", "hello", "ㅎㅇ", "반가"):
        return ("안녕하세요! **EVER-SKETCH 챗봇**이에요. 😊\n\n"
                "왼쪽에서 카드를 고르고 오른쪽에서 내용을 채운 뒤, 오른쪽 위 **이북 만들기**를 누르면 "
                "사업모델 이북 한 권이 만들어져요. 무엇부터 해볼까요?")
    if has("이북", "만들", "생성", "출간"):
        return ("이북은 이렇게 만들어요:\n\n"
                "1. 왼쪽 **카드 고르기**에서 표지·성과·로드맵·빈 페이지 같은 카드를 클릭해 추가\n"
                "2. 오른쪽 **내용 채우기**에서 예시 문구를 고쳐 쓰기\n"
                "3. 오른쪽 위 **이북 만들기 →** 클릭\n\n"
                "못 채운 칸이 있어도 이북은 만들어지니 편하게 시작하세요.")
    if has("카드"):
        return ("**카드**는 이북의 한 장(페이지) 틀이에요. 표지·목차·마무리·성과(KPI)·로드맵·시장/경쟁·"
                "한 줄 요약·빈 페이지(블록·토글)와 프로세스·마인드맵 같은 다이어그램 카드가 준비돼 있어요. 왼쪽에서 클릭하면 추가됩니다.")
    if has("발표", "프레젠", "슬라이드"):
        return ("상단 **▷ 발표** 를 누르면 전체화면 슬라이드로 넘겨볼 수 있어요. "
                "→/Space 다음, ← 이전, Esc 로 종료합니다.")
    if has("캔버스", "화살표", "도형", "연결", "펜"):
        return ("아래 **자유 캔버스** 도구에서 도형을 클릭해 추가하고, **⤳ 연결**로 도형 두 개를 차례로 "
                "클릭하면 화살표가 생겨요. 선을 잡아 끌면 원하는 곳에서 꺾입니다. **✎ 펜**으로 자유선도 그릴 수 있어요.")
    if has("단축키", "키보드"):
        return ("되돌리기 ⌘/Ctrl+Z, 복제 ⌘/Ctrl+D, 삭제 Delete, 이북 만들기 ⌘/Ctrl+S 예요. "
                "상단 **도움말**에 전체 단축키 표가 있어요.")
    if has("환경설정", "llm", "설정", "api"):
        return ("상단 **⚙ 환경설정**에서 LLM(provider·주소·API Key·모델)을 등록하면, 제가 더 똑똑하게 "
                "답할 수 있어요. 지금은 기본 안내만 드리고 있어요.")
    return ("아직 LLM이 연결되지 않아 기본 안내만 드릴 수 있어요. 상단 **⚙ 환경설정**에서 LLM을 등록하면 "
            "자유롭게 대화할 수 있습니다. 그동안에도 '이북 만드는 법', '카드', '발표', '자유 캔버스'는 안내해 드려요.")


def _call_llm(messages: list[dict], s: dict) -> Optional[str]:
    """설정된 LLM을 1회 호출해 답변 텍스트를 반환. 실패 시 None."""
    provider = (s.get("provider") or "self").lower()
    url = llm_endpoint(provider, s.get("base_url") or "")
    api_key = s.get("api_key") or ""
    model = s.get("model") or ""
    user_id = s.get("user_id") or ""
    timeout = min(float(s.get("timeout") or 45), 60.0)
    headers = {"Content-Type": "application/json"}
    if provider == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
        sys_txt = SYSTEM_PROMPT
        conv = [m for m in messages if m["role"] != "system"]
        body = {"model": model, "max_tokens": 800, "system": sys_txt, "messages": conv}
    else:
        # 유니에버 자체 게이트웨이 호환: api_key/user_id 를 헤더 + 본문 둘 다에 넣는다.
        # (연결 테스트 _llm_test_call · 요약 _llm_chat 과 동일. 이게 없으면 게이트웨이가 거부해
        #  챗/생성/편집이 폴백되어 'LLM 연결 안 됨'으로 보인다 — 테스트만 통과하던 원인.)
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["x-api-key"] = api_key
        if user_id:
            headers["X-User-Id"] = user_id
        body = {"model": model, "max_tokens": 800, "messages": messages}
        if api_key:
            body["api_key"] = api_key
        if user_id:
            body["user_id"] = user_id
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            j = json.loads(resp.read().decode("utf-8", "replace"))
            if provider == "anthropic":
                return (j.get("content", [{}])[0] or {}).get("text", "") or None
            return (((j.get("choices") or [{}])[0]).get("message") or {}).get("content", "") or None
    except Exception:
        return None


# ── 생성 레인(G4) — 빈 이북에서 '초안/기획/이북 만들기' → planner 로 초안 생성 ──
_CREATE_EXPLICIT = re.compile(r"(초안|기획안|기획해|기획서|기획\s*좀|목차\s*짜|이북\s*짜|이북\s*기획)")
_CREATE_MAKE = re.compile(r"이북.{0,6}(만들|생성|써|작성|제작)")
# G6 자동 export 신호(opt-in) — 생성과 동시에 이북(PDF)까지 뽑아달라는 명시.
_EXPORT_CUE = re.compile(r"(뽑아|뽑아줘|출간|출력|책으로|이북으로\s*(만들|뽑)|export|내보내|만들어서\s*뽑)")


def _detect_create_brief(message: str, book_state: Optional[dict]) -> Optional[str]:
    """생성 레인 트리거. 초안/기획 명시어가 있거나, 이북이 비어있는데 '이북 만들어' 류면 브리프로 본다.
    (내용이 있는 이북의 '이북 만들어/뽑아'는 PDF 빌드(make_ebook)로 두어 충돌을 피한다.)"""
    s = (message or "").strip()
    if not s:
        return None
    pages = (book_state or {}).get("pages") or []
    if _CREATE_EXPLICIT.search(s):
        return s
    if _CREATE_MAKE.search(s) and len(pages) <= 1:
        return s
    return None


def respond(message: str, session_id: Optional[str], confirm: Optional[bool] = None,
            confirm_action_id: Optional[str] = None, book_state: Optional[dict] = None) -> dict:
    """한 번의 대화 응답. ChatAnswer 계약과 동일한 dict 반환.

    book_state: 프론트가 보낸 현재 이북 스냅샷(G1). 세션에 보관만 하고 이번 턴 응답 로직에는 아직 쓰지 않는다.
    """
    sid = ensure_session(session_id)
    _remember_doc(sid, book_state)  # G1: 매 턴 현재 이북 상태 보관·로그
    hist = _SESSIONS[sid]

    # 확인/취소 (대기 중 액션)
    if confirm is not None:
        pend = _PENDING.get(sid)
        if confirm and pend and confirm_action_id in (None, pend.get("id")):
            _PENDING.pop(sid, None)
            ui = pend.get("ui") or {"type": pend.get("type"), "auto_apply": True}
            msg = "이북을 만들게요! 오른쪽 위 진행 상태를 확인해 주세요. 📖" if ui.get("type") == "make_ebook" else "네, 진행할게요."
            return _reply(sid, msg, ui_action=ui)
        _PENDING.pop(sid, None)
        return _reply(sid, "네, 취소했어요. 다른 걸 도와드릴까요?")

    hist.append({"role": "user", "content": message})
    _conv.append(sid, "user", message)

    s = load_llm_settings()
    # 모호할 때만 쓰는 동기 LLM 분류기(미설정이면 None → 규칙만, mock 폴백)
    llm_fn = (lambda msgs: _call_llm(msgs, s)) if s.get("configured") else None

    # 되묻기 이어받기(③+): 직전에 '무엇을 놓을까요'로 물었으면, 짧은 답(도형/개수)을 먼저 해석.
    #   편집 레인보다 앞에 둬서 '3개'가 'N장 추가'로 새지 않게 한다.
    if ACTIONS_ENABLED and _PENDING_ELEMENT.get(sid, {}).get("awaiting"):
        ans = _element_answer(sid, message)
        _PENDING_ELEMENT.pop(sid, None)
        if ans:
            tool, n = ans
            _LAST_SHAPE[sid] = tool
            label = _ELEM_LABEL.get(tool, "도형")
            obj = f"‘{label}’ {n}개를" if n > 1 else f"‘{label}’{_josa_eul(label)}"
            ui = {"type": "insert_element", "payload": {"tool": tool, "count": n}, "auto_apply": True}
            return _reply(sid, f"{obj} 캔버스에 놓았어요. 위치·크기는 드래그로 바꿀 수 있어요.", ui_action=ui)
        # 답이 아니면 대기만 해제하고 평소 라우팅 계속.

    # 생성 레인(G4): 브리프 → planner → 카드 통째로 적용(apply_book_plan)
    if ACTIONS_ENABLED:
        brief = _detect_create_brief(message, book_state)
        if brief:
            from server.intent import planner, self_check
            pres = planner.make_plan(brief, llm_fn, book_state)
            plan = pres["plan"]
            warns = list(pres["warnings"])
            # G6 자기검증 — 빈 필드·과장 문구·중복(표지/목차/제목)을 경고로 합류.
            warns.extend(self_check.messages(self_check.check_plan(plan)))
            n = len(plan["pages"])
            kinds = " · ".join(p["cardKey"] for p in plan["pages"])
            src = "초안" if pres["source"] == "llm" else "기본 골격"
            note = ("\n\n⚠ 확인이 필요해요: " + " / ".join(warns[:3])) if warns else ""
            # G6 자동 export(opt-in) — 브리프에 '뽑아/출간/이북으로' 신호가 있으면 생성 직후 이북까지.
            export_after = bool(_EXPORT_CUE.search(brief))
            tail = (" 이어서 이북(PDF)까지 바로 만들게요 — 오른쪽 위 진행 상태를 확인해 주세요. 📖"
                    if export_after else
                    " 마음에 안 드는 부분은 말로 고쳐 주세요(예: ‘표지 더 강하게’). 다 되면 ‘이북으로 뽑아줘’.")
            reply = (f"‘{plan['title']}’ {n}장짜리 {src}을 만들었어요: {kinds}.\n"
                     f"화면에 바로 반영했어요 —{tail}{note}")
            ui = {"type": "apply_book_plan",
                  "payload": {"plan": plan, "warnings": warns, "export_after": export_after},
                  "auto_apply": True}
            return _reply(sid, reply, ui_action=ui)

    # 스케치 우선(N개 추가): 장/페이지·도형명 없는 'N개 추가/넣기' → 직전 도형 N개 배치.
    #   편집 레인('N장 추가')보다 앞에 둬 도형 개수를 페이지 추가로 오인하지 않게 한다.
    if ACTIONS_ENABLED:
        sac = _shape_add_context(message, sid)
        if sac:
            _tool, _n = sac
            _LAST_SHAPE[sid] = _tool
            _label = _ELEM_LABEL.get(_tool, "도형")
            _obj = f"‘{_label}’ {_n}개를" if _n > 1 else f"‘{_label}’{_josa_eul(_label)}"
            _ui = {"type": "insert_element", "payload": {"tool": _tool, "count": _n}, "auto_apply": True}
            return _reply(sid, f"{_obj} 캔버스에 놓았어요. 위치·크기는 드래그로 바꿀 수 있어요.", ui_action=_ui)

    # 편집 레인(G5): 내용 있는 이북에서 '이 장 다듬어 / 톤 통일 / N장 추가' → 대상만 수정·추가.
    # (orchestrator 의 add_slide('장 추가')보다 먼저 가로채 숫자형 'N장 추가'를 생성으로 처리한다.)
    if ACTIONS_ENABLED:
        from server.intent import editor
        eop = editor.detect_edit(message, book_state)
        if eop:
            eres = editor.make_edits(eop, message, llm_fn, book_state)
            warns = eres["warnings"]
            note = ("\n\n⚠ " + " / ".join(warns[:3])) if warns else ""
            reply = eres["summary"] + note
            ui = {"type": "apply_page_edits",
                  "payload": {"edits": eres["edits"], "adds": eres["adds"], "warnings": warns},
                  "auto_apply": True}
            return _reply(sid, reply, ui_action=ui)

    # 의도 엔진(HELIX 재조준 이식) → ui_action / 되묻기
    if ACTIONS_ENABLED:
        res = orchestrator.route(message, llm_fn=llm_fn)
        ui = res.action.as_ui_action()
        if ui is not None:
            if ui.get("type") == "insert_element":
                _t = (ui.get("payload") or {}).get("tool")
                if _t in _SHAPE_TOOLS:
                    _LAST_SHAPE[sid] = _t
            if res.needs_confirm:
                pid = f"pa{len(hist)}_{sid}"
                _PENDING[sid] = {"id": pid, "type": ui["type"], "ui": ui}
                return _reply(sid, res.reply, status="confirm_required", pending_action_id=pid)
            return _reply(sid, res.reply, ui_action=ui)
        # 하이브리드(2단계): 규칙이 확신 못 한 명령 → LLM 구조화 해석(검증된 액션만 실행).
        #   카탈로그에 없는 건 실행 자체가 안 되므로 '안 했는데 했다'는 환각이 차단된다.
        if res.intent != "smalltalk":
            _st = _hybrid.resolve(message, llm_fn)
            if _st:
                _intent, _sl = _st
                _action, _say, _confirm = _am.build(_intent, _sl)
                _ui2 = _action.as_ui_action()
                if _ui2 is not None:
                    if _ui2.get("type") == "insert_element":
                        _t2 = (_ui2.get("payload") or {}).get("tool")
                        if _t2 in _SHAPE_TOOLS:
                            _LAST_SHAPE[sid] = _t2
                    if _confirm:
                        _pid = f"pa{len(hist)}_{sid}"
                        _PENDING[sid] = {"id": _pid, "type": _ui2["type"], "ui": _ui2}
                        return _reply(sid, _say, status="confirm_required", pending_action_id=_pid)
                    return _reply(sid, _say, ui_action=_ui2)
        if res.clarify and res.reply:
            return _reply(sid, res.reply)  # 되묻기(확신 낮음/필수 슬롯 없음)
        # 액션 없음(help/smalltalk/fallback) → 대화형으로 진행

    # 카드 추가 backstop: '표지 만들어줘'처럼 카드 이름+추가동사 → add_card(오케스트레이터가 놓친 카드형)
    if ACTIONS_ENABLED:
        _act = detect_action(message)
        if _act and _act[0] == "add_card":
            _t, _payload, _say = _act
            return _reply(sid, _say, ui_action={"type": "add_card", "payload": _payload, "auto_apply": True})

    # 문맥 위임(③): '너가 추가해줘'처럼 대상 없는 위임 발화 → 직전 것을 임의로 반복하지 않고
    # 무엇을·몇 개 놓을지 구체적으로 되묻는다.
    if ACTIONS_ENABLED and _is_delegate(message):
        _PENDING_ELEMENT[sid] = {"awaiting": True}
        return _reply(sid, "무엇을 놓을까요? 도형과 개수를 구체적으로 말씀해 주세요 — 예: ‘사각형 3개’, ‘화살표 2개’, ‘동그라미 하나’.")

    # 대화형 (LLM 또는 폴백)
    answer = None
    if s.get("configured"):
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + hist[-12:]
        answer = _call_llm(msgs, s)
    if not answer:
        answer = _fallback_reply(message)
    hist.append({"role": "assistant", "content": answer})
    _conv.append(sid, "assistant", answer)
    return _pack(sid, answer)


def _chunks(text: str, size: int = 3) -> Iterator[str]:
    for i in range(0, len(text), size):
        yield text[i:i + size]


def sse_stream(message: str, session_id: Optional[str], confirm: Optional[bool] = None,
               confirm_action_id: Optional[str] = None, book_state: Optional[dict] = None) -> Iterator[bytes]:
    """meta → token* → done. (LLM은 한 번에 받아 조각내어 타이핑 효과로 전송)"""
    ans = respond(message, session_id, confirm, confirm_action_id, book_state)
    meta = {k: v for k, v in ans.items() if k != "answer"}
    yield f"event: meta\ndata: {json.dumps(meta, ensure_ascii=False)}\n\n".encode("utf-8")
    for ch in _chunks(ans["answer"]):
        yield f"event: token\ndata: {json.dumps({'t': ch}, ensure_ascii=False)}\n\n".encode("utf-8")
    yield b"event: done\ndata: {}\n\n"
