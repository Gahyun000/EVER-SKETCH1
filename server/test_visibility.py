"""누가 무엇을 볼 수 있는가 — 역할 × 소유 관계 전체 표.

왜 표로 검사하는가:
열람 범위는 **틀려도 화면이 멀쩡해 보이는** 종류의 규칙이다. 너무 넓으면
남의 초안이 새어 나가고, 너무 좁으면 본인 자료도 못 연다. 둘 다 조용히 잘못된다.
그래서 규칙 하나하나를 따로 검사하지 않고, 판정해야 할 칸을 전부 적어 놓고
그 표와 코드를 맞춘다. 규칙을 바꾸면 표가 먼저 틀어져서 눈에 띈다.

── 회차가 사라지면서 바뀐 것 (2026-09-04, P2) ──
예전 이 파일은 (보는 사람, 자료 주인, **회차 단계**) 3축 표였다. 회차를 걷어내면서
'같은 회차 동료' 라는 개념이 사라졌고, 동료 열람·동료 지적 규칙도 함께 없어졌다.
그 자리는 **팀 단위 승인본 공유**(P6)가 채운다 — 작성 중인 남의 자료는 보이지 않는다.
지금 표는 (보는 사람, 자료 주인) 2축이다.
"""
from server.permissions import (
    AI_USE,
    COMMENT_READ,
    COMMENT_RESOLVE,
    COMMENT_WRITE,
    DELETE,
    READ,
    WRITE,
    Actor,
    Resource,
    decide,
    visible_project_filter,
)

ADMIN = Actor(id="u_admin", role="admin", status="active")
ME = Actor(id="u_me", role="writer", status="active")
PEER = Actor(id="u_peer", role="writer", status="active")
VIEWER = Actor(id="u_view", role="viewer", status="active")

MINE = Resource(owner_id="u_me")
PEERS = Resource(owner_id="u_peer")
PUBLISHED = Resource(owner_id="u_peer", published=True)

ALL_DOC_ACTIONS = (READ, WRITE, DELETE, COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE)


# ══════════ 본인 자료 ══════════
def test_본인_자료는_읽고_쓴다():
    assert decide(ME, READ, MINE) is True
    assert decide(ME, WRITE, MINE) is True


def test_본인_자료는_결재_전에만_지운다():
    """**D16 — P5 에서 열렸다.** 이 자리에는 원래 「본인 자료도 삭제는 못 한다」가 있었다.
    결재 테이블이 없어 판정할 이력이 없었기 때문이고, 없는 근거로 열어 두지 않았다.

    이제 갈리는 것은 **결재를 탔는가**다. 제출한 적 없는 초안은 제 것이니 지운다.
    한 번이라도 냈으면 못 지운다 — 거둬들인 건도 마찬가지다(남이 봤을 수 있다).
    """
    assert decide(ME, DELETE, Resource(owner_id=ME.id, has_approval_history=False)) is True
    assert decide(ME, DELETE, Resource(owner_id=ME.id, has_approval_history=True)) is False


def test_본인_자료에는_언제나_의견을_단다():
    """관리자 지적에 답할 수 있어야 한다."""
    assert decide(ME, COMMENT_READ, MINE) is True
    assert decide(ME, COMMENT_WRITE, MINE) is True


# ══════════ 남의 자료 — 회차 동료 예외가 사라졌다 ══════════
def test_남의_자료는_아무것도_못_한다():
    """회차 시절에는 '같은 회차 동료' 면 읽고 지적할 수 있었다. 그 예외가 없어졌다.
    팀 승인본은 P6 에서 별도 경로로 열린다 — 작성 중인 남의 자료는 아니다."""
    for action in ALL_DOC_ACTIONS:
        assert decide(ME, action, PEERS) is False, action


def test_남이_발행했어도_작성자에게는_안_보인다():
    """`published_id` 는 이북 PNG 빌드 산출물 표시로 의미가 줄었다(D6).
    작성자의 목록 필터가 'own' 이므로, 여기서 True 를 돌려주면
    '목록엔 없는데 링크로는 열리는' 상태가 된다."""
    assert decide(ME, READ, PUBLISHED) is False


# ══════════ 열람자 ══════════
def test_열람자는_발행본만_읽는다():
    """팀 승인본 열람은 P6 에서 이 자리를 대체한다."""
    assert decide(VIEWER, READ, PUBLISHED) is True
    assert decide(VIEWER, READ, PEERS) is False
    assert decide(VIEWER, READ, MINE) is False


def test_열람자는_쓰지도_지우지도_못한다():
    for action in (WRITE, DELETE):
        assert decide(VIEWER, action, PUBLISHED) is False, action


def test_열람자에게는_지적이_존재하지_않는다():
    """메모는 존재 자체를 노출하지 않는다(확정 사항)."""
    for action in (COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE):
        assert decide(VIEWER, action, PUBLISHED) is False, action


def test_열람자는_AI_도구를_쓰지_못한다():
    assert decide(VIEWER, AI_USE) is False


def test_작성자는_AI_도구를_쓴다():
    assert decide(ME, AI_USE) is True


# ══════════ 관리자 ══════════
def test_관리자는_전부_된다():
    for action in ALL_DOC_ACTIONS:
        for res in (MINE, PEERS, PUBLISHED):
            assert decide(ADMIN, action, res) is True, (action, res)


# ══════════ 목록 필터와 개별 판정이 어긋나지 않는다 ══════════
def test_목록_필터_이름이_바뀌면_여기서_걸린다():
    assert visible_project_filter(ADMIN) == "all"
    assert visible_project_filter(ME) == "own"
    assert visible_project_filter(VIEWER) == "published"


def test_작성자_필터와_개별_판정이_같은_말을_한다():
    """'own' 은 "본인 것만" 이다. decide 도 본인 것에만 True 를 줘야 한다 —
    어긋나면 '목록엔 보이는데 열면 403' 또는 그 반대가 난다."""
    assert visible_project_filter(ME) == "own"
    assert decide(ME, READ, MINE) is True
    assert decide(ME, READ, PEERS) is False
    assert decide(ME, READ, PUBLISHED) is False


def test_열람자_필터와_개별_판정이_같은_말을_한다():
    assert visible_project_filter(VIEWER) == "published"
    assert decide(VIEWER, READ, PUBLISHED) is True
    assert decide(VIEWER, READ, PEERS) is False


# ══════════ 소유자를 모르면 거부 ══════════
def test_소유자_불명이면_거부():
    """owner_id 가 없는 레거시 데이터에 작성자가 접근하지 못하게 한다."""
    orphan = Resource(owner_id=None)
    for action in ALL_DOC_ACTIONS:
        assert decide(ME, action, orphan) is False, action
