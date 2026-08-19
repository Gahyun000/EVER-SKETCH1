"""권한 판정 회귀 테스트 — 4계정 매트릭스.

W1 완료 게이트. 이 스위트가 깨지면 권한이 뚫린 것이므로 배포하지 않는다.
`decide()` 는 순수 함수라 DB·서버 없이 전 조합을 돌릴 수 있다.
"""
import pytest

from server.permissions import (
    Actor, Resource, decide, visible_project_filter, can_grant_level,
    READ, WRITE, DELETE, COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE,
    CYCLE_MANAGE, USER_MANAGE, TEMPLATE_MANAGE, ALL_ACTIONS,
)

# ── 4계정 + 비활성 ─────────────────────────────
PENDING = Actor(id="u_pend", level=0, status="pending")
L1U = Actor(id="u_l1", level=1, status="active")
L2U = Actor(id="u_l2", level=2, status="active")
L2B = Actor(id="u_l2b", level=2, status="active")   # 타인 이북 접근 테스트용
L3U = Actor(id="u_l3", level=3, status="active")
DISABLED = Actor(id="u_dis", level=3, status="disabled")   # 레벨은 높지만 비활성

OWN = Resource(owner_id="u_l2", published=False)        # L2U 소유, 미발행
OTHER = Resource(owner_id="u_l2b", published=False)     # 타인 소유
PUB = Resource(owner_id="u_l2b", published=True)        # 타인 소유, 발행본


# ── 승인 대기 · 비활성 · 비로그인 ─────────────────────────────
@pytest.mark.parametrize("actor", [None, PENDING, DISABLED])
@pytest.mark.parametrize("action", ALL_ACTIONS)
def test_비활성_계정은_모든_액션_거부(actor, action):
    """승인 전 계정은 로그인은 되지만 어떤 이북에도 접근하지 못한다."""
    assert decide(actor, action, OWN) is False
    assert decide(actor, action, PUB) is False


def test_비활성은_레벨이_3이어도_거부():
    """강등·비활성화 직후 남은 세션으로 옛 권한을 쓰지 못하게 하는 방어선."""
    assert DISABLED.level == 3
    assert decide(DISABLED, READ, PUB) is False
    assert decide(DISABLED, USER_MANAGE) is False


# ── L1 열람자 ─────────────────────────────
def test_L1은_발행본만_읽는다():
    assert decide(L1U, READ, PUB) is True
    assert decide(L1U, READ, OWN) is False      # 미발행
    assert decide(L1U, READ, OTHER) is False


def test_L1은_편집_삭제_불가():
    assert decide(L1U, WRITE, PUB) is False
    assert decide(L1U, DELETE, PUB) is False


def test_L1은_메모를_읽지도_쓰지도_못한다():
    """확정 사항 — L1에게는 메모 존재 자체를 노출하지 않는다."""
    assert decide(L1U, COMMENT_READ, PUB) is False
    assert decide(L1U, COMMENT_WRITE, PUB) is False
    assert decide(L1U, COMMENT_RESOLVE, PUB) is False


# ── L2 작성자 ─────────────────────────────
def test_L2는_본인_이북만_읽고_쓴다():
    assert decide(L2U, READ, OWN) is True
    assert decide(L2U, WRITE, OWN) is True
    assert decide(L2U, READ, OTHER) is False
    assert decide(L2U, WRITE, OTHER) is False


def test_L2도_발행본은_읽는다():
    assert decide(L2U, READ, PUB) is True
    assert decide(L2U, WRITE, PUB) is False     # 읽기만


def test_L2는_본인_것도_삭제_불가():
    """삭제는 L3만. 회차 자료 유실 방지."""
    assert decide(L2U, DELETE, OWN) is False
    assert decide(L2U, DELETE, OTHER) is False


def test_L2는_본인_이북_메모만():
    assert decide(L2U, COMMENT_READ, OWN) is True
    assert decide(L2U, COMMENT_WRITE, OWN) is True
    assert decide(L2U, COMMENT_READ, OTHER) is False
    assert decide(L2U, COMMENT_WRITE, OTHER) is False


def test_L2는_관리_액션_불가():
    for action in (CYCLE_MANAGE, USER_MANAGE, TEMPLATE_MANAGE):
        assert decide(L2U, action) is False
        assert decide(L2U, action, OWN) is False


def test_L2는_소유자_불명이면_거부():
    """owner_id 가 없는 레거시 데이터에 L2가 접근하지 못하게 한다(이관 전 방어)."""
    orphan = Resource(owner_id=None, published=False)
    assert decide(L2U, READ, orphan) is False
    assert decide(L2U, WRITE, orphan) is False


def test_L2는_리소스_없으면_거부():
    assert decide(L2U, READ, None) is False


# ── L3 관리자 ─────────────────────────────
@pytest.mark.parametrize("action", ALL_ACTIONS)
@pytest.mark.parametrize("res", [OWN, OTHER, PUB, None])
def test_L3는_전부_허용(action, res):
    assert decide(L3U, action, res) is True


# ── 방어적 기본값 ─────────────────────────────
def test_모르는_액션은_거부():
    """오타난 액션명이 조용히 통과하면 안 된다."""
    assert decide(L3U, "delet", OWN) is False
    assert decide(L3U, "", OWN) is False


def test_이상한_레벨은_거부():
    weird = Actor(id="x", level=99, status="active")
    assert decide(weird, READ, PUB) is False
    zero = Actor(id="x", level=0, status="active")   # active 지만 레벨 미부여
    assert decide(zero, READ, PUB) is False


# ── 목록 필터 ─────────────────────────────
def test_목록_필터가_개별_판정과_일치():
    assert visible_project_filter(L3U) == "all"
    assert visible_project_filter(L2U) == "own_or_published"
    assert visible_project_filter(L1U) == "published"
    assert visible_project_filter(PENDING) == "none"
    assert visible_project_filter(DISABLED) == "none"
    assert visible_project_filter(None) == "none"


# ── 레벨 부여 ─────────────────────────────
def test_L3만_레벨을_부여한다():
    ok, _ = can_grant_level(L3U, "u_other", 2)
    assert ok is True
    for actor in (L1U, L2U, PENDING, None):
        ok, why = can_grant_level(actor, "u_other", 2)
        assert ok is False and why


def test_자기_자신은_레벨_변경_불가():
    """마지막 L3가 스스로 강등해 관리자가 사라지는 사고를 막는다."""
    ok, why = can_grant_level(L3U, L3U.id, 1)
    assert ok is False
    assert "자기 자신" in why


def test_범위_밖_레벨_거부():
    for lv in (0, 4, -1, 99):
        ok, _ = can_grant_level(L3U, "u_other", lv)
        assert ok is False
