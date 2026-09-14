"""결재 — `Approvals` / `ApprovalComments`.

`ebook_html1/server/approvals.py` 를 옮겨 오되 **다섯 군데를 바꿨다.**

── ① `team_id` 신설 : D9 의 열쇠 ──────────────────────────
요청 **시점의 팀**을 못박는다. 가시성을 「현재 소속」이 아니라 「승인 당시 팀」으로 판정하면,
사람이 B팀으로 옮겨도 A팀 시절 자료는 A팀에 남고 본인은 더는 못 본다.
**팀이 없으면 제출할 수 없다** — 「승인이 곧 공유」(D6)인데 갈 팀이 없으면 승인이 아무 일도 안 한다.

── ② `requester`/`approver` 가 `Users.id` ─────────────────
원본은 표시 이름을 적었다. 이름은 바뀐다 — 이름으로 적어 두면
「누가 승인했는가」가 개명 한 번에 흐려진다. 이름은 화면이 붙인다.

── ③ `delete_approval` 을 옮기지 않았다 ────────────────────
「결재 이력이 있으면 자료를 못 지운다」(D16)가 규칙인데 **이력 자체를 지울 수 있으면
그 규칙이 없는 것과 같다.** 회수한 건(`withdrawn`)도 이력으로 센다 —
제출했다가 회수한 것도 남이 봤을 수 있고, 「없었던 일」로 만들 수 없다.

── ④ 권한 ─────────────────────────────────────────────
원본은 누구나 아무 결재나 결정할 수 있었다(혼자 쓰는 도구였다).
여기서는 `SUBMIT`(본인 자료만) · `DECIDE`(관리자만)를 `permissions.decide()` 가 판정한다.
이 파일은 판정하지 않는다 — 라우터가 통과시킨 뒤에만 불린다.

── ⑤ 실패를 예외로 ────────────────────────────────────
원본은 `{"ok": False, "error": ...}` 를 돌려줬다. 부르는 쪽이 `ok` 를 안 보면
**실패가 성공처럼 지나간다.** 여기서는 `ApprovalError` 를 던진다.

`_COLS` 순서는 `_row()` 의 인덱스 접근에 묶여 있다 — 한쪽만 고치면 값이 통째로 밀린다.
`snapshot` 은 **일부러 빠져 있다**(`get_approval` 만 따로 붙여 읽는다). 목록마다 실으면
문서 전체가 응답에 딸려 나간다.
"""
from __future__ import annotations

import json
import os
import pathlib
import sqlite3
import time
import uuid
from typing import Optional

from server import doc_state
from server import projects as projects_store
from server import teams as teams_store

_HERE = pathlib.Path(__file__).resolve().parent

STATUSES = ("pending", "approved", "rejected", "withdrawn")
#  'approval' — 승인 요청 (P5)
#  'revision' — 수정 요청 (P7). 컬럼은 지금 만들어 둔다 — 나중에 ALTER 하면
#               이미 쌓인 이력에 기본값을 채워 넣어야 하고, 그때 무엇이 맞는지 알기 어렵다.
KINDS = ("approval", "revision")


class ApprovalError(Exception):
    pass


def _db_path() -> str:
    return (
        os.environ.get("EVER_SKETCH_DB")
        or os.environ.get("EBOOK_HTML_DB")
        or str(_HERE / "ebook_html.db")
    )


def _now() -> float:
    return time.time() * 1000


def _new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:12]


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Approvals("
        "id TEXT PRIMARY KEY, project_id TEXT, project_name TEXT, folder_path TEXT, "
        "kind TEXT NOT NULL DEFAULT 'approval', team_id TEXT NOT NULL, "
        "round INTEGER, status TEXT, requester TEXT, approver TEXT, "
        "request_message TEXT, decision_message TEXT, page_count INTEGER, snapshot TEXT, "
        "created_at REAL, updated_at REAL, decided_at REAL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_appr_team ON Approvals(team_id, status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_appr_project ON Approvals(project_id)")
    c.execute(
        "CREATE TABLE IF NOT EXISTS ApprovalComments("
        "id TEXT PRIMARY KEY, approval_id TEXT, page_id INTEGER, page_no INTEGER, "
        "author TEXT, body TEXT, created_at REAL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_apc_appr ON ApprovalComments(approval_id)")
    c.commit()
    return c


# **순서를 바꾸지 말 것** — `_row()` 가 인덱스로 읽는다. snapshot 은 일부러 빠져 있다.
_COLS = ("id,project_id,project_name,folder_path,kind,team_id,round,status,"
         "requester,approver,request_message,decision_message,page_count,"
         "created_at,updated_at,decided_at")


def _row(r, snapshot_json: Optional[str] = None) -> dict:
    d = {
        "id": r[0], "project_id": r[1], "project_name": r[2] or "제목 없음",
        "folder_path": r[3] or "", "kind": r[4] or "approval", "team_id": r[5] or "",
        "round": r[6] or 1, "status": r[7], "requester": r[8] or "", "approver": r[9] or "",
        "request_message": r[10] or "", "decision_message": r[11] or "",
        "page_count": r[12] or 0,
        "created_at": r[13], "updated_at": r[14], "decided_at": r[15],
    }
    if snapshot_json is not None:
        try:
            d["snapshot"] = json.loads(snapshot_json) if snapshot_json else {}
        except Exception:
            # 스냅샷이 깨져도 결재 이력 자체는 읽혀야 한다 — 승인 시각과 코멘트가 여기 있다.
            d["snapshot"] = {}
    return d


# ── 조회 ─────────────────────────────────────────
def list_approvals(status: Optional[str] = None, project_id: Optional[str] = None,
                   team_ids: Optional[tuple[str, ...]] = None) -> list[dict]:
    """`team_ids` 가 주어지면 그 팀들의 건만. 가시성 판정은 라우터가 하고 여기서는 거르기만 한다."""
    c = _conn()
    try:
        q = "SELECT " + _COLS + " FROM Approvals"
        cond, args = [], []
        if status and status in STATUSES:
            cond.append("status=?"); args.append(status)
        if project_id:
            cond.append("project_id=?"); args.append(project_id)
        if team_ids is not None:
            if not team_ids:
                return []
            cond.append("team_id IN (%s)" % ",".join("?" * len(team_ids)))
            args += list(team_ids)
        if cond:
            q += " WHERE " + " AND ".join(cond)
        q += " ORDER BY created_at DESC, rowid DESC"
        out = [_row(r) for r in c.execute(q, args).fetchall()]
        for a in out:
            a["comment_count"] = c.execute(
                "SELECT COUNT(*) FROM ApprovalComments WHERE approval_id=?",
                (a["id"],)).fetchone()[0]
        return out
    finally:
        c.close()


def get_approval(aid: str) -> Optional[dict]:
    """**여기서만** 스냅샷을 붙인다. 목록에 실으면 문서 전체가 응답에 딸려 나간다."""
    c = _conn()
    try:
        r = c.execute("SELECT " + _COLS + ",snapshot FROM Approvals WHERE id=?", (aid,)).fetchone()
        if not r:
            return None
        a = _row(r[:-1], snapshot_json=r[-1] or "")
        a["comments"] = _list_comments(c, aid)
        return a
    finally:
        c.close()


def latest_for_project(project_id: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute(
            "SELECT " + _COLS + " FROM Approvals WHERE project_id=? "
            # **rowid 로 동점을 깬다.** `created_at` 은 밀리초라 승인 직후에 낸
            # 수정 요청이 같은 값을 가질 수 있고, 그러면 「최신 행」이 뒤집혀
            # 자료 상태가 통째로 달라진다. rowid 는 넣은 순서다.
            "ORDER BY created_at DESC, rowid DESC LIMIT 1", (project_id,)).fetchone()
        if not r:
            return None
        a = _row(r)
        a["comment_count"] = c.execute(
            "SELECT COUNT(*) FROM ApprovalComments WHERE approval_id=?", (a["id"],)).fetchone()[0]
        return a
    finally:
        c.close()


def status_map() -> dict:
    """`project_id` → 최신 결재 요약. 라이브러리 목록에 상태 칩을 붙일 때 **한 번에** 가져온다 —
    건마다 되물으면 자료 12건에 요청이 13번 나간다."""
    out: dict[str, dict] = {}
    c = _conn()
    try:
        rows = c.execute(
            "SELECT project_id,id,status,round,kind,decided_at,created_at FROM Approvals "
            # 동점은 rowid 로 깬다 — `latest_for_project` 와 **같은 답**이 나와야 한다.
            # 어긋나면 목록의 배지와 상세 화면의 상태가 서로 다른 말을 한다.
            "ORDER BY created_at DESC, rowid DESC").fetchall()
    finally:
        c.close()
    for pid, aid, st, rnd, kind, decided, created in rows:
        if pid in out:
            continue        # 최신순이므로 처음 만난 것이 최신이다
        row = {"approval_id": aid, "status": st, "round": rnd or 1,
               "kind": kind or "approval", "decided_at": decided, "created_at": created}
        # **파생 상태를 여기서 같이 준다**(P7). 화면이 `kind` 와 `status` 를 보고 스스로
        # 짜맞추게 두면 서버와 화면이 서로 다른 상태를 말하는 날이 온다.
        row["state"] = doc_state.derive(row)
        row["locked"] = doc_state.is_locked(row["state"])
        out[pid] = row
    return out


def state_of(project_id: str) -> str:
    """자료 하나의 파생 상태. 최신 결재 행 하나에서 계산한다(§3.4).

    **`Projects` 에 상태 칼럼을 두지 않는 이유**는 진실이 두 곳이 되면 반드시
    어긋나고, 어긋났을 때 어느 쪽이 맞는지 알 방법이 없기 때문이다.
    """
    return doc_state.derive(latest_for_project(project_id))


def has_history(project_id: str) -> bool:
    """**D16** — 결재를 한 번이라도 탄 자료인가. 회수한 건도 이력으로 센다:
    제출했다가 회수한 것도 남이 봤을 수 있고, 「없었던 일」로 만들 수 없다."""
    c = _conn()
    try:
        return bool(c.execute(
            "SELECT 1 FROM Approvals WHERE project_id=? LIMIT 1", (project_id,)).fetchone())
    finally:
        c.close()


# ── 제출 · 결정 ──────────────────────────────────
def submit_block_reason(project_id: str) -> Optional[str]:
    """지금 제출이 막혀 있다면 **왜 막혔는지 사람 말로** 돌려준다. 안 막혔으면 None.

    **이 함수가 있는 이유**는 이유를 두 곳에서 말하지 않기 위해서다.
    권한 판정(`decide`)은 잠긴 자료를 그냥 거부하고 「권한이 없습니다」(403)만 낸다 —
    맞는 말이지만, 제 승인본을 다시 내려던 사람은 「내 자료인데 왜 권한이 없지」에서
    멈춘다. 라우터가 이 함수로 먼저 물어 사람 말로 거절하고, 판정은 그대로 둔다.
    """
    st = state_of(project_id)
    if st == doc_state.PENDING:
        return "이미 결재 대기 중입니다."
    if st == doc_state.APPROVED:
        return "승인된 자료입니다. 고치려면 먼저 수정 요청을 내 주세요."
    if st == doc_state.REVISION_PENDING:
        return "수정 요청을 낸 상태입니다. 관리자 허락을 기다려 주세요."
    if not doc_state.can_submit(st):
        # 여기 오면 상태를 새로 만들고 문구를 안 적은 것이다 — 막되, 무엇인지는 말한다.
        return "지금은 제출할 수 없습니다. (%s)" % (doc_state.label(st) or st)
    return None


def request(project_id: str, requester_id: str, message: str = "") -> dict:
    """결재 요청. **지금 문서를 스냅샷으로 얼린다** — 승인은 「그때 본 것」에 대한 승인이다."""
    p = projects_store.get_project(project_id)
    if not p:
        raise ApprovalError("자료를 찾을 수 없습니다.")
    state = p.get("state") or {}
    if not state.get("pages"):
        raise ApprovalError("슬라이드가 없는 자료는 제출할 수 없습니다.")

    # 요청 시점의 팀을 못박는다(D9). 한 시점 한 팀이므로(D30) 첫 번째가 곧 그 팀이다.
    tids = teams_store.team_ids_of(requester_id)
    if not tids:
        raise ApprovalError(
            "팀에 속해 있어야 제출할 수 있습니다. 관리자에게 팀 편성을 요청해 주세요.")
    team_id = tids[0]

    # **잠긴 자료는 못 낸다**(P7). 「이미 대기 중」만 막으면 승인된 자료를 그대로
    # 다시 낼 수 있고, 그러면 수정 요청 흐름(D8)을 우회하는 뒷문이 된다.
    why = submit_block_reason(project_id)
    if why:
        raise ApprovalError(why)

    c = _conn()
    try:
        if c.execute("SELECT id FROM Approvals WHERE project_id=? AND status='pending'",
                     (project_id,)).fetchone():
            raise ApprovalError("이미 결재 대기 중입니다.")
        # **회차는 결재를 받은 「문서」의 번호다** — 수정 요청 행(`kind='revision'`)은
        # 문서가 아니라 허락을 청한 행이라 세지 않는다. 세면 승인본이 2건인데
        # 「3회차」라고 적히고, 그때부터 「3회차 승인본」이 무엇을 가리키는지 모르게 된다.
        rnd = c.execute("SELECT COUNT(*) FROM Approvals WHERE project_id=? AND kind='approval'",
                        (project_id,)).fetchone()[0] + 1
        aid, ts = _new_id("a"), _now()
        c.execute(
            "INSERT INTO Approvals(" + _COLS + ",snapshot) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (aid, project_id, p.get("name") or state.get("title") or "제목 없음",
             _folder_path_str(p.get("folder_id")), "approval", team_id, rnd, "pending",
             requester_id, "", (message or "").strip(), "",
             len(state.get("pages") or []), ts, ts, None,
             json.dumps(state, ensure_ascii=False)),
        )
        c.commit()
    finally:
        c.close()
    # 제출 시점을 버전으로도 남긴다(되돌리기 용). 실패해도 결재는 유효하다 —
    # 버전 저장이 안 됐다고 이미 낸 결재를 무르면 사람은 무엇이 일어났는지 모른다.
    try:
        projects_store.save_version(project_id, state,
                                    label="결재 요청 %d회차" % rnd, pinned=True, auto=False)
    except Exception:
        pass
    return get_approval(aid)


def _folder_path_str(fid: Optional[str]) -> str:
    """결재 건에 **그때의 경로**를 글자로 박아 둔다. 폴더는 나중에 이름이 바뀌거나 사라진다 —
    id 만 두면 옛 결재의 위치를 다시 그릴 수 없다."""
    if not fid:
        return ""
    from server import folders as folders_store
    return " / ".join(p["name"] for p in folders_store.folder_path(fid))


def decide(aid: str, action: str, approver_id: str, message: str = "") -> dict:
    """승인 / 반려. **대기 중인 건만** 결정할 수 있다.

    되돌리기는 P7 의 「수정 요청」이 한다 — 여기서 뒤집을 수 있으면
    승인 시각이 무슨 뜻인지 알 수 없어진다.
    """
    if action not in ("approve", "reject"):
        raise ApprovalError("승인 또는 반려만 할 수 있습니다.")
    c = _conn()
    try:
        r = c.execute("SELECT status FROM Approvals WHERE id=?", (aid,)).fetchone()
        if not r:
            raise ApprovalError("결재 건을 찾을 수 없습니다.")
        if r[0] != "pending":
            raise ApprovalError("이미 처리된 결재입니다.")
        ts = _now()
        c.execute(
            "UPDATE Approvals SET status=?, approver=?, decision_message=?, "
            "updated_at=?, decided_at=? WHERE id=?",
            ("approved" if action == "approve" else "rejected",
             approver_id, (message or "").strip(), ts, ts, aid))
        c.commit()
    finally:
        c.close()
    return get_approval(aid)


# ── 수정 요청 (P7 · D8) ──────────────────────────
def request_revision(project_id: str, requester_id: str, message: str = "") -> dict:
    """승인된 자료를 **고치게 해 달라**는 요청. 스냅샷을 얼리지 않는다.

    **문서가 아니라 허락을 요청하는 행이다.** 그래서 `snapshot IS NULL` 이고,
    팀이 보는 그림은 이 요청과 무관하게 직전 승인본 그대로다 —
    D8(「수정 중에 보던 자료가 사라지면 안 된다」)이 여기서 추가 장치 없이 풀린다.

    `round` 는 올리지 않는다. 회차는 **결재를 받은 문서**의 번호인데 이 행에는
    문서가 없다 — 올리면 「3회차 승인본」과 「3회차」가 서로 다른 것을 가리키게 된다.
    """
    p = projects_store.get_project(project_id)
    if not p:
        raise ApprovalError("자료를 찾을 수 없습니다.")
    st = state_of(project_id)
    if st != doc_state.APPROVED:
        if st in (doc_state.REVISION_PENDING, doc_state.REVISING):
            raise ApprovalError("이미 수정 요청이 진행 중입니다.")
        raise ApprovalError("승인된 자료만 수정 요청을 낼 수 있습니다. 지금은 바로 고칠 수 있어요.")

    last = latest_for_project(project_id)
    # 팀은 **승인 당시 팀**을 그대로 물려받는다(D9). 요청자가 그새 옮겼더라도
    # 이 자료가 걸려 있는 곳은 여전히 그 팀이다 — 자료는 팀의 것이다(D18).
    team_id = (last or {}).get("team_id") or ""
    rnd = (last or {}).get("round") or 1

    c = _conn()
    try:
        aid, ts = _new_id("a"), _now()
        c.execute(
            "INSERT INTO Approvals(" + _COLS + ",snapshot) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (aid, project_id, p.get("name") or "제목 없음",
             _folder_path_str(p.get("folder_id")), "revision", team_id, rnd, "pending",
             requester_id, "", (message or "").strip(), "", 0, ts, ts, None, None),
        )
        c.commit()
    finally:
        c.close()
    return get_approval(aid)


def decide_revision(aid: str, action: str, approver_id: str, message: str = "") -> dict:
    """수정 요청에 대한 허락 · 거절.

    **허락해도 승인본은 그대로다.** 열리는 것은 작업본뿐이고, 팀은 재승인이 날 때까지
    직전 승인본을 계속 본다. 거절하면 자료는 승인된 채로 잠겨 있던 그대로 남는다.
    """
    if action not in ("approve", "reject"):
        raise ApprovalError("허락 또는 거절만 할 수 있습니다.")
    a = get_approval(aid)
    if not a:
        raise ApprovalError("결재 건을 찾을 수 없습니다.")
    if a.get("kind") != "revision":
        raise ApprovalError("수정 요청이 아닙니다.")
    if a.get("status") != "pending":
        raise ApprovalError("이미 처리된 요청입니다.")
    return decide(aid, action, approver_id, message)


def end_revision(aid: str) -> dict:
    """수정을 **그만둔다.** 고치기로 해 놓고 안 고칠 수도 있다.

    이 길이 없으면 「수정 중」이 영원히 남는다 — 팀은 몇 달째 「곧 바뀐다」는 글자를
    달고 있는 승인본을 보게 되고, 그 글자는 아무 뜻도 없게 된다.
    **작업본에 고친 내용은 지우지 않는다** — 남의 작업을 대신 버리지 않는다.
    승인본은 애초에 손대지 않았으므로 팀 화면에는 아무 일도 일어나지 않는다.
    """
    a = get_approval(aid)
    if not a:
        raise ApprovalError("결재 건을 찾을 수 없습니다.")
    if a.get("kind") != "revision" or a.get("status") != "approved":
        raise ApprovalError("수정 중인 요청만 그만둘 수 있습니다.")
    c = _conn()
    try:
        ts = _now()
        c.execute("UPDATE Approvals SET status='withdrawn', updated_at=? WHERE id=?", (ts, aid))
        c.commit()
    finally:
        c.close()
    return get_approval(aid)


def withdraw(aid: str) -> dict:
    """작성자가 대기 중인 요청을 회수한다. **이력에는 남는다**(D16)."""
    c = _conn()
    try:
        r = c.execute("SELECT status FROM Approvals WHERE id=?", (aid,)).fetchone()
        if not r:
            raise ApprovalError("결재 건을 찾을 수 없습니다.")
        if r[0] != "pending":
            raise ApprovalError("대기 중인 결재만 거둘 수 있습니다.")
        ts = _now()
        c.execute("UPDATE Approvals SET status='withdrawn', updated_at=?, decided_at=? WHERE id=?",
                  (ts, ts, aid))
        c.commit()
    finally:
        c.close()
    return get_approval(aid)


# ── 슬라이드별 코멘트 ────────────────────────────
def _list_comments(c: sqlite3.Connection, aid: str) -> list[dict]:
    rows = c.execute(
        "SELECT id,approval_id,page_id,page_no,author,body,created_at FROM ApprovalComments "
        "WHERE approval_id=? ORDER BY created_at ASC", (aid,)).fetchall()
    return [{"id": r[0], "approval_id": r[1], "page_id": r[2], "page_no": r[3],
             "author": r[4] or "", "body": r[5] or "", "created_at": r[6]} for r in rows]


def add_comment(aid: str, body: str, author_id: str,
                page_id: Optional[int] = None, page_no: Optional[int] = None) -> dict:
    """`page_id` 가 없으면 **전체 의견**이다. 있으면 그 슬라이드에 붙는다."""
    text = (body or "").strip()
    if not text:
        raise ApprovalError("내용을 입력해 주세요.")
    c = _conn()
    try:
        if not c.execute("SELECT 1 FROM Approvals WHERE id=?", (aid,)).fetchone():
            raise ApprovalError("결재 건을 찾을 수 없습니다.")
        cid, ts = _new_id("ac"), _now()
        c.execute(
            "INSERT INTO ApprovalComments(id,approval_id,page_id,page_no,author,body,created_at) "
            "VALUES(?,?,?,?,?,?,?)", (cid, aid, page_id, page_no, author_id, text, ts))
        c.commit()
    finally:
        c.close()
    return {"id": cid, "approval_id": aid, "page_id": page_id, "page_no": page_no,
            "author": author_id, "body": text, "created_at": ts}


def get_comment(cid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute(
            "SELECT id,approval_id,page_id,page_no,author,body,created_at "
            "FROM ApprovalComments WHERE id=?", (cid,)).fetchone()
    finally:
        c.close()
    if not r:
        return None
    return {"id": r[0], "approval_id": r[1], "page_id": r[2], "page_no": r[3],
            "author": r[4] or "", "body": r[5] or "", "created_at": r[6]}


def update_comment(cid: str, body: str) -> dict:
    text = (body or "").strip()
    if not text:
        raise ApprovalError("내용을 입력해 주세요.")
    c = _conn()
    try:
        if not c.execute("SELECT 1 FROM ApprovalComments WHERE id=?", (cid,)).fetchone():
            raise ApprovalError("코멘트를 찾을 수 없습니다.")
        c.execute("UPDATE ApprovalComments SET body=? WHERE id=?", (text, cid))
        c.commit()
    finally:
        c.close()
    return get_comment(cid)


def delete_comment(cid: str) -> None:
    c = _conn()
    try:
        c.execute("DELETE FROM ApprovalComments WHERE id=?", (cid,))
        c.commit()
    finally:
        c.close()
