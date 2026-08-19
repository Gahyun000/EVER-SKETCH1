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

from server import auth as auth_store
from server import comments as comments_store
from server import notes as notes_store
from server import permissions as perm
from server import projects as projects_store
from server.authdeps import require_action, require_active, require_project

router = APIRouter(tags=["projects"])


class ProjectCreateIn(BaseModel):
    name: Optional[str] = None
    state: Optional[dict] = None


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


# ─────────────────────── 프로젝트 ───────────────────────
@router.get("/api/projects")
def projects_list(user: dict = Depends(require_active)):
    vis = perm.visible_project_filter(auth_store.actor_of(user))
    return {"projects": projects_store.list_projects(vis, user["id"])}


@router.post("/api/projects")
def projects_create(req: ProjectCreateIn, user: dict = Depends(require_active)):
    # 새 이북의 소유자는 만든 사람. owner 없는 프로젝트가 다시 생기지 않게 한다.
    require_action(user, perm.WRITE, perm.Resource(owner_id=user["id"]))
    return projects_store.create_project(req.name, req.state, owner_id=user["id"])


@router.get("/api/projects/{pid}")
def projects_get(pid: str, user: dict = Depends(require_active)):
    require_project(user, pid, perm.READ)
    p = projects_store.get_project(pid)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
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


@router.post("/api/comments/{cid}/resolve")
def comment_resolve(cid: str, req: ResolveIn, user: dict = Depends(require_active)):
    """해결 표시 — 스레드 단위."""
    item = _comment_or_404(cid)
    require_project(user, item["project_id"], perm.COMMENT_RESOLVE)
    try:
        out = comments_store.set_resolved(cid, req.resolved, user["id"])
    except comments_store.CommentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "comment_resolve", item["project_id"],
                     "%s → %s" % (cid, "해결" if req.resolved else "다시 열기"))
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
