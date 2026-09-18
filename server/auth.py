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

from server import teams as teams_store
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

# 아이디 중복 확인 시도 제한 (2026-09-04).
# 이 API 는 계정 존재 여부를 알려준다 — 제품의 다른 곳(로그인 실패 문구, 404/403 통일)과
# 반대 방향이다. 그래도 넣는 근거는 **이미 새고 있다**는 것이다: 가입 폼을 제출하면
# 지금도 "이미 사용 중인 아이디입니다"가 나온다. 이 API 는 없던 구멍을 뚫는 게 아니라
# 있는 구멍을 **빠르게** 만든다.
# 그래서 막을 것은 "알려주는 것"이 아니라 **"빠르게 많이 묻는 것"** 이다.
# 사람이 가입하며 누르는 횟수는 몇 번이고, 긁는 쪽은 수천 번이다.
CHECK_ID_WINDOW_MS = 60 * 1000       # 1분 동안
CHECK_ID_MAX = 20                    # 20회까지


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
    # 구 스키마(숫자 level)에서 올라온 DB — 역할 컬럼을 덧붙인다.
    # 값 변환은 migrate_role.py 가 하고, 구 컬럼 제거도 거기서 한다.
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
    c.commit()
    return c


# 구 숫자 레벨 컬럼 → 신규 INSERT 시 채워 넣을 값.
# 마이그레이션 전 DB 에서도 가입이 되게 하려는 것이다.
_LEGACY_DEFAULT = {"requested_level": 2, "level": 0}


def legacy_level_columns(c: sqlite3.Connection) -> list[str]:
    """아직 남아 있는 구 숫자 컬럼.

    `requested_level` 은 NOT NULL 인데 기본값이 없다. 이 컬럼이 남은 채로
    새 INSERT 를 하면 **가입이 통째로 막힌다** — 실제로 그렇게 막혔다.
    그래서 INSERT 마다 확인해 값을 함께 넣는다.
    """
    have = {r[1] for r in c.execute("PRAGMA table_info(Users)").fetchall()}
    return [x for x in ("requested_level", "level") if x in have]


def drop_legacy_level_columns(c: sqlite3.Connection) -> list[str]:
    """구 숫자 컬럼을 제거한다(migrate_role 이 값 변환을 마친 뒤 호출).

    SQLite 3.35+ 는 DROP COLUMN 을 지원한다. 구형이면 조용히 남겨두고,
    legacy_level_columns() 쪽 방어로 계속 동작한다.
    """
    dropped = []
    for col in legacy_level_columns(c):
        try:
            c.execute("ALTER TABLE Users DROP COLUMN %s" % col)
            dropped.append(col)
        except sqlite3.OperationalError:
            break
    if dropped:
        c.commit()
    return dropped


def _insert_user_sql(c: sqlite3.Connection, cols: list[str], vals: list) -> tuple[str, list]:
    """구 컬럼이 남아 있으면 기본값을 끼워 넣은 INSERT 를 만든다."""
    cols = list(cols)
    vals = list(vals)
    for col in legacy_level_columns(c):
        cols.append(col)
        vals.append(_LEGACY_DEFAULT[col])
    sql = "INSERT INTO Users(%s) VALUES(%s)" % (",".join(cols), ",".join("?" * len(cols)))
    return sql, vals


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


def list_audit(limit: int = 200, action: Optional[str] = None) -> list[dict]:
    """감사 기록 읽기 — 최근 것부터.

    지금까지 기록만 쓰고 읽는 길이 없었다. 남기기만 하고 아무도 볼 수 없는 로그는
    "남겼다"고 말할 수 있을 뿐 실제로는 없는 것과 같다(UDS-107 §5).
    되돌릴 수 없는 조작(자료 삭제·계정 중지 등)이 늘어날수록 이게 유일한 사후 확인 수단이다.
    """
    limit = max(1, min(int(limit or 200), 1000))
    c = _conn()
    try:
        if action:
            rows = c.execute(
                "SELECT id,user_id,action,target,ts,detail FROM AuditLogs "
                "WHERE action=? ORDER BY id DESC LIMIT ?", (action, limit)).fetchall()
        else:
            rows = c.execute(
                "SELECT id,user_id,action,target,ts,detail FROM AuditLogs "
                "ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    finally:
        c.close()
    return [{"id": r[0], "user_id": r[1], "action": r[2], "target": r[3],
             "ts": r[4], "detail": r[5] or ""} for r in rows]


# ── 가입 ─────────────────────────────────────────
class AuthError(Exception):
    pass


class RateLimited(Exception):
    """시도가 너무 잦다. 라우터가 429 로 옮긴다."""
    pass


def login_id_taken(login_id: str, ip: str = "") -> bool:
    """그 아이디를 쓸 수 있는가 — 가입 화면의 「중복 확인」.

    **돌려주는 것은 bool 하나다.** "이미 있다"와 "못 쓰는 형식이다"를 나눠 답하면
    응답 모양 자체가 정보가 된다. 형식은 화면이 서버에 묻지 않고도 판정하므로
    여기서 자세히 말할 이유도 없다.

    감사로그에 **아이디를 적지 않는다.** 적어 두면 로그를 보는 것만으로
    "누가 캐 갔는가"가 아니라 **캐 간 결과 자체**가 재현된다.
    """
    if recent_check_ids(ip) >= CHECK_ID_MAX:
        audit(None, "check_id_blocked", ip[:64],
              "%d초 내 %d회" % (CHECK_ID_WINDOW_MS // 1000, CHECK_ID_MAX))
        raise RateLimited(
            "확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
        )
    audit(None, "check_id", ip[:64])

    v = (login_id or "").strip().lower()
    if len(v) < MIN_LOGIN_ID or len(v) > MAX_LOGIN_ID or not _LOGIN_ID_RE.match(v):
        # 형식이 틀린 아이디는 애초에 가입할 수 없다 → 「쓸 수 없음」과 같은 답.
        return True

    c = _conn()
    try:
        r = c.execute("SELECT 1 FROM Users WHERE login_id=?", (v,)).fetchone()
    finally:
        c.close()
    return bool(r)


def recent_check_ids(ip: str) -> int:
    """최근 CHECK_ID_WINDOW_MS 안의 확인 횟수. 감사로그를 그대로 카운터로 쓴다
    (`recent_login_fails` 와 같은 방식 — 별도 테이블을 만들지 않는다)."""
    since = _now() - CHECK_ID_WINDOW_MS
    c = _conn()
    try:
        r = c.execute(
            "SELECT COUNT(*) FROM AuditLogs WHERE action='check_id' AND target=? AND ts>=?",
            (ip[:64], since),
        ).fetchone()
    finally:
        c.close()
    return int(r[0]) if r else 0


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
            sql, vals = _insert_user_sql(
                c,
                ["id", "login_id", "pw_hash", "name", "dept", "requested_role",
                 "role", "status", "must_change_pw", "created_at"],
                [uid, login_id, hash_pw(pw), name, dept, requested_role,
                 "", "pending", 0, _now()],
            )
            c.execute(sql, vals)
            c.commit()
        except sqlite3.IntegrityError as e:
            # IntegrityError 를 통째로 '중복 아이디'로 뭉개면 안 된다.
            # 스키마 문제(구 NOT NULL 컬럼 잔존 등)까지 같은 문구가 나가면
            # 사용자는 아이디만 계속 바꿔가며 헤매고 진짜 원인은 드러나지 않는다.
            msg = str(e)
            if "UNIQUE" in msg and "login_id" in msg:
                raise AuthError("이미 사용 중인 아이디입니다.")
            raise AuthError(
                "계정을 만들지 못했습니다. 관리자에게 문의해 주세요. (%s)" % msg[:120]
            )
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
    """dict → 권한 판정용 Actor. permissions.decide() 는 이것만 받는다.

    소속 팀을 **여기서 매번 읽는다.** 세션 토큰에 넣어 두면 L1 이 팀을 옮긴 뒤에도
    그 사람은 다시 로그인할 때까지 옛 팀 자료를 계속 본다 — 가시성 규칙에서는
    그게 곧 유출이다. 대신 팀 변경 때 `_kill_sessions()` 를 부르지 않아도 된다
    (부르면 L1 이 팀을 편성할 때마다 팀원 전원이 화면에서 튕긴다).
    """
    if not user:
        return None
    return Actor(id=user["id"], role=user.get("role") or "", status=user["status"],
                 team_ids=teams_store.team_ids_of(user["id"]))


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


def set_name(actor_id: str, target_id: str, name: str) -> dict:
    """이름을 고친다 — 관리자 전용. 호출 전에 `USER_MANAGE` 로 판정해야 한다.

    **왜 이 길이 생겼나**(2026-09-16). 처음 만들어진 관리자 계정의 이름이
    「시스템 관리자」였는데, 이름을 바꿀 길이 **서버에도 화면에도 관리 도구에도
    없었다.** 씨앗 코드(`ensure_seed_admin`)의 글자를 고쳐도 소용이 없다 — 그 값은
    **계정을 처음 만들 때 한 번만** 쓰이고, 이미 있으면 그 함수는 아무것도 안 한다.
    그래서 DB 를 직접 여는 것 말고는 방법이 없었다.

    **이름은 살아 있는 값이다.** 결재 기록에는 사람의 **id** 만 적히고 이름은 볼 때마다
    여기서 찾아간다. 그래서 여기서 한 번 고치면 **지난 결재 건까지 전부** 새 이름으로
    보인다 — 되돌려 승인받을 필요가 없다.

    **안 따라오는 것도 있다.** 자료 제목(「…임원회의 — 홍길동」)과 얼어붙은 스냅샷 속
    글자는 만들 때 한 번 박힌 것이라 안 바뀐다. 그건 버그가 아니라 기록이다 —
    승인은 「그때 본 것」에 대한 승인이고, 그때 이름이 그때 이름으로 남는 편이 맞다.

    비밀번호를 바꾸거나 역할을 낮추는 일과 달리 **세션을 끊지 않는다.** 이름은 무엇을
    할 수 있는지를 바꾸지 않는다 — 쓰던 사람을 밖으로 밀어낼 까닭이 없다.
    """
    name = (name or "").strip()
    if not name:
        raise AuthError("이름을 입력해 주세요.")
    if len(name) > MAX_NAME:
        raise AuthError("이름은 %d자 이하여야 합니다." % MAX_NAME)
    target = get_user(target_id)
    if not target:
        raise AuthError("대상 사용자를 찾을 수 없습니다.")
    before = target.get("name") or ""
    if before == name:
        return target
    c = _conn()
    try:
        c.execute("UPDATE Users SET name=? WHERE id=?", (name, target_id))
        c.commit()
    finally:
        c.close()
    # **앞 이름을 남긴다.** 이름이 바뀌면 지난 결재 건의 결재자 이름까지 함께 바뀌므로,
    # 「그때 그 사람이 누구였나」를 되짚을 자리가 여기밖에 없다.
    audit(actor_id, "rename", target_id, "name=%s (was %s)" % (name, before))
    result = get_user(target_id)
    assert result is not None
    return result


def set_own_password(user_id: str, new_pw: str) -> None:
    """**관리자가 제 비밀번호를 옛 값 없이 바꾼다**(2026-09-18 · 사용자 결정).

    ── 무엇을 푸는가 ──
    관리자가 **한 명**인 조직에서 그 사람이 비밀번호를 잊으면, 화면으로는 길이 없었다.
    `reset_password` 는 본인을 막고(아래 참고), `change_password` 는 옛 값을 묻는다.
    남는 길은 서버에 들어가 `admin_cli reset-pw` 를 치는 것뿐이었다.

    ── 왜 「초기화」가 아니라 「직접 정하기」인가 ──
    본인 초기화를 여는 쪽이 말은 쉬운데, **그 길은 사람을 가둔다.** 초기화는 세션을
    끊으므로 내 창이 그 자리에서 로그인 화면으로 튕기고, **한 번만 보이는 임시
    비밀번호가 그 화면과 함께 사라진다**(시험 서버에서 재 봤다 — 남의 것을 초기화하자
    그 창이 「로그인이 만료되어…」로 바뀌었다). 관리자가 한 명이면 그 순간 갇힌다.
    본인이 값을 **직접 정하면** 놓칠 글자가 없다.

    ── 한계 ──
    이건 「**로그인은 살아 있는데 비밀번호가 기억 안 나는**」 경우만 푼다. 이미
    로그아웃됐다면 눌러야 할 단추가 로그인 안에 있으므로 여전히 `admin_cli` 뿐이다.
    그래서 매뉴얼은 **관리자를 둘 이상 두라**고 먼저 권한다.

    ── 무엇을 내주는가 ──
    옛 비밀번호 확인은 **자리를 비운 사이 누가 계정을 가져가는 것**을 막던 장치였다.
    그걸 관리자에 한해 뺀다. 이미 그 사람은 열린 관리자 세션으로 무엇이든 할 수
    있지만, 「잠깐의 세션」이 「계속 쓰는 자격」으로 바뀌는 것은 다른 일이다.
    그래서 **감사로그에 다른 이름으로 남긴다**(`change_pw_noold`) — 평범한 변경과
    섞이면 나중에 무엇이 있었는지 못 가린다.

    **관리자인지는 여기서 안 본다.** 부르는 쪽(라우터)이 `USER_MANAGE` 로 막는다 —
    권한 판단을 두 곳에 두면 한쪽만 바뀌는 날이 온다.
    """
    if not new_pw or len(new_pw) < 8:
        raise AuthError("새 비밀번호는 8자 이상이어야 합니다.")
    c = _conn()
    try:
        r = c.execute("SELECT pw_hash FROM Users WHERE id=?", (user_id,)).fetchone()
        if not r:
            raise AuthError("사용자를 찾을 수 없습니다.")
        if verify_pw(new_pw, r[0]):
            raise AuthError("쓰던 비밀번호와 다르게 정해 주세요.")
        c.execute("UPDATE Users SET pw_hash=?, must_change_pw=0 WHERE id=?",
                  (hash_pw(new_pw), user_id))
        c.commit()
    finally:
        c.close()
    # 바꿨으면 다른 기기의 세션은 모두 끊는다 — change_password 와 같게 맞춘다.
    _kill_sessions(user_id)
    audit(user_id, "change_pw_noold", user_id)


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


def admin_reset_password(actor_id: str, target_id: str) -> str:
    """관리자가 남의 비밀번호를 **무작위로 재발급**한다. 돌려주는 값은 임시 비밀번호.

    **관리자가 값을 고르지 못한다.** 고르게 하면 관리자가 그 값을 계속 알고 있어서
    그 계정을 사칭할 수 있는 창이 열린 채로 남는다. 무작위로 발급하고
    `must_change_pw=1` 로 최초 로그인 시 변경을 강제하면, 관리자가 아는 값은
    **한 번 쓰고 폐기된다.**

    **본인도 대상이다**(2026-09-18 · 사용자 결정으로 **뒤집혔다**).

    원래는 막았고, 이유는 「본인 것을 무작위로 날리면 화면에 뜬 글자를 놓치는 순간
    관리자가 스스로 잠긴다」였다. 그 걱정은 **세션이 끊기면서 화면이 로그인으로 튕겨
    임시 비밀번호 창까지 함께 사라진다**는 것이었는데, 사용자가 되물었다 —
    「모달이 뜨고 닫기를 누르면 로그인 화면으로 가게 설정하면 되잖아.」 맞는 말이다.
    **튕기는 시점은 화면이 정할 수 있다.** 서버는 세션을 끊고, 화면은 창을 닫을 때까지
    그 사실을 미뤄 둔다(`session.holdUnauthorized`).

    서버가 **여기서 세션을 끊는 것은 그대로** 둔다 — 남의 것을 초기화할 때와 같아야 하고,
    끊지 않으면 열려 있던 다른 기기가 옛 비밀번호로 계속 산다.

    `status='active'` 로 되돌리는 것은 터미널 도구(`admin_cli reset-pw`)와 같게 맞춘 것이다 —
    두 길이 다르게 동작하면 어느 쪽으로 풀었는지에 따라 결과가 갈린다.

    임시 비밀번호는 **감사로그에 남기지 않는다.** 적으면 로그를 볼 수 있는 사람이
    그 계정에 들어갈 수 있다. 남기는 것은 "누가 누구를 언제"뿐이다.
    """
    target = get_user(target_id)
    if not target:
        raise AuthError("사용자를 찾을 수 없습니다.")

    pw = secrets.token_urlsafe(12)
    c = _conn()
    try:
        c.execute("UPDATE Users SET pw_hash=?, must_change_pw=1, status='active' WHERE id=?",
                  (hash_pw(pw), target_id))
        c.commit()
    finally:
        c.close()
    # 초기화했는데 그 사람이 열어 둔 창이 계속 살아 있으면 초기화는 절반만 된 것이다.
    _kill_sessions(target_id)
    audit(actor_id, "reset_pw", target_id, "login_id=%s" % target["login_id"])
    return pw


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
        sql, vals = _insert_user_sql(
            c,
            ["id", "login_id", "pw_hash", "name", "dept", "requested_role", "role",
             "status", "must_change_pw", "created_at", "approved_at"],
            [uid, _SEED_ADMIN_LOGIN, hash_pw(pw), "관리자", "", ADMIN, ADMIN,
             "active", 1, now, now],
        )
        c.execute(sql, vals)
        c.commit()
    finally:
        c.close()
    audit(uid, "seed_admin", uid)
    return pw
