"""회차(Cycles)와 템플릿(Templates) 저장소.

회차가 열리면 대상 임원 1인당 표준 템플릿 1장이 자동 생성·배부된다.
배부된 장은 그 임원 소유(`Projects.owner_id`)이고, 회차에 묶인다(`cycle_id`).

정본을 파일이 아니라 DB에 두는 이유 — L3가 화면에서 정본을 고칠 수 있어야 하고,
**회차마다 그 시점의 정본이 무엇이었는지 남아야** 한다. 나중에 정본을 바꿔도
과거 회차의 배부본은 그때 기준으로 설명된다.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Optional

from server import projects as projects_store
from server import template_seed

# 회차 상태 전이 — 역행은 L3만, closed 는 종착.
CYCLE_STATUSES = ("draft", "writing", "review", "published", "closed")
# 배부본 제출 상태
SUBMIT_STATUSES = ("draft", "submitted", "returned", "approved")

_ALLOWED_NEXT = {
    "draft": {"writing", "closed"},
    "writing": {"review", "draft", "closed"},
    "review": {"published", "writing", "closed"},
    "published": {"closed", "review"},
    "closed": set(),          # 종착 — 되돌리려면 새 회차를 연다
}


class CycleError(ValueError):
    pass


def _now() -> int:
    return int(time.time() * 1000)


def _new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:12]


def _conn() -> sqlite3.Connection:
    # Projects 확장 컬럼(cycle_id 등)이 있어야 하므로 projects 쪽 스키마를 먼저 보장한다.
    c = projects_store._conn()
    c.execute(
        "CREATE TABLE IF NOT EXISTS Cycles("
        "id TEXT PRIMARY KEY, title TEXT NOT NULL, period_ym TEXT NOT NULL, "
        "status TEXT NOT NULL DEFAULT 'draft', due_at REAL, template_id TEXT, "
        "created_by TEXT, created_at REAL NOT NULL, published_at REAL, closed_at REAL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_cycles_status ON Cycles(status)")
    c.execute(
        "CREATE TABLE IF NOT EXISTS Templates("
        "id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, "
        "state TEXT NOT NULL, slot_policy TEXT NOT NULL, active INTEGER DEFAULT 1, "
        "created_by TEXT, created_at REAL NOT NULL)"
    )
    c.commit()
    return c


# ─────────────────────── 템플릿 ───────────────────────
def ensure_default_template(created_by: Optional[str] = None) -> dict:
    """정본 v1.0 을 등록한다. 같은 버전이 이미 있으면 그대로 쓴다(멱등).

    state 에는 **기간이 비어 있는 골격**을 넣는다. 실제 배부 시에는 회차의
    period_ym 으로 다시 만들어야 연도 헤더와 Today 마커가 맞는다.
    """
    c = _conn()
    try:
        r = c.execute("SELECT id FROM Templates WHERE version=? AND active=1",
                      (template_seed.TEMPLATE_VERSION,)).fetchone()
        if r:
            return get_template(r[0])          # type: ignore[return-value]
        tid = _new_id("t")
        skeleton = template_seed.build_template_state("2026-01")
        c.execute(
            "INSERT INTO Templates(id,name,version,state,slot_policy,active,created_by,created_at) "
            "VALUES(?,?,?,?,?,1,?,?)",
            (tid, template_seed.TEMPLATE_NAME, template_seed.TEMPLATE_VERSION,
             json.dumps(skeleton, ensure_ascii=False),
             json.dumps(template_seed.SLOT_POLICY, ensure_ascii=False),
             created_by, _now()),
        )
        c.commit()
    finally:
        c.close()
    return get_template(tid)                    # type: ignore[return-value]


def get_template(tid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute("SELECT id,name,version,state,slot_policy,active,created_at "
                      "FROM Templates WHERE id=?", (tid,)).fetchone()
    finally:
        c.close()
    if not r:
        return None
    return {"id": r[0], "name": r[1], "version": r[2],
            "state": json.loads(r[3]), "slot_policy": json.loads(r[4]),
            "active": bool(r[5]), "created_at": r[6]}


def list_templates() -> list[dict]:
    c = _conn()
    try:
        rows = c.execute("SELECT id,name,version,active,created_at FROM Templates "
                         "ORDER BY created_at DESC").fetchall()
    finally:
        c.close()
    return [{"id": r[0], "name": r[1], "version": r[2],
             "active": bool(r[3]), "created_at": r[4]} for r in rows]


# ─────────────────────── 회차 ───────────────────────
_CYCLE_COLS = ("id,title,period_ym,status,due_at,template_id,created_by,"
               "created_at,published_at,closed_at")


def _row_to_cycle(r) -> dict:
    return {"id": r[0], "title": r[1], "period_ym": r[2], "status": r[3],
            "due_at": r[4], "template_id": r[5], "created_by": r[6],
            "created_at": r[7], "published_at": r[8], "closed_at": r[9]}


def create_cycle(period_ym: str, title: Optional[str], created_by: str,
                 due_at: Optional[float] = None) -> dict:
    # 기간 형식은 여기서 막는다. 통과시키면 배부 시점에 전 임원분이 한꺼번에 깨진다.
    year, month = template_seed.parse_period(period_ym)
    title = (title or "").strip() or "%d년 %d월 임원회의" % (year, month)

    c = _conn()
    try:
        dup = c.execute("SELECT id FROM Cycles WHERE period_ym=? AND status<>'closed'",
                        (period_ym,)).fetchone()
        if dup:
            # 같은 달에 회차가 두 개면 임원이 어디에 써야 할지 알 수 없다.
            raise CycleError("%s 회차가 이미 열려 있습니다." % period_ym)
    finally:
        c.close()

    tpl = ensure_default_template(created_by)
    cid = _new_id("c")
    c = _conn()
    try:
        c.execute(
            "INSERT INTO Cycles(id,title,period_ym,status,due_at,template_id,created_by,created_at) "
            "VALUES(?,?,?,'draft',?,?,?,?)",
            (cid, title, period_ym, due_at, tpl["id"], created_by, _now()),
        )
        c.commit()
    finally:
        c.close()
    return get_cycle(cid)                       # type: ignore[return-value]


def get_cycle(cid: str) -> Optional[dict]:
    c = _conn()
    try:
        r = c.execute("SELECT %s FROM Cycles WHERE id=?" % _CYCLE_COLS, (cid,)).fetchone()
    finally:
        c.close()
    return _row_to_cycle(r) if r else None


def list_cycles() -> list[dict]:
    c = _conn()
    try:
        rows = c.execute("SELECT %s FROM Cycles ORDER BY period_ym DESC" % _CYCLE_COLS).fetchall()
    finally:
        c.close()
    return [_row_to_cycle(r) for r in rows]


def set_cycle_status(cid: str, status: str) -> dict:
    if status not in CYCLE_STATUSES:
        raise CycleError("알 수 없는 회차 상태입니다: %s" % status)
    cur = get_cycle(cid)
    if not cur:
        raise CycleError("회차를 찾을 수 없습니다.")
    if status == cur["status"]:
        return cur
    if status not in _ALLOWED_NEXT[cur["status"]]:
        raise CycleError("'%s' 상태에서 '%s' 로는 바꿀 수 없습니다." % (cur["status"], status))

    now = _now()
    c = _conn()
    try:
        c.execute("UPDATE Cycles SET status=? WHERE id=?", (status, cid))
        if status == "published":
            c.execute("UPDATE Cycles SET published_at=? WHERE id=?", (now, cid))
        if status == "closed":
            c.execute("UPDATE Cycles SET closed_at=? WHERE id=?", (now, cid))
        c.commit()
    finally:
        c.close()
    return get_cycle(cid)                       # type: ignore[return-value]


# ─────────────────────── 배부 ───────────────────────
def distribute(cid: str, recipients: list[dict]) -> dict:
    """대상자별로 템플릿 1장을 만들어 배부한다.

    `recipients`: [{"id": 사용자id, "name": 이름, "dept": 부서}, ...]

    **멱등하다.** 이미 배부받은 사람은 건너뛴다 — 두 번 눌러도 두 장이 생기지 않는다.
    회차 개설 화면에서 버튼을 두 번 누르는 일은 반드시 일어난다.
    """
    cycle = get_cycle(cid)
    if not cycle:
        raise CycleError("회차를 찾을 수 없습니다.")
    if cycle["status"] == "closed":
        raise CycleError("마감된 회차에는 배부할 수 없습니다.")
    if not recipients:
        raise CycleError("배부 대상자가 없습니다.")

    existing = {p["owner_id"] for p in list_cycle_projects(cid)}
    due_label = ""
    if cycle["due_at"]:
        due_label = time.strftime("%m/%d", time.localtime(cycle["due_at"] / 1000))

    created, skipped = [], []
    for person in recipients:
        uid = person.get("id")
        if not uid:
            continue
        if uid in existing:
            skipped.append(uid)
            continue
        state = template_seed.build_template_state(
            cycle["period_ym"], person.get("name") or "", person.get("dept") or "", due_label,
        )
        proj = projects_store.create_project(
            name=state["title"], state=state, owner_id=uid, cycle_id=cid,
            keep_origin=True,      # 「처음부터 다시」가 돌아갈 곳
        )
        created.append({"project_id": proj["id"], "owner_id": uid,
                        "name": person.get("name") or ""})
        existing.add(uid)

    # 배부가 끝나면 회차는 '작성' 단계로 넘어간다(아직 draft 였다면).
    if created and cycle["status"] == "draft":
        set_cycle_status(cid, "writing")

    return {"cycle_id": cid, "created": created, "skipped": skipped,
            "created_count": len(created), "skipped_count": len(skipped)}


def list_cycle_projects(cid: str) -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id,name,owner_id,submit_status,updated_at,page_count "
            "FROM Projects WHERE cycle_id=? ORDER BY updated_at DESC", (cid,)
        ).fetchall()
    finally:
        c.close()
    return [{"id": r[0], "name": r[1], "owner_id": r[2],
             "submit_status": r[3] or "draft", "updated_at": r[4],
             "page_count": r[5] or 0} for r in rows]


def set_submit_status(pid: str, status: str) -> dict:
    if status not in SUBMIT_STATUSES:
        raise CycleError("알 수 없는 제출 상태입니다: %s" % status)
    c = _conn()
    try:
        r = c.execute("SELECT cycle_id FROM Projects WHERE id=?", (pid,)).fetchone()
        if not r:
            raise CycleError("이북을 찾을 수 없습니다.")
        c.execute("UPDATE Projects SET submit_status=? WHERE id=?", (status, pid))
        c.commit()
    finally:
        c.close()
    return {"ok": True, "id": pid, "submit_status": status}


# ─────────────────────── 회수 ───────────────────────
def _filled_cells(state: dict) -> int:
    """배부본에서 **사람이 채워 넣은 칸** 수.

    빈 양식으로 배부되므로, 머리글 아래에 글자가 있으면 그건 사람이 쓴 것이다.
    이 숫자를 회수 확인 문구에 그대로 쓴다 — "정말 지울까요?" 만으로는
    무엇이 사라지는지 알 수 없고, 관리자는 감으로 누르게 된다.

    실물 PPT 배부본은 처음부터 내용이 차 있다. 그건 '사람이 쓴 것'이 아니지만
    구분할 방법이 없으므로 **많게 잡는다** — 적게 잡아서 실수로 지우는 쪽이 더 나쁘다.
    """
    from server import template_seed

    n = 0
    for page in (state or {}).get("pages", []) or []:
        for el in page.get("els", []) or []:
            if el.get("type") != "table":
                continue
            locked = template_seed.SLOT_POLICY.get(el.get("slot") or "", {}).get("lockedRows", 0)
            for r, row in enumerate(el.get("cells") or []):
                if r < locked:
                    continue
                for v in row:
                    if isinstance(v, str) and v.strip():
                        n += 1
    return n


def revoke_preview(cid: str) -> dict:
    """회수하면 무엇이 사라지는지 미리 센다(지우지 않는다).

    이 값을 화면에 보여준 뒤에야 회수 버튼이 눌린다.
    """
    from server import comments as comments_store

    rows = list_cycle_projects(cid)
    # 배부를 무르면 그 자료에 달린 **검토 의견도 함께 사라진다.**
    # 이걸 안 세어 주면, 리뷰어가 쓴 지적이 아무 말 없이 없어지고
    # 무른 사람은 자기가 무엇을 지웠는지도 모른다. 20명분을 한 번에 센다.
    cmt = comments_store.counts_for([r["id"] for r in rows], include_resolved=True)
    items = []
    for r in rows:
        full = projects_store.get_project(r["id"])
        state = (full or {}).get("state") or {}
        items.append({
            "project_id": r["id"],
            "owner_id": r["owner_id"],
            "name": r["name"],
            "submit_status": r["submit_status"],
            "updated_at": r["updated_at"],
            "filled_cells": _filled_cells(state),
            "comments": cmt.get(r["id"], 0),
            "page_count": len(state.get("pages") or []),
        })
    return {
        "cycle_id": cid,
        "items": items,
        "total": len(items),
        "with_content": sum(1 for x in items if x["filled_cells"] > 0),
        "comments": sum(x["comments"] for x in items),
        "submitted": sum(1 for x in items if x["submit_status"] in ("submitted", "approved")),
    }


def revoke(cid: str, project_ids: Optional[list[str]] = None) -> dict:
    """배부본을 회수한다. `project_ids` 가 없으면 이 회차 전체.

    **다른 회차의 이북은 절대 지우지 않는다.** 회차에 속한 것만 대상으로 거른다 —
    바깥에서 넘어온 id 를 그대로 지우면, 실수 한 번에 남의 문서가 사라진다.
    """
    cycle = get_cycle(cid)
    if not cycle:
        raise CycleError("회차를 찾을 수 없습니다.")
    if cycle["status"] == "closed":
        raise CycleError("마감된 회차는 회수할 수 없습니다.")

    mine = {p["id"]: p for p in list_cycle_projects(cid)}
    if project_ids is None:
        targets = list(mine.values())
    else:
        unknown = [x for x in project_ids if x not in mine]
        if unknown:
            raise CycleError("이 회차의 배부본이 아닙니다: %d건" % len(unknown))
        targets = [mine[x] for x in project_ids]
    if not targets:
        raise CycleError("회수할 배부본이 없습니다.")

    removed = []
    for p in targets:
        full = projects_store.get_project(p["id"])
        state = (full or {}).get("state") or {}
        removed.append({
            "project_id": p["id"], "owner_id": p["owner_id"], "name": p["name"],
            "filled_cells": _filled_cells(state), "submit_status": p["submit_status"],
        })
        projects_store.delete_project(p["id"])

    # 전부 회수했고 아직 '작성' 단계였다면 '준비' 로 되돌린다.
    # 배부본이 하나도 없는데 '작성중' 이라고 떠 있으면 관리자가 상태를 못 믿는다.
    left = list_cycle_projects(cid)
    if not left and cycle["status"] == "writing":
        c = _conn()
        try:
            c.execute("UPDATE Cycles SET status='draft' WHERE id=?", (cid,))
            c.commit()
        finally:
            c.close()

    return {
        "cycle_id": cid,
        "removed": removed,
        "removed_count": len(removed),
        "remaining": len(left),
        "lost_cells": sum(x["filled_cells"] for x in removed),
    }


def cycle_progress(cid: str) -> dict:
    """회차 현황 요약 — 관리자 화면에서 '누가 아직 안 냈는지'를 한눈에."""
    rows = list_cycle_projects(cid)
    counts = {s: 0 for s in SUBMIT_STATUSES}
    for p in rows:
        counts[p["submit_status"]] = counts.get(p["submit_status"], 0) + 1
    return {"total": len(rows), "counts": counts,
            "submitted": counts["submitted"] + counts["approved"]}
