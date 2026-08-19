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
    python3 -m server.admin_cli promote --login 사번 --level 3
    python3 -m server.admin_cli unlock --login 사번        # 로그인 잠금 해제
"""
from __future__ import annotations

import argparse
import secrets

from server import auth as auth_store


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
    print("%-16s %-14s %-6s %-10s %s" % ("아이디", "이름", "레벨", "상태", "비고"))
    print("-" * 70)
    for u in users:
        note = []
        if u["must_change_pw"]:
            note.append("비밀번호 변경 필요")
        if u["status"] == "pending":
            note.append("희망 L%d" % u["requested_level"])
        print("%-16s %-14s %-6s %-10s %s" % (
            u["login_id"], u["name"], "L%d" % u["level"] if u["level"] else "-",
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


def cmd_promote(login_id: str, level: int) -> None:
    """화면 없이 레벨을 올린다. 관리자가 0명이 된 상황의 탈출구."""
    if level not in (1, 2, 3):
        raise SystemExit("레벨은 1~3 중에서 지정하세요.")
    user = _find(login_id)
    c = auth_store._conn()
    try:
        c.execute("UPDATE Users SET level=?, status='active', approved_at=? WHERE id=?",
                  (level, auth_store._now(), user["id"]))
        c.commit()
    finally:
        c.close()
    auth_store._kill_sessions(user["id"])
    auth_store.audit(None, "promote_cli", user["id"], "level=%d (콘솔)" % level)
    print("%s 를 L%d 로 지정했습니다. 다시 로그인해야 적용됩니다." % (user["login_id"], level))


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

    p = sub.add_parser("unlock", help="로그인 시도 제한 해제")
    p.add_argument("--login", required=True)

    p = sub.add_parser("promote", help="레벨 지정")
    p.add_argument("--login", required=True)
    p.add_argument("--level", type=int, required=True)

    args = ap.parse_args()
    if args.cmd == "list":
        cmd_list()
    elif args.cmd == "reset-pw":
        cmd_reset_pw(args.login, args.password)
    elif args.cmd == "unlock":
        cmd_unlock(args.login)
    elif args.cmd == "promote":
        cmd_promote(args.login, args.level)


if __name__ == "__main__":
    main()
