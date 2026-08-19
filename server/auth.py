"""계정·세션 저장소 — SQLite.

가입은 자유롭게, 권한은 승인제로.
`requested_role`(본인이 고른 희망 역할)과 `role`(실권한)을 **다른 컬럼으로 둔다.**
가입 시점에는 requested_role 만 채우고 role='' / status='pending'.
관리자가 승인할 때 비로소 role 이 채워진다.

이 분리가 없으면 링크를 아는 누구나 관리자를 골라 임원 자료 전체를 열람·삭제할 수 있다.

권한은 숫자가 아니라 **역할명**(admin/writer/viewer)으로 저장한다 — 이유는 permissions.py 참조.

시간 단위는 밀리초로 통일한다(기존 Projects/ProjectVersions 와 동일. Notes 만 초라서 이관 시 ×1000).
"""
from __future__ import annotations

import hashlib
import hmac
import re
import os
import pathlib
import secrets
import sqlite3
import time
import uuid
from typing import Optional

from server.permissions import ADMIN, Actor, ROLES, VIEWER, WRITER

_HERE = pathlib.Path(__file__).resolve().parent

PBKDF2_ROUNDS = 200_000
SESSION_TTL_MS = 12 * 60 * 60 * 1000        # 12시간
_SEED_ADMIN_LOGIN = "admin"

# 입력 길이 상한 (UDS-107 §6 — 형식·길이·범위 검증).
# 상한이 없으면 두 가지가 터진다.
#  · 비밀번호: PBKDF2 는 입력 길이에 비례해 시간을 쓴다. 10MB 비밀번호를 반복 전송하면
#    로그인 하나가 서버 CPU를 통째로 먹는다(연산 DoS).
#  · 아이디·이름: 무제한이면 DB와 화면·감사로그가 그대로 오염된다.
MAX_LOGIN_ID = 32
MIN_LOGIN_ID = 3
MAX_PASSWORD = 128
MIN_PASSWORD = 8
MAX_NAME = 40
MAX_DEPT = 40

# 로그인 시도 제한 (UDS-107 §6 — 권한 상승을 위협 모델에 포함).
LOGIN_WINDOW_MS = 10 * 60 * 1000     # 10분 동안
LOGIN_MAX_FAILS = 10                 # 10회 실패하면 잠금
_LOGIN_ID_RE = re.compile(r"^[a-z0-9._-]+$")


def _db_path() -> str:
    # 신규 변수 우선, 기존 EBOOK_HTML_DB 는 폴백으로 유지(이관 전 호환)
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


def _now() -> int:
    return int(time.time() * 1000)


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    # 동시 자동저장이 몰릴 때 읽기가 쓰기에 막히지 않도록. 임원 10~20명 동시 편집 대비.
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Users("
        "id TEXT PRIMARY KEY, login_id TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL, "
        "name TEXT NOT NULL, dept TEXT, requested_role TEXT NOT NULL DEFAULT 'writer', "
        "role TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', "
        "must_change_pw INTEGER NOT NULL DEFAULT 0, "
        "created_at REAL NOT NULL, approved_at REAL, approved_by TEXT, last_login_at REAL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_status ON Users(status)")
    # 구 스키마(level/requested_level 숫자)에서 올라온 DB 호환 — 컬럼만 덧붙인다.
    # 값 변환은 migrate_role.py 가 한다(백업 후 일괄).
    have = {r[1] for r in c.execute("PRAGMA table_info(Users)").fetchall()}
    if "role" not in have:
        c.execute("ALTER TABLE Users ADD COLUMN role TEXT NOT NULL DEFAULT ''")
    if "requested_role" not in have:
        c.execute("ALTER TABLE Users ADD COLUMN requested_role TEXT NOT NULL DEFAULT 'writer'")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Sessions("
        "token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at REAL NOT NULL, "
        "expires_at REAL NOT NULL, ip TEXT, user_agent TEXT)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON Sessions(user_id)")
    c.execute(
        "CREATE TABLE IF NOT EXISTS AuditLogs("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, "
        "target TEXT, ts REAL NOT NULL, detail TEXT)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON AuditLogs(ts)")
    return c


# ── 비밀번호 ─────────────────────────────────────────
def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return "pbkdf2$%d$%s$%s" % (PBKDF2_ROUNDS, salt.hex(), dk.hex())


def verify_pw(pw: str, stored: str) -> bool:
    try:
        scheme, rounds, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds))
    except Exception:
        return False
    # 타이밍 공격 방지 — 단순 == 비교를 쓰지 않는다.
    return hmac.compare_digest(dk.hex(), hash_hex)


def _new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:12]


def audit(user_id: Optional[str], action: str, target: str = "", detail: str = "") -> None:
    c = _conn()
    try:
        c.execute(
            "INSERT INTO AuditLogs(user_id,action,target,ts,detail) VALUES(?,?,?,?,?)",
            (user_id, action, target, _now(), detail),
        )
        c.commit()
    finally:
        c.close()


# ── 가입 ─────────────────────────────────────────
class AuthError(Exception):
    pass


def signup(login_id: str, pw: str, name: str, dept: str, requested_role: str) -> dict:
    """자가가입. **실권한은 부여하지 않는다** — role='', status='pending'."""
    login_id = (login_id or "").strip().lower()
    name = (name or "").strip()
    dept = (dept or "").strip()
    if len(login_id) < MIN_LOGIN_ID or len(login_id) > MAX_LOGIN_ID:
        raise AuthError("아이디는 %d~%d자여야 합니다." % (MIN_LOGIN_ID, MAX_LOGIN_ID))
    if not _LOGIN_ID_RE.match(login_id):
        # 공백·제어문자·따옴표가 섞인 아이디는 로그와 화면을 오염시킨다.
        raise AuthError("아이디는 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.")
    if not pw or len(pw) < MIN_PASSWORD:
        raise AuthError("비밀번호는 %d자 이상이어야 합니다." % MIN_PASSWORD)
    if len(pw) > MAX_PASSWORD:
        raise AuthError("비밀번호는 %d자 이하여야 합니다." % MAX_PASSWORD)
    if not name:
        raise AuthError("이름을 입력해 주세요.")
    if len(name) > MAX_NAME:
        raise AuthError("이름은 %d자 이하여야 합니다." % MAX_NAME)
    if len(dept) > MAX_DEPT:
        raise AuthError("부서는 %d자 이하여야 합니다." % MAX_DEPT)
    if requested_role not in ROLES:
        raise AuthError("희망 권한은 관리자·작성자·열람자 중에서 골라주세요.")

    uid = _new_id("u")
    c = _conn()
    try:
        try:
            c.execute(
                "INSERT INTO Users(id,login_id,pw_hash,name,dept,requested_role,role,status,"
                "must_change_pw,created_at) VALUES(?,?,?,?,?,?,'','pending',0,?)",
                (uid, login_id, hash_pw(pw), name, dept, requested_role, _now()),
            )
            c.commit()
        except sqlite3.IntegrityError:
            raise AuthError("이미 사용 중인 아이디입니다.")
    finally:
        c.close()
    audit(uid, "signup", uid, "requested_role=%s" % requested_role)
    return {"id": uid, "login_id": login_id, "status": "pending", "requested_role": requested_role}


# ── 로그인 · 세션 ─────────────────────────────────────────
def _row_to_user(r) -> dict:
    return {
        "id": r[0], "login_id": r[1], "name": r[2], "dept": r[3],
        "requested_role": r[4], "role": r[5], "status": r[6],
        "must_change_pw": bool(r[7]), "created_at": r[8],
        "approved_at": r[9], "approved_by": r[10], "last_login_at": r[11],
    }


_USER_COLS = ("id,login_id,name,dept,requested_role,role,status,must_change_pw,"
              "created_at,approved_at,approved_by,last_login_at")


def get_user(uid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute("SELECT %s FROM Users WHERE id=?" % _USER_COLS, (uid,)).fetchone()
    finally:
        c.close()
    return _row_to_user(r) if r else None


def recent_login_fails(login_id: str) -> int:
    """최근 LOGIN_WINDOW_MS 안의 실패 횟수. 감사로그를 그대로 카운터로 쓴다(별도 테이블 불필요)."""
    since = _now() - LOGIN_WINDOW_MS
    c = _conn()
    try:
        r = c.execute(
            "SELECT COUNT(*) FROM AuditLogs WHERE action='login_fail' AND target=? AND ts>=?",
            (login_id, since),
        ).fetchone()
    finally:
        c.close()
    return int(r[0]) if r else 0


def login(login_id: str, pw: str, ip: str = "", ua: str = "") -> tuple[str, dict]:
    """성공하면 (세션 토큰, 사용자). 승인 대기 계정도 **로그인은 된다** — 대기 화면을 보여줘야 하므로.

    실패 사유를 아이디/비밀번호로 구분해서 알려주지 않는다(계정 존재 여부 노출 방지).
    """
    login_id = (login_id or "").strip().lower()

    # 길이 상한 — PBKDF2 는 입력에 비례해 CPU를 쓴다. 검증 전에 먼저 잘라낸다.
    if len(login_id) > MAX_LOGIN_ID or len(pw or "") > MAX_PASSWORD:
        audit(None, "login_fail", login_id[:MAX_LOGIN_ID], "입력 길이 초과")
        raise AuthError("아이디 또는 비밀번호가 올바르지 않습니다.")

    # 시도 제한 — 사내망이라 외부 무차별 대입은 없지만, 같은 망 안에서의 시도는 막아야 한다.
    if recent_login_fails(login_id) >= LOGIN_MAX_FAILS:
        audit(None, "login_locked", login_id, "%d분 내 %d회 실패" % (LOGIN_WINDOW_MS // 60000, LOGIN_MAX_FAILS))
        raise AuthError(
            "로그인 시도가 너무 많습니다. %d분 후 다시 시도하거나 관리자에게 문의해 주세요."
            % (LOGIN_WINDOW_MS // 60000)
        )

    c = _conn()
    try:
        r = c.execute("SELECT id,pw_hash,status FROM Users WHERE login_id=?", (login_id,)).fetchone()
    finally:
        c.close()
    if not r or not verify_pw(pw or "", r[1]):
        audit(None, "login_fail", login_id)
        raise AuthError("아이디 또는 비밀번호가 올바르지 않습니다.")
    uid, _, status = r
    if status == "disabled":
        audit(uid, "login_fail", uid, "disabled")
        raise AuthError("비활성화된 계정입니다. 관리자에게 문의해 주세요.")

    token = secrets.token_urlsafe(32)
    now = _now()
    c = _conn()
    try:
        c.execute(
            "INSERT INTO Sessions(token,user_id,created_at,expires_at,ip,user_agent) VALUES(?,?,?,?,?,?)",
            (token, uid, now, now + SESSION_TTL_MS, ip, ua),
        )
        c.execute("UPDATE Users SET last_login_at=? WHERE id=?", (now, uid))
        # 성공했으면 실패 기록을 잠금 계산에서 제외한다(이력 자체는 남긴다).
        c.execute("UPDATE AuditLogs SET action='login_fail_cleared' "
                  "WHERE action='login_fail' AND target=?", (login_id,))
        c.commit()
    finally:
        c.close()
    audit(uid, "login", uid)
    user = get_user(uid)
    assert user is not None
    return token, user


def logout(token: str) -> None:
    c = _conn()
    try:
        c.execute("DELETE FROM Sessions WHERE token=?", (token,))
        c.commit()
    finally:
        c.close()


def user_by_token(token: Optional[str]) -> Optional[dict]:
    """만료된 세션은 즉시 삭제하고 None."""
    if not token:
        return None
    c = _conn()
    try:
        r = c.execute("SELECT user_id,expires_at FROM Sessions WHERE token=?", (token,)).fetchone()
        if not r:
            return None
        if r[1] < _now():
            c.execute("DELETE FROM Sessions WHERE token=?", (token,))
            c.commit()
            return None
    finally:
        c.close()
    return get_user(r[0])


def actor_of(user: Optional[dict]) -> Optional[Actor]:
    """dict → 권한 판정용 Actor. permissions.decide() 는 이것만 받는다."""
    if not user:
        return None
    return Actor(id=user["id"], role=user.get("role") or "", status=user["status"])


def _kill_sessions(user_id: str) -> None:
    """레벨 변경·비활성화 시 반드시 호출. 안 하면 강등된 사용자가 기존 토큰으로 옛 권한을 계속 쓴다."""
    c = _conn()
    try:
        c.execute("DELETE FROM Sessions WHERE user_id=?", (user_id,))
        c.commit()
    finally:
        c.close()


# ── 관리 ─────────────────────────────────────────
def list_users(status: Optional[str] = None) -> list[dict]:
    c = _conn()
    try:
        if status:
            rows = c.execute(
                "SELECT %s FROM Users WHERE status=? ORDER BY created_at DESC" % _USER_COLS,
                (status,),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT %s FROM Users ORDER BY status='pending' DESC, created_at DESC" % _USER_COLS
            ).fetchall()
    finally:
        c.close()
    return [_row_to_user(r) for r in rows]


def count_active_admins(exclude: Optional[str] = None) -> int:
    c = _conn()
    try:
        if exclude:
            r = c.execute(
                "SELECT COUNT(*) FROM Users WHERE role=? AND status='active' AND id<>?",
                (ADMIN, exclude),
            ).fetchone()
        else:
            r = c.execute("SELECT COUNT(*) FROM Users WHERE role=? AND status='active'",
                          (ADMIN,)).fetchone()
    finally:
        c.close()
    return int(r[0]) if r else 0


def approve(actor_id: str, target_id: str, role: str) -> dict:
    """가입 승인 · 역할 변경. 호출 전에 permissions.can_grant_role 로 판정해야 한다."""
    if role not in ROLES:
        raise AuthError("역할은 관리자·작성자·열람자 중에서 지정할 수 있습니다.")
    target = get_user(target_id)
    if not target:
        raise AuthError("대상 사용자를 찾을 수 없습니다.")
    c = _conn()
    try:
        c.execute(
            "UPDATE Users SET role=?, status='active', approved_at=?, approved_by=? WHERE id=?",
            (role, _now(), actor_id, target_id),
        )
        c.commit()
    finally:
        c.close()
    # 강등일 수 있으므로 기존 세션을 끊는다. 재로그인하면 새 역할이 적용된다.
    _kill_sessions(target_id)
    audit(actor_id, "approve", target_id, "role=%s (was %s)" % (role, target["role"] or "none"))
    result = get_user(target_id)
    assert result is not None
    return result


def set_status(actor_id: str, target_id: str, status: str) -> dict:
    """활성/비활성 전환. 마지막 남은 활성 L3는 비활성화할 수 없다(관리자 잠김 방지)."""
    if status not in ("active", "disabled"):
        raise AuthError("상태는 active 또는 disabled 만 가능합니다.")
    target = get_user(target_id)
    if not target:
        raise AuthError("대상 사용자를 찾을 수 없습니다.")
    if actor_id == target_id:
        raise AuthError("자기 자신의 상태는 변경할 수 없습니다.")
    if status == "disabled" and target["role"] == ADMIN and target["status"] == "active":
        if count_active_admins(exclude=target_id) == 0:
            raise AuthError("마지막 관리자는 비활성화할 수 없습니다.")
    c = _conn()
    try:
        c.execute("UPDATE Users SET status=? WHERE id=?", (status, target_id))
        c.commit()
    finally:
        c.close()
    _kill_sessions(target_id)
    audit(actor_id, "disable" if status == "disabled" else "enable", target_id)
    result = get_user(target_id)
    assert result is not None
    return result


def change_password(user_id: str, old_pw: str, new_pw: str) -> None:
    if not new_pw or len(new_pw) < 8:
        raise AuthError("새 비밀번호는 8자 이상이어야 합니다.")
    c = _conn()
    try:
        r = c.execute("SELECT pw_hash FROM Users WHERE id=?", (user_id,)).fetchone()
        if not r or not verify_pw(old_pw or "", r[0]):
            raise AuthError("현재 비밀번호가 올바르지 않습니다.")
        c.execute("UPDATE Users SET pw_hash=?, must_change_pw=0 WHERE id=?",
                  (hash_pw(new_pw), user_id))
        c.commit()
    finally:
        c.close()
    # 비밀번호를 바꿨으면 다른 기기의 세션은 모두 끊는다.
    _kill_sessions(user_id)
    audit(user_id, "change_pw", user_id)


def ensure_seed_admin(initial_pw: Optional[str] = None) -> Optional[str]:
    """최초 관리자 1명을 시드로 만든다. 이미 있으면 아무것도 하지 않는다(멱등).

    돌려주는 값은 **생성했을 때만** 초기 비밀번호. 콘솔에 한 번 찍고 잊는다.
    must_change_pw=1 이라 최초 로그인 시 비밀번호를 반드시 바꿔야 한다.
    """
    c = _conn()
    try:
        r = c.execute("SELECT id FROM Users WHERE login_id=?", (_SEED_ADMIN_LOGIN,)).fetchone()
    finally:
        c.close()
    if r:
        return None
    pw = initial_pw or secrets.token_urlsafe(12)
    uid = _new_id("u")
    now = _now()
    c = _conn()
    try:
        c.execute(
            "INSERT INTO Users(id,login_id,pw_hash,name,dept,requested_role,role,status,"
            "must_change_pw,created_at,approved_at) VALUES(?,?,?,?,?,?,?,'active',1,?,?)",
            (uid, _SEED_ADMIN_LOGIN, hash_pw(pw), "시스템 관리자", "", ADMIN, ADMIN, now, now),
        )
        c.commit()
    finally:
        c.close()
    audit(uid, "seed_admin", uid)
    return pw
