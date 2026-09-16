"""이름 바꾸기 — `POST /api/auth/users/{uid}/name`.

2026-09-16 · 처음 만들어진 관리자 계정의 이름이 「시스템 관리자」였다. 그것을
「관리자」로 바꾸려는데 **길이 어디에도 없었다** — 서버에도, 사용자 관리 화면에도,
터미널 도구에도. 씨앗 코드(`ensure_seed_admin`)의 글자를 고쳐도 소용이 없다:
그 값은 계정을 **처음 만들 때 한 번만** 쓰이고, 이미 있으면 그 함수는 아무것도 안 한다.
그래서 DB 를 직접 여는 것 말고는 방법이 없었다.

여기서 지키는 것.
  · 관리자만 바꾼다 — 남이 남의 이름을 고치면 감사로그가 거짓이 된다
  · 이름은 **살아 있는 값**이다 — 고치면 지난 결재 건의 결재자 이름까지 함께 바뀐다
  · 그래도 **쓰던 사람을 안 쫓아낸다** — 이름은 무엇을 할 수 있는지를 안 바꾼다
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "rename.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "rename.db")


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def ctx():
    admin_pw = auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    w = auth_store.signup("writer1", "password123", "김가현", "사업본부", "writer")
    auth_store.approve(admin["id"], w["id"], "writer")
    v = auth_store.signup("viewer1", "password123", "홍길동", "사업본부", "viewer")
    auth_store.approve(admin["id"], v["id"], "viewer")
    app = FastAPI()
    app.include_router(auth_router)
    return app, admin, admin_pw, auth_store.get_user(w["id"]), auth_store.get_user(v["id"])


def login(app, login_id, pw) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"login_id": login_id, "password": pw})
    assert r.status_code == 200, r.text
    return c


# ── 되는 일 ─────────────────────────────────────
def test_관리자가_남의_이름을_바꾼다():
    app, admin, apw, w, _ = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/name" % w["id"], json={"name": "김가현A"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["name"] == "김가현A"
    assert auth_store.get_user(w["id"])["name"] == "김가현A"


def test_관리자가_제_이름도_바꾼다():
    """**이게 안 돼서 이 길을 만들었다.** 씨앗 관리자라고 예외가 아니다.
    자기 이름만 따로 길을 내면 판정이 두 벌이 되고, 두 벌은 언젠가 어긋난다."""
    app, admin, apw, _, _ = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/name" % admin["id"], json={"name": "관리자"})
    assert r.status_code == 200, r.text
    assert auth_store.get_user(admin["id"])["name"] == "관리자"


# ── 막는 일 ─────────────────────────────────────
def test_작성자는_못_바꾼다():
    app, admin, apw, w, v = ctx()
    c = login(app, "writer1", "password123")
    assert c.post("/api/auth/users/%s/name" % v["id"], json={"name": "몰래"}).status_code == 403
    assert auth_store.get_user(v["id"])["name"] == "홍길동"


def test_열람자는_제_이름도_못_바꾼다():
    """**남이 제 이름을 마음대로 바꾸면 감사로그가 거짓이 된다.** 「그때 그 사람」을
    되짚는 자리가 감사로그뿐인데, 아무나 이름을 갈면 그 기록이 흔들린다."""
    app, admin, apw, _, v = ctx()
    c = login(app, "viewer1", "password123")
    assert c.post("/api/auth/users/%s/name" % v["id"], json={"name": "내이름"}).status_code == 403


def test_로그인_안_하면_못_바꾼다():
    app, admin, apw, w, _ = ctx()
    c = TestClient(app)
    assert c.post("/api/auth/users/%s/name" % w["id"], json={"name": "몰래"}).status_code in (401, 403)


def test_빈_이름은_400():
    app, admin, apw, w, _ = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/name" % w["id"], json={"name": "   "})
    assert r.status_code == 400
    assert auth_store.get_user(w["id"])["name"] == "김가현"


def test_너무_긴_이름은_400():
    app, admin, apw, w, _ = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/users/%s/name" % w["id"],
               json={"name": "가" * (auth_store.MAX_NAME + 1)})
    assert r.status_code == 400


def test_없는_사람은_400():
    app, admin, apw, _, _ = ctx()
    c = login(app, "admin", apw)
    assert c.post("/api/auth/users/u_없음/name", json={"name": "아무개"}).status_code == 400


# ── 이름이 살아 있는 값이라는 것 ─────────────────
def test_이름을_바꾸면_지난_결재의_결재자도_같이_바뀐다():
    """**되돌려 승인받을 필요가 없다.** 결재 기록에는 사람의 id 만 적히고 이름은
    볼 때마다 계정에서 찾아가므로, 한 번 바꾸면 과거 건까지 전부 따라온다."""
    app, admin, apw, w, _ = ctx()
    # 결재 기록이 이름을 안 들고 id 만 든다는 것을 계약으로 못박는다.
    from server import approvals as ap
    cols = ap._COLS.split(",")
    assert "approver" in cols and "requester" in cols
    # **사람 이름**을 박으면 안 된다. 박으면 사람 이름을 바꿔도 지난 건이 안 따라온다.
    assert not [c for c in cols if c in ("requester_name", "approver_name")], \
        "결재 기록에 사람 이름을 박으면 이름을 바꿔도 지난 건이 안 따라온다: %s" % cols
    # **자료 이름(`project_name`)은 일부러 박는다.** 그건 사람이 아니라 「그때 낸 것」의
    # 이름이고, 자료 제목이 나중에 바뀌어도 결재 이력은 그때 낸 것을 가리켜야 한다.
    # 처음에 이 둘을 뭉뚱그려 「_name 으로 끝나는 칸은 없다」로 적었다가 여기서 걸렸다.
    assert "project_name" in cols
    c = login(app, "admin", apw)
    c.post("/api/auth/users/%s/name" % admin["id"], json={"name": "관리자"})
    assert auth_store.get_user(admin["id"])["name"] == "관리자"


def test_이름을_바꿔도_그_사람이_안_쫓겨난다():
    app, admin, apw, w, _ = ctx()
    wc = login(app, "writer1", "password123")
    assert wc.get("/api/auth/me").json()["user"]["name"] == "김가현"
    login(app, "admin", apw).post("/api/auth/users/%s/name" % w["id"], json={"name": "김가현B"})
    me = wc.get("/api/auth/me")
    assert me.status_code == 200, "이름을 바꿨다고 로그아웃되면 안 된다"
    assert me.json()["user"]["name"] == "김가현B"
