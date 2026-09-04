"""팀 공유 — 승인본을 팀에게 보여 주는 곳 (P6).

**여기서 보는 것은 `Projects` 가 아니라 `Approvals.snapshot` 이다.** 이 한 줄이
이 파일의 전부이고, 전환계획 §3.1 이 말하는 「승인본과 작업본의 분리」다.

    Projects.state            ← 작성자가 지금 고치고 있는 살아 있는 문서. 요동친다.
    Approvals[승인].snapshot   ← 제출 순간에 얼어붙은 승인본. 팀이 보는 것.

작업본을 그대로 보여 줬다면 「어제 승인한 것과 다른 게 떠 있다」가 매일 일어난다.
승인은 **그때 그 문서**에 대한 승인이지 그 문서 이름표에 대한 승인이 아니다.

── 가시성은 이 파일이 정하지 않는다 ────────────────────────
`permissions.can_see_approval()` 하나만 통과시킨다. 결재 API 도 같은 함수를 쓴다 —
두 곳이 각자 규칙을 적으면 한쪽에서만 보이는 자료가 생긴다.

그래서 **D23(이전 팀에서는 본인 것만)을 위한 코드가 여기 한 줄도 없다.**
`can_see_approval` 이 「같은 팀 승인본」을 *지금* 소속으로 판정하므로, 지금 내 팀이
아닌 팀의 자료가 이 목록에 남아 있을 수 있는 경로는 「내가 낸 것」밖에 없다.
규칙이 맞으면 결과가 저절로 따라오는 자리다 — 따로 거르면 규칙이 두 벌이 된다.

── 묶는 순서: 팀 / 작성자 / 월 (D22) ──────────────────────
월은 **승인 시각**(`decided_at`)으로 묶는다. 제출 시각이 아니다 —
9월 30일에 내고 10월 2일에 승인됐다면 그 자료가 팀에 존재하게 된 것은 10월이다.

한 자료(project)는 **최신 승인본 1건만** 뜬다. 3차까지 승인된 자료가 목록에 셋으로
늘어서면 「어느 게 최신인가」를 사람이 매번 판단해야 한다. 과거 승인본은 사라지지
않는다 — 상세에서 이력으로 연다(`round` 로 몇 번째인지 보인다).
"""
from __future__ import annotations

import time
from typing import Optional

from server import approvals as approvals_store
from server import auth as auth_store
from server import permissions as perm
from server import teams as teams_store

# 팀 묶음 순서. 「지금 내 팀」이 맨 위다 — 매일 여는 곳이 스크롤 아래 있으면 안 된다.
CURRENT = "current"   # 지금 내가 속한 팀
PAST = "past"         # 내가 낸 자료가 남아 있는 팀 = 내가 있었던 팀 (읽기 전용, D19)
OTHER = "other"       # 내 팀이 아니고 내 자료도 없다 — 관리자만 여기에 닿는다

RELATIONS = (CURRENT, PAST, OTHER)
RELATION_LABEL = {CURRENT: "현재", PAST: "이전", OTHER: "다른 팀"}
_ORDER = {CURRENT: 0, PAST: 1, OTHER: 2}


def _ym(ts: Optional[float]) -> str:
    """승인 시각의 `YYYY-MM`. 시각이 없으면 빈 문자열 — 없는 달을 지어내지 않는다."""
    if not ts:
        return ""
    return time.strftime("%Y-%m", time.localtime(ts))


def _latest_per_project(items: list[dict]) -> list[dict]:
    """자료 하나당 최신 승인본 하나. 같은 시각이면 `round` 가 큰 쪽이 최신이다
    (초 단위로 같은 순간에 두 건이 승인될 수 있고, 그때 순서를 시각이 못 가린다)."""
    best: dict[str, dict] = {}
    for a in items:
        key = a.get("project_id") or a["id"]
        cur = best.get(key)
        if cur is None or (a.get("decided_at") or 0, a.get("round") or 0) > \
                (cur.get("decided_at") or 0, cur.get("round") or 0):
            best[key] = a
    return list(best.values())


def _relation(team_id: str, actor: perm.Actor, items: list[dict]) -> str:
    """이 팀이 나에게 무엇인가. **화면에 글자로 붙는다**(D19) — 색으로만 구분하지 않는다.

    「이전」과 「다른 팀」을 가르는 근거는 *내가 낸 자료가 여기 있는가* 하나뿐이다.
    팀 소속 이력을 따로 저장하지 않으므로 그것 말고는 알 방법이 없고,
    없는 근거로 「이전 팀입니다」라고 쓰면 그건 추측을 사실처럼 적는 것이다.
    """
    if team_id in actor.team_ids:
        return CURRENT
    if any(a.get("requester") == actor.id for a in items):
        return PAST
    return OTHER


def library(actor: Optional[perm.Actor]) -> dict:
    """팀 공유 화면 한 판. 팀 → 작성자 → 월 → 자료.

    승인본만 읽는다(`status='approved'`). 대기·반려·회수는 낸 사람과 결재자 사이의
    일이고, 팀은 **결과만** 본다(D6 「승인이 곧 공유」).
    """
    if actor is None or not actor.is_active:
        return {"teams": []}

    approved = [a for a in approvals_store.list_approvals(status="approved")
                if perm.can_see_approval(actor, a)]

    # 이름은 화면이 붙인다 — 저장에는 id 만 있다(개명해도 이력이 안 흐려지도록).
    # 한 번에 모아 붙인다: 건마다 되물으면 20건에 요청이 21번 나간다.
    uids = {a.get("requester") for a in approved if a.get("requester")}
    users = {u: (auth_store.get_user(u) or {}) for u in uids}

    by_team: dict[str, list[dict]] = {}
    for a in approved:
        by_team.setdefault(a.get("team_id") or "", []).append(a)

    teams_out = []
    for tid, rows in by_team.items():
        t = teams_store.get_team(tid) if tid else None
        rel = _relation(tid, actor, rows)

        by_author: dict[str, list[dict]] = {}
        for a in _latest_per_project(rows):
            by_author.setdefault(a.get("requester") or "", []).append(a)

        authors = []
        for uid, mine in by_author.items():
            by_month: dict[str, list[dict]] = {}
            for a in mine:
                by_month.setdefault(_ym(a.get("decided_at")), []).append(a)
            months = [
                {"ym": ym,
                 "items": sorted(v, key=lambda x: -(x.get("decided_at") or 0))}
                for ym, v in by_month.items()
            ]
            months.sort(key=lambda m: m["ym"], reverse=True)   # 최근 달이 위
            u = users.get(uid) or {}
            authors.append({
                "id": uid,
                "name": u.get("name") or "(탈퇴한 사용자)",
                "dept": u.get("dept") or "",
                "is_me": uid == actor.id,
                "count": len(mine),
                "months": months,
            })
        # 본인을 맨 위에, 나머지는 가나다. 제 자료를 찾는 일이 가장 잦다.
        authors.sort(key=lambda x: (not x["is_me"], x["name"]))

        teams_out.append({
            "id": tid,
            "name": (t or {}).get("name") or "(없어진 팀)",
            "relation": rel,
            # 이전 팀 자료는 읽기 전용이다(D19). 서버는 애초에 쓰기 경로를 안 주지만,
            # 화면이 「고치기」 버튼을 띄울지 말지를 여기서 알아야 한다.
            "readonly": rel != CURRENT,
            "count": sum(a["count"] for a in authors),
            "authors": authors,
        })

    teams_out.sort(key=lambda t: (_ORDER[t["relation"]], t["name"]))
    return {"teams": teams_out}


def visible_approval(actor: Optional[perm.Actor], aid: str) -> Optional[dict]:
    """승인본 한 건을 스냅샷째 연다. 못 보는 건이면 **None** —
    부르는 쪽이 404 를 준다(403 은 「그 id 는 있다」를 확인해 준다).

    판정은 여기서도 `can_see_approval` 하나다. 「팀 공유에서 열었으니 봐도 된다」는
    화면의 사정이지 권한의 근거가 아니다 — id 만 알면 화면 없이도 부를 수 있다.
    """
    a = approvals_store.get_approval(aid)
    if not a or not perm.can_see_approval(actor, a):
        return None
    if not perm.can_see_approval_thread(actor, a):
        # **결과물은 팀의 것이지만 대화는 아니다.** 「3쪽 수치가 작년 것입니다」 같은
        # 지적이 팀 전체에 흐르면 사람들이 결재함에서 솔직하게 지적하기를 그만둔다.
        # 지운 척하지 않고 **몇 마디 오갔는지는 남긴다** — 감춘 사실 자체는 감추지 않는다.
        a["comment_count"] = len(a.get("comments") or [])
        a["comments"] = []
        a["comments_hidden"] = True
    return a


def history(actor: Optional[perm.Actor], project_id: str) -> list[dict]:
    """자료 하나의 승인 이력. 목록에는 최신 1건만 뜨므로, 과거 회차는 여기서 연다.

    스냅샷은 붙이지 않는다 — 이력 열 때마다 문서 전체가 여러 벌 딸려 나온다.
    한 건을 실제로 볼 때 `visible_approval` 로 따로 가져간다.
    """
    if actor is None or not actor.is_active or not project_id:
        return []
    rows = [a for a in approvals_store.list_approvals(project_id=project_id)
            if a.get("status") == "approved" and perm.can_see_approval(actor, a)]
    return sorted(rows, key=lambda a: -(a.get("decided_at") or 0))
