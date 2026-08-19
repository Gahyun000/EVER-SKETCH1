"""회차 라우터 — 개설 · 배부 · 제출.

권한은 전부 `permissions.decide()` 를 거친다. 여기서 레벨을 직접 비교하지 않는다.
"""
from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from server import auth as auth_store
from server import cycle_decks as decks_store
from server import comments as comments_store
from server import cycles as cycles_store
from server import permissions as perm
from server import projects as projects_store
from server import template_seed
from server.authdeps import require_action, require_active, require_project

router = APIRouter(prefix="/api/cycles", tags=["cycles"])


class CycleCreateIn(BaseModel):
    period_ym: str                       # '2026-10'
    title: Optional[str] = None
    due_at: Optional[float] = None       # ms


class StatusIn(BaseModel):
    status: str


class DistributeIn(BaseModel):
    # 비우면 활성 L2 전원. 명시하면 그 사람들에게만.
    user_ids: Optional[list[str]] = None


class SubmitIn(BaseModel):
    status: str                          # draft | submitted | returned | approved


class RevokeIn(BaseModel):
    # 비우면 이 회차 전체 회수. 채우면 그 사람들 것만.
    project_ids: Optional[list[str]] = None
    # 화면에서 '무엇이 사라지는지' 를 본 뒤에만 눌리게 한다.
    # 확인 없이 도는 스크립트가 실수로 전량을 지우는 걸 막는 안전핀이다.
    confirm: bool = False


class SlideAssign(BaseModel):
    slide: int                           # 0부터
    user_id: str


class DeckDistributeIn(BaseModel):
    assignments: list[SlideAssign]
    # 표지·목차처럼 모두에게 앞에 붙일 슬라이드. 없으면 각자 담당분만.
    common: Optional[list[int]] = None


def _visible_cycles(user: dict) -> list[dict]:
    """가시성 규칙은 permissions.visible_cycle_filter 가 정한다. 여기서 레벨을 비교하지 않는다."""
    vis = perm.visible_cycle_filter(auth_store.actor_of(user))
    if vis == "none":
        return []
    rows = cycles_store.list_cycles()
    if vis == "all":
        return rows
    if vis == "mine_or_published":
        # 작성자는 자기가 배부받은 회차 + 발행된 회차
        mine = {p["cycle_id"] for p in projects_store.list_projects("own_or_published", user["id"])
                if p.get("cycle_id")}
        return [c for c in rows if c["id"] in mine or c["status"] == "published"]
    return [c for c in rows if c["status"] == "published"]


@router.get("")
def cycles_list(user: dict = Depends(require_active)):
    return {"cycles": _visible_cycles(user)}


@router.post("")
def cycle_create(req: CycleCreateIn, user: dict = Depends(require_active)):
    require_action(user, perm.CYCLE_MANAGE)
    try:
        cycle = cycles_store.create_cycle(req.period_ym, req.title, user["id"], req.due_at)
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:      # template_seed.TemplateError 등
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "cycle_create", cycle["id"], "period=%s" % req.period_ym)
    return {"ok": True, "cycle": cycle}


@router.get("/{cid}")
def cycle_get(cid: str, user: dict = Depends(require_active)):
    cycle = cycles_store.get_cycle(cid)
    if not cycle:
        raise HTTPException(status_code=404, detail="회차를 찾을 수 없습니다.")
    if cycle["id"] not in {c["id"] for c in _visible_cycles(user)}:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    out = {"cycle": cycle}
    if perm.visible_cycle_filter(auth_store.actor_of(user)) == "all":
        # 관리자만 전체 진행 현황을 본다 — 누가 아직 안 냈는지가 여기 드러난다.
        out["projects"] = cycles_store.list_cycle_projects(cid)
        out["progress"] = cycles_store.cycle_progress(cid)
    else:
        mine = [p for p in cycles_store.list_cycle_projects(cid)
                if p["owner_id"] == user["id"]]
        out["projects"] = mine
    # 미해결 지적 수를 함께 내려준다 — 이게 없으면 반려된 사람이 '무엇을 고쳐야
    # 하는지' 를 알려면 자료를 하나하나 열어봐야 한다. 20명분을 한 번에 센다.
    counts = comments_store.counts_for([p["id"] for p in out["projects"]])
    for p in out["projects"]:
        p["unresolved"] = counts.get(p["id"], 0)
    return out


@router.post("/{cid}/status")
def cycle_status(cid: str, req: StatusIn, user: dict = Depends(require_active)):
    require_action(user, perm.CYCLE_MANAGE)
    try:
        cycle = cycles_store.set_cycle_status(cid, req.status)
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "cycle_status", cid, "→ %s" % req.status)
    return {"ok": True, "cycle": cycle}


@router.post("/{cid}/distribute")
def cycle_distribute(cid: str, req: DistributeIn, user: dict = Depends(require_active)):
    require_action(user, perm.CYCLE_MANAGE)

    if req.user_ids:
        people = [u for u in auth_store.list_users("active") if u["id"] in set(req.user_ids)]
        missing = set(req.user_ids) - {u["id"] for u in people}
        if missing:
            raise HTTPException(status_code=400,
                                detail="승인되지 않았거나 없는 계정이 있습니다: %d건" % len(missing))
    else:
        # 기본 대상 = 활성 작성자 전원. 열람자와 관리자는 작성 대상이 아니다.
        people = [u for u in auth_store.list_users("active") if u["role"] == perm.WRITER]

    if not people:
        raise HTTPException(status_code=400,
                            detail="배부할 작성자가 없습니다. 먼저 가입을 승인해 주세요.")
    try:
        result = cycles_store.distribute(
            cid, [{"id": u["id"], "name": u["name"], "dept": u["dept"]} for u in people])
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "cycle_distribute", cid,
                     "신규 %d · 기존 %d" % (result["created_count"], result["skipped_count"]))
    return {"ok": True, **result}


@router.post("/projects/{pid}/submit")
def project_submit(pid: str, req: SubmitIn, user: dict = Depends(require_active)):
    """제출 상태 전이.

    - 작성자(L2)는 본인 것을 **제출(submitted)** 하거나 작성중으로 되돌릴 수 있다.
    - 반려(returned)·승인(approved)은 검토하는 쪽 판단이므로 L3 만 한다.
    """
    if req.status in ("returned", "approved"):
        require_project(user, pid, perm.WRITE)
        require_action(user, perm.CYCLE_MANAGE)
    else:
        require_project(user, pid, perm.WRITE)
    try:
        out = cycles_store.set_submit_status(pid, req.status)
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "submit_status", pid, "→ %s" % req.status)
    return out


# ─────────────── 실물 PPT 업로드 · 슬라이드별 배부 ───────────────
@router.post("/{cid}/deck")
async def cycle_deck_upload(cid: str, file: UploadFile = File(...),
                            user: dict = Depends(require_active)):
    """실물 PPT 를 회차에 붙인다(관리자만).

    파일을 통째로 메모리에 읽되 **상한보다 1바이트만 더 읽는다.**
    상한 없이 read() 하면 큰 파일 하나로 서버 메모리가 바닥난다(UDS-107 §6).
    """
    from server import pptx_import

    require_action(user, perm.CYCLE_MANAGE)
    limit = pptx_import.MAX_UPLOAD_BYTES
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413,
                            detail="파일이 너무 큽니다 — 최대 %dMB 입니다."
                                   % (limit // (1024 * 1024)))
    try:
        deck = decks_store.save_deck(cid, file.filename or "upload.pptx", data, user["id"])
    except pptx_import.PptxDependencyError as e:
        # 서버가 덜 갖춰진 것이지 올린 파일이 잘못된 게 아니다.
        # 400 으로 답하면 사용자는 멀쩡한 파일을 몇 번씩 다시 저장해 보게 된다.
        raise HTTPException(status_code=503, detail=str(e))
    except pptx_import.PptxImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # 여기까지 온 것은 우리가 예상하지 못한 오류다. 그래도 'HTTP 500' 만
        # 던지지 않는다 — 관리자가 서버 로그를 뒤지지 않고도 신고할 수 있어야 한다.
        auth_store.audit(user["id"], "deck_upload_error", cid, "%s: %s" % (type(e).__name__, e))
        raise HTTPException(
            status_code=500,
            detail="파일을 읽는 중 예상치 못한 오류가 났습니다 (%s). "
                   "관리자에게 이 문구를 알려 주세요." % type(e).__name__)
    auth_store.audit(user["id"], "deck_upload", cid,
                     "%s · %d장" % (deck["filename"], deck["slide_count"]))
    return {"ok": True, "deck": deck}


@router.get("/{cid}/deck")
def cycle_deck_get(cid: str, user: dict = Depends(require_active)):
    require_action(user, perm.CYCLE_MANAGE)
    deck = decks_store.get_deck(cid)
    if not deck:
        raise HTTPException(status_code=404, detail="이 회차에 올린 PPT 가 없습니다.")
    return {"deck": deck}


@router.delete("/{cid}/deck")
def cycle_deck_delete(cid: str, user: dict = Depends(require_active)):
    require_action(user, perm.CYCLE_MANAGE)
    ok = decks_store.delete_deck(cid)
    if not ok:
        raise HTTPException(status_code=404, detail="이 회차에 올린 PPT 가 없습니다.")
    auth_store.audit(user["id"], "deck_delete", cid, "")
    return {"ok": True}


@router.post("/{cid}/deck/distribute")
def cycle_deck_distribute(cid: str, req: DeckDistributeIn,
                          user: dict = Depends(require_active)):
    """슬라이드마다 담당자를 지정해 배부한다(관리자만)."""
    require_action(user, perm.CYCLE_MANAGE)
    wanted = {a.user_id for a in req.assignments}
    people = [u for u in auth_store.list_users("active") if u["id"] in wanted]
    missing = wanted - {u["id"] for u in people}
    if missing:
        raise HTTPException(status_code=400,
                            detail="승인되지 않았거나 없는 계정이 있습니다: %d건" % len(missing))
    try:
        result = decks_store.distribute_slides(
            cid,
            [{"slide": a.slide, "user_id": a.user_id} for a in req.assignments],
            [{"id": u["id"], "name": u["name"], "dept": u["dept"]} for u in people],
            req.common,
        )
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "deck_distribute", cid,
                     "신규 %d · 기존 %d" % (result["created_count"], result["skipped_count"]))
    return {"ok": True, **result}


@router.get("/{cid}/preview")
def cycle_distribute_preview(cid: str, slide: Optional[int] = None,
                             user: dict = Depends(require_active)):
    """배부 전 미리보기 — **실제로 나갈 그 장**을 그대로 돌려준다.

    왜 필요한가
      정본 좌표계가 어긋나 배부본이 종이 밖에 그려진 적이 있다. 테스트는 전부
      통과했는데 화면에는 빈 종이가 갔다 — 아무도 눈으로 확인하지 않았기 때문이다.
      배부는 되돌리기 비싼 조작이므로, 누르기 전에 한 번은 보게 한다.

    slide 를 주면 올린 PPT 의 그 장, 안 주면 표준 양식 한 장.
    """
    require_action(user, perm.CYCLE_MANAGE)
    cycle = cycles_store.get_cycle(cid)
    if not cycle:
        raise HTTPException(status_code=404, detail="회차를 찾을 수 없습니다.")

    if slide is not None:
        pages = decks_store.get_deck_pages(cid)
        if not pages:
            raise HTTPException(status_code=404, detail="이 회차에 올린 PPT 가 없습니다.")
        if not (0 <= slide < len(pages)):
            raise HTTPException(status_code=400,
                                detail="%d번째 슬라이드가 없습니다." % (slide + 1))
        return {"mode": "deck", "page": pages[slide], "slide": slide}

    due_label = ""
    if cycle["due_at"]:
        due_label = time.strftime("%m/%d", time.localtime(cycle["due_at"] / 1000))
    try:
        page = template_seed.build_template_page(
            cycle["period_ym"], user.get("name") or "", user.get("dept") or "", due_label)
    except template_seed.TemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # 이름·부서는 받는 사람마다 달라진다. 미리보기는 누른 사람 기준으로 채워 보여준다.
    return {"mode": "template", "page": page,
            "template_version": template_seed.TEMPLATE_VERSION}


# ─────────────── 배부 회수 ───────────────
@router.get("/{cid}/revoke-preview")
def cycle_revoke_preview(cid: str, user: dict = Depends(require_active)):
    """회수하면 무엇이 사라지는지 미리 보여준다(지우지 않는다).

    목록 API 에 섞지 않은 이유 — 배부본 하나하나의 state 를 열어 세어야 해서
    무겁다. 회차 화면을 열 때마다 20명분 JSON 을 파싱할 이유가 없다.
    """
    require_action(user, perm.CYCLE_MANAGE)
    if not cycles_store.get_cycle(cid):
        raise HTTPException(status_code=404, detail="회차를 찾을 수 없습니다.")
    return cycles_store.revoke_preview(cid)


@router.post("/{cid}/revoke")
def cycle_revoke(cid: str, req: RevokeIn, user: dict = Depends(require_active)):
    """배부본을 회수한다(관리자만). 되돌릴 수 없다."""
    require_action(user, perm.CYCLE_MANAGE)
    if not req.confirm:
        raise HTTPException(status_code=400,
                            detail="회수 전에 사라지는 내용을 확인해 주세요.")
    try:
        result = cycles_store.revoke(cid, req.project_ids)
    except cycles_store.CycleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # 되돌릴 수 없는 조작이다. 누가·언제·무엇을 지웠는지는 반드시 남는다(UDS-107 §5).
    auth_store.audit(
        user["id"], "cycle_revoke", cid,
        "%d건 회수 · 작성 칸 %d개 소실 · 대상 %s"
        % (result["removed_count"], result["lost_cells"],
           ",".join(x["owner_id"] for x in result["removed"])[:200]))
    return {"ok": True, **result}


@router.get("/templates/list")
def templates_list(user: dict = Depends(require_active)):
    require_action(user, perm.TEMPLATE_MANAGE)
    return {"templates": cycles_store.list_templates()}
