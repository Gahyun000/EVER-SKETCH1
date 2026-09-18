"""인증·사용자 관리 라우터.

가입은 자유롭게, 권한은 승인제로. 승인 전 계정은 로그인은 되지만 "승인 대기"만 본다.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from server import auth as auth_store
from server import permissions as perm
from server.authdeps import (
    SESSION_COOKIE, clear_session_cookie, client_ip, current_user,
    require_action, require_login, set_session_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _public(u: dict) -> dict:
    """클라이언트에 내보내는 사용자 정보. 해시·승인자 id 같은 건 빼지 않지만 pw는 애초에 없다."""
    role = u.get("role") or ""
    req = u.get("requested_role") or ""
    return {
        "id": u["id"], "login_id": u["login_id"], "name": u["name"], "dept": u["dept"],
        "status": u["status"], "must_change_pw": u["must_change_pw"],
        # 역할이 진실. 등급(grade)과 라벨은 화면 표시용으로 함께 내려준다.
        "role": role, "requested_role": req,
        "grade": perm.grade_of(role), "requested_grade": perm.grade_of(req),
        "role_label": perm.role_label(role),
        "requested_role_label": perm.role_label(req),
    }


class SignupIn(BaseModel):
    login_id: str
    password: str
    name: str
    dept: str = ""
    requested_role: str = "writer"       # admin | writer | viewer


@router.post("/signup")
def signup(req: SignupIn):
    try:
        auth_store.signup(req.login_id, req.password, req.name, req.dept, req.requested_role)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # 가입만으로는 로그인시키지 않는다. 승인 대기임을 명확히 보여준다.
    return {"ok": True, "status": "pending",
            "message": "가입 신청이 접수됐습니다. 관리자 승인 후 이용할 수 있습니다."}


@router.get("/check-id")
def check_id(login_id: str, request: Request):
    """아이디 중복 확인. **로그인 없이 호출된다** — 가입 전에 쓰는 기능이라 가드를 붙일 수 없다.

    그래서 시도 제한이 유일한 방어선이다(`auth.CHECK_ID_MAX`).
    응답은 `{available: bool}` 하나뿐 — 이름·부서·상태를 함께 내려주면
    중복 확인이 사내 인명부가 된다.
    """
    try:
        taken = auth_store.login_id_taken(login_id, client_ip(request))
    except auth_store.RateLimited as e:
        raise HTTPException(status_code=429, detail=str(e))
    return {"available": not taken}


class LoginIn(BaseModel):
    login_id: str
    password: str


@router.post("/login")
def login(req: LoginIn, request: Request, response: Response):
    try:
        token, user = auth_store.login(
            req.login_id, req.password,
            ip=client_ip(request), ua=request.headers.get("user-agent", "")[:300],
        )
    except auth_store.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    set_session_cookie(response, token)
    return {"ok": True, "user": _public(user)}


@router.post("/logout")
def logout(response: Response, es_session: Optional[str] = Cookie(default=None)):
    if es_session:
        auth_store.logout(es_session)     # 서버 쪽 세션도 지운다(쿠키만 지우면 토큰이 살아 있다)
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: Optional[dict] = Depends(current_user)):
    """비로그인도 200 으로 응답한다 — 프런트가 로그인 화면을 그릴 때 401 처리를 안 해도 되도록."""
    if not user:
        return {"user": None}
    return {"user": _public(user)}


class ChangePwIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/password")
def change_password(req: ChangePwIn, response: Response, user: dict = Depends(require_login)):
    try:
        auth_store.change_password(user["id"], req.old_password, req.new_password)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # 세션이 전부 끊겼으므로 쿠키도 지운다. 새 비밀번호로 다시 로그인해야 한다.
    clear_session_cookie(response)
    return {"ok": True, "message": "비밀번호를 바꿨습니다. 다시 로그인해 주세요."}


class SetOwnPwIn(BaseModel):
    new_password: str


@router.post("/password/force")
def set_own_password(req: SetOwnPwIn, response: Response, user: dict = Depends(require_login)):
    """**관리자가 제 비밀번호를 옛 값 없이 정한다.** 대상은 언제나 부른 사람 자신이다.

    **길을 따로 낸 이유.** `/password` 에 「옛 값은 생략 가능」을 얹는 쪽이 짧지만,
    그러면 화면이 실수로 빈 문자열을 보냈을 때 **옛 값 확인이 조용히 통과한다.**
    길이 다르면 그런 식으로는 못 샌다.

    `USER_MANAGE` 로 막는 것은 이 동작이 사용자 관리라서가 아니라, **관리자 표시**로
    이 저장소가 줄곧 쓰는 것이 이것이기 때문이다(_ADMIN_ONLY).
    """
    require_action(user, perm.USER_MANAGE)
    try:
        auth_store.set_own_password(user["id"], req.new_password)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    clear_session_cookie(response)
    return {"ok": True, "message": "비밀번호를 바꿨습니다. 다시 로그인해 주세요."}


# ── 사용자 관리 (관리자 전용) ─────────────────────────────
@router.get("/users")
def list_users(status: Optional[str] = None, user: dict = Depends(require_login)):
    require_action(user, perm.USER_MANAGE)
    return {"users": [_public(u) for u in auth_store.list_users(status)]}


class ApproveIn(BaseModel):
    role: str                            # admin | writer | viewer


@router.post("/users/{uid}/approve")
def approve(uid: str, req: ApproveIn, user: dict = Depends(require_login)):
    ok, why = perm.can_grant_role(auth_store.actor_of(user), uid, req.role)
    if not ok:
        raise HTTPException(status_code=403, detail=why)
    try:
        updated = auth_store.approve(user["id"], uid, req.role)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": _public(updated)}


@router.post("/users/{uid}/reset-pw")
def reset_password(uid: str, user: dict = Depends(require_login)):
    """비밀번호 초기화 — 관리자 전용.

    **본문을 받지 않는다.** 관리자가 값을 고를 수 있으면 그 값이 관리자 머릿속에 남고,
    그 계정을 사칭할 수 있는 창이 열린 채로 남는다. 서버가 무작위로 발급하고
    화면은 그것을 한 번 보여주기만 한다.

    **본인은 안 된다.** 본인은 「비밀번호 변경」을 쓴다 — 잊었으면 그 창의
    「지금 비밀번호가 기억나지 않습니다」로 새 값을 직접 정한다(`/password/force`).
    한 번 열었다 닫은 줄이라, 왜 닫았는지는 `auth.admin_reset_password` 에 적어 뒀다.
    """
    require_action(user, perm.USER_MANAGE)
    if not auth_store.get_user(uid):
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    try:
        pw = auth_store.admin_reset_password(user["id"], uid)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "password": pw}


class NameIn(BaseModel):
    name: str


@router.post("/users/{uid}/name")
def set_name(uid: str, req: NameIn, user: dict = Depends(require_login)):
    """이름 고치기 — 관리자 전용.

    **자기 이름도 여기로 고친다.** 따로 길을 내면 판정이 두 벌이 되고, 두 벌은
    언젠가 어긋난다. 관리자만 쓰는 화면이라 그 한 벌로 충분하다.
    """
    require_action(user, perm.USER_MANAGE)
    try:
        updated = auth_store.set_name(user["id"], uid, req.name)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": _public(updated)}


class StatusIn(BaseModel):
    status: str


@router.post("/users/{uid}/status")
def set_status(uid: str, req: StatusIn, user: dict = Depends(require_login)):
    require_action(user, perm.USER_MANAGE)
    try:
        updated = auth_store.set_status(user["id"], uid, req.status)
    except auth_store.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": _public(updated)}
