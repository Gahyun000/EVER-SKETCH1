"""팀 공유 API (P6).

**결재 API 와 판정을 나눠 갖지 않는다** — 둘 다 `permissions.can_see_approval()`
하나를 부른다. 이 파일이 하는 일은 그 판정을 통과한 것을 HTTP 로 옮기는 것뿐이다.

못 보는 건에는 **404** 를 준다. 403 은 「그 id 는 있다」를 확인해 주고,
결재 id 는 남의 자료가 존재한다는 사실 그 자체다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from server import auth as auth_store
from server import team_library
from server.authdeps import require_active

router = APIRouter(prefix="/api/team-library", tags=["team-library"])


@router.get("")
def get_library(user: dict = Depends(require_active)):
    """팀 → 작성자 → 월 → 자료. 승인본만.

    **권한 판정을 따로 걸지 않는다.** 로그인한 사람이면 누구나 부를 수 있고,
    그 사람에게 보이는 것이 없으면 빈 목록이 온다 — L3 처럼 팀이 없는 사람에게
    403 을 주면 「팀 공유 화면이 오류를 낸다」가 되지만, 사실은 아직 볼 게 없을 뿐이다.
    무엇이 보이는지는 `can_see_approval` 이 건마다 정한다.
    """
    return team_library.library(auth_store.actor_of(user))


@router.get("/approval/{aid}")
def get_snapshot(aid: str, user: dict = Depends(require_active)):
    """승인본 한 건을 **스냅샷째** 연다 — 팀이 보는 것은 얼어붙은 사본이다.
    작성자가 지금 그 자료를 고치고 있어도 여기 뜨는 그림은 안 흔들린다."""
    a = team_library.visible_approval(auth_store.actor_of(user), aid)
    if not a:
        raise HTTPException(status_code=404, detail="승인본을 찾을 수 없습니다.")
    a["requester_name"] = (auth_store.get_user(a.get("requester")) or {}).get("name", "")
    a["approver_name"] = (auth_store.get_user(a.get("approver")) or {}).get("name", "")
    return {"approval": a}


@router.get("/history/{project_id}")
def get_history(project_id: str, user: dict = Depends(require_active)):
    """이 자료의 지난 승인본들. 목록에는 최신 1건만 뜨므로 여기서 거슬러 올라간다.
    스냅샷은 안 싣는다 — 회차마다 문서 전체가 딸려 나온다."""
    rows = team_library.history(auth_store.actor_of(user), project_id)
    names = {}
    for a in rows:
        for k in ("requester", "approver"):
            uid = a.get(k)
            if uid and uid not in names:
                names[uid] = (auth_store.get_user(uid) or {}).get("name", "")
        a["requester_name"] = names.get(a.get("requester"), "")
        a["approver_name"] = names.get(a.get("approver"), "")
    return {"history": rows}
