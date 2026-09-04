"""프로젝트(이북) 영구 저장 — SQLite 백엔드.

'내 이북' 목록의 진실 소스. 편집용 작업본(state=DraftStateSnapshot JSON)을
프로젝트마다 개별 저장한다. 재시작 후에도 남는다.
- Projects        : 편집 프로젝트(작업본)
- ProjectVersions : 프로젝트별 버전 기록(자동/이름/고정)

발행(FOLIO 라이브러리)은 /api/build 가 굽고, 그 결과 이북 id를
published_id 로 되받아 저장한다. ts/updated_at 은 JS Date 와 맞추려 '밀리초'로 둔다.
"""
from __future__ import annotations

import json
import os
import pathlib
import sqlite3
import time
import uuid
from typing import Optional

_HERE = pathlib.Path(__file__).resolve().parent

# 버전 보존 정책(클라 versionStorage 와 동일 개념: 최근은 촘촘, 오래될수록 성글게)
_RECENT_KEEP = 20
_MAX_KEEP = 80


def _db_path() -> str:
    # 신규 변수 우선, 기존 EBOOK_HTML_DB 는 폴백으로 유지(이관 전 호환)
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


# W1 확장 컬럼 — 기존 DB에도 안전하게 덧붙인다(있으면 무시).
_EXTRA_COLS = (
    ("owner_id", "TEXT"),
    # P4 — 개인 폴더 위치. NULL = 최상위.
    # **폴더는 권한과 무관하다**(D20). 가시성은 owner_id 가 정하고 folder_id 는
    # 「어디에 넣어 뒀나」만 말한다 — 목록 조회에서 둘은 AND 로 결합한다.
    ("folder_id", "TEXT"),
)


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Projects("
        "id TEXT PRIMARY KEY, name TEXT, created_at REAL, updated_at REAL, "
        "published_id TEXT, page_count INTEGER, state TEXT)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS ProjectVersions("
        "id TEXT PRIMARY KEY, project_id TEXT, ts REAL, label TEXT, "
        "pinned INTEGER, auto INTEGER, page_count INTEGER, hash TEXT, state TEXT)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_pv_project ON ProjectVersions(project_id)")
    # ALTER TABLE ADD COLUMN 은 SQLite 에 IF NOT EXISTS 가 없다. 현재 컬럼을 보고 없는 것만 추가.
    have = {r[1] for r in c.execute("PRAGMA table_info(Projects)").fetchall()}
    for col, decl in _EXTRA_COLS:
        if col not in have:
            c.execute("ALTER TABLE Projects ADD COLUMN %s %s" % (col, decl))
    c.execute("CREATE INDEX IF NOT EXISTS idx_projects_owner ON Projects(owner_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_projects_folder ON Projects(folder_id)")
    c.commit()
    return c


def _now() -> int:
    return int(time.time() * 1000)  # ms (JS Date 호환)


def _page_count(state) -> int:
    try:
        return len(state.get("pages") or [])
    except Exception:
        return 0


def _new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:12]


def _title_of(state, fallback: str = "제목 없음") -> str:
    if isinstance(state, dict):
        t = (state.get("title") or "").strip()
        if t:
            return t
    return fallback


# ─────────────────────── 프로젝트 ───────────────────────
_LIST_COLS = "id,name,created_at,updated_at,published_id,page_count,owner_id,folder_id"


def _row_to_meta(r) -> dict:
    # 인덱스는 _LIST_COLS 순서에 묶여 있다. 한쪽만 고치면 값이 통째로 밀린다.
    return {"id": r[0], "name": r[1] or "제목 없음", "created_at": r[2],
            "updated_at": r[3], "published_id": r[4], "page_count": r[5] or 0,
            "owner_id": r[6], "folder_id": r[7] or None}


def list_projects(visibility: str = "all", user_id: Optional[str] = None,
                  folder_id: Optional[str] = None, all_folders: bool = True) -> list[dict]:
    """visibility 는 permissions.visible_project_filter() 가 정한다.

    목록 필터를 여기서 새로 판단하지 않는다 — 개별 판정(decide)과 어긋나면
    '목록엔 보이는데 열면 403'이 난다.

    **폴더는 가시성과 별개다**(D20). `visibility` 가 「누가 볼 수 있나」를 정하고
    `folder_id` 는 「어느 서랍에 있나」를 정한다 — 둘을 **AND 로 묶는다.**
    폴더로 권한이 갈리면 「이 폴더에 넣으면 누가 보지」를 매번 생각해야 한다.

      all_folders=True  (기본) 서랍을 가리지 않는다 — 예전 호출부가 그대로 돈다
      all_folders=False, folder_id=None  최상위에 놓인 것만
      folder_id='f...'  그 폴더 안에 놓인 것만
    """
    if visibility == "none":
        return []
    where, args = [], []
    if visibility == "all":
        pass
    elif visibility in ("own", "own_or_published"):
        # 'own' — 본인 것만. decide() 의 READ 규칙과 짝이 맞아야 한다.
        # 회차가 사라지면서 '같은 회차 동료' 분기도 함께 없앴다.
        # **괄호가 중요하다** — folder 조건과 OR 이 섞이면 남의 발행본이 새어 나온다.
        if visibility == "own_or_published":
            where.append("(owner_id=? OR published_id IS NOT NULL)")
        else:
            where.append("owner_id=?")
        args.append(user_id)
    elif visibility == "published":
        where.append("published_id IS NOT NULL")
    else:
        return []

    if not all_folders:
        if folder_id:
            where.append("folder_id=?")
            args.append(folder_id)
        else:
            where.append("(folder_id IS NULL OR folder_id='')")

    sql = "SELECT %s FROM Projects" % _LIST_COLS
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY updated_at DESC"
    c = _conn()
    try:
        rows = c.execute(sql, tuple(args)).fetchall()
    finally:
        c.close()
    return [_row_to_meta(r) for r in rows]


def get_project_meta(pid: str) -> Optional[dict]:
    """권한 판정용 — state(본문)를 읽지 않는다. 큰 JSON을 매 판정마다 파싱하지 않기 위함."""
    c = _conn()
    try:
        r = c.execute("SELECT %s FROM Projects WHERE id=?" % _LIST_COLS, (pid,)).fetchone()
    finally:
        c.close()
    return _row_to_meta(r) if r else None


def project_scope(pid: str) -> Optional[dict]:
    """권한 판정에 필요한 것만 꺼낸다 — 소유자와 발행 여부."""
    c = _conn()
    try:
        r = c.execute("SELECT owner_id, published_id FROM Projects WHERE id=?", (pid,)).fetchone()
    finally:
        c.close()
    if not r:
        return None
    return {"owner_id": r[0], "published": bool(r[1])}


def create_project(name: Optional[str] = None, state: Optional[dict] = None,
                   owner_id: Optional[str] = None, folder_id: Optional[str] = None) -> dict:
    pid = _new_id("p")
    ts = _now()
    st = state or {}
    nm = (name or "").strip() or _title_of(st)
    c = _conn()
    try:
        body = json.dumps(st, ensure_ascii=False)
        c.execute(
            "INSERT INTO Projects(id,name,created_at,updated_at,published_id,page_count,state,"
            "owner_id,folder_id) VALUES(?,?,?,?,?,?,?,?,?)",
            (pid, nm, ts, ts, None, _page_count(st), body, owner_id, folder_id or None),
        )
        c.commit()
    finally:
        c.close()
    return {"id": pid, "name": nm, "created_at": ts, "updated_at": ts,
            "published_id": None, "page_count": _page_count(st), "state": st,
            "owner_id": owner_id, "folder_id": folder_id or None}


def get_project(pid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute(
            "SELECT id,name,created_at,updated_at,published_id,state,owner_id "
            "FROM Projects WHERE id=?",
            (pid,),
        ).fetchone()
    finally:
        c.close()
    if not r:
        return None
    return {"id": r[0], "name": r[1] or "제목 없음", "created_at": r[2],
            "updated_at": r[3], "published_id": r[4],
            "state": json.loads(r[5]) if r[5] else {},
            "owner_id": r[6]}


def set_owner(pid: str, owner_id: str) -> dict:
    c = _conn()
    try:
        c.execute("UPDATE Projects SET owner_id=? WHERE id=?", (owner_id, pid))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


def version_belongs_to(vid: str, pid: str) -> bool:
    """버전이 그 프로젝트의 것인지 확인.

    기존 라우터는 /projects/{pid}/versions/{vid} 에서 pid 를 쓰지 않고 vid 로만 조회했다.
    권한을 pid 로만 검사하면 '내 pid + 남의 vid' 조합으로 남의 버전을 읽을 수 있다.
    """
    c = _conn()
    try:
        r = c.execute("SELECT project_id FROM ProjectVersions WHERE id=?", (vid,)).fetchone()
    finally:
        c.close()
    return bool(r and r[0] == pid)


def save_project(pid: str, state: dict, name: Optional[str] = None) -> dict:
    ts = _now()
    c = _conn()
    try:
        row = c.execute("SELECT name FROM Projects WHERE id=?", (pid,)).fetchone()
        if not row:  # 방어적: 없으면 같은 id로 생성
            nm = (name or "").strip() or _title_of(state)
            c.execute(
                "INSERT INTO Projects(id,name,created_at,updated_at,published_id,page_count,state) "
                "VALUES(?,?,?,?,?,?,?)",
                (pid, nm, ts, ts, None, _page_count(state), json.dumps(state, ensure_ascii=False)),
            )
        else:
            nm = name.strip() if isinstance(name, str) and name.strip() else (row[0] or _title_of(state))
            c.execute(
                "UPDATE Projects SET name=?, updated_at=?, page_count=?, state=? WHERE id=?",
                (nm, ts, _page_count(state), json.dumps(state, ensure_ascii=False), pid),
            )
        c.commit()
    finally:
        c.close()
    return {"ok": True, "id": pid, "updated_at": ts, "name": nm}


def rename_project(pid: str, name: str) -> dict:
    nm = (name or "").strip() or "제목 없음"
    c = _conn()
    try:
        row = c.execute("SELECT state FROM Projects WHERE id=?", (pid,)).fetchone()
        state_json = row[0] if row else None
        if state_json:
            try:
                st = json.loads(state_json)
                if isinstance(st, dict):
                    st["title"] = nm
                    state_json = json.dumps(st, ensure_ascii=False)
            except Exception:
                pass
        c.execute("UPDATE Projects SET name=?, updated_at=?, state=? WHERE id=?",
                  (nm, _now(), state_json, pid))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


def delete_project(pid: str) -> dict:
    """이북과 **딸린 것 전부**를 지운다.

    예전에는 Projects/ProjectVersions 만 지웠다. 그러면 Notes 가 죽은
    project_id 를 가리킨 채 남는다 — 자료를 회수했는데 그 자료에 달린 메모는
    DB 에 그대로 있는 상태다. 지웠다고 말한 것이 안 지워진 것은 신뢰의 문제이고,
    회수 사유가 '잘못 배부' 라면 개인정보 문제이기도 하다.
    """
    c = _conn()
    try:
        c.execute("DELETE FROM Projects WHERE id=?", (pid,))
        c.execute("DELETE FROM ProjectVersions WHERE project_id=?", (pid,))
        # Notes·Comments 는 다른 모듈이 만드는 표다. 아직 없을 수 있으므로 존재를 확인한다.
        for tbl in ("Notes", "Comments"):
            have = c.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (tbl,)).fetchone()
            if have:
                c.execute("DELETE FROM %s WHERE project_id=?" % tbl, (pid,))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


def duplicate_project(pid: str, owner_id: Optional[str] = None) -> Optional[dict]:
    """복제본의 소유자는 **복제한 사람**이다.

    원본 소유자를 그대로 물려주면, L3가 임원 자료를 복제했을 때 그 복제본이
    임원 소유가 되어 L3의 '내 것' 목록에서 사라진다.
    """
    src = get_project(pid)
    if not src:
        return None
    return create_project(name=(src["name"] + " 복사본"), state=src["state"],
                          owner_id=owner_id or src.get("owner_id"))


def set_published(pid: str, published_id: str) -> dict:
    c = _conn()
    try:
        c.execute("UPDATE Projects SET published_id=?, updated_at=? WHERE id=?",
                  (published_id, _now(), pid))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


# ─────────────────────── 버전 ───────────────────────
def _hash(state: dict) -> str:
    try:
        s = (json.dumps(state.get("pages"), ensure_ascii=False) + "|"
             + str(state.get("title")) + "|" + str(state.get("theme")) + "|"
             + str(state.get("orientation")))
    except Exception:
        s = json.dumps(state, ensure_ascii=False, sort_keys=True)
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return str(len(s)) + ":" + format(h, "x")


def list_versions(pid: str) -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id,project_id,ts,label,pinned,auto,page_count,hash FROM ProjectVersions "
            "WHERE project_id=? ORDER BY ts DESC",
            (pid,),
        ).fetchall()
    finally:
        c.close()
    return [
        {"id": r[0], "project_id": r[1], "ts": r[2], "label": r[3],
         "pinned": bool(r[4]), "auto": bool(r[5]), "page_count": r[6] or 0, "hash": r[7]}
        for r in rows
    ]


def get_version(vid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute(
            "SELECT id,project_id,ts,label,pinned,auto,page_count,hash,state "
            "FROM ProjectVersions WHERE id=?",
            (vid,),
        ).fetchone()
    finally:
        c.close()
    if not r:
        return None
    return {"id": r[0], "project_id": r[1], "ts": r[2], "label": r[3],
            "pinned": bool(r[4]), "auto": bool(r[5]), "page_count": r[6] or 0,
            "hash": r[7], "state": json.loads(r[8]) if r[8] else {}}


def save_version(pid: str, state: dict, label: Optional[str] = None,
                 pinned: bool = False, auto: bool = True) -> Optional[dict]:
    if not isinstance(state, dict) or not state.get("pages"):
        return None  # 빈 문서는 버전으로 남기지 않음
    h = _hash(state)
    existing = list_versions(pid)
    if auto and existing and existing[0]["hash"] == h:
        return None  # 직전과 동일 → 스킵(자동만)
    vid = _new_id("v")
    ts = _now()
    c = _conn()
    try:
        c.execute(
            "INSERT INTO ProjectVersions(id,project_id,ts,label,pinned,auto,page_count,hash,state) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (vid, pid, ts, (label or None), 1 if pinned else 0, 1 if auto else 0,
             _page_count(state), h, json.dumps(state, ensure_ascii=False)),
        )
        c.commit()
    finally:
        c.close()
    _prune_versions(pid)
    return {"id": vid, "ts": ts, "label": label, "pinned": pinned, "auto": auto,
            "page_count": _page_count(state), "hash": h}


def update_version(vid: str, patch: dict) -> dict:
    v = get_version(vid)
    if not v:
        return {"ok": False}
    label = patch["label"] if "label" in patch else v["label"]
    pinned = bool(patch["pinned"]) if "pinned" in patch else v["pinned"]
    c = _conn()
    try:
        c.execute("UPDATE ProjectVersions SET label=?, pinned=? WHERE id=?",
                  (label, 1 if pinned else 0, vid))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


def delete_version(vid: str) -> dict:
    c = _conn()
    try:
        c.execute("DELETE FROM ProjectVersions WHERE id=?", (vid,))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


def _prune_versions(pid: str) -> None:
    """최근 N개는 그대로, 오래된 것만 시간→일 단위로 성글게. 이름/고정은 영구. 총량 상한."""
    allv = list_versions(pid)  # desc(최신 우선)
    now = _now()
    keep: set = set()
    seen: set = set()
    for i, v in enumerate(allv):
        if v["pinned"] or v["label"]:
            keep.add(v["id"]); continue
        if i < _RECENT_KEEP:
            keep.add(v["id"]); continue
        age = now - v["ts"]
        bucket = ("h" + str(int(v["ts"] // 3600000))) if age < 86400000 else ("d" + str(int(v["ts"] // 86400000)))
        if bucket not in seen:
            seen.add(bucket); keep.add(v["id"])
    kept = [v for v in allv if v["id"] in keep]
    removable = sorted([v for v in kept if not v["pinned"] and not v["label"]], key=lambda x: x["ts"])
    overflow = len(kept) - _MAX_KEEP
    dele: set = set()
    i = 0
    while i < len(removable) and overflow > 0:
        dele.add(removable[i]["id"]); i += 1; overflow -= 1
    to_delete = [v["id"] for v in allv if (v["id"] not in keep) or (v["id"] in dele)]
    if to_delete:
        c = _conn()
        try:
            c.executemany("DELETE FROM ProjectVersions WHERE id=?", [(x,) for x in to_delete])
            c.commit()
        finally:
            c.close()
