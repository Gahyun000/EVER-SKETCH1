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
    # 「고쳤습니다」 표시 — 나중에 생긴 열이라 이미 쓰고 있는 DB 에는 없다.
    # 없으면 붙인다. 이 한 줄이 없으면 배포하는 순간 기존 자료의 메모가 전부 죽는다.
    have = {r[1] for r in c.execute("PRAGMA table_info(Comments)").fetchall()}
    for col, decl in (("fixed_at", "REAL"), ("fixed_by", "TEXT")):
        if col not in have:
            c.execute("ALTER TABLE Comments ADD COLUMN %s %s" % (col, decl))
    c.commit()
    return c


def _row(r) -> dict:
    return {"id": r[0], "project_id": r[1], "thread_id": r[2], "page_id": r[3],
            "el_id": r[4], "cell": r[5], "body": r[6], "author_id": r[7],
            "created_at": r[8], "resolved_at": r[9], "resolved_by": r[10],
            "fixed_at": r[11], "fixed_by": r[12]}


_COLS = ("id,project_id,thread_id,page_id,el_id,cell,body,author_id,"
         "created_at,resolved_at,resolved_by,fixed_at,fixed_by")


# 앵커에 넣을 수 있는 가장 큰 좌표. 표는 이보다 훨씬 작지만, 서버는 표 크기를
# 모른다(그건 문서 안에 있다). 말이 되는 범위를 넘는 값만 걸러낸다.
MAX_CELL_INDEX = 999


def normalize_cell(cell: Optional[str]) -> Optional[str]:
    """앵커 문자열을 정규화한다.

        "3_5"        칸 하나
        "3_3:3_5"    범위 (왼쪽 위 : 오른쪽 아래)

    끌어서 고르면 시작점이 오른쪽 아래일 수도 있다("3_5:3_3"). 저장하기 전에
    **작은 값이 앞으로 오게 맞춘다.** 안 맞추면 같은 범위가 네 가지 문자열로
    저장되고, 핀을 그리는 쪽에서 그 네 경우를 다 알아야 한다.

    한 칸이면 콜론 없이 쓴다 — 예전에 달린 의견과 같은 형식이다.
    """
    if cell is None:
        return None
    txt = str(cell).strip()
    if not txt:
        return None

    def pt(s: str) -> tuple[int, int]:
        a, _, b = s.partition("_")
        try:
            r, c = int(a), int(b)
        except ValueError:
            raise CommentError("가리키는 칸이 올바르지 않습니다.")
        if not (0 <= r <= MAX_CELL_INDEX and 0 <= c <= MAX_CELL_INDEX):
            raise CommentError("가리키는 칸이 표 밖입니다.")
        return r, c

    head, sep, tail = txt.partition(":")
    r0, c0 = pt(head)
    if not sep:
        return "%d_%d" % (r0, c0)
    r1, c1 = pt(tail)
    lo_r, hi_r = min(r0, r1), max(r0, r1)
    lo_c, hi_c = min(c0, c1), max(c0, c1)
    if lo_r == hi_r and lo_c == hi_c:
        return "%d_%d" % (lo_r, lo_c)
    return "%d_%d:%d_%d" % (lo_r, lo_c, hi_r, hi_c)


def add(project_id: str, author_id: str, body: str, page_id: int,
        el_id: Optional[int] = None, cell: Optional[str] = None,
        reply_to: Optional[str] = None) -> dict:
    """메모를 단다. `reply_to` 를 주면 그 스레드의 답글이 된다."""
    body = (body or "").strip()
    if not body:
        raise CommentError("내용을 입력해 주세요.")
    if len(body) > MAX_BODY:
        raise CommentError("메모가 너무 깁니다 — 최대 %d자입니다." % MAX_BODY)
    cell = normalize_cell(cell)

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
            "INSERT INTO Comments(%s) VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)" % _COLS,
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
        if resolved:
            # 닫힌 지적에는 '고침 알림' 을 남기지 않는다 — 남겨두면 '내 차례'
            # 로 다시 세어져서, 해결했는데도 할 일이 줄지 않는다.
            c.execute("UPDATE Comments SET fixed_at=NULL, fixed_by=NULL WHERE id=?", (root_id,))
        c.commit()
    finally:
        c.close()
    return get(root_id)          # type: ignore[return-value]


# 담당자가 「고쳤습니다」를 누를 때 자동으로 달리는 한 줄.
# 답글 없이 상태만 바꾸면, 지적한 사람은 목록에서 무엇이 달라졌는지 알 수 없다.
FIXED_NOTE = "고쳤습니다."


def set_fixed(cid: str, fixed: bool, actor_id: str, note: Optional[str] = None) -> dict:
    """「고쳤습니다」 표시. 해결과 다르다 — **아직 닫힌 게 아니다.**

    지적한 사람이 확인하고 닫을 때까지 미해결로 남는다. 담당자가 스스로
    닫게 두면 검토가 형식이 된다(고쳤다는 말과 실제로 고쳤는지는 다르다).

    표시와 함께 답글을 한 줄 남긴다. 상태만 바뀌면 지적한 사람은 목록에서
    무엇이 달라졌는지 알 수 없다.
    """
    cur = get(cid)
    if not cur:
        raise CommentError("메모를 찾을 수 없습니다.")
    if cur["resolved_at"]:
        raise CommentError("이미 해결된 지적입니다.")
    root_id = cur["thread_id"]
    if fixed:
        add(cur["project_id"], actor_id, (note or "").strip() or FIXED_NOTE,
            cur["page_id"], reply_to=root_id)
    c = _conn()
    try:
        c.execute("UPDATE Comments SET fixed_at=?, fixed_by=? WHERE id=?",
                  (_now() if fixed else None, actor_id if fixed else None, root_id))
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


def remove_all(project_id: str) -> int:
    """이 자료의 메모를 전부 지운다. 지운 개수를 돌려준다.

    「처음부터 다시」에서 사용자가 **함께 지우기를 고른 경우**에만 부른다.
    기본은 남기는 쪽이다 — 검토 이력이 조용히 사라지는 것이 제일 나쁘다.
    """
    c = _conn()
    try:
        n = c.execute("SELECT COUNT(*) FROM Comments WHERE project_id=?",
                      (project_id,)).fetchone()[0]
        c.execute("DELETE FROM Comments WHERE project_id=?", (project_id,))
        c.commit()
    finally:
        c.close()
    return int(n)


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
