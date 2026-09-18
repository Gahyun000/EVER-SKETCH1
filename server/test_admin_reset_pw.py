"""관리자의 비밀번호 초기화 — `POST /api/auth/users/{uid}/reset-pw`.

이 제품에는 비밀번호 찾기가 없다. 사람이 비밀번호를 잊으면 **관리자만** 풀어줄 수 있고,
지금까지 그 길은 터미널(`admin_cli reset-pw`) 하나뿐이었다.

여기서 지키는 계약의 핵심은 **관리자가 남의 비밀번호를 정하지 못한다**는 것이다.
관리자가 값을 정하면 그 값을 계속 알고 있어서 그 계정을 사칭할 수 있는 창이 열린 채 남는다.
무작위로 발급하고 최초 로그인 시 변경을 강제하면, 관리자가 아는 값은 **한 번 쓰고 폐기된다.**
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "resetpw.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "resetpw.db")


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def ctx():
    """시드 관리자 + 승인된 작성자. 관리자 비밀번호는 알려진 값으로 맞춰 둔다."""
    admin_pw = auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    w = auth_store.signup("writer1", "password123", "김가현", "사업본부", "writer")
    auth_store.approve(admin["id"], w["id"], "writer")
    app = FastAPI()
    app.include_router(auth_router)
    return app, admin, admin_pw, auth_store.get_user(w["id"])


def login(app, login_id, pw) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"login_id": login_id, "password": pw})
    assert r.status_code == 200, r.text
    return c


# ── 되는 일 ─────────────────────────────────────
def test_관리자가_초기화하면_임시_비밀번호가_돌아온다():
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/reset-pw" % w["id"])
    assert r.status_code == 200, r.text
    pw = r.json()["password"]
    assert isinstance(pw, str) and len(pw) >= 12


def test_임시_비밀번호로_들어가진다():
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    pw = c.post("/api/auth/users/%s/reset-pw" % w["id"]).json()["password"]
    tok, u = auth_store.login("writer1", pw)
    assert u["login_id"] == "writer1"


def test_최초_로그인_시_반드시_바꾸게_한다():
    """관리자가 아는 값이 그대로 남으면 사칭할 수 있는 창이 계속 열려 있다.
    한 번 쓰고 폐기되게 만든다."""
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    pw = c.post("/api/auth/users/%s/reset-pw" % w["id"]).json()["password"]
    _, u = auth_store.login("writer1", pw)
    assert u["must_change_pw"] is True


def test_옛_비밀번호로는_못_들어간다():
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    c.post("/api/auth/users/%s/reset-pw" % w["id"])
    with pytest.raises(auth_store.AuthError):
        auth_store.login("writer1", "password123")


def test_쓰고_있던_세션이_끊긴다():
    """초기화했는데 그 사람이 열어 둔 창이 계속 살아 있으면, 초기화는 절반만 된 것이다."""
    app, admin, apw, w = ctx()
    tok, _ = auth_store.login("writer1", "password123")
    assert auth_store.user_by_token(tok) is not None
    c = login(app, "admin", apw)
    c.post("/api/auth/users/%s/reset-pw" % w["id"])
    assert auth_store.user_by_token(tok) is None


def test_중지된_계정도_풀면서_초기화한다():
    """터미널 도구(`admin_cli reset-pw`)가 status='active' 로 되돌리는 것과 같게 맞춘다 —
    두 길이 다르게 동작하면 어느 쪽으로 풀었는지에 따라 결과가 갈린다."""
    app, admin, apw, w = ctx()
    auth_store.set_status(admin["id"], w["id"], "disabled")
    c = login(app, "admin", apw)
    pw = c.post("/api/auth/users/%s/reset-pw" % w["id"]).json()["password"]
    assert auth_store.get_user(w["id"])["status"] == "active"
    auth_store.login("writer1", pw)


# ── 막는 일 ─────────────────────────────────────
def test_자기_자신은_초기화하지_않는다():
    """**하루 사이에 열렸다 닫힌 규칙**(2026-09-18). 지우지 않고 고쳐 쓴다.

    처음 막은 이유는 「본인 것을 무작위로 날리면 화면에 뜬 글자를 놓치는 순간 관리자가
    스스로 잠긴다」였다. 사용자가 「창을 닫을 때 로그인으로 가게 하면 되잖아」라고 물어
    한 번 **열었고** — 그 말이 맞았다, 튕기는 시점은 화면이 정할 수 있다 — 붙여 놓고 보니
    **같은 자리를 푸는 길이 둘**이 됐다. 사용자가 골랐다: 「2번보다 3만 있으면 되겠다.」

    남은 길(3)은 「비밀번호 변경」의 **「지금 비밀번호가 기억나지 않습니다」**다
    (`/password/force`, 관리자만). 초기화는 무작위 값을 **한 번만** 보여 주고 들어가서
    **또 바꾸게** 하지만, 직접 정하기는 그 자리에서 내 값으로 끝난다 — 걸음이 하나 짧고
    놓칠 글자가 없다.
    """
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/reset-pw" % admin["id"])
    assert r.status_code == 400
    assert "본인" in r.json()["detail"]
    # **막혔다고 적히고 실제로는 바뀌는** 일이 없도록, 원래 값이 그대로 통하는지 본다.
    auth_store.login("admin", apw)


def test_막을_때_어디로_가라고_말해_준다():
    """「안 됩니다」만 하면 관리자는 다음에 무엇을 눌러야 할지 모른다."""
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    d = c.post("/api/auth/users/%s/reset-pw" % admin["id"]).json()["detail"]
    assert "비밀번호 변경" in d
    assert "기억나지 않습니다" in d, d


def test_작성자는_남의_비밀번호를_초기화하지_못한다():
    app, admin, apw, w = ctx()
    c = login(app, "writer1", "password123")
    assert c.post("/api/auth/users/%s/reset-pw" % admin["id"]).status_code == 403


def test_비로그인은_401():
    app, admin, apw, w = ctx()
    c = TestClient(app)
    assert c.post("/api/auth/users/%s/reset-pw" % w["id"]).status_code == 401


def test_없는_사용자는_404():
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    assert c.post("/api/auth/users/u_없음/reset-pw").status_code == 404


# ── 남기는 것 · 남기지 않는 것 ────────────────────
def test_누가_누구를_초기화했는지_감사로그에_남는다():
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    c.post("/api/auth/users/%s/reset-pw" % w["id"])
    rows = [a for a in auth_store.list_audit(limit=50) if a["action"] == "reset_pw"]
    assert rows, "초기화 기록이 없습니다"
    assert rows[0]["user_id"] == admin["id"], "누가 했는지가 남아야 한다"
    assert w["id"] in rows[0]["target"]


def test_임시_비밀번호는_감사로그에_남지_않는다():
    """로그에 적으면 로그를 볼 수 있는 사람이 그 계정에 들어갈 수 있다."""
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    pw = c.post("/api/auth/users/%s/reset-pw" % w["id"]).json()["password"]
    dump = " ".join("%s %s %s" % (a["action"], a["target"], a["detail"])
                    for a in auth_store.list_audit(limit=50))
    assert pw not in dump


def test_임시_비밀번호는_매번_다르다():
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    seen = {c.post("/api/auth/users/%s/reset-pw" % w["id"]).json()["password"]
            for _ in range(5)}
    assert len(seen) == 5


def test_관리자가_비밀번호를_고를_수_없다():
    """본문으로 값을 보내도 무시된다 — 관리자가 정한 값이 남으면
    그 계정을 사칭할 수 있는 창이 열린 채로 남는다."""
    app, admin, apw, w = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/reset-pw" % w["id"], json={"password": "iknowthis1"})
    assert r.status_code == 200
    assert r.json()["password"] != "iknowthis1"
    with pytest.raises(auth_store.AuthError):
        auth_store.login("writer1", "iknowthis1")
