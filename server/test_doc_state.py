"""자료 상태 파생 회귀 테스트 (P7).

`derive()` 는 순수 함수라 DB·서버 없이 전 조합을 돌릴 수 있다.
**모든 (kind, status) 조합을 빠짐없이** 돌린다 — 상태 기계에서 사고가 나는 자리는
언제나 「생각해 본 적 없는 조합」이다.
"""
import itertools

import pytest

from server import doc_state as ds
from server.approvals import KINDS, STATUSES


def row(kind, status):
    return {"kind": kind, "status": status}


# ── 빠짐이 없다 ─────────────────────────────
@pytest.mark.parametrize("kind,status", list(itertools.product(KINDS, STATUSES)))
def test_모든_조합이_아는_상태를_낸다(kind, status):
    """**「생각해 본 적 없는 조합」이 사고가 나는 자리다.** 조합을 늘리면 여기서 걸린다."""
    assert ds.derive(row(kind, status)) in ds.ALL_STATES


@pytest.mark.parametrize("state", ds.ALL_STATES)
def test_모든_상태가_잠금_여부를_밝힌다(state):
    """`is_locked` 는 목록에 없는 상태를 **열린다**고 답한다 — 안전한 방향이 아니다.
    그래서 상태를 새로 만들면 잠금 여부를 반드시 정하게 여기서 강제한다."""
    assert isinstance(ds.is_locked(state), bool)
    assert isinstance(ds.label(state), str)


def test_모르는_상태는_안_잠근다는_사실을_적어_둔다():
    """기본값이 「열림」이라는 것을 **테스트가 알고 있어야** 한다.
    누가 상태를 추가하고 `_LOCKED` 를 안 건드리면 조용히 편집이 열린다."""
    assert ds.is_locked("난생처음보는상태") is False


# ── 결재 없는 자료 ─────────────────────────────
def test_결재를_안_탄_자료는_초안이다():
    assert ds.derive(None) == ds.DRAFT
    assert ds.derive({}) == ds.DRAFT


def test_회수하면_다시_초안이다():
    """이력에는 남지만(D16) 지금 걸려 있는 결재는 없다 — 고쳐서 다시 낼 수 있다."""
    assert ds.derive(row("approval", "withdrawn")) == ds.DRAFT
    assert ds.is_locked(ds.DRAFT) is False


# ── 결재 흐름 ─────────────────────────────
def test_제출하면_잠긴다():
    """**결재자가 보고 있는 동안 문서가 바뀌면 안 된다** —
    승인 도장이 무엇에 찍힌 것인지 알 수 없어진다."""
    assert ds.derive(row("approval", "pending")) == ds.PENDING
    assert ds.is_locked(ds.PENDING) is True


def test_반려되면_열린다():
    """고치라고 돌려준 것이다. 잠근 채로 돌려주면 고칠 수가 없다."""
    assert ds.derive(row("approval", "rejected")) == ds.REJECTED
    assert ds.is_locked(ds.REJECTED) is False


def test_승인되면_잠긴다():
    """팀이 보고 있는 자료다(D6). 잠그지 않으면
    「팀이 본 것」과 「지금 문서」가 소리 없이 달라진다."""
    assert ds.derive(row("approval", "approved")) == ds.APPROVED
    assert ds.is_locked(ds.APPROVED) is True


# ── 수정 요청 흐름 (D8) ─────────────────────────────
def test_수정_요청_중에는_아직_못_고친다():
    """허락을 기다리는 중이다. 여기서 열어 주면 「요청」이 형식이 된다."""
    assert ds.derive(row("revision", "pending")) == ds.REVISION_PENDING
    assert ds.is_locked(ds.REVISION_PENDING) is True


def test_허락받으면_고칠_수_있다():
    """**P7 의 핵심.** 승인본은 얼어 있는 채로 팀에 남고, 작업본만 열린다."""
    assert ds.derive(row("revision", "approved")) == ds.REVISING
    assert ds.is_locked(ds.REVISING) is False
    assert ds.label(ds.REVISING) == "수정 중"


def test_수정_요청이_거절되면_있던_그대로다():
    """**되돌아갈 자리가 승인본뿐이다** — 수정 요청은 승인본이 있어야만 낼 수 있다.
    여기서 `draft` 로 떨어뜨리면 승인받은 자료의 잠금이 거절 한 번에 풀린다."""
    assert ds.derive(row("revision", "rejected")) == ds.APPROVED
    assert ds.is_locked(ds.APPROVED) is True


def test_수정을_그만두면_있던_그대로다():
    """「수정 중」이 영원히 남는 것을 막는 유일한 길이다.
    그만둬도 승인본은 그대로이므로 팀 화면은 아무 일도 없다."""
    assert ds.derive(row("revision", "withdrawn")) == ds.APPROVED


# ── 배지 ─────────────────────────────
def test_기본_상태에는_배지가_없다():
    """모든 줄에 배지가 붙으면 배지가 아니라 배경이 된다."""
    assert ds.label(ds.DRAFT) == "" and ds.label(ds.APPROVED) == ""


def test_손이_필요한_상태에만_글자가_붙는다():
    for st in (ds.PENDING, ds.REJECTED, ds.REVISION_PENDING, ds.REVISING):
        assert ds.label(st), st


# ── 제출·수정요청 가능 여부 ─────────────────────────────
def test_고칠_수_있으면_낼_수도_있다():
    """두 규칙이 되는 순간 「고칠 수는 있는데 낼 수는 없는」 상태가 생긴다."""
    for st in ds.ALL_STATES:
        assert ds.can_submit(st) is (not ds.is_locked(st)), st


def test_수정_요청은_승인본에만():
    """아직 승인 안 된 자료는 요청할 것 없이 그냥 고치면 된다."""
    assert ds.can_request_revision(ds.APPROVED) is True
    for st in (ds.DRAFT, ds.PENDING, ds.REJECTED, ds.REVISION_PENDING, ds.REVISING):
        assert ds.can_request_revision(st) is False, st
