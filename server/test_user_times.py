"""사용자 관리 상세(2026-09-21 · 시안 ㄴ)가 쓰는 세 시각 — 가입 신청 · 승인 · 마지막 로그인.

DB(`Users.created_at · approved_at · last_login_at`)에는 처음부터 있었고
`routes_auth._public` 이 내보내지 않았을 뿐이다. 내보내는지, 값이 맞는 차례로 채워지는지 본다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
_DB = str(pathlib.Path(_tmp) / "times.db")
os.environ["EVER_SKETCH_DB"] = _DB

from server import auth as auth_store  # noqa: E402
from server.routes_auth import _public  # noqa: E402


def _reset():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()


def test_pending_has_only_created():
    _reset()
    auth_store.ensure_seed_admin("adminpw12345")
    u = auth_store.signup("newbie", "password123", "새사람", "본부", "writer")
    p = _public(auth_store.get_user(u["id"]))
    assert isinstance(p["created_at"], (int, float)) and p["created_at"] > 1e12, "밀리초"
    assert p["approved_at"] is None and p["last_login_at"] is None


def test_approved_then_login_fills_in_order():
    _reset()
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    u = auth_store.signup("newbie", "password123", "새사람", "본부", "writer")
    auth_store.approve(admin["id"], u["id"], "writer")
    auth_store.login("newbie", "password123")
    p = _public(auth_store.get_user(u["id"]))
    assert p["created_at"] <= p["approved_at"] <= p["last_login_at"]


def test_list_carries_times_and_no_secrets():
    _reset()
    auth_store.ensure_seed_admin("adminpw12345")
    auth_store.signup("newbie", "password123", "새사람", "본부", "writer")
    for u in auth_store.list_users():
        p = _public(u)
        assert {"created_at", "approved_at", "last_login_at"} <= set(p)
        assert not any("pw" in k and k != "must_change_pw" for k in p), "비밀번호 관련 값은 내보내지 않는다"
