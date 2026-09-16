"""계정·세션 저장소 테스트. 임시 DB 파일에서 돌린다."""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "t.db")

import pytest  # noqa: E402

from server import auth  # noqa: E402
from server.permissions import can_grant_role, decide, USER_MANAGE  # noqa: E402


_DB = str(pathlib.Path(_tmp) / "t.db")


@pytest.fixture(autouse=True)
def clean_db():
    """테스트마다 DB 파일을 새로 만든다(격리).

    경로를 여기서 다시 세팅하는 이유 — pytest 는 전 테스트 모듈을 먼저 import 하므로
    import 시점 환경변수는 마지막 모듈 것이 이긴다. 그러면 모듈끼리 DB를 공유해 버린다.
    """
    os.environ["EVER_SKETCH_DB"] = _DB
    p = pathlib.Path(_DB)
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(str(p) + suffix)
        if f.exists():
            f.unlink()
    yield


def mk(login, want="writer", pw="password123", name="홍길동"):
    return auth.signup(login, pw, name, "사업본부", want)


def promote(uid, role="writer"):
    """테스트 편의 — 시드 관리자로 승인."""
    admin_pw = auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    auth.approve(admin["id"], uid, role)
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
    """희망 역할이 관리자여도 실권한은 비어 있어야 한다. 이 테스트가 깨지면 권한이 뚫린 것."""
    u = mk("execA", want="admin")
    row = auth.get_user(u["id"])
    assert row["requested_role"] == "admin"
    assert row["role"] == ""
    assert row["status"] == "pending"


def test_가입_직후_계정은_아무것도_못한다():
    u = mk("execB", want="admin")
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


@pytest.mark.parametrize("login,pw,name,want", [
    ("ab", "password123", "홍", "writer"),      # 아이디 짧음
    ("okid", "short", "홍", "writer"),          # 비밀번호 짧음
    ("okid2", "password123", "  ", "writer"),   # 이름 없음
    ("okid3", "password123", "홍", ""),         # 역할 미지정
    ("okid4", "password123", "홍", "superuser"),  # 없는 역할
    ("okid5", "password123", "홍", "ADMIN"),    # 대소문자 불일치
])
def test_잘못된_가입_입력_거부(login, pw, name, want):
    with pytest.raises(auth.AuthError):
        auth.signup(login, pw, name, "", want)


# ── 로그인 · 세션 ─────────────────────────────
def test_승인전에도_로그인은_된다():
    """대기 화면을 보여줘야 하므로 로그인 자체는 허용한다."""
    mk("pendA")
    token, user = auth.login("pendA", "password123")
    assert token and user["status"] == "pending" and user["role"] == ""


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
    u = mk("apprA", want="writer")
    promote(u["id"], "writer")
    row = auth.get_user(u["id"])
    assert row["role"] == "writer" and row["status"] == "active"
    assert row["approved_at"] and row["approved_by"]


def test_승인은_희망역할과_다르게_줄_수_있다():
    """관리자를 희망했어도 승인하는 쪽이 열람자로 낮출 수 있어야 한다."""
    u = mk("apprB", want="admin")
    promote(u["id"], "viewer")
    assert auth.get_user(u["id"])["role"] == "viewer"


def test_역할_변경하면_기존_세션이_끊긴다():
    """강등된 사용자가 기존 토큰으로 옛 권한을 계속 쓰지 못하게 하는 방어선."""
    u = mk("demoA", want="admin")
    admin, _ = promote(u["id"], "admin")
    token, _ = auth.login("demoA", "password123")
    assert auth.user_by_token(token)["role"] == "admin"
    auth.approve(admin["id"], u["id"], "viewer")          # L3 → L1 강등
    assert auth.user_by_token(token) is None       # 세션이 끊겨야 한다


def test_비활성화하면_세션이_끊기고_로그인_불가():
    u = mk("disA")
    admin, _ = promote(u["id"], "writer")
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
    auth.approve(admin["id"], other["id"], "writer")      # L2 — 관리자 아님
    with pytest.raises(auth.AuthError) as e:
        auth.set_status(other["id"], admin["id"], "disabled")
    assert "마지막 관리자" in str(e.value)


def test_관리자가_둘이면_한쪽_비활성화_가능():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    second = mk("admin2")
    auth.approve(admin["id"], second["id"], "admin")
    auth.set_status(admin["id"], second["id"], "disabled")
    assert auth.get_user(second["id"])["status"] == "disabled"


def test_자기_자신은_상태_변경_불가():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    with pytest.raises(auth.AuthError):
        auth.set_status(admin["id"], admin["id"], "disabled")


def test_자기_자신은_역할_변경_불가_판정():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    actor = auth.actor_of(admin)
    ok, why = can_grant_role(actor, admin["id"], "viewer")
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
    assert admins[0]["role"] == "admin" and admins[0]["status"] == "active"


def test_시드_관리자는_비밀번호_변경_강제():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    assert admin["must_change_pw"] is True
    auth.change_password(admin["id"], "adminpw12345", "realadminpw789")
    assert auth.get_user(admin["id"])["must_change_pw"] is False


# ── 감사로그 ─────────────────────────────
def test_로그인_승인_실패가_기록된다():
    u = mk("audA")
    admin, _ = promote(u["id"], "writer")
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
    promote(a["id"], "writer")
    pending = auth.list_users(status="pending")
    logins = {u["login_id"] for u in pending}       # 저장 시 소문자로 정규화된다
    assert "listb" in logins and "lista" not in logins


# ── 이름 바꾸기 (2026-09-16) ─────────────
#
# 처음 만들어진 관리자 이름이 「시스템 관리자」였는데, **이름을 바꿀 길이 서버에도
# 화면에도 관리 도구에도 없었다.** 씨앗 코드의 글자를 고쳐도 소용이 없다 — 그 값은
# 계정을 처음 만들 때 한 번만 쓰이고, 이미 있으면 `ensure_seed_admin` 은 아무것도
# 안 한다(멱등). DB 를 직접 여는 것 말고는 방법이 없었다.
def test_이름을_바꾼다():
    u = mk("ren1", name="옛 이름")
    admin, _ = promote(u["id"], "writer")
    out = auth.set_name(admin["id"], u["id"], "새 이름")
    assert out["name"] == "새 이름"
    assert auth.get_user(u["id"])["name"] == "새 이름"


def test_씨앗_관리자_이름도_바꿀_수_있다():
    """**이게 안 돼서 이 길을 만들었다.** 씨앗으로 만들어진 계정이라고 예외가 아니다."""
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    auth.set_name(admin["id"], admin["id"], "관리자")
    assert auth.get_user(admin["id"])["name"] == "관리자"


def test_빈_이름은_안_된다():
    u = mk("ren2")
    admin, _ = promote(u["id"], "writer")
    for bad in ("", "   ", "\t"):
        with pytest.raises(auth.AuthError):
            auth.set_name(admin["id"], u["id"], bad)


def test_너무_긴_이름은_안_된다():
    """가입할 때와 **같은 자를 쓴다** — 한쪽만 느슨하면 그쪽으로 들어온다."""
    u = mk("ren3")
    admin, _ = promote(u["id"], "writer")
    with pytest.raises(auth.AuthError):
        auth.set_name(admin["id"], u["id"], "가" * (auth.MAX_NAME + 1))
    auth.set_name(admin["id"], u["id"], "가" * auth.MAX_NAME)


def test_없는_사람의_이름은_못_바꾼다():
    auth.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth.list_users() if u["login_id"] == "admin"][0]
    with pytest.raises(auth.AuthError):
        auth.set_name(admin["id"], "u_없음", "아무개")


def test_이름_앞뒤_공백은_털어_낸다():
    u = mk("ren4")
    admin, _ = promote(u["id"], "writer")
    assert auth.set_name(admin["id"], u["id"], "  김가현  ")["name"] == "김가현"


def test_이름을_바꿔도_쓰던_사람을_안_쫓아낸다():
    """역할 변경·비활성화와 다르다. **이름은 무엇을 할 수 있는지를 안 바꾼다** —
    쓰던 사람을 로그인 화면으로 밀어낼 까닭이 없다."""
    u = mk("ren5", pw="password123")
    admin, _ = promote(u["id"], "writer")
    token, _ = auth.login("ren5", "password123")
    auth.set_name(admin["id"], u["id"], "새 이름")
    still = auth.user_by_token(token)
    assert still is not None and still["name"] == "새 이름"


def test_이름을_바꾸면_감사로그에_앞_이름이_남는다():
    """이름이 바뀌면 **지난 결재 건의 결재자 이름까지** 함께 바뀐다(id 만 저장하므로).
    그래서 「그때 그 사람이 누구였나」를 되짚을 자리가 여기밖에 없다."""
    u = mk("ren6", name="옛 이름")
    admin, _ = promote(u["id"], "writer")
    auth.set_name(admin["id"], u["id"], "새 이름")
    rows = [a for a in auth.list_audit() if a["action"] == "rename"]
    assert rows, "rename 이 감사로그에 안 남았습니다"
    assert "옛 이름" in rows[0]["detail"] and "새 이름" in rows[0]["detail"]


def test_같은_이름으로_바꾸면_조용히_지나간다():
    """감사로그가 「안 바뀐 변경」으로 불어나지 않는다."""
    u = mk("ren7", name="그대로")
    admin, _ = promote(u["id"], "writer")
    before = len([a for a in auth.list_audit() if a["action"] == "rename"])
    auth.set_name(admin["id"], u["id"], "그대로")
    after = len([a for a in auth.list_audit() if a["action"] == "rename"])
    assert before == after
