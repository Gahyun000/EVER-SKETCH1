"""권한 모델 전환 — 숫자 레벨(level) → 역할명(role).

왜 바꾸는가
  초기 설계는 L1(열람) < L2(작성) < L3(관리) 로, **숫자가 클수록 권한이 큰** 모델이었다.
  사내 표기 관례는 "1등급이 최고"다. 숫자만 뒤집으면 코드 곳곳의
  `if level == 3`(관리자 판정)이 조용히 반대로 동작한다 — 열람자에게 관리자 권한이 열린다.

  그래서 저장·판정은 역할명(admin/writer/viewer)으로 바꾸고,
  숫자는 화면 표시용 등급으로만 남긴다(Lv1 관리자 / Lv2 작성자 / Lv3 열람자).
  다음에 등급 체계를 또 바꾸더라도 DB와 권한 코드는 건드리지 않는다.

변환 규칙 (구 스키마 → 신 스키마)
    level 3  → role 'admin'     (관리자)
    level 2  → role 'writer'    (작성자)
    level 1  → role 'viewer'    (열람자)
    level 0  → role ''          (미부여 — 승인 대기)

**멱등하다.** role 이 이미 채워진 행은 건드리지 않는다.

사용법:
    python3 -m server.migrate_role --dry-run
    python3 -m server.migrate_role
"""
from __future__ import annotations

import argparse
import sqlite3

from server import auth as auth_store
from server import permissions as perm


def backup_db(path: str) -> str:
    """바꾸기 전에 파일을 통째로 복사해 둔다.

    (W1 이관 스크립트에 있던 것을 여기로 옮겼다 — 그 스크립트는 회차 제거와 함께
    사라졌지만, 되돌릴 수 없는 변경 앞에 백업을 두는 규칙은 남는다.)
    """
    import shutil
    import time as _t
    dst = "%s.backup_%s" % (path, _t.strftime("%Y%m%d_%H%M%S"))
    shutil.copy2(path, dst)
    return dst


# 구 숫자 레벨 → 역할명
LEVEL_TO_ROLE = {3: perm.ADMIN, 2: perm.WRITER, 1: perm.VIEWER, 0: ""}


def run(dry_run: bool = False) -> dict:
    db_path = auth_store._db_path()
    report: dict = {"db": db_path, "dry_run": dry_run, "converted": [], "already": 0,
                    "no_legacy_column": False, "dropped": []}

    if not dry_run:
        report["backup"] = backup_db(db_path)

    # 스키마 보장 — role / requested_role 컬럼을 만든다.
    c = auth_store._conn()
    c.close()

    conn = sqlite3.connect(db_path)
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(Users)").fetchall()}
        if "level" not in cols:
            # 새로 만든 DB — 변환할 구 데이터가 없다.
            report["no_legacy_column"] = True
            report["total"] = conn.execute("SELECT COUNT(*) FROM Users").fetchone()[0]
            return report

        rows = conn.execute(
            "SELECT id, login_id, level, requested_level, role FROM Users"
        ).fetchall()
        report["total"] = len(rows)

        for uid, login_id, level, req_level, role in rows:
            if role:
                report["already"] += 1
                continue
            new_role = LEVEL_TO_ROLE.get(int(level or 0), "")
            new_req = LEVEL_TO_ROLE.get(int(req_level or 2), perm.WRITER) or perm.WRITER
            report["converted"].append({
                "login_id": login_id, "level": level, "role": new_role or "(미부여)",
            })
            if not dry_run:
                conn.execute("UPDATE Users SET role=?, requested_role=? WHERE id=?",
                             (new_role, new_req, uid))
        if not dry_run and report["converted"]:
            conn.commit()
            auth_store.audit(None, "migrate_role", "",
                             "%d명 역할 전환" % len(report["converted"]))

        # 값 변환이 끝났으면 구 숫자 컬럼을 없앤다.
        # 남겨두면 requested_level(NOT NULL, 기본값 없음) 때문에 **신규 가입이 통째로 막힌다.**
        if not dry_run:
            report["dropped"] = auth_store.drop_legacy_level_columns(conn)

        # 전환 후 관리자가 0명이면 시스템이 잠긴다. 반드시 확인한다.
        admins = conn.execute(
            "SELECT COUNT(*) FROM Users WHERE role=? AND status='active'", (perm.ADMIN,)
        ).fetchone()[0]
        report["active_admins"] = admins if not dry_run else \
            sum(1 for r in report["converted"] if r["role"] == perm.ADMIN) + \
            conn.execute("SELECT COUNT(*) FROM Users WHERE role=? AND status='active'",
                         (perm.ADMIN,)).fetchone()[0]
    finally:
        conn.close()
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="EVER-SKETCH 권한 모델 전환 (level → role)")
    ap.add_argument("--dry-run", action="store_true", help="바뀔 내용만 출력하고 실제로 쓰지 않음")
    args = ap.parse_args()

    rep = run(dry_run=args.dry_run)
    print("=" * 66)
    print("  권한 모델 전환 %s" % ("(모의 실행)" if args.dry_run else ""))
    print("=" * 66)
    print("  DB   : %s" % rep["db"])
    if rep.get("backup"):
        print("  백업 : %s" % rep["backup"])
    if rep["no_legacy_column"]:
        print("  구 level 컬럼이 없습니다 — 전환할 데이터가 없습니다(신규 DB).")
        print("=" * 66)
        return
    print("  사용자 %d명 · 전환 대상 %d명 · 이미 전환됨 %d명"
          % (rep["total"], len(rep["converted"]), rep["already"]))
    if rep["converted"]:
        print("-" * 66)
        print("  %-18s %-8s → %s" % ("아이디", "구 레벨", "역할"))
        for r in rep["converted"]:
            label = perm.role_label(r["role"]) if r["role"] != "(미부여)" else "(미부여)"
            print("  %-18s L%-7s → %s" % (r["login_id"], r["level"], label))
    print("-" * 66)
    admins = rep.get("active_admins", 0)
    if rep.get("dropped"):
        print("  구 컬럼 제거   : %s" % ", ".join(rep["dropped"]))
    print("  전환 후 활성 관리자: %d명" % admins)
    if admins == 0:
        print("  ⚠ 관리자가 없습니다. 아무도 승인할 수 없게 됩니다.")
        print("    python3 -m server.admin_cli promote --login <아이디> --role admin")
    if args.dry_run:
        print("  모의 실행이었습니다. 실제 전환: python3 -m server.migrate_role")
    else:
        print("  완료. 모든 사용자는 다시 로그인해야 합니다.")
    print("=" * 66)


if __name__ == "__main__":
    main()
