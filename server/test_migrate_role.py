"""권한 모델 전환(level → role) 검증.

숫자를 뒤집는 대신 역할명으로 바꾸는 이유가 바로 이 테스트의 존재 이유다 —
전환이 절반만 되면 열람자가 관리자가 된다. 그런 상태를 만들 수 없게 못 박는다.
"""
import os
import pathlib
import sqlite3
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "role.db")

import pytest  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import migrate_role  # noqa: E402
from server import permissions as perm  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "role.db")


@pytest.fixture(autouse=True)
def clean():
    os.environ["EVER_SKETCH_DB"] = _DB
    for f in pathlib.Path(_tmp).iterdir():
        if f.is_file():
            f.unlink()
    yield


def make_legacy_db(rows):
    """구 스키마(숫자 level)를 가진 DB를 손으로 만든다."""
    c = sqlite3.connect(_DB)
    c.execute(
        "CREATE TABLE Users("
        "id TEXT PRIMARY KEY, login_id TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL, "
        "name TEXT NOT NULL, dept TEXT, requested_level INTEGER NOT NULL, "
        "level INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', "
        "must_change_pw INTEGER NOT NULL DEFAULT 0, "
        "created_at REAL NOT NULL, approved_at REAL, approved_by TEXT, last_login_at REAL)"
    )
    for i, (login, level, req, status) in enumerate(rows):
        c.execute(
            "INSERT INTO Users(id,login_id,pw_hash,name,dept,requested_level,level,status,created_at) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            ("u%d" % i, login, "pbkdf2$1$aa$bb", login, "본부", req, level, status, 1.0),
        )
    c.commit()
    c.close()


def roles_now():
    c = sqlite3.connect(_DB)
    try:
        return {r[0]: r[1] for r in c.execute("SELECT login_id, role FROM Users").fetchall()}
    finally:
        c.close()


# ══════════ 변환 규칙 ══════════
def test_레벨이_역할로_정확히_바뀐다():
    """L3=관리자 / L2=작성자 / L1=열람자 / L0=미부여.

    이 매핑이 어긋나면 열람자가 관리자가 된다 — 전환에서 가장 위험한 지점이다.
    """
    make_legacy_db([
        ("boss", 3, 3, "active"),
        ("writer1", 2, 2, "active"),
        ("viewer1", 1, 1, "active"),
        ("waiting", 0, 3, "pending"),
    ])
    migrate_role.run()
    got = roles_now()
    assert got["boss"] == perm.ADMIN
    assert got["writer1"] == perm.WRITER
    assert got["viewer1"] == perm.VIEWER
    assert got["waiting"] == ""          # 승인 전이므로 실권한 없음


def test_승인대기의_희망역할도_보존된다():
    """관리자를 신청한 사람은 전환 후에도 '관리자 신청'으로 남아야 한다."""
    make_legacy_db([("waiting", 0, 3, "pending")])
    migrate_role.run()
    c = sqlite3.connect(_DB)
    req = c.execute("SELECT requested_role FROM Users WHERE login_id='waiting'").fetchone()[0]
    c.close()
    assert req == perm.ADMIN


def test_전환_후_권한_판정이_그대로다():
    """전환의 목적은 표기 변경이지 권한 변경이 아니다."""
    make_legacy_db([("boss", 3, 3, "active"), ("viewer1", 1, 1, "active")])
    migrate_role.run()
    boss = [u for u in auth_store.list_users() if u["login_id"] == "boss"][0]
    viewer = [u for u in auth_store.list_users() if u["login_id"] == "viewer1"][0]
    assert perm.decide(auth_store.actor_of(boss), perm.USER_MANAGE) is True
    assert perm.decide(auth_store.actor_of(viewer), perm.USER_MANAGE) is False
    assert perm.decide(auth_store.actor_of(viewer), perm.WRITE,
                       perm.Resource(owner_id=viewer["id"])) is False


# ══════════ 안전장치 ══════════
def test_멱등하다():
    """재실행이 안전해야 운영 중에도 마음 놓고 돌린다.

    첫 실행이 구 컬럼까지 지우므로 두 번째는 '전환할 것이 없다'로 끝난다 —
    데이터는 그대로다.
    """
    make_legacy_db([("boss", 3, 3, "active")])
    first = migrate_role.run()
    second = migrate_role.run()
    assert len(first["converted"]) == 1
    assert second["no_legacy_column"] is True and second["converted"] == []
    assert roles_now()["boss"] == perm.ADMIN


def test_컬럼이_남아_있으면_재실행이_건너뛴다():
    """구형 SQLite 라 DROP 이 안 되는 환경 — 이미 전환된 행을 다시 건드리지 않는다."""
    make_legacy_db([("boss", 3, 3, "active")])
    c = sqlite3.connect(_DB)
    c.execute("ALTER TABLE Users ADD COLUMN role TEXT NOT NULL DEFAULT ''")
    c.execute("ALTER TABLE Users ADD COLUMN requested_role TEXT NOT NULL DEFAULT 'writer'")
    c.execute("UPDATE Users SET role=? WHERE login_id='boss'", (perm.ADMIN,))
    c.commit(); c.close()
    rep = migrate_role.run()
    assert rep["already"] == 1 and rep["converted"] == []


def test_모의_실행은_아무것도_바꾸지_않는다():
    make_legacy_db([("boss", 3, 3, "active")])
    rep = migrate_role.run(dry_run=True)
    assert len(rep["converted"]) == 1
    assert roles_now()["boss"] == ""       # 그대로
    assert not rep.get("backup")


def test_백업을_먼저_뜬다():
    make_legacy_db([("boss", 3, 3, "active")])
    rep = migrate_role.run()
    assert rep["backup"] and pathlib.Path(rep["backup"]).exists()


def test_전환_후_관리자_수를_알려준다():
    """0명이면 아무도 승인할 수 없게 된다 — 사람이 즉시 알아야 한다."""
    make_legacy_db([("boss", 3, 3, "active"), ("writer1", 2, 2, "active")])
    assert migrate_role.run()["active_admins"] == 1

    for f in pathlib.Path(_tmp).iterdir():
        if f.is_file():
            f.unlink()
    make_legacy_db([("writer1", 2, 2, "active")])       # 관리자 없음
    assert migrate_role.run()["active_admins"] == 0


def test_신규_DB는_전환할_것이_없다():
    auth_store.ensure_seed_admin("adminpw12345")
    rep = migrate_role.run()
    assert rep["no_legacy_column"] is True
    assert rep["converted"] == []


def test_이미_역할이_있으면_덮어쓰지_않는다():
    """전환 후 관리자가 역할을 손으로 바꿨는데, 재실행이 옛 level 로 되돌리면 안 된다."""
    make_legacy_db([("boss", 3, 3, "active")])
    migrate_role.run()
    c = sqlite3.connect(_DB)
    c.execute("UPDATE Users SET role=? WHERE login_id='boss'", (perm.VIEWER,))
    c.commit(); c.close()
    migrate_role.run()
    assert roles_now()["boss"] == perm.VIEWER      # 손으로 바꾼 값이 유지된다


def test_전환이_감사로그에_남는다():
    make_legacy_db([("boss", 3, 3, "active")])
    migrate_role.run()
    c = auth_store._conn()
    acts = [r[0] for r in c.execute("SELECT action FROM AuditLogs").fetchall()]
    c.close()
    assert "migrate_role" in acts


# ══════════ 표시용 등급 ══════════
def test_등급은_1등이_최고다():
    """확정 2026-08-19 — 사내 표기 관례."""
    assert perm.grade_of(perm.ADMIN) == 1
    assert perm.grade_of(perm.WRITER) == 2
    assert perm.grade_of(perm.VIEWER) == 3


def test_라벨_문구():
    assert perm.role_label(perm.ADMIN) == "Lv1 관리자"
    assert perm.role_label(perm.WRITER) == "Lv2 작성자"
    assert perm.role_label(perm.VIEWER) == "Lv3 열람자"
    assert perm.role_label("") == "미부여"


def test_등급을_역할로_되돌린다():
    assert perm.role_of_grade(1) == perm.ADMIN
    assert perm.role_of_grade(3) == perm.VIEWER
    assert perm.role_of_grade(0) is None       # 모르는 값은 거부
    assert perm.role_of_grade(4) is None


def test_등급표는_판정에_쓰이지_않는다():
    """DISPLAY_GRADE 가 decide() 안에 등장하면 숫자 체계를 바꿀 때 또 같은 사고가 난다."""
    src = pathlib.Path(perm.__file__).read_text(encoding="utf-8")
    body = src.split("def decide(")[1].split("\ndef ")[0]
    for banned in ("DISPLAY_GRADE", "grade_of", "role_of_grade"):
        assert banned not in body, "decide() 가 표시용 등급을 참조합니다: %s" % banned


# ══════════ 전환 후에도 가입이 되는가 (실제로 막혔던 버그) ══════════
def test_전환_후_신규_가입이_된다():
    """구 컬럼 requested_level 이 NOT NULL 인 채로 남으면 **가입이 통째로 막힌다.**

    실제로 그랬다 — 화면에는 '이미 사용 중인 아이디입니다'가 떴고,
    사용자는 아이디만 바꿔가며 헤맸다. 진짜 원인은
    `NOT NULL constraint failed: Users.requested_level` 이었다.
    """
    make_legacy_db([("boss", 3, 3, "active")])
    migrate_role.run()
    u = auth_store.signup("newbie", "password123", "신규", "본부", perm.WRITER)
    row = auth_store.get_user(u["id"])
    assert row["role"] == "" and row["status"] == "pending"
    assert row["requested_role"] == perm.WRITER


def test_전환하지_않은_DB에서도_가입이_된다():
    """마이그레이션을 깜빡했더라도 가입은 되어야 한다 — 구 컬럼에 기본값을 함께 넣는다."""
    make_legacy_db([("boss", 3, 3, "active")])
    u = auth_store.signup("newbie2", "password123", "신규", "본부", perm.WRITER)
    assert auth_store.get_user(u["id"])["requested_role"] == perm.WRITER


def test_전환_후_시드_관리자도_만들어진다():
    make_legacy_db([("someone", 2, 2, "active")])
    migrate_role.run()
    pw = auth_store.ensure_seed_admin("adminpw12345")
    assert pw
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    assert admin["role"] == perm.ADMIN


def test_전환하면_구_컬럼이_사라진다():
    make_legacy_db([("boss", 3, 3, "active")])
    rep = migrate_role.run()
    assert set(rep["dropped"]) == {"requested_level", "level"}
    c = sqlite3.connect(_DB)
    cols = {r[1] for r in c.execute("PRAGMA table_info(Users)").fetchall()}
    c.close()
    assert "requested_level" not in cols and "level" not in cols


def test_중복_아이디는_여전히_정확한_메시지를_준다():
    """스키마 오류를 '중복 아이디'로 뭉개면 안 되지만, 진짜 중복은 그렇게 알려야 한다."""
    auth_store.signup("dupuser", "password123", "중복", "", perm.WRITER)
    with pytest.raises(auth_store.AuthError) as e:
        auth_store.signup("dupuser", "password123", "중복2", "", perm.WRITER)
    assert "이미 사용 중인 아이디" in str(e.value)


def test_스키마_오류는_중복_아이디로_보고하지_않는다():
    """원인을 감추면 사용자는 엉뚱한 곳(아이디)만 계속 고친다."""
    import sqlite3 as sq
    make_legacy_db([("boss", 3, 3, "active")])
    c = auth_store._conn(); c.close()
    # 채울 수 없는 NOT NULL 컬럼을 하나 심어 INSERT 를 강제로 실패시킨다.
    c = sq.connect(_DB)
    c.execute("ALTER TABLE Users ADD COLUMN mandatory TEXT NOT NULL DEFAULT ''")
    c.execute("CREATE TRIGGER force_fail BEFORE INSERT ON Users BEGIN "
              "SELECT RAISE(ABORT, 'CHECK constraint failed: forced'); END")
    c.commit(); c.close()
    with pytest.raises(auth_store.AuthError) as e:
        auth_store.signup("victim", "password123", "피해자", "", perm.WRITER)
    assert "이미 사용 중인 아이디" not in str(e.value)
    assert "계정을 만들지 못했습니다" in str(e.value)
