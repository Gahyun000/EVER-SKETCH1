"""대화 영구 저장(노션식 '내 대화' 목록) — SQLite 백엔드.

세션ID(=대화ID)별로 메시지를 보관한다. 재시작 후에도 남는다.
messages: [{role, text, ts(epoch sec)}]
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
    return os.environ.get("EBOOK_HTML_DB") or str(_HERE / "ebook_html.db")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute(
        "CREATE TABLE IF NOT EXISTS Conversations("
        "id TEXT PRIMARY KEY, title TEXT, updated_at REAL, messages TEXT)"
    )
    return c


def append(cid: Optional[str], role: str, text: str) -> None:
    """대화에 메시지 한 건 추가(대화 없으면 생성). title은 첫 사용자 발화로 잡는다."""
    if not cid or not (text or "").strip():
        return
    c = _conn()
    try:
        row = c.execute("SELECT title, messages FROM Conversations WHERE id=?", (cid,)).fetchone()
        msgs = json.loads(row[1]) if row and row[1] else []
        title = (row[0] if row else "") or ""
        ts = time.time()
        msgs.append({"role": role, "text": text, "ts": ts})
        if not title and role == "user":
            title = text.strip()[:40]
        if not title:
            title = "새 대화"
        payload = json.dumps(msgs, ensure_ascii=False)
        if row:
            c.execute("UPDATE Conversations SET title=?, updated_at=?, messages=? WHERE id=?",
                      (title, ts, payload, cid))
        else:
            c.execute("INSERT INTO Conversations(id,title,updated_at,messages) VALUES(?,?,?,?)",
                      (cid, title, ts, payload))
        c.commit()
    finally:
        c.close()


def list_all() -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id,title,updated_at,messages FROM Conversations ORDER BY updated_at DESC"
        ).fetchall()
    finally:
        c.close()
    out = []
    for cid, title, upd, msgs in rows:
        m = json.loads(msgs) if msgs else []
        preview = ""
        for x in reversed(m):
            if (x.get("text") or "").strip():
                preview = x["text"].strip()
                break
        out.append({"id": cid, "title": title or "새 대화",
                    "preview": preview[:60], "updated_at": upd, "count": len(m)})
    return out


def get(cid: str) -> dict:
    c = _conn()
    try:
        row = c.execute("SELECT id,title,messages FROM Conversations WHERE id=?", (cid,)).fetchone()
    finally:
        c.close()
    if not row:
        return {"id": cid, "title": "", "messages": []}
    return {"id": row[0], "title": row[1] or "", "messages": json.loads(row[2]) if row[2] else []}


def delete(cid: str) -> dict:
    c = _conn()
    try:
        c.execute("DELETE FROM Conversations WHERE id=?", (cid,))
        c.commit()
    finally:
        c.close()
    return {"ok": True}
