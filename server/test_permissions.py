"""권한 판정 회귀 테스트 — 4계정 매트릭스.

W1 완료 게이트. 이 스위트가 깨지면 권한이 뚫린 것이므로 배포하지 않는다.
`decide()` 는 순수 함수라 DB·서버 없이 전 조합을 돌릴 수 있다.
"""
import pathlib

import pytest

from server.permissions import (
    Actor, Resource, decide, visible_project_filter, can_grant_role, can_see_approval,
    READ, WRITE, DELETE, COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE,
    USER_MANAGE, SETTINGS_MANAGE, PUBLISH, FOLDER_MANAGE, ALL_ACTIONS,
    SUBMIT, AI_USE, TEMPLATE_USE,
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


# ── Lv3 열람자 ─────────────────────────────
VIEWER_OWN = Resource(owner_id="u_l1", published=False)   # VIEWER_U 의 개인 스케치


def test_열람자는_발행본과_제_스케치를_읽는다():
    """**D13.** 원래(D3) 열람자는 발행본만 봤다. 그러면 발행본이 없는 동안은
    로그인해도 빈 화면이다 — 그래서 제 작업 공간을 열어 줬다."""
    assert decide(VIEWER_U, READ, PUB) is True
    assert decide(VIEWER_U, READ, VIEWER_OWN) is True
    assert decide(VIEWER_U, READ, OWN) is False       # 남의 미발행
    assert decide(VIEWER_U, READ, OTHER) is False


def test_열람자는_제_스케치만_고치고_지운다():
    assert decide(VIEWER_U, WRITE, VIEWER_OWN) is True
    assert decide(VIEWER_U, DELETE, VIEWER_OWN) is True
    assert decide(VIEWER_U, WRITE, PUB) is False      # 남의 발행본을 고칠 수는 없다
    assert decide(VIEWER_U, DELETE, PUB) is False
    assert decide(VIEWER_U, WRITE, OWN) is False


def test_열람자는_제출하지_못한다():
    """**D13 의 경계.** 개인 스케치는 「개인」에서 끝난다 —
    제출이 열리면 결재가 열리고, 결재가 열리면 팀 공유가 열린다(D6)."""
    assert decide(VIEWER_U, SUBMIT, VIEWER_OWN) is False


def test_열람자는_회사_서식도_AI도_못_쓴다():
    """**P2 에서 미뤄 둔 `TEMPLATE_USE` 가 여기서 처음 `WRITE` 와 갈린다** —
    제 스케치는 쓰지만(WRITE=O) 나갈 데 없는 문서에 회사 서식은 필요 없다."""
    assert decide(VIEWER_U, WRITE, VIEWER_OWN) is True
    assert decide(VIEWER_U, TEMPLATE_USE, VIEWER_OWN) is False
    assert decide(VIEWER_U, TEMPLATE_USE, None) is False
    assert decide(VIEWER_U, AI_USE, VIEWER_OWN) is False


def test_작성자는_회사_서식을_쓴다():
    assert decide(WRITER_U, TEMPLATE_USE, None) is True
    assert decide(ADMIN_U, TEMPLATE_USE, None) is True


def test_열람자는_메모를_읽지도_쓰지도_못한다():
    """확정 사항 — L1에게는 메모 존재 자체를 노출하지 않는다.
    **제 스케치라도** 마찬가지다: 메모는 결재 흐름의 도구인데 L3 은 제출을 못 한다."""
    assert decide(VIEWER_U, COMMENT_READ, PUB) is False
    assert decide(VIEWER_U, COMMENT_WRITE, PUB) is False
    assert decide(VIEWER_U, COMMENT_RESOLVE, PUB) is False
    assert decide(VIEWER_U, COMMENT_READ, VIEWER_OWN) is False
    assert decide(VIEWER_U, COMMENT_WRITE, VIEWER_OWN) is False


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


# ── 잠금 (P7 · D8) ─────────────────────────────
def test_잠긴_자료는_주인도_못_고친다():
    """잠그는 이유는 **결재자·팀이 본 것과 작성자가 가진 것이 갈라지지 않게** 하는 것이다.
    「내 자료인데 왜」가 아니라 「이미 남이 봤기 때문에」다."""
    locked = Resource(owner_id=WRITER_U.id, locked=True)
    assert decide(WRITER_U, WRITE, locked) is False
    assert decide(WRITER_U, SUBMIT, locked) is False
    # 열람자의 개인 스케치도 **같은 규칙**을 쓴다 — 규칙이 두 벌이면 한쪽만 고쳐진다.
    assert decide(VIEWER_U, WRITE, Resource(owner_id=VIEWER_U.id, locked=True)) is False


def test_잠금_기본값은_고칠_수_있는_쪽이다():
    """`locked` 의 기본값은 False 이고, 그러면 **고쳐진다.**
    `has_approval_history` 와 똑같이 안전한 쪽으로 실패하지 않는다."""
    assert Resource(owner_id="x").locked is False
    assert decide(WRITER_U, WRITE, Resource(owner_id=WRITER_U.id)) is True


def test_라우터가_잠금을_채운다():
    """이 배선이 빠지면 **승인된 자료가 그냥 고쳐진다** — 팀이 보는 그림과
    작성자가 가진 문서가 소리 없이 갈라진다(D8 이 뚫린다)."""
    src = (pathlib.Path(__file__).resolve().parent / "authdeps.py").read_text(encoding="utf-8")
    assert "locked=" in src and "is_locked(" in src, \
        "_resource_of 가 잠금을 채우지 않습니다 (D8 이 뚫립니다)"


def test_삭제는_잠금과_무관하다():
    """**일부러 갈라 둔 규칙이다.** 삭제를 막는 근거는 「결재 이력이 있는가」(D16)지
    「지금 잠겼는가」가 아니다 — 반려된 자료(열림)도 이력이 있으면 못 지운다."""
    rejected = Resource(owner_id=WRITER_U.id, locked=False, has_approval_history=True)
    assert decide(WRITER_U, WRITE, rejected) is True
    assert decide(WRITER_U, DELETE, rejected) is False


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


# ── Lv1 관리자 ─────────────────────────────
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
    assert visible_project_filter(VIEWER_U) == "own_or_published"
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


# ── 결재 가시성 (P6) ─────────────────────────────
# 판정에 팀이 들어오는 **유일한** 지점이다. 여기가 틀리면 남의 팀 자료가 보인다.
A_TEAM = Actor(id="u_a", role="writer", status="active", team_ids=("t_sales",))
B_TEAM = Actor(id="u_b", role="writer", status="active", team_ids=("t_tech",))
NO_TEAM = Actor(id="u_n", role="writer", status="active")


def _ap(status="approved", team="t_sales", requester="u_x"):
    return {"id": "a1", "status": status, "team_id": team, "requester": requester}


def test_같은_팀_승인본은_보인다():
    """**D6 — 승인이 곧 공유.** 이 한 줄이 P6 의 전부다."""
    assert can_see_approval(A_TEAM, _ap()) is True


def test_다른_팀_승인본은_안_보인다():
    assert can_see_approval(B_TEAM, _ap()) is False
    assert can_see_approval(NO_TEAM, _ap()) is False


def test_승인_전에는_팀에_안_보인다():
    """대기·반려·회수는 낸 사람과 결재자 사이의 일이다. 팀은 **결과만** 본다."""
    for st in ("pending", "rejected", "withdrawn"):
        assert can_see_approval(A_TEAM, _ap(status=st)) is False


def test_낸_사람은_상태와_무관하게_제_것을_본다():
    """반려당한 제 제출본을 못 보면 무엇을 고쳐야 하는지 알 수가 없다."""
    for st in ("pending", "approved", "rejected", "withdrawn"):
        assert can_see_approval(A_TEAM, _ap(status=st, requester="u_a")) is True
    # 팀을 옮겨도 제가 낸 것은 계속 본다 — 「낸 사람」 자격은 팀과 무관하다.
    assert can_see_approval(B_TEAM, _ap(team="t_sales", requester="u_b")) is True


def test_팀은_제출_시점_팀이지_지금_소속이_아니다():
    """**D9.** A팀에서 낸 승인본은 A팀에 남는다. 낸 사람이 B팀으로 옮겨도
    B팀 사람들에게 그 자료가 따라가지 않는다."""
    moved = _ap(team="t_sales", requester="u_moved")
    assert can_see_approval(B_TEAM, moved) is False
    # 반대로 A팀에 새로 들어온 사람은 그날부터 본다 — 자료는 팀의 것이다(D18).
    newbie = Actor(id="u_new", role="viewer", status="active", team_ids=("t_sales",))
    assert can_see_approval(newbie, moved) is True


def test_관리자는_결재_전부_본다():
    assert can_see_approval(ADMIN_U, _ap(status="pending", team="t_tech")) is True


def test_비활성_비로그인은_결재를_못_본다():
    dead = Actor(id="u_a", role="writer", status="disabled", team_ids=("t_sales",))
    assert can_see_approval(dead, _ap()) is False
    assert can_see_approval(None, _ap()) is False
    assert can_see_approval(A_TEAM, None) is False


def test_팀_없는_승인본은_아무에게도_안_열린다():
    """`team_id` 가 빈 문자열인 건이 섞여 들어와도 「빈 값 == 빈 값」으로
    통과하면 안 된다 — 그 순간 팀 없는 사람에게 남의 자료가 전부 열린다."""
    orphan = _ap(team="")
    assert can_see_approval(NO_TEAM, orphan) is False
    assert can_see_approval(A_TEAM, orphan) is False
