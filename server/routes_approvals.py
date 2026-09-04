"""결재 API.

가시성 규칙 — **한 문장으로 적어 둔다.**
  · L1(관리자) : 전부 본다. 결재자가 한 명이므로(D11) 결재함이 곧 전체 목록이다.
  · L2(작성자) : **본인이 낸 건만.** 같은 팀 남의 *제출본*은 여전히 못 본다 —
                 팀에 열리는 것은 「승인된 것」뿐이고(D6), 그건 팀 공유 화면이다.
  · L3(열람자) : 결재함 자체가 없다(D13 — 제출을 못 하니 낸 것도 없다).

**P6 이후:** 건 하나의 가시성은 `permissions.can_see_approval()` 이 정한다
(관리자 전부 / 낸 사람 / 같은 팀 승인본). 위 목록은 그중 「결재함」이라는
화면이 보여 주는 몫이고, 나머지 한 몫은 `team_library` 가 보여 준다.

판정은 `permissions.decide()` 가 하고 이 파일은 HTTP 로 옮길 뿐이다.
남의 결재 건에는 **404** 를 준다 — 403 은 「그 id 는 있다」를 확인해 준다.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import approvals as approvals_store
from server import auth as auth_store
from server import permissions as perm
from server import projects as projects_store
from server.authdeps import require_action, require_active, require_project

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


def _is_admin(user: dict) -> bool:
    return perm.decide(auth_store.actor_of(user), perm.DECIDE)


def _visible(a: dict, user: dict) -> bool:
    """**판정은 `permissions.can_see_approval()` 하나뿐이다.**
    팀 공유(`team_library`)도 같은 함수를 쓴다 — 두 곳이 각자 규칙을 적으면
    「팀 공유에는 뜨는데 열면 404」 같은 상태가 생긴다."""
    return perm.can_see_approval(auth_store.actor_of(user), a)


def _my_box(items: list[dict], user: dict) -> list[dict]:
    """**결재함은 화면이지 권한이 아니다.** 결재함이 답하는 질문은
    「내가 낸 것이 지금 어떻게 됐나」 하나다 — 같은 팀 남의 승인본이 여기 섞이면
    그 질문의 답이 목록 어딘가에 묻힌다. 그것은 팀 공유 화면이 답한다.

    관리자에게는 결재함이 곧 전체 목록이다(결재자가 한 명이므로, D11).
    `_my_box` ∪ 팀 공유 = `can_see_approval` 이 허용하는 전부 — 빠지는 건 없다.
    """
    if _is_admin(user):
        return items
    return [a for a in items if a["requester"] == user["id"]]


def _mine_or_404(aid: str, user: dict) -> dict:
    a = approvals_store.get_approval(aid)
    if not a or not _visible(a, user):
        raise HTTPException(status_code=404, detail="결재 건을 찾을 수 없습니다.")
    return a


def _with_names(items: list[dict]) -> list[dict]:
    """저장에는 `Users.id` 를, 화면에는 이름을 준다. **이름을 저장하지 않는 이유**는
    이름이 바뀌기 때문이다 — 개명 한 번에 「누가 승인했는가」가 흐려지면 안 된다.
    한 번에 모아 붙인다(건마다 되물으면 목록 20건에 요청이 21번 나간다)."""
    ids = {x for a in items for x in (a.get("requester"), a.get("approver")) if x}
    names = {i: (auth_store.get_user(i) or {}).get("name", "") for i in ids}
    for a in items:
        a["requester_name"] = names.get(a.get("requester"), "")
        a["approver_name"] = names.get(a.get("approver"), "")
        for c in a.get("comments", []):
            c["author_name"] = (auth_store.get_user(c["author"]) or {}).get("name", "") \
                if c.get("author") else ""
    return items


@router.get("")
def list_approvals(status: Optional[str] = None, project_id: Optional[str] = None,
                   user: dict = Depends(require_active)):
    require_action(user, perm.COMMENT_READ, perm.Resource(owner_id=user["id"]))
    items = _my_box(approvals_store.list_approvals(status=status, project_id=project_id), user)
    return {"approvals": _with_names(items), "counts": _counts(items)}


def _counts(items: list[dict]) -> dict:
    out = {s: 0 for s in approvals_store.STATUSES}
    for a in items:
        out[a["status"]] = out.get(a["status"], 0) + 1
    return out


@router.get("/status-map")
def status_map(user: dict = Depends(require_active)):
    """자료 목록에 상태 칩을 붙일 때 **한 번에** 가져간다.
    작성자에게는 본인 자료의 것만 남긴다 — 남의 자료 id 가 여기서 새면 안 된다."""
    require_action(user, perm.COMMENT_READ, perm.Resource(owner_id=user["id"]))
    m = approvals_store.status_map()
    if _is_admin(user):
        return {"status_map": m}
    vis = perm.visible_project_filter(auth_store.actor_of(user))
    mine = {p["id"] for p in projects_store.list_projects(vis, user["id"])}
    return {"status_map": {k: v for k, v in m.items() if k in mine}}


@router.get("/{aid}")
def get_approval(aid: str, user: dict = Depends(require_active)):
    """건 하나. **같은 팀 사람은 승인된 건을 열 수 있다**(P6) — 팀 공유 화면이
    여기로 들어온다. 다만 **결재 대화는 당사자만** 본다(`can_see_approval_thread`):
    자료가 팀의 것이 된다고 해서 그 자료를 두고 오간 지적까지 팀의 것이 되지는 않는다."""
    a = _mine_or_404(aid, user)
    if not perm.can_see_approval_thread(auth_store.actor_of(user), a):
        a["comment_count"] = len(a.get("comments") or [])
        a["comments"] = []
        a["comments_hidden"] = True
    return {"approval": _with_names([a])[0]}


class RequestIn(BaseModel):
    project_id: str
    message: str = ""


@router.post("/request")
def request_approval(req: RequestIn, user: dict = Depends(require_active)):
    """제출 — **본인 자료만**(SUBMIT). 열람자는 못 한다(D13)."""
    require_project(user, req.project_id, perm.SUBMIT)
    try:
        a = approvals_store.request(req.project_id, user["id"], req.message)
    except approvals_store.ApprovalError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "approval_request", a["id"],
                     "project=%s round=%d" % (req.project_id, a["round"]))
    return {"ok": True, "approval": _with_names([a])[0]}


class DecideIn(BaseModel):
    action: str          # approve | reject
    message: str = ""


@router.post("/{aid}/decide")
def decide_approval(aid: str, req: DecideIn, user: dict = Depends(require_active)):
    """승인 · 반려 — **관리자만**(DECIDE, D11)."""
    require_action(user, perm.DECIDE)
    if not approvals_store.get_approval(aid):
        raise HTTPException(status_code=404, detail="결재 건을 찾을 수 없습니다.")
    try:
        a = approvals_store.decide(aid, req.action, user["id"], req.message)
    except approvals_store.ApprovalError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "approval_%s" % req.action, aid, "project=%s" % a["project_id"])
    return {"ok": True, "approval": _with_names([a])[0]}


@router.post("/{aid}/withdraw")
def withdraw_approval(aid: str, user: dict = Depends(require_active)):
    """거두기 — **낸 사람만**. 관리자가 대신 거두면 「반려」와 구분이 안 된다."""
    a = _mine_or_404(aid, user)
    if a["requester"] != user["id"]:
        raise HTTPException(status_code=404, detail="결재 건을 찾을 수 없습니다.")
    try:
        a = approvals_store.withdraw(aid)
    except approvals_store.ApprovalError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "approval_withdraw", aid)
    return {"ok": True, "approval": _with_names([a])[0]}


class CommentIn(BaseModel):
    body: str
    page_id: Optional[int] = None
    page_no: Optional[int] = None


@router.post("/{aid}/comments")
def add_comment(aid: str, req: CommentIn, user: dict = Depends(require_active)):
    """슬라이드별 코멘트. 볼 수 있는 결재 건이면 쓸 수 있다 —
    관리자는 지적하고, 낸 사람은 답한다. 한쪽만 열면 대화가 안 된다."""
    _mine_or_404(aid, user)
    try:
        c = approvals_store.add_comment(aid, req.body, user["id"], req.page_id, req.page_no)
    except approvals_store.ApprovalError as e:
        raise HTTPException(status_code=400, detail=str(e))
    c["author_name"] = user.get("name", "")
    return {"ok": True, "comment": c}


class CommentEditIn(BaseModel):
    body: str


def _own_comment_or_404(cid: str, user: dict) -> dict:
    """**제 코멘트만** 고치고 지운다. 관리자도 남의 말을 고치지 못한다 —
    남의 말을 고칠 수 있으면 결재 이력이 기록이 아니라 편집물이 된다."""
    c = approvals_store.get_comment(cid)
    if not c or c["author"] != user["id"]:
        raise HTTPException(status_code=404, detail="코멘트를 찾을 수 없습니다.")
    return c


@router.patch("/comments/{cid}")
def update_comment(cid: str, req: CommentEditIn, user: dict = Depends(require_active)):
    _own_comment_or_404(cid, user)
    try:
        c = approvals_store.update_comment(cid, req.body)
    except approvals_store.ApprovalError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "comment": c}


@router.delete("/comments/{cid}")
def delete_comment(cid: str, user: dict = Depends(require_active)):
    _own_comment_or_404(cid, user)
    approvals_store.delete_comment(cid)
    return {"ok": True}
