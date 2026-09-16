"""관리자 콘솔 도구 — 화면 없이 계정을 손볼 때 쓴다.

만든 이유가 둘 있다.
  1. 시드 관리자 초기 비밀번호는 서버 기동 시 콘솔에 **한 번만** 찍힌다. 놓치면 못 들어간다.
  2. 관리자가 0명이 되거나 비밀번호를 잊으면 화면으로는 복구할 길이 없다.

서버를 끄지 않고 써도 되지만, 세션을 끊으므로 해당 사용자는 다시 로그인해야 한다.

사용법 (저장소 루트에서):
    python3 -m server.admin_cli list
    python3 -m server.admin_cli reset-pw                 # admin 비밀번호 재발급
    python3 -m server.admin_cli reset-pw --login 홍길동id
    python3 -m server.admin_cli reset-pw --password 직접지정할비밀번호
    python3 -m server.admin_cli promote --login 사번 --role admin
    python3 -m server.admin_cli unlock --login 사번        # 로그인 잠금 해제
"""
from __future__ import annotations

import argparse
import secrets

from server import auth as auth_store
from server import permissions as perm


def _find(login_id: str) -> dict:
    login_id = (login_id or "").strip().lower()
    hits = [u for u in auth_store.list_users() if u["login_id"] == login_id]
    if not hits:
        raise SystemExit("사용자를 찾을 수 없습니다: %s" % login_id)
    return hits[0]


def cmd_list() -> None:
    users = auth_store.list_users()
    if not users:
        print("등록된 사용자가 없습니다. 서버를 한 번 기동하면 admin 계정이 생깁니다.")
        return
    print("%-16s %-14s %-12s %-10s %s" % ("아이디", "이름", "권한", "상태", "비고"))
    print("-" * 74)
    for u in users:
        note = []
        if u["must_change_pw"]:
            note.append("비밀번호 변경 필요")
        if u["status"] == "pending":
            note.append("희망 %s" % perm.role_label(u["requested_role"]))
        print("%-16s %-14s %-12s %-10s %s" % (
            u["login_id"], u["name"],
            perm.role_label(u["role"]) if u["role"] else "-",
            u["status"], " · ".join(note)))
    print("-" * 70)
    print("활성 관리자 %d명" % auth_store.count_active_admins())


def cmd_reset_pw(login_id: str, password: str | None) -> None:
    user = _find(login_id)
    pw = password or secrets.token_urlsafe(12)
    c = auth_store._conn()
    try:
        c.execute("UPDATE Users SET pw_hash=?, must_change_pw=1, status='active' WHERE id=?",
                  (auth_store.hash_pw(pw), user["id"]))
        c.commit()
    finally:
        c.close()
    auth_store._kill_sessions(user["id"])          # 기존 세션 전부 무효화
    auth_store.audit(user["id"], "reset_pw_cli", user["id"], "콘솔에서 재발급")
    print("=" * 60)
    print("  %s 의 비밀번호를 재발급했습니다." % user["login_id"])
    print("  새 비밀번호: %s" % pw)
    print("  최초 로그인 시 다시 바꿔야 합니다. 기존 세션은 모두 끊겼습니다.")
    print("=" * 60)


def cmd_promote(login_id: str, role: str) -> None:
    """화면 없이 역할을 지정한다. 관리자가 0명이 된 상황의 탈출구."""
    role = (role or "").strip().lower()
    if role not in perm.ROLES:
        raise SystemExit("역할은 admin · writer · viewer 중에서 지정하세요.")
    user = _find(login_id)
    c = auth_store._conn()
    try:
        c.execute("UPDATE Users SET role=?, status='active', approved_at=? WHERE id=?",
                  (role, auth_store._now(), user["id"]))
        c.commit()
    finally:
        c.close()
    auth_store._kill_sessions(user["id"])
    auth_store.audit(None, "promote_cli", user["id"], "role=%s (콘솔)" % role)
    print("%s 를 %s 로 지정했습니다. 다시 로그인해야 적용됩니다."
          % (user["login_id"], perm.role_label(role)))


def cmd_rename(login_id: str, name: str) -> None:
    """이름을 고친다. 화면에도 같은 길이 있지만(사용자 관리), **화면에 못 들어가는
    상황의 탈출구**로 여기에도 둔다 — 다른 명령들과 같은 이유다.

    이름은 살아 있는 값이라, 고치면 **지난 결재 건의 결재자 이름까지** 함께 바뀐다.
    자료 제목과 얼어붙은 스냅샷 속 글자는 안 바뀐다 — 그건 그때의 기록이다.
    """
    user = _find(login_id)
    try:
        updated = auth_store.set_name(None, user["id"], name)
    except auth_store.AuthError as e:
        raise SystemExit(str(e))
    print("%s 의 이름을 %r → %r 로 바꿨습니다. 다시 로그인할 필요는 없습니다."
          % (user["login_id"], user.get("name") or "", updated.get("name") or ""))


def cmd_unlock(login_id: str) -> None:
    """로그인 시도 제한 해제. 임원이 비밀번호를 여러 번 틀려 잠긴 경우의 탈출구."""
    user = _find(login_id)
    n = auth_store.recent_login_fails(user["login_id"])
    c = auth_store._conn()
    try:
        c.execute("UPDATE AuditLogs SET action='login_fail_cleared' "
                  "WHERE action='login_fail' AND target=?", (user["login_id"],))
        c.commit()
    finally:
        c.close()
    auth_store.audit(None, "unlock_cli", user["id"], "최근 실패 %d회 해제" % n)
    print("%s 의 로그인 잠금을 해제했습니다 (최근 실패 %d회)." % (user["login_id"], n))


def main() -> None:
    ap = argparse.ArgumentParser(description="EVER-SKETCH 관리자 콘솔 도구")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="사용자 목록")

    p = sub.add_parser("reset-pw", help="비밀번호 재발급")
    p.add_argument("--login", default="admin", help="대상 아이디 (기본: admin)")
    p.add_argument("--password", default=None, help="직접 지정 (생략하면 무작위 발급)")

    p = sub.add_parser("rename", help="이름 바꾸기")
    p.add_argument("--login", required=True)
    p.add_argument("--name", required=True)

    p = sub.add_parser("unlock", help="로그인 시도 제한 해제")
    p.add_argument("--login", required=True)

    p = sub.add_parser("promote", help="역할 지정")
    p.add_argument("--login", required=True)
    p.add_argument("--role", required=True, choices=list(perm.ROLES))

    args = ap.parse_args()
    if args.cmd == "list":
        cmd_list()
    elif args.cmd == "reset-pw":
        cmd_reset_pw(args.login, args.password)
    elif args.cmd == "rename":
        cmd_rename(args.login, args.name)
    elif args.cmd == "unlock":
        cmd_unlock(args.login)
    elif args.cmd == "promote":
        cmd_promote(args.login, args.role)


if __name__ == "__main__":
    main()
