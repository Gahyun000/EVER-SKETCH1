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
CYCLE_MANAGE = "cycle_manage"     # 회차 개설·마감
USER_MANAGE = "user_manage"       # 가입 승인·역할 변경·비활성화
TEMPLATE_MANAGE = "template_manage"
SETTINGS_MANAGE = "settings_manage"   # LLM 설정 — API 키를 다룬다(UDS-107 §5)
PUBLISH = "publish"               # 이북 발행 — 열람자 전원에게 공개된다. 되돌리기 어렵다
AI_USE = "ai_use"                 # 챗봇·요약·계획·덱변환·docx. 작성 도구이므로 작성자 이상

ALL_ACTIONS = (
    READ, WRITE, DELETE,
    COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE,
    CYCLE_MANAGE, USER_MANAGE, TEMPLATE_MANAGE,
    SETTINGS_MANAGE, PUBLISH, AI_USE,
)

# 관리자 전용 액션. 새 관리 기능을 추가하면 여기에 넣는다.
_ADMIN_ONLY = (CYCLE_MANAGE, USER_MANAGE, TEMPLATE_MANAGE, SETTINGS_MANAGE, PUBLISH)


@dataclass(frozen=True)
class Actor:
    """판정에 필요한 사용자 정보만 담는다(비밀번호 해시 같은 건 여기 오지 않는다)."""
    id: str
    role: str            # admin | writer | viewer | '' (미부여)
    status: str          # pending | active | disabled

    @property
    def is_active(self) -> bool:
        return self.status == "active"


@dataclass(frozen=True)
class Resource:
    """판정 대상. 프로젝트가 아닌 액션(USER_MANAGE 등)은 None 을 넘긴다."""
    owner_id: Optional[str] = None
    cycle_status: Optional[str] = None   # Cycles.status — 'published' 여야 열람자가 볼 수 있다
    published: bool = False


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

    # ── 관리자 ─────────────────────────────
    if actor.role == ADMIN:
        return True

    # ── 관리 액션은 관리자 전용 ────────────────
    # PUBLISH 가 여기 있는 이유 — 발행하면 열람자 전원에게 공개된다.
    # 작성자가 초안을 실수로 발행하면 되돌릴 수 없다(이미 본 사람은 본 것이다).
    if action in _ADMIN_ONLY:
        return False

    # ── 열람자 ─────────────────────────────
    if actor.role == VIEWER:
        # 발행된 회차 결과물만, 읽기만.
        # 메모는 존재 자체를 노출하지 않는다(확정 사항) — 읽기도 쓰기도 불가.
        # AI 도구도 불가 — 열람자에게 작성 보조가 필요할 이유가 없고,
        # LLM 호출은 비용과 외부 전송을 수반한다(UDS-107 §3).
        if action == READ:
            return bool(res and res.published)
        return False

    # ── 작성자 ─────────────────────────────
    # AI 도구는 특정 이북에 매이지 않는다 — 리소스 없이 판정한다.
    if action == AI_USE:
        return True

    # 소유 기반: '내 것'만. 소유자 판정이 불가능하면 거부.
    if res is None or res.owner_id is None:
        return False
    owns = res.owner_id == actor.id

    if action == READ:
        # 본인 이북 + 발행본
        return owns or bool(res.published)
    if action == WRITE:
        return owns
    if action == DELETE:
        # 삭제는 관리자만. 회차 자료 유실 방지(삭제 요청 워크플로는 v1.1 이월)
        return False
    if action in (COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE):
        # 본인 이북의 메모만. 답글·해결요청 가능
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
        return "own_or_published"
    if actor.role == VIEWER:
        return "published"
    return "none"


def visible_cycle_filter(actor: Optional[Actor]) -> str:
    """회차 목록에서 무엇을 보여줄지. 'all' | 'mine_or_published' | 'published' | 'none'

    프로젝트와 마찬가지로 목록 필터를 라우터가 따로 판단하지 않는다.
    열람자는 **진행 중인 회차의 존재 자체를 알 필요가 없다** —
    아직 정리되지 않은 회차가 있다는 사실도 정보다.
    """
    if actor is None or not actor.is_active:
        return "none"
    if actor.role == ADMIN:
        return "all"
    if actor.role == WRITER:
        return "mine_or_published"
    if actor.role == VIEWER:
        return "published"
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
