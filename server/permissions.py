"""권한 판정 — 단일 지점.

설계사상 ② "권한은 화면이 아니라 데이터에 붙는다".
버튼을 숨기는 것은 UX이고, 막는 것은 이 파일이다.

**모든 읽기·쓰기·삭제 판정은 이 모듈의 `decide()` 하나만 통과한다.**
라우터마다 `if role == 'admin'` 을 흩뿌리면 반드시 빠뜨리는 곳이 생기고, 그게 곧 권한 우회 구멍이 된다.
새 엔드포인트를 추가할 때도 여기에 액션을 하나 늘리는 방식으로만 확장한다.

── 왜 숫자가 아니라 역할명인가 ────────────────────────────
초기 설계는 L1(열람) < L2(작성) < L3(관리) 처럼 **숫자가 클수록 권한이 큰** 모델이었다.
그런데 사내 표기 관례는 "1등급이 최고"다. 숫자를 뒤집는 순간
`if level == 3` 같은 코드가 전부 반대로 동작한다 — 열람자에게 관리자 메뉴가 열린다.

그래서 저장·판정은 **역할명**(`admin` / `writer` / `viewer`)으로 하고,
숫자는 **화면 표시용 등급**으로만 쓴다(`DISPLAY_GRADE`).
등급 체계를 또 바꾸더라도 이 파일과 DB는 건드리지 않는다.

의존성 없음(순수 함수) — DB도 FastAPI도 모른다. 그래서 테스트가 쉽고, 테스트가 쉬우니 실제로 테스트된다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# ── 역할 (저장·판정의 진실) ──────────────────────────
ADMIN = "admin"      # 관리자 — 회의 주관·기획
WRITER = "writer"    # 작성자 — 임원·부서 담당자
VIEWER = "viewer"    # 열람자 — 일반 참석자
NONE = ""            # 미부여 (승인 대기)

ROLES = (ADMIN, WRITER, VIEWER)

ROLE_NAMES = {ADMIN: "관리자", WRITER: "작성자", VIEWER: "열람자", NONE: "미부여"}

# ── 표시용 등급 (화면 라벨 전용) ──────────────────────
# 확정 2026-08-19: 1등급이 최고 권한(사내 표기 관례).
# **이 표는 화면에만 쓴다.** 판정에 쓰면 숫자 체계를 바꿀 때 또 같은 문제가 생긴다.
DISPLAY_GRADE = {ADMIN: 1, WRITER: 2, VIEWER: 3}
GRADE_TO_ROLE = {v: k for k, v in DISPLAY_GRADE.items()}


def role_label(role: str) -> str:
    """화면 문구. 예: 'Lv1 관리자'"""
    if role not in DISPLAY_GRADE:
        return ROLE_NAMES.get(role, "미부여")
    return "Lv%d %s" % (DISPLAY_GRADE[role], ROLE_NAMES[role])


def grade_of(role: str) -> Optional[int]:
    return DISPLAY_GRADE.get(role)


def role_of_grade(grade: int) -> Optional[str]:
    """화면에서 올라온 등급 숫자를 역할로 되돌린다. 모르는 값이면 None(거부)."""
    return GRADE_TO_ROLE.get(grade)


# ── 액션 ─────────────────────────────────────────────
READ = "read"
WRITE = "write"
DELETE = "delete"
COMMENT_READ = "comment_read"
COMMENT_WRITE = "comment_write"
COMMENT_RESOLVE = "comment_resolve"
COMMENT_FIX = "comment_fix"       # 「고쳤습니다」 — 지적받은 쪽이 답하는 표시
SUBMIT = "submit"                 # 결재 제출 — 본인 자료만. 열람자는 못 한다 (D13)
DECIDE = "decide"                 # 승인·반려 — 결재자는 L1 한 명이다 (D11)
FOLDER_MANAGE = "folder_manage"   # 개인 폴더 — **관리자도 남의 것은 못 만진다** (D20)
TEAM_MANAGE = "team_manage"       # 팀 편성 — 누가 누구 자료를 보게 되는지를 정한다 (D1)
USER_MANAGE = "user_manage"       # 가입 승인·역할 변경·비활성화
SETTINGS_MANAGE = "settings_manage"   # LLM 설정 — API 키를 다룬다(UDS-107 §5)
# 이북 발행. **2026-09-16 에 작성자(L2)에게도 열었다**(사용자 지시: 「Lv2까진 이북발행
# 가능하게」). 그전에는 관리자 전용이었고, 이유는 「발행하면 열람자 전원에게 공개되고
# 되돌릴 수 없다」였다. 그 걱정은 없어지지 않았으므로 **범위로 좁혔다** —
# 작성자는 **제 자료만** 발행한다. 남의 자료를 발행할 수 있으면 「내가 만들지도 않은
# 초안이 공개됐다」가 되고, 그건 관리자 전용이던 시절보다 나쁘다.
# 열람자(L3)는 그대로 못 한다 — 제출조차 못 하는 순수 개인 작업 공간이다(D13).
PUBLISH = "publish"
AI_USE = "ai_use"                 # 챗봇·요약·계획·덱변환·docx. 작성 도구이므로 작성자 이상
# 표준 템플릿(회사 서식)으로 새 자료를 시작한다.
# **P2 에서 미뤄 두고 P6 에서 만든 액션이다.** P1~P5 동안에는 `WRITE` 와 언제나 같은 답을
# 냈다(L3 은 아무것도 못 썼다). D13 이 L3 에게 개인 스케치를 열어 주는 지금,
# 처음으로 답이 갈린다 — L3 은 제 스케치를 쓰지만(WRITE=O) 회사 서식은 못 쓴다.
# 서식은 결재를 타고 팀에 나갈 문서의 틀인데, L3 은 제출 자체를 못 하기 때문이다.
TEMPLATE_USE = "template_use"
# 승인된 자료를 **고치게 해 달라**고 청한다 (P7 · D8). 본인 승인본만.
REVISION_REQUEST = "revision_request"
# 그 청을 허락 · 거절한다. 결재자는 한 명이다 (D11).
REVISION_DECIDE = "revision_decide"

ALL_ACTIONS = (
    READ, WRITE, DELETE,
    COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE, COMMENT_FIX,
    SUBMIT, DECIDE,
    FOLDER_MANAGE, TEAM_MANAGE, USER_MANAGE, SETTINGS_MANAGE, PUBLISH, AI_USE,
    TEMPLATE_USE, REVISION_REQUEST, REVISION_DECIDE,
)

# 관리자 전용 액션. 새 관리 기능을 추가하면 여기에 넣는다.
# **PUBLISH 는 2026-09-16 에 여기서 나갔다** — 작성자도 제 자료는 발행한다(위 설명).
_ADMIN_ONLY = (DECIDE, REVISION_DECIDE, TEAM_MANAGE, USER_MANAGE, SETTINGS_MANAGE)


@dataclass(frozen=True)
class Actor:
    """판정에 필요한 사용자 정보만 담는다(비밀번호 해시 같은 건 여기 오지 않는다)."""
    id: str
    role: str            # admin | writer | viewer | '' (미부여)
    status: str          # pending | active | disabled
    # 지금 소속된 팀들. **매 요청 DB 에서 다시 읽는다**(auth.actor_of) —
    # 토큰에 실어 두면 L1 이 팀을 옮겨도 그 사람 화면은 옛 팀을 계속 본다.
    # 기본값이 빈 튜플인 이유: 팀을 모르는 판정(USER_MANAGE 등)이 훨씬 많고,
    # 기존 `Actor(id, role, status)` 호출부가 인자 하나 늘었다고 깨지면 안 된다.
    # P6 에서 "같은 팀 승인본"을 판정할 때부터 실제로 쓰인다.
    team_ids: tuple[str, ...] = ()

    @property
    def is_active(self) -> bool:
        return self.status == "active"


@dataclass(frozen=True)
class Resource:
    """판정 대상. 프로젝트가 아닌 액션(USER_MANAGE 등)은 None 을 넘긴다."""
    owner_id: Optional[str] = None
    published: bool = False
    # **결재를 한 번이라도 탄 자료인가**(D16). 탔으면 작성자는 못 지운다 —
    # 남의 눈에 든 자료가 조용히 사라지면 「분명히 봤는데 없다」가 된다.
    # 회수한 건(withdrawn)도 이력으로 센다. 자료 하나를 두고 판정할 때만 채운다.
    has_approval_history: bool = False
    # **지금 편집이 막혀 있는가**(P7 · `doc_state.is_locked`). 결재자가 보고 있거나
    # 팀이 보고 있는 문서는 잠긴다 — 안 잠그면 「승인 도장이 무엇에 찍혔는지」를
    # 나중에 알 수 없어진다. 이 값도 기본이 False(=열림) 라 **안전한 쪽이 아니다.**
    # 그래서 라우터가 반드시 채운다(`authdeps._resource_of`, test_routes_perm 이 지킨다).
    locked: bool = False
    # 그 지적을 **누가 썼는가.** 해결(닫기)은 지적한 사람 몫이다 —
    # 담당자가 자기에게 온 지적을 스스로 닫으면 검토가 형식이 된다.
    # 지적 하나를 두고 판정할 때만 채운다(목록 조회 등에는 None).
    comment_author_id: Optional[str] = None


def decide(actor: Optional[Actor], action: str, res: Optional[Resource] = None) -> bool:
    """허용이면 True. 판정 규칙 전체가 이 함수 안에 있다.

    기본값은 **거부**다. 조건에 걸리지 않으면 떨어진다 — 새 액션을 추가했는데
    규칙을 안 적으면 '열려버리는' 게 아니라 '막히는' 쪽으로 실패해야 한다.
    """
    # 비로그인 / 승인대기 / 비활성 → 전부 거부
    if actor is None or not actor.is_active:
        return False
    if action not in ALL_ACTIONS:
        return False          # 오타난 액션명이 조용히 통과하지 않도록
    if actor.role not in ROLES:
        return False          # 미부여·알 수 없는 역할

    # ── 개인 폴더 — 관리자보다 **먼저** 판정한다 ──
    # 관리자는 남의 *자료*를 본다(결재해야 하므로). 그러나 *서랍*은 다르다 —
    # 폴더는 정리 도구일 뿐이고(D20), 남의 정리를 대신할 이유가 없다.
    # 폴더 이름은 사적 메모에 가깝다(「2026 재무 구조조정」 같은 이름 자체가 정보다).
    # 그래서 이 한 줄이 관리자 전면 허용 **위**에 있다.
    if action == FOLDER_MANAGE:
        return bool(res and res.owner_id and res.owner_id == actor.id)

    # ── 관리자 ─────────────────────────────
    if actor.role == ADMIN:
        return True

    # ── 관리 액션은 관리자 전용 ────────────────
    if action in _ADMIN_ONLY:
        return False

    # ── 열람자 ─────────────────────────────
    if actor.role == VIEWER:
        # **D13 — 개인 스케치.** 원래(D3) L3 은 순수 열람자였다. 그런데 그러면
        # 로그인해도 발행본이 없는 동안은 빈 화면만 본다. D13 이 이를 뒤집어,
        # L3 에게 **아무에게도 안 보이는 제 작업 공간**을 준다.
        #
        # 「개인」이 무슨 뜻인지 아래 세 줄이 전부다 —
        #   · 제 것은 읽고 쓰고 지운다(발행본도 읽는다)
        #   · **제출은 못 한다**(SUBMIT). 그래서 결재도, 팀 공유도 일어나지 않는다.
        #   · 회사 서식(TEMPLATE_USE)·AI 도구(AI_USE)는 못 쓴다.
        #     서식은 결재를 타고 나갈 문서의 틀이고, LLM 은 비용과 외부 전송을
        #     수반한다(UDS-107 §3). 나갈 데가 없는 문서에 둘 다 필요 없다.
        # 메모는 존재 자체를 노출하지 않는다(확정 사항) — 제 것이라도 불가.
        # L3 의 자료에는 결재 이력이 생길 수 없으므로(제출 불가) 삭제는 언제나 열린다.
        if res is None or res.owner_id is None:
            return bool(action == READ and res and res.published)
        owns_v = res.owner_id == actor.id
        if action == READ:
            return owns_v or res.published
        if action == WRITE:
            # 열람자의 스케치는 제출이 안 되니 잠길 일이 없다. 그래도 **같은 규칙을
            # 쓴다** — 규칙이 두 벌이면 언젠가 한쪽만 고쳐진다.
            return owns_v and not res.locked
        if action == DELETE:
            return owns_v
        return False

    # ── 작성자 ─────────────────────────────
    # AI 도구·회사 서식은 특정 이북에 매이지 않는다 — 리소스 없이 판정한다.
    if action in (AI_USE, TEMPLATE_USE):
        return True

    # 소유 기반. 소유자 판정이 불가능하면 거부.
    #
    # **회차 시절의 '동료 열람'은 없어졌다.** 같은 회차에 배부본을 가진 사람끼리
    # 서로의 장을 보던 규칙인데, 회차가 사라지면서 '동료'를 정의할 근거가 없어졌다.
    # 팀 단위 공유는 P6 에서 승인본에만 열린다 — 작성 중인 남의 자료는 보이지 않는다.
    if res is None or res.owner_id is None:
        return False
    owns = res.owner_id == actor.id

    if action == READ:
        # **본인 것만.** 목록 필터(visible_project_filter)의 'own' 과 짝이 맞아야 한다 —
        # 어긋나면 '목록엔 없는데 열리는' 또는 '보이는데 403' 이 난다.
        return owns
    if action == SUBMIT:
        # **열람자는 여기 오지 않는다** — 위 VIEWER 분기에서 이미 걸렸다(D13:
        # L3 도 개인 스케치는 만들지만 제출은 못 하는 순수 개인 작업 공간).
        # 잠긴 자료는 못 낸다 — 「고칠 수 있으면 낼 수 있다」가 한 규칙이어야
        # 「고칠 수는 있는데 낼 수는 없는」 상태가 안 생긴다(`doc_state.can_submit`).
        return owns and not res.locked
    if action == WRITE:
        # 고치는 것은 본인 것만. 회차 단계에 따른 잠금은 사라졌고,
        # **결재 상태에 따른 잠금이 P7 에서 그 자리에 왔다.**
        # 잠기는 이유는 결재자·팀이 본 것과 작성자가 가진 것이 갈라지지 않게 하는 것이다.
        # 「반려」와 「수정 중」은 고치라고 열어 준 상태라 잠기지 않는다(`doc_state`).
        return owns and not res.locked
    if action == PUBLISH:
        # **본인 자료만**(2026-09-16). 열람자는 위 분기에서 이미 걸렸으므로 여기 안 온다.
        # 잠금(`locked`)은 안 본다 — 승인되어 잠긴 자료야말로 발행할 물건이다.
        # 「발행하면 되돌릴 수 없다」는 걱정은 그대로라, 범위를 제 것으로 묶어 둔다.
        return owns
    if action == REVISION_REQUEST:
        # **본인 승인본만.** 「지금 승인 상태인가」는 여기서 안 본다 —
        # 그건 권한이 아니라 흐름의 조건이고, `approvals.request_revision` 이
        # 「승인된 자료만」이라고 사람이 읽을 수 있는 말로 거절한다.
        return owns
    if action == DELETE:
        # **D16 (P5 에서 열었다)** — 결재를 한 번도 안 탄 자료는 작성자가 지운다.
        # 한 번이라도 탔으면 못 지운다: 남의 눈에 든 자료가 조용히 사라지면
        # 「분명히 봤는데 없다」가 되고, 결재 이력만 남아 무엇을 승인했는지 알 수 없어진다.
        # 이력을 아직 안 채워 넣은 호출부는 기본값 False 라 **지울 수 있는 쪽**으로 떨어진다 —
        # 그래서 라우터가 반드시 채운다(test_routes_perm 이 지킨다).
        return owns and not res.has_approval_history
    if action == COMMENT_READ:
        # 볼 수 있는 자료의 의견은 볼 수 있다. 따로 가르면 '자료는 보이는데
        # 거기 달린 지적은 안 보이는' 상태가 되어 같은 지적이 두 번 달린다.
        return owns
    if action == COMMENT_FIX:
        # 「고쳤습니다」는 **지적받은 쪽**이 누른다 — 내 자료의 지적만.
        return owns
    if action == COMMENT_RESOLVE and res.comment_author_id is not None:
        # **지적한 사람이 닫는다.**
        # 담당자가 스스로 닫게 두면 "고쳤다" 와 "정말 고쳤다" 가 구분되지 않고,
        # 발행 직전의 '미해결 0건' 이 아무것도 보장하지 못하게 된다.
        # 대신 담당자에게는 「고쳤습니다」(COMMENT_FIX)가 있다.
        # 자리를 비운 리뷰어 때문에 회차가 막히는 경우는 관리자가 푼다.
        return res.comment_author_id == actor.id
    if action in (COMMENT_WRITE, COMMENT_RESOLVE):
        # 내 자료에는 언제나(관리자 지적에 답해야 한다).
        return owns

    return False


def is_admin(actor: Optional[Actor]) -> bool:
    """'관리자인가'를 묻는 유일한 방법. 라우터·화면이 역할 문자열을 직접 비교하지 않도록."""
    return actor is not None and actor.is_active and actor.role == ADMIN


def visible_project_filter(actor: Optional[Actor]) -> str:
    """목록 조회에서 쓸 필터 종류를 돌려준다. 'all' | 'own_or_published' | 'published' | 'none'

    개별 판정(`decide`)과 목록 필터가 어긋나면 '목록에는 보이는데 열면 403' 같은 버그가 난다.
    두 경로 모두 이 모듈에서만 결정한다.
    """
    if actor is None or not actor.is_active:
        return "none"
    if actor.role == ADMIN:
        return "all"
    if actor.role == WRITER:
        # **본인 것만.** decide() 의 READ 규칙과 짝이 맞아야 한다 —
        # 어긋나면 '목록엔 보이는데 열면 403' 이 난다.
        # 팀 승인본은 P6 에서 별도 화면(팀 공유)으로 붙는다.
        return "own"
    if actor.role == VIEWER:
        # **본인 것 + 발행본** (D13). 「published」 하나였을 때 L3 은 제 스케치를
        # 만들어 놓고도 목록에서 찾지 못했다. decide() 의 열람자 READ 규칙
        # (owns or published)과 글자 그대로 짝이다.
        return "own_or_published"
    return "none"


def can_grant_role(actor: Optional[Actor], target_user_id: str, new_role: str) -> tuple[bool, str]:
    """역할 부여·변경 가능 여부. (허용, 사유) 를 돌려준다.

    거부 사유를 문자열로 함께 주는 이유 — 관리자 화면에서 '왜 안 되는지'를 보여줘야
    담당자가 헤매지 않는다. 단순 False 면 "버튼이 안 먹네"로 끝난다.
    """
    if not decide(actor, USER_MANAGE):
        return False, "관리자만 승인·역할 변경을 할 수 있습니다."
    if new_role not in ROLES:
        return False, "역할은 관리자·작성자·열람자 중에서 지정할 수 있습니다."
    assert actor is not None
    if actor.id == target_user_id:
        # 본인 강등으로 관리자가 사라지는 사고를 막는다.
        return False, "자기 자신의 역할은 변경할 수 없습니다."
    return True, ""


def can_see_approval(actor: Optional[Actor], approval: Optional[dict]) -> bool:
    """결재 건 하나가 이 사람에게 보이는가. **세 줄이 전부다.**

        · 관리자 — 전부. 결재자가 한 명이므로(D11) 결재함이 곧 전체 목록이다.
        · 낸 사람 — 제 것. 상태와 무관하다(반려·회수한 것도 제 이력이다).
        · 같은 팀 — **승인된 것만**(D6 「승인이 곧 공유」).

    세 번째 줄이 P6 의 전부다. 그리고 그 줄은 `approval["team_id"]` 를 본다 —
    **제출 시점에 못박힌 팀**이지 지금 소속이 아니다(D9). 그래서 사람이 B팀으로
    옮기면 A팀 시절 제 승인본은 A팀에 남고, 본인은 「낸 사람」 자격으로만 계속 본다.
    반대로 B팀에 새로 들어온 사람은 그날부터 B팀의 옛 승인본을 본다 —
    자료는 사람이 아니라 **팀의 것**이기 때문이다(D18).

    이 함수가 결재 API(`routes_approvals`)와 팀 공유(`team_library`) **양쪽의
    유일한 판정**이다. 두 곳이 각자 규칙을 적으면 한쪽에서만 보이는 자료가 생긴다.
    """
    if actor is None or not actor.is_active or not approval:
        return False
    if is_admin(actor):
        return True
    if approval.get("requester") == actor.id:
        return True
    if approval.get("status") != "approved":
        # 대기·반려·회수는 낸 사람과 결재자 사이의 일이다. 팀은 결과만 본다.
        return False
    tid = approval.get("team_id") or ""
    return bool(tid and tid in actor.team_ids)


def can_see_approval_thread(actor: Optional[Actor], approval: Optional[dict]) -> bool:
    """결재 **대화**(코멘트)를 볼 수 있는가. `can_see_approval` 보다 한 칸 좁다.

    자료가 팀에 공유된다고 해서 그 자료를 두고 오간 말까지 팀에 공유되는 것은 아니다.
    「3쪽 수치가 작년 것입니다」 같은 지적은 낸 사람과 결재자 사이의 일이고,
    그게 팀 전체에 흐르면 사람들이 결재함에서 솔직하게 지적하기를 그만둔다.

    그래서 대화는 **당사자만** 본다 — 관리자와 낸 사람.
    팀은 결과물(스냅샷)을 보고, 대화는 안 본다.
    """
    if not can_see_approval(actor, approval):
        return False
    assert actor is not None and approval is not None
    return is_admin(actor) or approval.get("requester") == actor.id
