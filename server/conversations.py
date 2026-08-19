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
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute(
        "CREATE TABLE IF NOT EXISTS Conversations("
        "id TEXT PRIMARY KEY, title TEXT, updated_at REAL, messages TEXT)"
    )
    # 단일 사용자 시절에는 대화에 주인이 없었다. 다중 사용자가 되면 그대로 두면
    # 임원 A가 임원 B의 챗봇 대화를 그대로 읽는다. 소유자 컬럼을 덧붙인다.
    have = {r[1] for r in c.execute("PRAGMA table_info(Conversations)").fetchall()}
    if "user_id" not in have:
        c.execute("ALTER TABLE Conversations ADD COLUMN user_id TEXT")
    c.execute("CREATE INDEX IF NOT EXISTS idx_conv_user ON Conversations(user_id)")
    c.commit()
    return c


def append(cid: Optional[str], role: str, text: str, user_id: Optional[str] = None) -> None:
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
            c.execute("INSERT INTO Conversations(id,title,updated_at,messages,user_id) VALUES(?,?,?,?,?)",
                      (cid, title, ts, payload, user_id))
        c.commit()
    finally:
        c.close()


def list_all(user_id: Optional[str] = None) -> list[dict]:
    """user_id 를 주면 그 사람 대화만. 주지 않으면 전부(관리자·이관용)."""
    c = _conn()
    try:
        if user_id is None:
            rows = c.execute(
                "SELECT id,title,updated_at,messages FROM Conversations ORDER BY updated_at DESC"
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT id,title,updated_at,messages FROM Conversations "
                "WHERE user_id=? ORDER BY updated_at DESC", (user_id,)
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


def owner_of(cid: str) -> Optional[str]:
    c = _conn()
    try:
        r = c.execute("SELECT user_id FROM Conversations WHERE id=?", (cid,)).fetchone()
    finally:
        c.close()
    return r[0] if r else None


def claim(cid: str, user_id: str) -> None:
    """주인 없는 대화를 이 사용자 것으로 표시한다. 이미 주인이 있으면 건드리지 않는다.

    chat_engine 은 대화 생성 시점을 알려주지 않으므로(내부에서 append 한다),
    라우터가 요청을 받을 때 여기서 귀속시킨다.
    """
    if not cid or not user_id:
        return
    c = _conn()
    try:
        c.execute("INSERT OR IGNORE INTO Conversations(id,title,updated_at,messages,user_id) "
                  "VALUES(?,?,?,?,?)", (cid, "새 대화", time.time(), "[]", user_id))
        c.execute("UPDATE Conversations SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id='')",
                  (user_id, cid))
        c.commit()
    finally:
        c.close()


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
