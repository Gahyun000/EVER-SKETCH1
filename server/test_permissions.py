"""권한 판정 회귀 테스트 — 4계정 매트릭스.

W1 완료 게이트. 이 스위트가 깨지면 권한이 뚫린 것이므로 배포하지 않는다.
`decide()` 는 순수 함수라 DB·서버 없이 전 조합을 돌릴 수 있다.
"""
import pathlib

import pytest

from server.permissions import (
    Actor, Resource, decide, visible_project_filter, can_grant_role,
    READ, WRITE, DELETE, COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE,
    USER_MANAGE, SETTINGS_MANAGE, PUBLISH, FOLDER_MANAGE, ALL_ACTIONS,
)

# ── 4계정 + 비활성 ─────────────────────────────
PENDING = Actor(id="u_pend", role="", status="pending")
VIEWER_U = Actor(id="u_l1", role="viewer", status="active")
WRITER_U = Actor(id="u_l2", role="writer", status="active")
WRITER_B = Actor(id="u_l2b", role="writer", status="active")   # 타인 이북 접근 테스트용
ADMIN_U = Actor(id="u_l3", role="admin", status="active")
DISABLED = Actor(id="u_dis", role="admin", status="disabled")   # 레벨은 높지만 비활성

OWN = Resource(owner_id="u_l2", published=False)        # WRITER_U 소유, 미발행
OTHER = Resource(owner_id="u_l2b", published=False)     # 타인 소유
PUB = Resource(owner_id="u_l2b", published=True)        # 타인 소유, 발행본


# ── 승인 대기 · 비활성 · 비로그인 ─────────────────────────────
@pytest.mark.parametrize("actor", [None, PENDING, DISABLED])
@pytest.mark.parametrize("action", ALL_ACTIONS)
def test_비활성_계정은_모든_액션_거부(actor, action):
    """승인 전 계정은 로그인은 되지만 어떤 이북에도 접근하지 못한다."""
    assert decide(actor, action, OWN) is False
    assert decide(actor, action, PUB) is False


def test_비활성은_관리자여도_거부():
    """강등·비활성화 직후 남은 세션으로 옛 권한을 쓰지 못하게 하는 방어선."""
    assert DISABLED.role == "admin"
    assert decide(DISABLED, READ, PUB) is False
    assert decide(DISABLED, USER_MANAGE) is False


# ── L1 열람자 ─────────────────────────────
def test_열람자는_발행본만_읽는다():
    assert decide(VIEWER_U, READ, PUB) is True
    assert decide(VIEWER_U, READ, OWN) is False      # 미발행
    assert decide(VIEWER_U, READ, OTHER) is False


def test_열람자는_편집_삭제_불가():
    assert decide(VIEWER_U, WRITE, PUB) is False
    assert decide(VIEWER_U, DELETE, PUB) is False


def test_열람자는_메모를_읽지도_쓰지도_못한다():
    """확정 사항 — L1에게는 메모 존재 자체를 노출하지 않는다."""
    assert decide(VIEWER_U, COMMENT_READ, PUB) is False
    assert decide(VIEWER_U, COMMENT_WRITE, PUB) is False
    assert decide(VIEWER_U, COMMENT_RESOLVE, PUB) is False


# ── L2 작성자 ─────────────────────────────
def test_작성자는_본인_이북만_읽고_쓴다():
    assert decide(WRITER_U, READ, OWN) is True
    assert decide(WRITER_U, WRITE, OWN) is True
    assert decide(WRITER_U, READ, OTHER) is False
    assert decide(WRITER_U, WRITE, OTHER) is False


def test_작성자에게는_남의_발행본이_보이지_않는다():
    """회차를 걷어내면서 바뀐 계약이다(P2).

    `published_id` 는 이북 PNG 빌드 산출물 표시로 의미가 줄었고(D6),
    작성자의 목록 필터는 'own' 이 됐다. 여기서 True 를 돌려주면
    **목록엔 없는데 링크로는 열리는** 상태가 된다.
    팀 단위 승인본 공유는 P6 에서 별도 경로로 붙는다."""
    assert decide(WRITER_U, READ, PUB) is False
    assert decide(WRITER_U, WRITE, PUB) is False


def test_작성자는_결재_전_자료만_지운다():
    """**D16 (P5 에서 열렸다).** 예전에는 「삭제는 관리자만」이었다 —
    결재 테이블이 없어 판정할 이력이 없었기 때문이고, 없는 근거로 열어 두지 않았다.

    이제 규칙은 **결재를 한 번이라도 탔는가**다. 안 탔으면 제 초안이니 지운다.
    탔으면 못 지운다 — 남의 눈에 든 자료가 조용히 사라지면 「분명히 봤는데 없다」가 되고,
    결재 이력만 남아 무엇을 승인했는지 알 수 없어진다.
    """
    fresh = Resource(owner_id=WRITER_U.id, has_approval_history=False)
    used = Resource(owner_id=WRITER_U.id, has_approval_history=True)
    assert decide(WRITER_U, DELETE, fresh) is True
    assert decide(WRITER_U, DELETE, used) is False
    # 남의 것은 이력과 무관하게 못 지운다
    assert decide(WRITER_U, DELETE, Resource(owner_id="u_other")) is False
    assert decide(WRITER_U, DELETE, OTHER) is False


def test_삭제_이력_기본값은_지울_수_있는_쪽이다():
    """`has_approval_history` 의 기본값은 False 이고, 그러면 **지워진다.**
    안전한 쪽으로 실패하지 않으므로 **라우터가 반드시 채워야 한다** —
    `authdeps._resource_of` 가 그 일을 하고, 아래 테스트가 그걸 지킨다."""
    assert Resource(owner_id="x").has_approval_history is False
    assert decide(WRITER_U, DELETE, Resource(owner_id=WRITER_U.id)) is True


def test_라우터가_결재_이력을_채운다():
    """위 기본값 때문에 이 배선이 빠지면 **이미 결재를 탄 자료가 지워진다.**"""
    src = (pathlib.Path(__file__).resolve().parent / "authdeps.py").read_text(encoding="utf-8")
    assert "has_approval_history=" in src and "has_history(" in src, \
        "_resource_of 가 결재 이력을 채우지 않습니다 (D16 이 뚫립니다)"


def test_작성자는_본인_이북_메모만():
    assert decide(WRITER_U, COMMENT_READ, OWN) is True
    assert decide(WRITER_U, COMMENT_WRITE, OWN) is True
    assert decide(WRITER_U, COMMENT_READ, OTHER) is False
    assert decide(WRITER_U, COMMENT_WRITE, OTHER) is False


def test_작성자는_관리_액션_불가():
    for action in (USER_MANAGE, SETTINGS_MANAGE, PUBLISH):
        assert decide(WRITER_U, action) is False
        assert decide(WRITER_U, action, OWN) is False


def test_작성자는_소유자_불명이면_거부():
    """owner_id 가 없는 레거시 데이터에 L2가 접근하지 못하게 한다(이관 전 방어)."""
    orphan = Resource(owner_id=None, published=False)
    assert decide(WRITER_U, READ, orphan) is False
    assert decide(WRITER_U, WRITE, orphan) is False


def test_작성자는_리소스_없으면_거부():
    assert decide(WRITER_U, READ, None) is False


# ── L3 관리자 ─────────────────────────────
# **관리자에게도 열리지 않는 액션.** 여기 적힌 것만 예외다 —
# 목록에 없는 액션이 관리자에게 막히면 아래 테스트가 잡는다.
ADMIN_EXCEPTIONS = {FOLDER_MANAGE}


@pytest.mark.parametrize("action", [a for a in ALL_ACTIONS if a not in ADMIN_EXCEPTIONS])
@pytest.mark.parametrize("res", [OWN, OTHER, PUB, None])
def test_관리자는_전부_허용(action, res):
    assert decide(ADMIN_U, action, res) is True


def test_관리자에게도_남의_폴더는_안_열린다():
    """**「관리자는 전부 허용」의 유일한 예외**(P4, 2026-09-04).

    관리자는 남의 **자료**를 본다 — 결재해야 하므로 그래야 한다.
    그러나 **서랍**은 다르다. 폴더는 정리 도구일 뿐이고(D20), 남의 정리를 대신할
    이유가 없다. 폴더 이름은 사적 메모에 가깝다 —
    「2026 재무 구조조정」 같은 이름이 목록에 뜨면 그 이름 자체가 정보다.

    그래서 `decide()` 는 이 액션을 **관리자 전면 허용보다 먼저** 판정한다.
    예외를 늘리려면 `ADMIN_EXCEPTIONS` 에 적고 여기에 사유를 함께 남긴다.
    """
    # 주의: OWN 은 **작성자**(u_l2)의 것이다. 관리자에게는 그것도 남의 서랍이다.
    assert decide(ADMIN_U, FOLDER_MANAGE, OWN) is False
    assert decide(ADMIN_U, FOLDER_MANAGE, OTHER) is False
    assert decide(ADMIN_U, FOLDER_MANAGE, Resource(owner_id=ADMIN_U.id)) is True  # 제 서랍
    assert decide(ADMIN_U, FOLDER_MANAGE, None) is False    # 소유자를 모르면 막힌다
    # 자료는 여전히 본다. 두 규칙이 서로 다른 것을 말한다.
    assert decide(ADMIN_U, READ, OTHER) is True


def test_관리자_예외는_최소한으로_유지된다():
    """예외가 늘면 그만큼 「관리자는 전부 허용」이라는 문장이 거짓에 가까워진다.
    늘릴 때 이 테스트를 함께 고치게 한다."""
    assert ADMIN_EXCEPTIONS == {FOLDER_MANAGE}


# ── 방어적 기본값 ─────────────────────────────
def test_모르는_액션은_거부():
    """오타난 액션명이 조용히 통과하면 안 된다."""
    assert decide(ADMIN_U, "delet", OWN) is False
    assert decide(ADMIN_U, "", OWN) is False


def test_이상한_역할은_거부():
    weird = Actor(id="x", role="superuser", status="active")
    assert decide(weird, READ, PUB) is False
    zero = Actor(id="x", role="", status="active")   # active 지만 역할 미부여
    assert decide(zero, READ, PUB) is False


# ── 목록 필터 ─────────────────────────────
def test_목록_필터가_개별_판정과_일치():
    assert visible_project_filter(ADMIN_U) == "all"
    assert visible_project_filter(WRITER_U) == "own"
    assert visible_project_filter(VIEWER_U) == "published"
    assert visible_project_filter(PENDING) == "none"
    assert visible_project_filter(DISABLED) == "none"
    assert visible_project_filter(None) == "none"


# ── 레벨 부여 ─────────────────────────────
def test_관리자만_역할을_부여한다():
    ok, _ = can_grant_role(ADMIN_U, "u_other", "writer")
    assert ok is True
    for actor in (VIEWER_U, WRITER_U, PENDING, None):
        ok, why = can_grant_role(actor, "u_other", "writer")
        assert ok is False and why


def test_자기_자신은_역할_변경_불가():
    """마지막 관리자가 스스로 강등해 관리자가 사라지는 사고를 막는다."""
    ok, why = can_grant_role(ADMIN_U, ADMIN_U.id, "viewer")
    assert ok is False
    assert "자기 자신" in why


def test_없는_역할_거부():
    for bad in ("", "superuser", "ADMIN", "관리자", None, 3):
        ok, _ = can_grant_role(ADMIN_U, "u_other", bad)
        assert ok is False
