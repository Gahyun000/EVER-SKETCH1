"""권한 판정 — 단일 지점.

설계사상 ② "권한은 화면이 아니라 데이터에 붙는다".
버튼을 숨기는 것은 UX이고, 막는 것은 이 파일이다.

**모든 읽기·쓰기·삭제 판정은 이 모듈의 `decide()` 하나만 통과한다.**
라우터마다 `if level >= 2` 를 흩뿌리면 반드시 빠뜨리는 곳이 생기고, 그게 곧 권한 우회 구멍이 된다.
새 엔드포인트를 추가할 때도 여기에 액션을 하나 늘리는 방식으로만 확장한다.

의존성 없음(순수 함수) — DB도 FastAPI도 모른다. 그래서 테스트가 쉽고, 테스트가 쉬우니 실제로 테스트된다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# ── 레벨 ─────────────────────────────────────────────
L_NONE = 0   # 승인 대기 — 아무 권한 없음
L1 = 1       # 열람자
L2 = 2       # 작성자
L3 = 3       # 관리자

LEVEL_NAMES = {L_NONE: "승인대기", L1: "열람자", L2: "작성자", L3: "관리자"}

# ── 액션 ─────────────────────────────────────────────
READ = "read"
WRITE = "write"
DELETE = "delete"
COMMENT_READ = "comment_read"
COMMENT_WRITE = "comment_write"
COMMENT_RESOLVE = "comment_resolve"
CYCLE_MANAGE = "cycle_manage"     # 회차 개설·마감·발행
USER_MANAGE = "user_manage"       # 가입 승인·레벨 변경·비활성화
TEMPLATE_MANAGE = "template_manage"

ALL_ACTIONS = (
    READ, WRITE, DELETE,
    COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE,
    CYCLE_MANAGE, USER_MANAGE, TEMPLATE_MANAGE,
)


@dataclass(frozen=True)
class Actor:
    """판정에 필요한 사용자 정보만 담는다(비밀번호 해시 같은 건 여기 오지 않는다)."""
    id: str
    level: int
    status: str          # pending | active | disabled

    @property
    def is_active(self) -> bool:
        return self.status == "active"


@dataclass(frozen=True)
class Resource:
    """판정 대상. 프로젝트가 아닌 액션(USER_MANAGE 등)은 None 을 넘긴다."""
    owner_id: Optional[str] = None
    cycle_status: Optional[str] = None   # Cycles.status — 'published' 여야 L1이 볼 수 있다
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
    if actor.level not in (L1, L2, L3):
        return False

    # ── L3 관리자 ─────────────────────────────
    if actor.level == L3:
        return True           # 전체 권한

    # ── 관리 액션은 L3 전용 ────────────────────
    if action in (CYCLE_MANAGE, USER_MANAGE, TEMPLATE_MANAGE):
        return False

    # ── L1 열람자 ─────────────────────────────
    if actor.level == L1:
        # 발행된 회차 결과물만, 읽기만.
        # 메모는 존재 자체를 노출하지 않는다(확정 사항) — 읽기도 쓰기도 불가.
        if action == READ:
            return bool(res and res.published)
        return False

    # ── L2 작성자 ─────────────────────────────
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
        # 삭제는 L3만. 회차 자료 유실 방지(삭제 요청 워크플로는 v1.1 이월)
        return False
    if action in (COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE):
        # 본인 이북의 메모만. 답글·해결요청 가능
        return owns

    return False


def visible_project_filter(actor: Optional[Actor]) -> str:
    """목록 조회에서 쓸 필터 종류를 돌려준다. 'all' | 'own_or_published' | 'published' | 'none'

    개별 판정(`decide`)과 목록 필터가 어긋나면 '목록에는 보이는데 열면 403' 같은 버그가 난다.
    두 경로 모두 이 모듈에서만 결정한다.
    """
    if actor is None or not actor.is_active:
        return "none"
    if actor.level == L3:
        return "all"
    if actor.level == L2:
        return "own_or_published"
    if actor.level == L1:
        return "published"
    return "none"


def can_grant_level(actor: Optional[Actor], target_user_id: str, new_level: int) -> tuple[bool, str]:
    """레벨 부여·변경 가능 여부. (허용, 사유) 를 돌려준다.

    거부 사유를 문자열로 함께 주는 이유 — 관리자 화면에서 '왜 안 되는지'를 보여줘야
    담당자가 헤매지 않는다. 단순 False 면 "버튼이 안 먹네"로 끝난다.
    """
    if not decide(actor, USER_MANAGE):
        return False, "관리자(L3)만 승인·레벨 변경을 할 수 있습니다."
    if new_level not in (L1, L2, L3):
        return False, "레벨은 1~3만 지정할 수 있습니다."
    assert actor is not None
    if actor.id == target_user_id:
        # 본인 강등으로 관리자가 사라지는 사고를 막는다.
        return False, "자기 자신의 레벨은 변경할 수 없습니다."
    return True, ""
