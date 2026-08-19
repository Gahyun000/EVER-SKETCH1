"""계정·세션 저장소 테스트. 임시 DB 파일에서 돌린다."""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "t.db")

import pytest  # noqa: E402

from server import auth  # noqa: E402
from server.permissions import can_grant_level, decide, USER_MANAGE  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    """테스트마다 DB 파일을 새로 만든다(격리)."""
    p = pathlib.Path(os.environ["EVER_SKETCH_DB"])
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(str(p) + suffix)
        if f.exists():
            f.unlink()
    yield


def mk(login, level_req=2, pw="password123"):
    return auth.signup(login, pw, "홍길동", "사업본부", level_req)


def promote(uid, level=2):
    """테스트 편의 — 시드 관리자로 승인."""
    admin_pw = auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    auth.approve(admin["id"], uid, level)
    return admin, admin_pw


# ── 비밀번호 ─────────────────────────────
def test_비밀번호는_평문으로_저장되지_않는다():
    h = auth.hash_pw("password123")
    assert "password123" not in h
    assert h.startswith("pbkdf2$200000$")
    assert auth.verify_pw("password123", h) is True
    assert auth.verify_pw("password124", h) is False


def test_같은_비밀번호도_해시가_다르다():
    """salt 가 매번 달라야 한다 — 레인보우 테이블 방어."""
    assert auth.hash_pw("password123") != auth.hash_pw("password123")


def test_깨진_해시는_검증_실패():
    for bad in ("", "garbage", "pbkdf2$abc", "md5$1$aa$bb"):
        assert auth.verify_pw("password123", bad) is False


# ── 가입 ─────────────────────────────
def test_가입하면_승인대기_실권한_0():
    """희망 레벨 3을 골라도 실권한은 0이어야 한다. 이 테스트가 깨지면 권한이 뚫린 것."""
    u = mk("execA", level_req=3)
    row = auth.get_user(u["id"])
    assert row["requested_level"] == 3
    assert row["level"] == 0
    assert row["status"] == "pending"


def test_가입_직후_계정은_아무것도_못한다():
    u = mk("execB", level_req=3)
    actor = auth.actor_of(auth.get_user(u["id"]))
    assert decide(actor, "read", None) is False
    assert decide(actor, USER_MANAGE) is False


def test_중복_아이디_거부():
    mk("dup")
    with pytest.raises(auth.AuthError):
        mk("dup")


def test_아이디는_대소문자_구분하지_않는다():
    mk("MixedCase")
    with pytest.raises(auth.AuthError):
        mk("mixedcase")


@pytest.mark.parametrize("login,pw,name,lv", [
    ("ab", "password123", "홍", 2),        # 아이디 짧음
    ("okid", "short", "홍", 2),            # 비밀번호 짧음
    ("okid2", "password123", "  ", 2),     # 이름 없음
    ("okid3", "password123", "홍", 0),     # 레벨 범위 밖
    ("okid4", "password123", "홍", 4),
])
def test_잘못된_가입_입력_거부(login, pw, name, lv):
    with pytest.raises(auth.AuthError):
        auth.signup(login, pw, name, "", lv)


# ── 로그인 · 세션 ─────────────────────────────
def test_승인전에도_로그인은_된다():
    """대기 화면을 보여줘야 하므로 로그인 자체는 허용한다."""
    mk("pendA")
    token, user = auth.login("pendA", "password123")
    assert token and user["status"] == "pending" and user["level"] == 0


def test_틀린_비밀번호_거부():
    mk("loginA")
    with pytest.raises(auth.AuthError):
        auth.login("loginA", "wrongpass123")


def test_없는_계정과_틀린_비밀번호의_메시지가_같다():
    """계정 존재 여부를 노출하지 않는다."""
    mk("existA")
    with pytest.raises(auth.AuthError) as e1:
        auth.login("existA", "wrongpass123")
    with pytest.raises(auth.AuthError) as e2:
        auth.login("nosuchuser", "wrongpass123")
    assert str(e1.value) == str(e2.value)


def test_토큰으로_사용자를_찾는다():
    u = mk("tokA")
    token, _ = auth.login("tokA", "password123")
    assert auth.user_by_token(token)["id"] == u["id"]
    assert auth.user_by_token("bogus") is None
    assert auth.user_by_token(None) is None


def test_만료된_세션은_거부되고_삭제된다():
    mk("expA")
    token, _ = auth.login("expA", "password123")
    c = auth._conn()
    c.execute("UPDATE Sessions SET expires_at=? WHERE token=?", (auth._now() - 1, token))
    c.commit()
    c.close()
    assert auth.user_by_token(token) is None
    c = auth._conn()
    left = c.execute("SELECT COUNT(*) FROM Sessions WHERE token=?", (token,)).fetchone()[0]
    c.close()
    assert left == 0


def test_로그아웃하면_토큰이_죽는다():
    mk("outA")
    token, _ = auth.login("outA", "password123")
    auth.logout(token)
    assert auth.user_by_token(token) is None


# ── 승인 · 레벨 변경 ─────────────────────────────
def test_승인하면_실권한이_부여된다():
    u = mk("apprA", level_req=2)
    promote(u["id"], 2)
    row = auth.get_user(u["id"])
    assert row["level"] == 2 and row["status"] == "active"
    assert row["approved_at"] and row["approved_by"]


def test_승인은_희망레벨과_다르게_줄_수_있다():
    """L3를 희망했어도 관리자가 L2로 낮춰 승인할 수 있어야 한다."""
    u = mk("apprB", level_req=3)
    promote(u["id"], 1)
    assert auth.get_user(u["id"])["level"] == 1


def test_레벨_변경하면_기존_세션이_끊긴다():
    """강등된 사용자가 기존 토큰으로 옛 권한을 계속 쓰지 못하게 하는 방어선."""
    u = mk("demoA", level_req=3)
    admin, _ = promote(u["id"], 3)
    token, _ = auth.login("demoA", "password123")
    assert auth.user_by_token(token)["level"] == 3
    auth.approve(admin["id"], u["id"], 1)          # L3 → L1 강등
    assert auth.user_by_token(token) is None       # 세션이 끊겨야 한다


def test_비활성화하면_세션이_끊기고_로그인_불가():
    u = mk("disA")
    admin, _ = promote(u["id"], 2)
    token, _ = auth.login("disA", "password123")
    auth.set_status(admin["id"], u["id"], "disabled")
    assert auth.user_by_token(token) is None
    with pytest.raises(auth.AuthError):
        auth.login("disA", "password123")


def test_마지막_관리자는_비활성화_불가():
    """관리자가 0명이 되면 아무도 승인을 못 해 시스템이 잠긴다."""
    admin_pw = auth.ensure_seed_admin("adminpw12345")
    assert admin_pw
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    other = mk("other")
    auth.approve(admin["id"], other["id"], 2)      # L2 — 관리자 아님
    with pytest.raises(auth.AuthError) as e:
        auth.set_status(other["id"], admin["id"], "disabled")
    assert "마지막 관리자" in str(e.value)


def test_관리자가_둘이면_한쪽_비활성화_가능():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    second = mk("admin2")
    auth.approve(admin["id"], second["id"], 3)
    auth.set_status(admin["id"], second["id"], "disabled")
    assert auth.get_user(second["id"])["status"] == "disabled"


def test_자기_자신은_상태_변경_불가():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    with pytest.raises(auth.AuthError):
        auth.set_status(admin["id"], admin["id"], "disabled")


def test_자기_자신은_레벨_변경_불가_판정():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    actor = auth.actor_of(admin)
    ok, why = can_grant_level(actor, admin["id"], 1)
    assert ok is False and "자기 자신" in why


# ── 비밀번호 변경 ─────────────────────────────
def test_비밀번호_변경():
    u = mk("pwA")
    auth.change_password(u["id"], "password123", "newpassword456")
    with pytest.raises(auth.AuthError):
        auth.login("pwA", "password123")
    token, _ = auth.login("pwA", "newpassword456")
    assert token


def test_현재_비밀번호_틀리면_변경_거부():
    u = mk("pwB")
    with pytest.raises(auth.AuthError):
        auth.change_password(u["id"], "wrongpass123", "newpassword456")


def test_비밀번호_바꾸면_다른_기기_세션이_끊긴다():
    u = mk("pwC")
    token, _ = auth.login("pwC", "password123")
    auth.change_password(u["id"], "password123", "newpassword456")
    assert auth.user_by_token(token) is None


# ── 시드 관리자 ─────────────────────────────
def test_시드_관리자는_한_번만_생긴다():
    pw1 = auth.ensure_seed_admin("adminpw12345")
    pw2 = auth.ensure_seed_admin("adminpw12345")
    assert pw1 == "adminpw12345"
    assert pw2 is None                      # 멱등 — 두 번째는 아무것도 안 함
    admins = [u for u in auth.list_users() if u["login_id"] == "admin"]
    assert len(admins) == 1
    assert admins[0]["level"] == 3 and admins[0]["status"] == "active"


def test_시드_관리자는_비밀번호_변경_강제():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    assert admin["must_change_pw"] is True
    auth.change_password(admin["id"], "adminpw12345", "realadminpw789")
    assert auth.get_user(admin["id"])["must_change_pw"] is False


# ── 감사로그 ─────────────────────────────
def test_로그인_승인_실패가_기록된다():
    u = mk("audA")
    admin, _ = promote(u["id"], 2)
    auth.login("audA", "password123")
    try:
        auth.login("audA", "wrongpass123")
    except auth.AuthError:
        pass
    c = auth._conn()
    actions = [r[0] for r in c.execute("SELECT action FROM AuditLogs").fetchall()]
    c.close()
    for expected in ("signup", "approve", "login", "login_fail"):
        assert expected in actions


# ── 목록 ─────────────────────────────
def test_대기자_목록_필터():
    a = mk("listA")
    mk("listB")
    promote(a["id"], 2)
    pending = auth.list_users(status="pending")
    logins = {u["login_id"] for u in pending}       # 저장 시 소문자로 정규화된다
    assert "listb" in logins and "lista" not in logins
