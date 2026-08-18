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
    return os.environ.get("EBOOK_HTML_DB") or str(_HERE / "ebook_html.db")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
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
def list_projects() -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id,name,created_at,updated_at,published_id,page_count "
            "FROM Projects ORDER BY updated_at DESC"
        ).fetchall()
    finally:
        c.close()
    return [
        {"id": r[0], "name": r[1] or "제목 없음", "created_at": r[2],
         "updated_at": r[3], "published_id": r[4], "page_count": r[5] or 0}
        for r in rows
    ]


def create_project(name: Optional[str] = None, state: Optional[dict] = None) -> dict:
    pid = _new_id("p")
    ts = _now()
    st = state or {}
    nm = (name or "").strip() or _title_of(st)
    c = _conn()
    try:
        c.execute(
            "INSERT INTO Projects(id,name,created_at,updated_at,published_id,page_count,state) "
            "VALUES(?,?,?,?,?,?,?)",
            (pid, nm, ts, ts, None, _page_count(st), json.dumps(st, ensure_ascii=False)),
        )
        c.commit()
    finally:
        c.close()
    return {"id": pid, "name": nm, "created_at": ts, "updated_at": ts,
            "published_id": None, "page_count": _page_count(st), "state": st}


def get_project(pid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute(
            "SELECT id,name,created_at,updated_at,published_id,state FROM Projects WHERE id=?",
            (pid,),
        ).fetchone()
    finally:
        c.close()
    if not r:
        return None
    return {"id": r[0], "name": r[1] or "제목 없음", "created_at": r[2],
            "updated_at": r[3], "published_id": r[4],
            "state": json.loads(r[5]) if r[5] else {}}


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
    c = _conn()
    try:
        c.execute("DELETE FROM Projects WHERE id=?", (pid,))
        c.execute("DELETE FROM ProjectVersions WHERE project_id=?", (pid,))
        c.commit()
    finally:
        c.close()
    return {"ok": True}


def duplicate_project(pid: str) -> Optional[dict]:
    src = get_project(pid)
    if not src:
        return None
    return create_project(name=(src["name"] + " 복사본"), state=src["state"])


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
