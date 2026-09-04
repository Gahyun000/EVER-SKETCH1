"""자료의 상태 — **저장하지 않고 파생한다** (P7, 전환계획 §3.4).

상태를 `Projects` 에 칼럼으로 두면 진실이 두 곳이 된다: 결재 행과 그 칼럼.
둘은 반드시 어긋난다 — 승인 트랜잭션이 반쯤 실패하거나, 나중에 결재를 고치는
경로가 하나 더 생기거나, 마이그레이션이 한쪽만 건드리는 순간에. 그리고 어긋나면
**어느 쪽이 맞는지 알 방법이 없다.**

그래서 상태는 **최신 결재 행 하나에서 계산한다.** 진실은 `Approvals` 에만 있다.

    없음 / 거둠            → draft             편집 O · 팀에 안 보임
    approval  · pending    → pending           편집 X · 「결재 중」
    approval  · rejected   → rejected          편집 O · 「반려」
    approval  · approved   → approved          편집 X · 팀이 본다
    revision  · pending    → revision_pending  편집 X · 「수정 요청 중」
    revision  · approved   → revising          편집 **O** · 「수정 중」
    revision  · rejected   → approved          거절당했으면 **있던 그대로다**
    revision  · withdrawn  → approved          수정을 그만뒀으면 있던 그대로다

── 왜 revision 행이 승인본을 안 가리는가 ────────────────────
수정 요청 행에는 스냅샷이 없다(`snapshot IS NULL`). 「이 문서를 고치겠다」는 요청이지
문서 그 자체가 아니기 때문이다. 그래서 **팀이 보는 그림은 수정 요청과 무관하게
직전 승인본 그대로**다 — D8(「수정 중에 보던 자료가 사라지면 안 된다」)이
추가 장치 없이 풀리는 자리가 여기다. 화면에는 「수정 중」 글자만 얹는다.

── `locked` 의 경계 ────────────────────────────────────
잠그는 이유는 **결재자가 본 것과 작성자가 가진 것이 달라지지 않게** 하는 것이다.
그래서 `pending`(결재자가 보고 있다) · `approved`(결재자가 봤고 팀도 본다) ·
`revision_pending`(허락을 기다리는 중)은 잠기고,
`rejected`(고치라고 돌려준 것) · `revising`(고치라고 허락한 것)은 열린다.

의존성 없음(순수 함수) — DB 도 FastAPI 도 모른다. `permissions.py` 와 같은 이유다.
"""
from __future__ import annotations

from typing import Optional

DRAFT = "draft"
PENDING = "pending"
REJECTED = "rejected"
APPROVED = "approved"
REVISION_PENDING = "revision_pending"
REVISING = "revising"

ALL_STATES = (DRAFT, PENDING, REJECTED, APPROVED, REVISION_PENDING, REVISING)

# 화면 배지. **글자로 붙는다** — 색으로만 상태를 구분하지 않는다(표준).
# `draft`·`approved` 에 배지가 없는 이유: 자료 목록의 기본값이라 모든 줄에 붙으면
# 배지가 아니라 배경이 된다. 「승인됨」은 잠금 자물쇠로 따로 보인다.
LABEL = {
    DRAFT: "",
    PENDING: "결재 중",
    REJECTED: "반려",
    APPROVED: "",
    REVISION_PENDING: "수정 요청 중",
    REVISING: "수정 중",
}

# 편집이 막히는 상태. **여기 없는 것은 열린다** — 새 상태를 추가하고 규칙을 안 적으면
# 잠기는 게 아니라 열리는 쪽으로 실패한다. 그래서 `ALL_STATES` 와 짝을 이루는
# 테스트(`test_모든_상태가_잠금_여부를_밝힌다`)가 그 빠짐을 잡는다.
_LOCKED = (PENDING, APPROVED, REVISION_PENDING)


def derive(latest: Optional[dict]) -> str:
    """최신 결재 행 하나 → 자료의 상태. 행이 없으면 `draft`.

    **최신 행 하나만 본다.** 이력 전체를 훑어 상태를 짜맞추면, 같은 이력으로도
    훑는 순서에 따라 다른 답이 나올 수 있다. 최신 행 하나면 답이 하나다.
    """
    if not latest:
        return DRAFT
    kind = latest.get("kind") or "approval"
    status = latest.get("status") or ""

    if kind == "revision":
        if status == "pending":
            return REVISION_PENDING
        if status == "approved":
            return REVISING
        # 거절당했거나 스스로 그만뒀다 → **있던 그대로다.**
        # 수정 요청은 승인본이 있어야만 낼 수 있으므로 되돌아갈 자리가 승인본뿐이다.
        return APPROVED

    if status == "pending":
        return PENDING
    if status == "rejected":
        return REJECTED
    if status == "approved":
        return APPROVED
    # withdrawn — 낸 적은 있지만 지금은 없는 것과 같다(이력에는 남는다, D16).
    return DRAFT


def is_locked(state: str) -> bool:
    """편집이 막히는가. **결재자가 본 것과 작성자가 가진 것이 달라지지 않게** 한다."""
    return state in _LOCKED


def can_request_revision(state: str) -> bool:
    """수정 요청을 낼 수 있는가. **승인본이 있을 때만** —
    아직 승인 안 된 자료는 요청할 것 없이 그냥 고치면 된다(`rejected`·`draft` 는 편집 가능)."""
    return state == APPROVED


def can_submit(state: str) -> bool:
    """제출할 수 있는가. 편집이 열려 있으면 낼 수 있다 — 규칙을 따로 적지 않는다.
    두 규칙이 되는 순간 「고칠 수는 있는데 낼 수는 없는」 상태가 생긴다."""
    return not is_locked(state)


def label(state: str) -> str:
    return LABEL.get(state, "")
