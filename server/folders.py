"""개인 폴더 — `Folders(owner_id)`.

`ebook_html1/server/projects.py` 의 폴더 기능을 옮겨 오되 **세 군데를 바꿨다.**

── ① `owner_id` 신설 : 사설 트리 ──────────────────────────
원본에는 소유자가 없었다(혼자 쓰는 도구였다). 여기서는 남의 폴더가
**목록에도 없고, id 를 알아도 못 만지고, 이름조차 새지 않는다.**
폴더 이름은 사적 메모에 가깝다 — 「2026 재무 구조조정」 같은 이름이 목록에 뜨면
그 이름 자체가 정보다.
**관리자도 예외가 아니다.** 관리자는 남의 *자료*를 본다(결재해야 하므로).
그러나 *서랍*은 다르다 — 폴더는 정리 도구일 뿐이고(D20), 남의 정리를 대신할 이유가 없다.
판정은 `permissions.FOLDER_MANAGE` 가 하고, 그 규칙은 관리자 전면 허용보다 **먼저** 걸린다.

── ② 깊이 3 제한 (D24) ────────────────────────────────
원본에는 제한이 없었다. 깊이가 자라면 경로 표시가 접히기 시작하고(D26),
「어디에 넣었더라」가 매번 생긴다. **만들 때만 막으면 안 된다** — 두 단짜리 가지를
3단 자리로 **옮기면** 바닥이 5단이 된다. `move_folder` 가 가지의 키를 함께 본다.

── ③ 빈 폴더만 삭제 (D20) ─────────────────────────────
**원본 `delete_folder` 는 하위 폴더와 그 안의 자료를 통째로 지운다.**
그대로 옮겼으면 폴더 하나 정리하다 결재 이력이 붙은 자료까지 사라진다.
여기서는 비어 있지 않으면 거부하고, 무엇이 남았는지 문구로 말한다.

이 모듈은 `projects` 를 import 하지 않는다 — 같은 DB 라 `Projects` 를 SQL 로 직접 센다.
"""
from __future__ import annotations

import os
import pathlib
import sqlite3
import time
import uuid
from typing import Optional

_HERE = pathlib.Path(__file__).resolve().parent

# 계획서 D24. 화면(경로 접기 D26)과 짝이므로 한쪽만 바꾸면 안 된다.
MAX_DEPTH = 3


class FolderError(Exception):
    pass


def _db_path() -> str:
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


def _now() -> float:
    return time.time() * 1000


def _new_id() -> str:
    return "f" + uuid.uuid4().hex[:12]


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Folders("
        "id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, "
        "owner_id TEXT NOT NULL, created_at REAL NOT NULL, updated_at REAL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_folders_parent ON Folders(parent_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_folders_owner ON Folders(owner_id)")
    c.commit()
    return c


_COLS = "id,name,parent_id,owner_id,created_at,updated_at"


def _row(r) -> dict:
    return {"id": r[0], "name": r[1], "parent_id": r[2], "owner_id": r[3],
            "created_at": r[4], "updated_at": r[5]}


def get_folder(fid: Optional[str]) -> Optional[dict]:
    if not fid:
        return None
    c = _conn()
    try:
        r = c.execute("SELECT %s FROM Folders WHERE id=?" % _COLS, (fid,)).fetchone()
    finally:
        c.close()
    return _row(r) if r else None


def folder_path(fid: Optional[str]) -> list[dict]:
    """루트→해당 폴더까지의 경로. 루트 자신은 포함하지 않는다.

    `seen` 으로 고리를 끊는다 — 이동 가드가 뚫리더라도 여기서 무한히 돌지는 않는다.
    """
    path: list[dict] = []
    seen: set[str] = set()
    cur = fid
    while cur and cur not in seen:
        seen.add(cur)
        f = get_folder(cur)
        if not f:
            break
        path.append({"id": f["id"], "name": f["name"]})
        cur = f["parent_id"]
    path.reverse()
    return path


def depth_of(fid: Optional[str]) -> int:
    """최상위가 1. 폴더가 없으면 0(= 최상위에 만들면 1단이 된다)."""
    return len(folder_path(fid))


def _height(fid: str) -> int:
    """이 폴더를 뿌리로 본 가지의 키. 자기만 있으면 1."""
    c = _conn()
    try:
        depth, level = 1, [fid]
        while level:
            nxt: list[str] = []
            for f in level:
                nxt += [r[0] for r in c.execute(
                    "SELECT id FROM Folders WHERE parent_id=?", (f,)).fetchall()]
            if nxt:
                depth += 1
            level = nxt
        return depth
    finally:
        c.close()


def _name_taken(c: sqlite3.Connection, owner_id: str, parent_id: Optional[str],
                name: str, except_id: str = "") -> bool:
    """같은 사람의 같은 부모 아래에서만 겹침을 본다.
    남이 같은 이름을 쓰는 것은 상관없다 — 사설 트리다."""
    if parent_id:
        rows = c.execute(
            "SELECT id FROM Folders WHERE owner_id=? AND parent_id=? AND name=?",
            (owner_id, parent_id, name)).fetchall()
    else:
        rows = c.execute(
            "SELECT id FROM Folders WHERE owner_id=? AND (parent_id IS NULL OR parent_id='') "
            "AND name=?", (owner_id, name)).fetchall()
    return any(r[0] != except_id for r in rows)


def _clean_name(name: Optional[str]) -> str:
    nm = (name or "").strip()
    if not nm:
        # 원본은 빈 이름을 「새 폴더」로 바꿔 줬다. 그러면 「새 폴더」가 여러 개 쌓이고,
        # 이름으로 못 찾는 폴더는 정리 도구가 아니다.
        raise FolderError("폴더 이름을 입력해 주세요.")
    if len(nm) > 40:
        raise FolderError("폴더 이름은 40자 이하여야 합니다.")
    return nm


def create_folder(name: Optional[str], owner_id: str, parent_id: Optional[str] = None) -> dict:
    nm = _clean_name(name)
    pid = parent_id or None
    if pid:
        parent = get_folder(pid)
        if not parent:
            raise FolderError("상위 폴더를 찾을 수 없습니다.")
        if depth_of(pid) >= MAX_DEPTH:
            raise FolderError("폴더는 %d단까지만 만들 수 있습니다." % MAX_DEPTH)
    fid, ts = _new_id(), _now()
    c = _conn()
    try:
        if _name_taken(c, owner_id, pid, nm):
            raise FolderError("같은 위치에 이미 「%s」 폴더가 있습니다." % nm)
        c.execute(
            "INSERT INTO Folders(id,name,parent_id,owner_id,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?)", (fid, nm, pid, owner_id, ts, ts))
        c.commit()
    finally:
        c.close()
    return {"id": fid, "name": nm, "parent_id": pid, "owner_id": owner_id,
            "created_at": ts, "updated_at": ts, "folder_count": 0, "project_count": 0}


def list_folders(owner_id: str, parent_id: Optional[str] = None) -> list[dict]:
    """**한 단만** 보여준다. 안에 든 개수를 함께 실어 주므로,
    들어가 보지 않고도 빈 폴더인지 알 수 있다(지울지 말지 판단하는 데 쓴다)."""
    c = _conn()
    try:
        if parent_id:
            rows = c.execute(
                "SELECT %s FROM Folders WHERE owner_id=? AND parent_id=? ORDER BY name" % _COLS,
                (owner_id, parent_id)).fetchall()
        else:
            rows = c.execute(
                "SELECT %s FROM Folders WHERE owner_id=? AND (parent_id IS NULL OR parent_id='') "
                "ORDER BY name" % _COLS, (owner_id,)).fetchall()
        out = []
        for r in rows:
            f = _row(r)
            f["folder_count"] = c.execute(
                "SELECT COUNT(*) FROM Folders WHERE parent_id=?", (f["id"],)).fetchone()[0]
            f["project_count"] = _count_projects(c, f["id"])
            out.append(f)
        return out
    finally:
        c.close()


def _count_projects(c: sqlite3.Connection, fid: str) -> int:
    """`Projects` 는 다른 모듈 것이지만 같은 DB 다. import 하면 순환이 되므로 SQL 로 센다.
    아직 `folder_id` 컬럼이 없는 DB 에서도 0 을 돌려준다."""
    try:
        return c.execute("SELECT COUNT(*) FROM Projects WHERE folder_id=?", (fid,)).fetchone()[0]
    except sqlite3.OperationalError:
        return 0


def rename_folder(fid: str, name: Optional[str]) -> dict:
    nm = _clean_name(name)
    f = get_folder(fid)
    if not f:
        raise FolderError("폴더를 찾을 수 없습니다.")
    c = _conn()
    try:
        if _name_taken(c, f["owner_id"], f["parent_id"], nm, except_id=fid):
            raise FolderError("같은 위치에 이미 「%s」 폴더가 있습니다." % nm)
        c.execute("UPDATE Folders SET name=?, updated_at=? WHERE id=?", (nm, _now(), fid))
        c.commit()
    finally:
        c.close()
    return get_folder(fid)


def move_folder(fid: str, parent_id: Optional[str]) -> dict:
    f = get_folder(fid)
    if not f:
        raise FolderError("폴더를 찾을 수 없습니다.")
    pid = parent_id or None
    if pid == fid:
        raise FolderError("자기 자신 안으로는 옮길 수 없습니다.")
    if pid:
        parent = get_folder(pid)
        if not parent:
            raise FolderError("옮길 위치를 찾을 수 없습니다.")
        if fid in [p["id"] for p in folder_path(pid)]:
            # 허용하면 트리가 고리가 되고, 그 순간 경로를 그리는 코드가 갇힌다.
            raise FolderError("자기 하위 폴더 안으로는 옮길 수 없습니다.")
        # **옮기는 가지의 키까지 본다.** 만들 때만 막으면 이 길로 새어 나간다.
        if depth_of(pid) + _height(fid) > MAX_DEPTH:
            raise FolderError("옮기면 폴더가 %d단을 넘습니다." % MAX_DEPTH)
    c = _conn()
    try:
        if _name_taken(c, f["owner_id"], pid, f["name"], except_id=fid):
            raise FolderError("옮길 위치에 이미 「%s」 폴더가 있습니다." % f["name"])
        c.execute("UPDATE Folders SET parent_id=?, updated_at=? WHERE id=?", (pid, _now(), fid))
        c.commit()
    finally:
        c.close()
    return get_folder(fid)


def delete_folder(fid: str) -> None:
    """**빈 폴더만 지운다**(D20).

    원본은 하위 폴더와 그 안의 자료를 통째로 지웠다. 여기서는 거부하고
    **무엇이 남았는지** 말한다 — 「못 지웁니다」만 하면 사람은 왜인지 모른 채 헤맨다.
    """
    if not get_folder(fid):
        raise FolderError("폴더를 찾을 수 없습니다.")
    c = _conn()
    try:
        subs = c.execute("SELECT COUNT(*) FROM Folders WHERE parent_id=?", (fid,)).fetchone()[0]
        docs = _count_projects(c, fid)
        if subs or docs:
            what = []
            if subs:
                what.append("하위 폴더 %d개" % subs)
            if docs:
                what.append("자료 %d건" % docs)
            # 「1개이(가)」 같은 조사 땜질을 하지 않는다 — 괄호로 빼면 조사가 필요 없다.
            raise FolderError(
                "폴더가 비어 있지 않습니다 (%s). 먼저 옮기거나 지워 주세요." % " · ".join(what))
        c.execute("DELETE FROM Folders WHERE id=?", (fid,))
        c.commit()
    finally:
        c.close()
