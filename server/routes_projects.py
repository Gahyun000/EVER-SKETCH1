"""이북(프로젝트)·메모·버전 라우터 — 권한 가드 적용본.

원래 app.py 안에 인라인으로 있던 라우트를 그대로 옮기고 가드를 물렸다.
옮긴 이유는 **테스트 가능성**이다. app.py 는 chat·deck·pptx 등 무거운 의존성을 끌어오는데,
그 상태로는 권한 회귀 테스트를 돌릴 수 없다. 여기 있으면 라우터만 올려 실제 코드 경로를 검증한다.

라우트 경로·응답 형태는 바뀌지 않았다(프런트 무수정).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import approvals as approvals_store
from server import auth as auth_store
from server import comments as comments_store
from server import doc_state
from server import folders as folders_store
from server import notes as notes_store
from server import permissions as perm
from server import projects as projects_store
from server import template_seed
from server.authdeps import require_action, require_active, require_project

router = APIRouter(tags=["projects"])


class ProjectCreateIn(BaseModel):
    name: Optional[str] = None
    state: Optional[dict] = None
    folder_id: Optional[str] = None


class TemplateProjectIn(BaseModel):
    period_ym: str
    folder_id: Optional[str] = None


class ProjectSaveIn(BaseModel):
    state: dict
    name: Optional[str] = None


class ProjectRenameIn(BaseModel):
    name: str


class VersionSaveIn(BaseModel):
    state: dict
    label: Optional[str] = None
    pinned: bool = False
    auto: bool = True


class VersionPatchIn(BaseModel):
    label: Optional[str] = None
    pinned: Optional[bool] = None


class CommentIn(BaseModel):
    body: str
    page_id: int = 1
    el_id: Optional[int] = None       # 없으면 페이지 전체에 붙는다
    cell: Optional[str] = None        # 'r_c' — 표의 한 칸
    reply_to: Optional[str] = None


class ResolveIn(BaseModel):
    resolved: bool = True


class ShiftIn(BaseModel):
    el_id: int
    axis: str            # 'row' | 'col'
    at: int
    delta: int           # +1 추가 · -1 삭제
    on_lost: str = "keep"   # 가리킬 곳이 사라진 지적을 남길지 지울지


class FixedIn(BaseModel):
    fixed: bool = True
    body: Optional[str] = None      # 비우면 「고쳤습니다.」 한 줄이 달린다


# ─────────────────────── 프로젝트 ───────────────────────
def _own_folder_or_404(fid: Optional[str], user: dict) -> None:
    """폴더를 지정했으면 **내 것이어야 한다.** 남의 폴더 id 로는 아무것도 못 한다.
    없음과 남의 것을 똑같이 404 로 뭉갠다(routes_folders 와 같은 이유)."""
    if not fid:
        return
    f = folders_store.get_folder(fid)
    if not f or not perm.decide(auth_store.actor_of(user), perm.FOLDER_MANAGE,
                                perm.Resource(owner_id=f["owner_id"])):
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")


@router.get("/api/projects")
def projects_list(folder: Optional[str] = None, all: bool = True,
                  user: dict = Depends(require_active)):
    """`visibility`(누가 볼 수 있나)와 `folder`(어느 서랍인가)를 **AND 로** 묶는다.

    폴더는 권한과 무관하다(D20) — 남의 폴더에 내 자료를 넣어도 보이는 사람은 그대로다.
    그래서 두 조건은 서로를 넓히지 않고 좁히기만 한다.

      all=True (기본)   서랍을 가리지 않는다 — 예전 호출부가 그대로 돈다
      all=False         folder 가 없으면 최상위, 있으면 그 폴더 안
    """
    _own_folder_or_404(folder, user)
    vis = perm.visible_project_filter(auth_store.actor_of(user))
    return {"projects": projects_store.list_projects(
        vis, user["id"], folder_id=folder, all_folders=all)}


@router.post("/api/projects")
def projects_create(req: ProjectCreateIn, user: dict = Depends(require_active)):
    # 새 이북의 소유자는 만든 사람. owner 없는 프로젝트가 다시 생기지 않게 한다.
    require_action(user, perm.WRITE, perm.Resource(owner_id=user["id"]))
    _own_folder_or_404(req.folder_id, user)
    return projects_store.create_project(req.name, req.state, owner_id=user["id"],
                                         folder_id=req.folder_id)


@router.post("/api/projects/from-template")
def projects_create_from_template(req: TemplateProjectIn, user: dict = Depends(require_active)):
    """표준 양식 1장으로 새 이북을 시작한다.

    **이 라우트가 없으면 표준 양식은 죽는다.** 지금까지 표준 양식이 세상에 나오는
    길은 배부 API 하나뿐이었고, 그 API 는 회차 id 를 요구했다.
    회차를 걷어내는 순간 파일은 멀쩡한데 아무도 못 쓰는 상태가 된다.

    양식 자체는 `template_seed` 가 만든다. 여기서 정하는 것은 **누구 것인가** 뿐이다.

    권한은 `TEMPLATE_USE` 다 — **P6 에서 `WRITE` 와 갈라졌다.** P1~P5 동안 둘은
    언제나 같은 답을 냈다(열람자는 아무것도 못 썼다). D13 이 열람자에게 개인 스케치를
    열어 준 지금, 열람자는 빈 슬라이드는 만들지만(WRITE=O) 회사 서식은 못 쓴다 —
    서식은 결재를 타고 팀에 나갈 문서의 틀인데 열람자는 제출을 못 하기 때문이다.
    """
    require_action(user, perm.TEMPLATE_USE, perm.Resource(owner_id=user["id"]))
    try:
        state = template_seed.build_template_state(
            req.period_ym, user.get("name") or "", user.get("dept") or "")
    except template_seed.TemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _own_folder_or_404(req.folder_id, user)
    return projects_store.create_project(state["title"], state, owner_id=user["id"],
                                         folder_id=req.folder_id)


@router.get("/api/projects/{pid}")
def projects_get(pid: str, user: dict = Depends(require_active)):
    res = require_project(user, pid, perm.READ)
    p = projects_store.get_project(pid)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
    # **무엇을 할 수 있는지는 서버가 말한다.**
    # 화면이 역할을 보고 다시 계산하면 규칙이 두 곳에 생기고 반드시 어긋난다
    # (그때 사용자에게는 '눌리는데 403' 으로 보인다).
    actor = auth_store.actor_of(user)
    st = approvals_store.state_of(pid)
    p["access"] = {
        "mine": res.owner_id == user["id"],
        "can_write": perm.decide(actor, perm.WRITE, res),
        "can_comment": perm.decide(actor, perm.COMMENT_WRITE, res),
        # **왜 잠겼는지까지 말한다**(P7). `can_write: false` 만 주면 화면은
        # 「권한이 없습니다」밖에 못 쓰고, 사람은 제 자료가 왜 안 고쳐지는지 모른다.
        # 「승인됨 — 고치려면 수정 요청을 내 주세요」라고 쓰려면 상태가 필요하다.
        "state": st,
        "state_label": doc_state.label(st),
        "locked": doc_state.is_locked(st),
        "can_submit": perm.decide(actor, perm.SUBMIT, res),
        "can_request_revision": (perm.decide(actor, perm.REVISION_REQUEST, res)
                                 and doc_state.can_request_revision(st)),
    }
    return p


@router.put("/api/projects/{pid}")
def projects_save(pid: str, req: ProjectSaveIn, user: dict = Depends(require_active)):
    require_project(user, pid, perm.WRITE)
    return projects_store.save_project(pid, req.state, req.name)


@router.patch("/api/projects/{pid}")
def projects_rename(pid: str, req: ProjectRenameIn, user: dict = Depends(require_active)):
    require_project(user, pid, perm.WRITE)
    return projects_store.rename_project(pid, req.name)


@router.delete("/api/projects/{pid}")
def projects_delete(pid: str, user: dict = Depends(require_active)):
    # 삭제는 관리자만. 작성자는 본인 것도 지우지 못한다(회차 자료 유실 방지).
    require_project(user, pid, perm.DELETE)
    meta = projects_store.get_project_meta(pid)
    result = projects_store.delete_project(pid)
    # 되돌릴 수 없는 작업이므로 누가 무엇을 지웠는지 반드시 남긴다(UDS-107 §4).
    auth_store.audit(user["id"], "delete_project", pid,
                     "name=%s owner=%s" % (meta.get("name") if meta else "?",
                                           meta.get("owner_id") if meta else "?"))
    return result


@router.post("/api/projects/{pid}/duplicate")
def projects_duplicate(pid: str, user: dict = Depends(require_active)):
    require_project(user, pid, perm.READ)
    d = projects_store.duplicate_project(pid, owner_id=user["id"])
    if not d:
        raise HTTPException(status_code=404, detail="not found")
    return d


# ─────────────────────── 메모 ───────────────────────
class NoteIn(BaseModel):
    project_id: str
    id: str
    title: str = ""
    blocks: list = []
    pinned: bool = False
    sort: float = 0


@router.get("/api/notes")
def notes_list(project_id: str, user: dict = Depends(require_active)):
    # 열람자는 메모의 존재 자체를 알 수 없다 — 빈 목록이 아니라 403으로 막는다.
    require_project(user, project_id, perm.COMMENT_READ)
    return {"notes": notes_store.list_notes(project_id)}


@router.post("/api/notes")
def notes_upsert(req: NoteIn, user: dict = Depends(require_active)):
    require_project(user, req.project_id, perm.COMMENT_WRITE)
    return notes_store.upsert_note(req.project_id, req.id, req.title, req.blocks,
                                   req.pinned, req.sort)


@router.delete("/api/notes/{nid}")
def notes_delete(nid: str, user: dict = Depends(require_active)):
    # 메모 id 만으로는 어느 이북 것인지 모른다 → 소속을 먼저 찾아 그 이북 기준으로 판정한다.
    pid = notes_store.project_of_note(nid)
    if not pid:
        raise HTTPException(status_code=404, detail="not found")
    require_project(user, pid, perm.COMMENT_WRITE)
    return notes_store.delete_note(nid)


# ─────────────────────── 버전 ───────────────────────
def _require_version_in_project(pid: str, vid: str) -> None:
    """'내 pid + 남의 vid' 조합 차단.

    기존 라우터는 pid 를 무시하고 vid 로만 조회했다. 권한을 pid 로만 검사하면
    자기 프로젝트 id를 붙여 남의 버전을 읽거나 지울 수 있다.
    """
    if not projects_store.version_belongs_to(vid, pid):
        raise HTTPException(status_code=404, detail="not found")


@router.get("/api/projects/{pid}/versions")
def project_versions(pid: str, user: dict = Depends(require_active)):
    require_project(user, pid, perm.READ)
    return {"versions": projects_store.list_versions(pid)}


@router.post("/api/projects/{pid}/versions")
def project_version_save(pid: str, req: VersionSaveIn, user: dict = Depends(require_active)):
    require_project(user, pid, perm.WRITE)
    v = projects_store.save_version(pid, req.state, req.label, req.pinned, req.auto)
    return {"ok": True, "version": v}


@router.get("/api/projects/{pid}/versions/{vid}")
def project_version_get(pid: str, vid: str, user: dict = Depends(require_active)):
    require_project(user, pid, perm.READ)
    _require_version_in_project(pid, vid)
    v = projects_store.get_version(vid)
    if not v:
        raise HTTPException(status_code=404, detail="not found")
    return v


@router.patch("/api/projects/{pid}/versions/{vid}")
def project_version_patch(pid: str, vid: str, req: VersionPatchIn,
                          user: dict = Depends(require_active)):
    require_project(user, pid, perm.WRITE)
    _require_version_in_project(pid, vid)
    patch = {}
    if req.label is not None:
        patch["label"] = req.label
    if req.pinned is not None:
        patch["pinned"] = req.pinned
    return projects_store.update_version(vid, patch)


@router.delete("/api/projects/{pid}/versions/{vid}")
def project_version_delete(pid: str, vid: str, user: dict = Depends(require_active)):
    # 버전 삭제도 삭제다 — 관리자만.
    require_project(user, pid, perm.DELETE)
    _require_version_in_project(pid, vid)
    result = projects_store.delete_version(vid)
    auth_store.audit(user["id"], "delete_version", vid, "project=%s" % pid)
    return result


# ─────────────────────── 앵커 메모 ───────────────────────
# 의견은 **가리키는 대상과 함께** 있어야 한 번에 통한다.
# 권한은 프로젝트 단위로 판정한다 — 남의 배부본에 다는 것은 관리자만,
# 작성자는 자기 것에만, 열람자는 아예 못 단다(permissions.decide).
@router.get("/api/projects/{pid}/comments")
def comments_list(pid: str, user: dict = Depends(require_active)):
    require_project(user, pid, perm.COMMENT_READ)
    return {"comments": comments_store.list_for_project(pid)}


@router.post("/api/projects/{pid}/comments")
def comments_add(pid: str, req: CommentIn, user: dict = Depends(require_active)):
    require_project(user, pid, perm.COMMENT_WRITE)
    try:
        item = comments_store.add(
            pid, user["id"], req.body, req.page_id, req.el_id, req.cell, req.reply_to)
    except comments_store.CommentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "comment_add", pid,
                     "page=%s el=%s cell=%s" % (req.page_id, req.el_id, req.cell))
    return {"ok": True, "comment": item}


def _comment_or_404(cid: str) -> dict:
    item = comments_store.get(cid)
    if not item:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다.")
    return item


@router.post("/api/projects/{pid}/comments/shift")
def comments_shift(pid: str, req: ShiftIn, user: dict = Depends(require_active)):
    """표에서 행·열이 늘거나 줄었을 때 앵커를 따라 옮긴다.

    이걸 안 하면 지적은 그대로인데 **엉뚱한 칸을 가리키게** 된다 —
    그리고 아무도 그 사실을 모른다. 문서를 고칠 수 있는 사람만 부를 수 있다
    (문서가 바뀌었으니 앵커도 따라가는 것이므로 판정 기준은 WRITE 다).
    """
    require_project(user, pid, perm.WRITE)
    try:
        out = comments_store.shift_anchors(pid, req.el_id, req.axis, req.at, req.delta,
                                           req.on_lost)
    except comments_store.CommentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if out["lost"]:
        auth_store.audit(user["id"], "comment_anchor_lost", pid,
                         "%d건 (%s)" % (out["lost"], req.on_lost))
    return {"ok": True, **out}


@router.post("/api/comments/{cid}/resolve")
def comment_resolve(cid: str, req: ResolveIn, user: dict = Depends(require_active)):
    """해결 표시 — 스레드 단위. **지적한 사람(과 관리자)만.**

    담당자가 자기에게 온 지적을 스스로 닫게 두면, "고쳤다" 와 "정말 고쳤다" 가
    구분되지 않는다. 그러면 발행 직전의 '미해결 0건' 이 아무것도 보장하지 못한다.
    담당자 쪽 손은 「고쳤습니다」(아래 comment_fixed)다.
    """
    item = _comment_or_404(cid)
    root = comments_store.get(item["thread_id"]) or item
    res = require_project(user, item["project_id"], perm.READ)
    require_action(user, perm.COMMENT_RESOLVE,
                   perm.Resource(owner_id=res.owner_id, published=res.published,
                                 comment_author_id=root["author_id"]))
    try:
        out = comments_store.set_resolved(cid, req.resolved, user["id"])
    except comments_store.CommentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # 관리자가 **남 대신** 닫은 것은 따로 알아볼 수 있어야 한다.
    who = "" if root["author_id"] == user["id"] else " (대신 %s)" % root["author_id"]
    auth_store.audit(user["id"], "comment_resolve", item["project_id"],
                     "%s → %s%s" % (cid, "해결" if req.resolved else "다시 열기", who))
    return {"ok": True, "comment": out}


@router.post("/api/comments/{cid}/fixed")
def comment_fixed(cid: str, req: FixedIn, user: dict = Depends(require_active)):
    """「고쳤습니다」 — 지적받은 쪽이 답하는 표시. **닫는 것이 아니다.**

    지적한 사람이 확인하고 닫을 때까지 미해결로 남는다.
    표시와 함께 답글을 한 줄 남긴다 — 상태만 바뀌면 지적한 사람은 목록에서
    무엇이 달라졌는지 알 수 없다.
    """
    item = _comment_or_404(cid)
    require_project(user, item["project_id"], perm.COMMENT_FIX)
    try:
        out = comments_store.set_fixed(cid, req.fixed, user["id"], req.body)
    except comments_store.CommentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "comment_fixed", item["project_id"],
                     "%s → %s" % (cid, "고침" if req.fixed else "고침 취소"))
    return {"ok": True, "comment": out}


@router.delete("/api/comments/{cid}")
def comment_delete(cid: str, user: dict = Depends(require_active)):
    """지우는 것은 **쓴 사람**과 관리자만.

    읽고 쓸 수 있다고 남의 지적을 지울 수 있으면, 반려 사유가 조용히 사라진다.
    """
    item = _comment_or_404(cid)
    require_project(user, item["project_id"], perm.COMMENT_READ)
    if item["author_id"] != user["id"]:
        require_action(user, perm.COMMENT_RESOLVE)
    try:
        out = comments_store.remove(cid)
    except comments_store.CommentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "comment_delete", item["project_id"], cid)
    return out
