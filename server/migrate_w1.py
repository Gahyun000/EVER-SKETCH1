"""W1 데이터 이관 — 기존 ebook_html 데이터에 소유자를 붙인다.

기존 Projects 에는 owner_id 가 없다. 소유자가 없는 프로젝트는 L2에게 보이지 않으므로
(권한 판정이 owner_id 를 못 찾으면 거부한다) 이관 전에는 관리자만 볼 수 있는 상태다.

절차
  1. DB 파일 통째 백업          ← 이걸 먼저 한다. 롤백 경로가 없으면 시작하지 않는다.
  2. 시드 관리자 계정 확보
  3. owner_id 가 비어 있는 Projects 를 전부 시드 관리자 소유로
  4. Notes 의 시간 단위 점검(초 → ms). Comments 이관은 W3에서

**멱등하다.** 두 번 돌려도 결과가 같다 — owner_id IS NULL 인 행만 건드린다.

사용법:
    python3 -m server.migrate_w1              # 실제 이관
    python3 -m server.migrate_w1 --dry-run    # 무엇이 바뀌는지만 출력
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import time
from pathlib import Path

from server import auth as auth_store


def backup_db(db_path: str) -> str:
    src = Path(db_path)
    if not src.exists():
        return ""
    stamp = time.strftime("%Y%m%d_%H%M%S")
    dst = src.with_name("%s.backup_%s" % (src.name, stamp))
    shutil.copy2(src, dst)
    # WAL 파일이 따로 있으면 함께 복사(체크포인트 전 데이터가 거기 있을 수 있다).
    for suffix in ("-wal", "-shm"):
        side = Path(str(src) + suffix)
        if side.exists():
            shutil.copy2(side, str(dst) + suffix)
    return str(dst)


def run(dry_run: bool = False) -> dict:
    db_path = auth_store._db_path()
    report: dict = {"db": db_path, "dry_run": dry_run}

    if not dry_run:
        report["backup"] = backup_db(db_path)

    # 스키마 보장 — _conn() 이 테이블·컬럼을 만든다.
    from server import projects as projects_store
    c = projects_store._conn()
    c.close()

    admin_pw = auth_store.ensure_seed_admin() if not dry_run else None
    report["seed_admin_password"] = admin_pw          # 새로 만들었을 때만 값이 있다

    admins = [u for u in auth_store.list_users() if u["login_id"] == "admin"]
    if not admins:
        report["error"] = "시드 관리자가 없습니다. --dry-run 없이 다시 실행하세요."
        return report
    admin_id = admins[0]["id"]
    report["admin_id"] = admin_id

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT id,name FROM Projects WHERE owner_id IS NULL OR owner_id=''"
        ).fetchall()
        report["orphans"] = [{"id": r[0], "name": r[1]} for r in rows]
        report["orphan_count"] = len(rows)

        if not dry_run and rows:
            conn.execute(
                "UPDATE Projects SET owner_id=? WHERE owner_id IS NULL OR owner_id=''",
                (admin_id,),
            )
            conn.commit()
            auth_store.audit(admin_id, "migrate_owner", "",
                             "%d개 프로젝트를 관리자 소유로 이관" % len(rows))

        # Notes 시간 단위 점검. 기존 Notes 는 초 단위(time.time()), 신규 테이블은 ms.
        # 지금 값을 바꾸지는 않는다 — W3에서 Comments 로 이관할 때 ×1000 한다.
        try:
            r = conn.execute("SELECT COUNT(*), MAX(updated_at) FROM Notes").fetchone()
            report["notes_count"] = r[0]
            # 2001년 이후 ms 타임스탬프는 1e12 를 넘는다. 그보다 작으면 초 단위.
            report["notes_unit"] = "seconds" if (r[1] or 0) < 1e12 else "milliseconds"
        except sqlite3.OperationalError:
            report["notes_count"] = 0
            report["notes_unit"] = "n/a"
    finally:
        conn.close()

    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="EVER-SKETCH W1 데이터 이관")
    ap.add_argument("--dry-run", action="store_true", help="바뀔 내용만 출력하고 실제로 쓰지 않음")
    args = ap.parse_args()

    rep = run(dry_run=args.dry_run)
    print("=" * 64)
    print("  EVER-SKETCH W1 이관 %s" % ("(모의 실행)" if args.dry_run else ""))
    print("=" * 64)
    print("  DB           : %s" % rep["db"])
    if rep.get("backup"):
        print("  백업         : %s" % rep["backup"])
    if rep.get("error"):
        print("  오류         : %s" % rep["error"])
        return
    print("  관리자       : %s" % rep.get("admin_id"))
    if rep.get("seed_admin_password"):
        print("  초기 비밀번호: %s   ← 최초 로그인 시 반드시 변경" % rep["seed_admin_password"])
    print("  소유자 없던 프로젝트: %d건" % rep.get("orphan_count", 0))
    for p in rep.get("orphans", [])[:20]:
        print("      - %s  %s" % (p["id"], p["name"]))
    if rep.get("orphan_count", 0) > 20:
        print("      ... 외 %d건" % (rep["orphan_count"] - 20))
    print("  메모         : %d건 (시간 단위: %s)" % (rep.get("notes_count", 0),
                                                  rep.get("notes_unit", "?")))
    print("-" * 64)
    if args.dry_run:
        print("  모의 실행이었습니다. 실제 이관: python3 -m server.migrate_w1")
    else:
        print("  완료. 관리자 화면에서 실제 소유자에게 재배정하세요.")
    print("=" * 64)


if __name__ == "__main__":
    main()
