"""FastAPI 의존성 — 세션 쿠키 → 사용자 → 권한 판정.

라우터는 여기 있는 헬퍼만 쓴다. `if role == 'admin'` 같은 판정을 라우터에 직접 쓰지 않는다.
실제 허용/거부 규칙은 전부 `permissions.decide()` 에 있고, 이 파일은 그걸 HTTP로 옮기는 얇은 층이다.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import Cookie, HTTPException, Request, Response

from server import approvals as approvals_store
from server import auth as auth_store
from server import permissions as perm
from server import projects as projects_store

SESSION_COOKIE = "es_session"


def https_enabled() -> bool:
    """사내망 HTTP 배포가 기본. HTTPS로 올릴 때만 EVER_SKETCH_HTTPS=1.

    HTTP인데 Secure 를 붙이면 브라우저가 쿠키를 저장하지 않아 로그인 자체가 안 된다.
    """
    return os.environ.get("EVER_SKETCH_HTTPS", "") in ("1", "true", "True")


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE, token,
        httponly=True,
        samesite="lax",
        secure=https_enabled(),
        max_age=int(auth_store.SESSION_TTL_MS / 1000),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# ── 현재 사용자 ─────────────────────────────────────────
def current_user(es_session: Optional[str] = Cookie(default=None)) -> Optional[dict]:
    """로그인 안 됐으면 None. 401을 던지지 않는다 — 공개 엔드포인트도 이 의존성을 쓴다."""
    return auth_store.user_by_token(es_session)


def require_login(es_session: Optional[str] = Cookie(default=None)) -> dict:
    """로그인 필수. 승인 대기 계정도 통과한다(대기 화면·본인 정보 조회용)."""
    user = auth_store.user_by_token(es_session)
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user


def require_active(es_session: Optional[str] = Cookie(default=None)) -> dict:
    """승인 완료 계정만. 승인 대기는 403 — 어떤 이북에도 접근하지 못한다."""
    user = require_login(es_session)
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="관리자 승인 대기 중입니다.")
    return user


# ── 권한 판정 ─────────────────────────────────────────
def _resource_of(pid: str, user: Optional[dict] = None) -> Optional[perm.Resource]:
    """판정 대상을 만든다.

    **결재 이력을 반드시 채운다**(D16). `Resource.has_approval_history` 의 기본값은
    False 이고, `decide()` 의 DELETE 규칙은 그 값이 False 면 **지울 수 있는 쪽**으로 떨어진다.
    여기서 안 채우면 이미 결재를 탄 자료가 지워진다 — 기본값이 안전한 쪽이 아니라서,
    채우는 일을 잊지 않는 것이 이 함수의 몫이다.
    """
    del user           # 회차 동료 판정이 사라지면서 더는 쓰지 않는다
    sc = projects_store.project_scope(pid)
    if not sc:
        return None
    return perm.Resource(owner_id=sc["owner_id"], published=sc["published"],
                         has_approval_history=approvals_store.has_history(pid))


def require_action(user: Optional[dict], action: str, res: Optional[perm.Resource] = None) -> None:
    """판정 실패 시 403. 판정 자체는 permissions.decide() 가 한다."""
    if not perm.decide(auth_store.actor_of(user), action, res):
        raise HTTPException(status_code=403, detail="권한이 없습니다.")


def require_project(user: dict, pid: str, action: str) -> perm.Resource:
    """프로젝트 단위 판정. 존재하지 않으면 404, 권한 없으면 403.

    **404를 403보다 먼저 내지 않는다** — 남의 프로젝트 id를 넣었을 때
    "없음(404)"과 "있는데 권한없음(403)"이 구분되면 id 존재 여부가 새어나간다.
    권한이 없으면 존재 여부와 무관하게 403으로 통일한다.
    """
    res = _resource_of(pid, user)
    if res is None:
        # 없는 id — 전체를 볼 수 있는 사람(관리자)에게만 404를 알려준다.
        # 작성자에게 404를 주면 "그 id는 없다"가 확인되어 id 열거가 가능해진다.
        if perm.visible_project_filter(auth_store.actor_of(user)) == "all":
            raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    require_action(user, action, res)
    return res


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""
