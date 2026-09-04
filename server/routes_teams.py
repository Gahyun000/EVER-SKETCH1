"""팀 관리 API — L1 전용.

여기서 하는 일은 두 가지뿐이다. 팀을 만들고(`teams` 저장소), 그 팀에 사람을 넣는다.
**누가 무엇을 보게 되는지는 이 파일이 정하지 않는다** — P6 의 `visible_project_filter()`
가 정한다. 이 파일은 그 규칙이 쓸 재료를 만들 뿐이다.

두 쪽을 다 아는 판단(그 사용자가 실제로 있는가, 승인된 계정인가)은 여기서 한다.
`teams.py` 는 `auth` 를 모른다 — 알게 하면 `auth.actor_of()` 와 import 순환이 생긴다.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import auth as auth_store
from server import permissions as perm
from server import teams as teams_store
from server.authdeps import require_action, require_active

router = APIRouter(prefix="/api/teams", tags=["teams"])


def _member_public(uid: str) -> Optional[dict]:
    u = auth_store.get_user(uid)
    if not u:
        return None
    return {"id": u["id"], "login_id": u["login_id"], "name": u["name"],
            "dept": u["dept"], "role": u["role"], "status": u["status"]}


def _team_public(t: dict) -> dict:
    """팀 + 팀원을 함께 실어 준다.

    팀마다 되물으면 팀이 열 개일 때 요청이 열한 번 나간다. 팀 편성 화면은
    **한 화면에서 옮기는** 작업이라 목록이 통째로 최신이어야 한다.
    """
    members = [m for m in (_member_public(uid) for uid in teams_store.list_members(t["id"]))
               if m is not None]
    return {**t, "members": members}


@router.get("")
def list_teams(user: dict = Depends(require_active)):
    require_action(user, perm.TEAM_MANAGE)
    return {"teams": [_team_public(t) for t in teams_store.list_teams()]}


class TeamIn(BaseModel):
    name: str


@router.post("")
def create_team(req: TeamIn, user: dict = Depends(require_active)):
    require_action(user, perm.TEAM_MANAGE)
    try:
        team = teams_store.create_team(req.name, user["id"])
    except teams_store.TeamError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "team_create", team["id"], team["name"])
    return {"ok": True, "team": team}


@router.patch("/{tid}")
def rename_team(tid: str, req: TeamIn, user: dict = Depends(require_active)):
    require_action(user, perm.TEAM_MANAGE)
    if not teams_store.get_team(tid):
        raise HTTPException(status_code=404, detail="팀을 찾을 수 없습니다.")
    try:
        team = teams_store.rename_team(tid, req.name)
    except teams_store.TeamError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "team_rename", tid, team["name"])
    return {"ok": True, "team": team}


@router.delete("/{tid}")
def delete_team(tid: str, user: dict = Depends(require_active)):
    require_action(user, perm.TEAM_MANAGE)
    if not teams_store.get_team(tid):
        raise HTTPException(status_code=404, detail="팀을 찾을 수 없습니다.")
    try:
        teams_store.delete_team(tid)
    except teams_store.TeamError as e:
        # "팀원이 남아 있다"는 잘못된 요청이지 없는 팀이 아니다 — 400 으로 구분한다.
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "team_delete", tid)
    return {"ok": True}


class MemberIn(BaseModel):
    user_id: str


@router.post("/{tid}/members")
def add_member(tid: str, req: MemberIn, user: dict = Depends(require_active)):
    require_action(user, perm.TEAM_MANAGE)
    if not teams_store.get_team(tid):
        raise HTTPException(status_code=404, detail="팀을 찾을 수 없습니다.")
    target = auth_store.get_user(req.user_id)
    if not target:
        raise HTTPException(status_code=400, detail="사용자를 찾을 수 없습니다.")
    if target["status"] != "active":
        # 승인 전 계정을 미리 넣어 두면, 승인되는 순간 아무도 다시 보지 않은 채
        # 팀 자료가 열린다. 사람을 먼저 승인하게 만든다.
        raise HTTPException(status_code=400, detail="승인된 계정만 팀에 넣을 수 있습니다.")
    if target["role"] == perm.ADMIN:
        # 관리자는 모든 팀을 보고(7.1), 결재를 타지 않고 스위치로 공유한다(D15).
        # 팀에 넣어도 달라지는 것이 하나도 없다 — 아무 효과 없는 조작을 허용하면
        # "관리자를 A팀에 넣으면 뭔가 달라지나?"라는 잘못된 기대만 남는다.
        raise HTTPException(status_code=400, detail="관리자는 팀에 넣지 않습니다. 모든 팀을 볼 수 있습니다.")
    if not target["role"]:
        raise HTTPException(status_code=400, detail="역할이 부여된 계정만 팀에 넣을 수 있습니다.")
    moved_ids = teams_store.add_member(tid, req.user_id, user["id"])
    moved = [{"id": t, "name": (teams_store.get_team(t) or {}).get("name", "")}
             for t in moved_ids]
    auth_store.audit(user["id"], "team_member_add", tid,
                     "user=%s moved_from=%s" % (req.user_id, ",".join(moved_ids) or "-"))
    return {"ok": True, "moved_from": moved}


@router.delete("/{tid}/members/{uid}")
def remove_member(tid: str, uid: str, user: dict = Depends(require_active)):
    require_action(user, perm.TEAM_MANAGE)
    if not teams_store.get_team(tid):
        raise HTTPException(status_code=404, detail="팀을 찾을 수 없습니다.")
    teams_store.remove_member(tid, uid)
    auth_store.audit(user["id"], "team_member_remove", tid, "user=%s" % uid)
    return {"ok": True}
