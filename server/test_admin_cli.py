"""관리자 콘솔 도구 테스트 — 잠긴 상황에서 실제로 빠져나올 수 있는지."""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "cli.db")

import pytest  # noqa: E402

from server import admin_cli  # noqa: E402
from server import auth as auth_store  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "cli.db")


@pytest.fixture(autouse=True)
def clean():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def test_초기_비밀번호를_놓쳐도_복구된다(capsys):
    """서버 기동 시 한 번만 찍히는 비밀번호를 못 봤을 때의 탈출구."""
    auth_store.ensure_seed_admin("lost_forever_pw")
    admin_cli.cmd_reset_pw("admin", None)
    out = capsys.readouterr().out
    newpw = [l for l in out.splitlines() if "새 비밀번호" in l][0].split(":")[1].strip()
    token, user = auth_store.login("admin", newpw)
    assert token and user["role"] == "admin"
    assert user["must_change_pw"] is True        # 다시 바꾸도록 강제


def test_재발급하면_옛_비밀번호는_죽는다():
    auth_store.ensure_seed_admin("oldpassword123")
    admin_cli.cmd_reset_pw("admin", "newpassword456")
    with pytest.raises(auth_store.AuthError):
        auth_store.login("admin", "oldpassword123")
    assert auth_store.login("admin", "newpassword456")[0]


def test_재발급하면_기존_세션이_끊긴다():
    auth_store.ensure_seed_admin("oldpassword123")
    token, _ = auth_store.login("admin", "oldpassword123")
    admin_cli.cmd_reset_pw("admin", "newpassword456")
    assert auth_store.user_by_token(token) is None


def test_비활성_계정도_재발급으로_되살아난다():
    """관리자가 실수로 자기를 잠갔을 때."""
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    c = auth_store._conn()
    c.execute("UPDATE Users SET status='disabled' WHERE id=?", (admin["id"],))
    c.commit()
    c.close()
    with pytest.raises(auth_store.AuthError):
        auth_store.login("admin", "adminpw12345")
    admin_cli.cmd_reset_pw("admin", "newpassword456")
    assert auth_store.login("admin", "newpassword456")[0]


def test_관리자가_0명이어도_승격으로_복구():
    """관리자가 아무도 없는 상태 — 화면으로는 승인할 사람이 없어 잠긴다."""
    auth_store.signup("rescue", "password123", "구조", "", "writer")
    assert auth_store.count_active_admins() == 0
    admin_cli.cmd_promote("rescue", "admin")
    assert auth_store.count_active_admins() == 1
    _, user = auth_store.login("rescue", "password123")
    assert user["role"] == "admin" and user["status"] == "active"


def test_없는_사용자는_명확히_실패():
    auth_store.ensure_seed_admin("adminpw12345")
    with pytest.raises(SystemExit):
        admin_cli.cmd_reset_pw("nosuchuser", None)
    with pytest.raises(SystemExit):
        admin_cli.cmd_promote("nosuchuser", "admin")


def test_없는_역할_거부():
    auth_store.signup("rangeuser", "password123", "범위", "", "writer")
    for bad in ("", "superuser", "관리자", "3", "admin2"):
        with pytest.raises(SystemExit):
            admin_cli.cmd_promote("rangeuser", bad)


def test_역할은_대소문자와_공백을_흡수한다():
    """콘솔에서 손으로 치는 값이다. 'Admin ' 을 거부하면 담당자만 헤맨다."""
    auth_store.signup("caseuser", "password123", "대소", "", "writer")
    admin_cli.cmd_promote("caseuser", "  Admin ")
    assert auth_store.count_active_admins() == 1


def test_목록_출력(capsys):
    auth_store.ensure_seed_admin("adminpw12345")
    auth_store.signup("waiting", "password123", "대기자", "본부", "admin")
    admin_cli.cmd_list()
    out = capsys.readouterr().out
    assert "admin" in out and "waiting" in out
    assert "희망 Lv1 관리자" in out     # 승인 담당자가 무엇을 신청했는지 봐야 한다
    assert "활성 관리자 1명" in out


def test_콘솔_작업도_감사로그에_남는다():
    auth_store.ensure_seed_admin("adminpw12345")
    admin_cli.cmd_reset_pw("admin", "newpassword456")
    c = auth_store._conn()
    actions = [r[0] for r in c.execute("SELECT action FROM AuditLogs").fetchall()]
    c.close()
    assert "reset_pw_cli" in actions
