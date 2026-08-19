"""프로젝트별 메모장 — SQLite. 이북(project_id)마다 여러 개의 메모를 보관한다.
blocks: NoteBlocks 편집기의 블록 배열(JSON). 재시작 후에도 남는다.
"""
from __future__ import annotations

import json
import os
import pathlib
import sqlite3
import time
from typing import Optional

_HERE = pathlib.Path(__file__).resolve().parent


def _db_path() -> str:
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute(
        "CREATE TABLE IF NOT EXISTS Notes("
        "id TEXT PRIMARY KEY, project_id TEXT, title TEXT, blocks TEXT, "
        "pinned INTEGER DEFAULT 0, sort REAL DEFAULT 0, updated_at REAL, created_at REAL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_notes_pid ON Notes(project_id)")
    return c


def list_notes(project_id: str) -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id,title,blocks,pinned,sort,updated_at,created_at FROM Notes "
            "WHERE project_id=? ORDER BY pinned DESC, sort ASC, updated_at DESC",
            (project_id,),
        ).fetchall()
    finally:
        c.close()
    out = []
    for id_, title, blocks, pinned, sort, upd, cre in rows:
        out.append({
            "id": id_, "title": title or "",
            "blocks": json.loads(blocks) if blocks else [],
            "pinned": bool(pinned), "sort": sort or 0,
            "updatedAt": upd, "createdAt": cre,
        })
    return out


def upsert_note(project_id: str, id: str, title: str, blocks, pinned: bool, sort: float) -> dict:
    if not id or not project_id:
        return {"ok": False}
    c = _conn()
    try:
        now = time.time()
        row = c.execute("SELECT created_at FROM Notes WHERE id=?", (id,)).fetchone()
        created = row[0] if row else now
        payload = json.dumps(blocks or [], ensure_ascii=False)
        c.execute(
            "INSERT INTO Notes(id,project_id,title,blocks,pinned,sort,updated_at,created_at) "
            "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
            "project_id=excluded.project_id,title=excluded.title,blocks=excluded.blocks,"
            "pinned=excluded.pinned,sort=excluded.sort,updated_at=excluded.updated_at",
            (id, project_id, title or "", payload, 1 if pinned else 0, sort or 0, now, created),
        )
        c.commit()
    finally:
        c.close()
    return {"ok": True, "updatedAt": now}


def project_of_note(id: str) -> Optional[str]:
    """메모가 속한 이북 id. 삭제 권한을 그 이북 기준으로 판정하기 위해 필요하다."""
    c = _conn()
    try:
        r = c.execute("SELECT project_id FROM Notes WHERE id=?", (id,)).fetchone()
    finally:
        c.close()
    return r[0] if r else None


def delete_note(id: str) -> dict:
    c = _conn()
    try:
        c.execute("DELETE FROM Notes WHERE id=?", (id,))
        c.commit()
    finally:
        c.close()
    return {"ok": True}
