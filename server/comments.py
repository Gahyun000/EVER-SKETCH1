"""앵커 메모 — 문서의 **그 자리**에 붙는 검토 의견.

왜 자유 메모장(notes.py)으로 부족한가
    "3번째 줄 진행 구간이 실제와 다릅니다" 라고 적어두면, 받는 사람은 3번째 줄이
    어디인지부터 찾아야 한다. 회차마다 20명이 이걸 반복한다.
    의견은 **가리키는 대상과 함께** 있어야 한 번에 통한다.

무엇에 붙일 수 있는가
    페이지 / 요소(표·글상자) / 표의 한 칸.
    칸까지 붙일 수 있어야 "5월 칸" 같은 지적이 가능하다 — 로드맵이 18열이라
    요소 단위로는 어느 칸인지 여전히 못 가리킨다.

스레드
    첫 메모가 뿌리(thread_id == id)이고 답글이 매달린다.
    해결(resolve)은 **스레드 단위**다 — 답글마다 해결 상태를 두면
    "이 지적이 처리됐는가" 를 아무도 한눈에 못 본다.

앵커가 사라지면
    가리키던 요소를 지울 수 있다. 그때 메모를 함께 지우지 않는다 —
    "무엇을 지적했는지" 는 남아야 한다. 화면에서 '가리키던 곳 없음' 으로 보여준다.
"""
from __future__ import annotations

import sqlite3
import time
import uuid
from typing import Optional

from server import projects as projects_store

MAX_BODY = 2000
MAX_THREADS_PER_PROJECT = 500      # 무한 생성 방어 (UDS-107 §6)


class CommentError(ValueError):
    pass


def _now() -> int:
    return int(time.time() * 1000)


def _conn() -> sqlite3.Connection:
    c = projects_store._conn()
    c.execute(
        "CREATE TABLE IF NOT EXISTS Comments("
        "id TEXT PRIMARY KEY, project_id TEXT NOT NULL, thread_id TEXT NOT NULL, "
        "page_id INTEGER NOT NULL, el_id INTEGER, cell TEXT, "
        "body TEXT NOT NULL, author_id TEXT NOT NULL, created_at REAL NOT NULL, "
        "resolved_at REAL, resolved_by TEXT)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_comments_pid ON Comments(project_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_comments_thread ON Comments(thread_id)")
    c.commit()
    return c


def _row(r) -> dict:
    return {"id": r[0], "project_id": r[1], "thread_id": r[2], "page_id": r[3],
            "el_id": r[4], "cell": r[5], "body": r[6], "author_id": r[7],
            "created_at": r[8], "resolved_at": r[9], "resolved_by": r[10]}


_COLS = ("id,project_id,thread_id,page_id,el_id,cell,body,author_id,"
         "created_at,resolved_at,resolved_by")


def add(project_id: str, author_id: str, body: str, page_id: int,
        el_id: Optional[int] = None, cell: Optional[str] = None,
        reply_to: Optional[str] = None) -> dict:
    """메모를 단다. `reply_to` 를 주면 그 스레드의 답글이 된다."""
    body = (body or "").strip()
    if not body:
        raise CommentError("내용을 입력해 주세요.")
    if len(body) > MAX_BODY:
        raise CommentError("메모가 너무 깁니다 — 최대 %d자입니다." % MAX_BODY)

    c = _conn()
    try:
        thread_id = None
        if reply_to:
            r = c.execute("SELECT thread_id, project_id, page_id, el_id, cell "
                          "FROM Comments WHERE id=?", (reply_to,)).fetchone()
            if not r:
                raise CommentError("답글을 달 메모를 찾을 수 없습니다.")
            if r[1] != project_id:
                # 다른 문서의 메모에 답글을 매달면, 그 문서를 볼 권한이 없는 사람이
                # 남의 스레드에 글을 남길 수 있게 된다.
                raise CommentError("다른 문서의 메모에는 답글을 달 수 없습니다.")
            thread_id = r[0]
            # 답글은 뿌리와 같은 곳을 가리킨다 — 스레드가 두 곳을 가리킬 수는 없다.
            page_id, el_id, cell = r[2], r[3], r[4]
        else:
            n = c.execute("SELECT COUNT(*) FROM Comments WHERE project_id=? AND id=thread_id",
                          (project_id,)).fetchone()[0]
            if n >= MAX_THREADS_PER_PROJECT:
                raise CommentError("이 자료의 메모가 너무 많습니다 (최대 %d개)."
                                   % MAX_THREADS_PER_PROJECT)

        cid = "cm" + uuid.uuid4().hex[:12]
        c.execute(
            "INSERT INTO Comments(%s) VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL)" % _COLS,
            (cid, project_id, thread_id or cid, int(page_id), el_id, cell,
             body, author_id, _now()),
        )
        c.commit()
        r = c.execute("SELECT %s FROM Comments WHERE id=?" % _COLS, (cid,)).fetchone()
    finally:
        c.close()
    return _row(r)


def list_for_project(project_id: str) -> list[dict]:
    """스레드 목록. 뿌리는 오래된 순, 답글은 뿌리 뒤에 시간순."""
    c = _conn()
    try:
        rows = c.execute(
            "SELECT %s FROM Comments WHERE project_id=? ORDER BY created_at ASC" % _COLS,
            (project_id,)).fetchall()
    finally:
        c.close()
    items = [_row(r) for r in rows]
    by_thread: dict[str, dict] = {}
    order: list[str] = []
    for it in items:
        if it["id"] == it["thread_id"]:
            by_thread[it["thread_id"]] = {**it, "replies": []}
            order.append(it["thread_id"])
    for it in items:
        if it["id"] != it["thread_id"]:
            root = by_thread.get(it["thread_id"])
            # 뿌리가 지워진 답글은 버린다 — 가리킬 곳이 없다.
            if root is not None:
                root["replies"].append(it)
    return [by_thread[t] for t in order]


def get(cid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute("SELECT %s FROM Comments WHERE id=?" % _COLS, (cid,)).fetchone()
    finally:
        c.close()
    return _row(r) if r else None


def set_resolved(cid: str, resolved: bool, actor_id: str) -> dict:
    """해결 표시. **스레드 단위**다 — 답글 id 를 줘도 뿌리에 적용한다."""
    cur = get(cid)
    if not cur:
        raise CommentError("메모를 찾을 수 없습니다.")
    root_id = cur["thread_id"]
    c = _conn()
    try:
        c.execute("UPDATE Comments SET resolved_at=?, resolved_by=? WHERE id=?",
                  (_now() if resolved else None, actor_id if resolved else None, root_id))
        c.commit()
    finally:
        c.close()
    return get(root_id)          # type: ignore[return-value]


def remove(cid: str) -> dict:
    """메모 삭제. 뿌리를 지우면 스레드 전체가 사라진다.

    답글만 남겨두면 무엇에 대한 답인지 알 수 없는 글이 된다.
    """
    cur = get(cid)
    if not cur:
        raise CommentError("메모를 찾을 수 없습니다.")
    c = _conn()
    try:
        if cur["id"] == cur["thread_id"]:
            n = c.execute("DELETE FROM Comments WHERE thread_id=?", (cur["thread_id"],)).rowcount
        else:
            n = c.execute("DELETE FROM Comments WHERE id=?", (cid,)).rowcount
        c.commit()
    finally:
        c.close()
    return {"ok": True, "removed": n, "thread_id": cur["thread_id"]}


def unresolved_count(project_id: str) -> int:
    c = _conn()
    try:
        return c.execute(
            "SELECT COUNT(*) FROM Comments WHERE project_id=? AND id=thread_id "
            "AND resolved_at IS NULL", (project_id,)).fetchone()[0]
    finally:
        c.close()


def counts_for(project_ids: list[str]) -> dict[str, int]:
    """여러 자료의 미해결 수를 한 번에 — 회차 화면에서 20명분을 한 줄씩 물어보지 않게."""
    if not project_ids:
        return {}
    c = _conn()
    try:
        marks = ",".join("?" for _ in project_ids)
        rows = c.execute(
            "SELECT project_id, COUNT(*) FROM Comments "
            "WHERE project_id IN (%s) AND id=thread_id AND resolved_at IS NULL "
            "GROUP BY project_id" % marks, project_ids).fetchall()
    finally:
        c.close()
    return {r[0]: r[1] for r in rows}
