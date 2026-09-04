"""팀 저장소 — `Teams` / `TeamMembers`.

팀은 **가시성의 단위**다(계획서 D1). P6 에서 "같은 팀 승인본만 보인다"를 판정하려면
그 팀이 먼저 존재해야 한다. 그래서 P3 이 P6 보다 앞에 있다.

── 왜 `Users.team_id` 단일 컬럼이 아닌가 ──────────────────
사람은 팀을 옮긴다(D9). 단일 컬럼이면 옮기는 순간 과거 소속이 덮어써져 사라지고,
"A팀 시절에 승인받은 자료는 A팀에 남는다"(D18)를 판정할 근거가 없어진다.
연결 테이블이면 소속을 빼도 `Approvals.team_id` 가 승인 당시 팀을 그대로 들고 있다.

── 스키마는 다중 소속, 운영은 한 시점 한 팀 ─────────────────
PK 가 `(team_id, user_id)` 라 한 사람이 여러 팀에 들어갈 수 있다. 그래도
`add_member()` 는 **기본으로 옮긴다**(이전 팀에서 뺀다). 「현재 팀 / 이전 팀」(D19)이
성립하려면 현재 팀이 하나여야 하기 때문이다. 나중에 다중 소속이 필요해지면
`exclusive=False` 로 열면 되고, 그때 스키마를 고칠 일은 없다.

이 모듈은 `auth` 를 import 하지 않는다 — `auth.actor_of()` 가 여기를 부르기 때문이다.
사용자 존재 검사처럼 두 쪽을 다 아는 판단은 라우터(`routes_teams.py`)가 한다.
"""
from __future__ import annotations

import os
import pathlib
import sqlite3
import time
import uuid
from typing import Optional

_HERE = pathlib.Path(__file__).resolve().parent


class TeamError(Exception):
    pass


def _db_path() -> str:
    # auth._db_path() 와 같은 규칙. 한쪽만 바뀌면 서로 다른 파일을 보게 되므로
    # 규칙을 바꿀 때는 반드시 두 곳을 같이 고친다.
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


def _now() -> float:
    return time.time() * 1000


def _new_id() -> str:
    return "t" + uuid.uuid4().hex[:12]


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Teams("
        "id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, "
        "created_by TEXT, created_at REAL NOT NULL, updated_at REAL)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS TeamMembers("
        "team_id TEXT NOT NULL, user_id TEXT NOT NULL, "
        "added_by TEXT, added_at REAL NOT NULL, "
        "PRIMARY KEY(team_id, user_id))"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_tm_user ON TeamMembers(user_id)")
    c.commit()
    return c


def _row(r) -> dict:
    return {"id": r[0], "name": r[1], "created_by": r[2],
            "created_at": r[3], "updated_at": r[4]}


_COLS = "id,name,created_by,created_at,updated_at"


# ── 팀 ───────────────────────────────────────────
def create_team(name: Optional[str], created_by: str) -> dict:
    name = (name or "").strip()
    if not name:
        raise TeamError("팀 이름을 입력해 주세요.")
    tid = _new_id()
    now = _now()
    c = _conn()
    try:
        try:
            c.execute(
                "INSERT INTO Teams(id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?)",
                (tid, name, created_by, now, now))
        except sqlite3.IntegrityError:
            # 이름이 겹치면 L1 이 화면에서 어느 팀인지 구분할 수 없고,
            # 팀 공유 폴더가 「팀/작성자명/」(D22)이라 경로까지 겹친다.
            raise TeamError("이미 있는 팀 이름입니다: %s" % name)
        c.commit()
    finally:
        c.close()
    return {"id": tid, "name": name, "created_by": created_by,
            "created_at": now, "updated_at": now}


def get_team(tid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute("SELECT %s FROM Teams WHERE id=?" % _COLS, (tid,)).fetchone()
    finally:
        c.close()
    return _row(r) if r else None


def list_teams() -> list[dict]:
    """이름순. 만든 순서로 두면 팀이 늘어날수록 화면에서 찾기 어려워진다."""
    c = _conn()
    try:
        rows = c.execute("SELECT %s FROM Teams ORDER BY name" % _COLS).fetchall()
    finally:
        c.close()
    return [_row(r) for r in rows]


def rename_team(tid: str, name: Optional[str]) -> dict:
    name = (name or "").strip()
    if not name:
        raise TeamError("팀 이름을 입력해 주세요.")
    c = _conn()
    try:
        if not c.execute("SELECT 1 FROM Teams WHERE id=?", (tid,)).fetchone():
            raise TeamError("팀을 찾을 수 없습니다.")
        try:
            c.execute("UPDATE Teams SET name=?, updated_at=? WHERE id=?", (name, _now(), tid))
        except sqlite3.IntegrityError:
            raise TeamError("이미 있는 팀 이름입니다: %s" % name)
        c.commit()
    finally:
        c.close()
    return get_team(tid)


def delete_team(tid: str) -> None:
    """**팀원이 있으면 지우지 않는다.**

    지우는 순간 그 팀에 붙은 자료(P6 팀 공유)가 갈 곳을 잃는다. 사람을 먼저 빼게 만들면
    L1 이 "이 팀에 아직 누가 있다"를 반드시 한 번 보게 된다.
    """
    c = _conn()
    try:
        if not c.execute("SELECT 1 FROM Teams WHERE id=?", (tid,)).fetchone():
            raise TeamError("팀을 찾을 수 없습니다.")
        n = c.execute("SELECT COUNT(*) FROM TeamMembers WHERE team_id=?", (tid,)).fetchone()[0]
        if n:
            raise TeamError("팀원 %d명이 남아 있습니다. 먼저 팀원을 옮겨 주세요." % n)
        c.execute("DELETE FROM Teams WHERE id=?", (tid,))
        c.commit()
    finally:
        c.close()


# ── 팀원 ─────────────────────────────────────────
def add_member(team_id: str, user_id: str, added_by: str,
               exclusive: bool = True) -> list[str]:
    """팀에 넣는다. 돌려주는 것은 **이 사람이 빠져나온 이전 팀 id 목록**이다.

    조용히 옮기면 L1 은 자기가 무엇을 했는지 모른다. 화면이 「A팀에서 B팀으로
    옮겼습니다」라고 말할 수 있도록 옮긴 흔적을 반환값으로 넘긴다.
    """
    c = _conn()
    try:
        if not c.execute("SELECT 1 FROM Teams WHERE id=?", (team_id,)).fetchone():
            raise TeamError("팀을 찾을 수 없습니다.")
        moved: list[str] = []
        if exclusive:
            moved = [r[0] for r in c.execute(
                "SELECT team_id FROM TeamMembers WHERE user_id=? AND team_id<>?",
                (user_id, team_id)).fetchall()]
            if moved:
                c.execute("DELETE FROM TeamMembers WHERE user_id=? AND team_id<>?",
                          (user_id, team_id))
        c.execute(
            "INSERT OR IGNORE INTO TeamMembers(team_id,user_id,added_by,added_at) "
            "VALUES(?,?,?,?)", (team_id, user_id, added_by, _now()))
        c.commit()
    finally:
        c.close()
    return moved


def remove_member(team_id: str, user_id: str) -> None:
    c = _conn()
    try:
        c.execute("DELETE FROM TeamMembers WHERE team_id=? AND user_id=?", (team_id, user_id))
        c.commit()
    finally:
        c.close()


def list_members(team_id: str) -> list[str]:
    """사용자 id 만 돌려준다. 이름·부서를 붙이는 것은 라우터의 일이다 —
    여기서 Users 를 join 하면 이 모듈이 auth 를 알게 되고 import 순환이 생긴다."""
    c = _conn()
    try:
        rows = c.execute(
            "SELECT user_id FROM TeamMembers WHERE team_id=? ORDER BY added_at",
            (team_id,)).fetchall()
    finally:
        c.close()
    return [r[0] for r in rows]


def team_ids_of(user_id: str) -> tuple[str, ...]:
    """`Actor.team_ids` 의 원천. 매 요청 여기서 읽으므로 팀이 바뀌어도 세션을 끊을 필요가 없다."""
    if not user_id:
        return ()
    c = _conn()
    try:
        rows = c.execute(
            "SELECT team_id FROM TeamMembers WHERE user_id=? ORDER BY added_at",
            (user_id,)).fetchall()
    finally:
        c.close()
    return tuple(r[0] for r in rows)
