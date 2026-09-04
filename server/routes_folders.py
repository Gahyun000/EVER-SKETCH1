"""개인 폴더 API.

**소유자만.** 관리자도 남의 폴더는 못 본다 — 판정은 `permissions.FOLDER_MANAGE` 하나가
하고(관리자 전면 허용보다 먼저 걸린다), 이 파일은 그걸 HTTP 로 옮길 뿐이다.

없는 폴더와 남의 폴더에 **똑같이 404** 를 준다. 403 을 주면 「그 id 는 있다」가
확인되어 남의 폴더 존재가 새어 나간다(`authdeps.require_project` 와 같은 이유).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import auth as auth_store
from server import folders as folders_store
from server import permissions as perm
from server.authdeps import require_active

router = APIRouter(prefix="/api/folders", tags=["folders"])


def _mine(fid: str, user: dict) -> dict:
    """내 폴더면 돌려주고, 아니면 404. **없음과 남의 것을 구분해서 알려주지 않는다.**"""
    f = folders_store.get_folder(fid)
    if not f or not perm.decide(auth_store.actor_of(user), perm.FOLDER_MANAGE,
                                perm.Resource(owner_id=f["owner_id"])):
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
    return f


@router.get("")
def list_folders(parent: Optional[str] = None, user: dict = Depends(require_active)):
    """한 단만. 경로(브레드크럼)를 함께 준다 — 화면이 되묻지 않게."""
    if parent:
        _mine(parent, user)
    return {
        "folders": folders_store.list_folders(user["id"], parent),
        "path": folders_store.folder_path(parent),
        "max_depth": folders_store.MAX_DEPTH,
    }


class FolderIn(BaseModel):
    name: str
    parent_id: Optional[str] = None


@router.post("")
def create_folder(req: FolderIn, user: dict = Depends(require_active)):
    if req.parent_id:
        _mine(req.parent_id, user)
    try:
        f = folders_store.create_folder(req.name, user["id"], req.parent_id)
    except folders_store.FolderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "folder_create", f["id"], f["name"])
    return {"ok": True, "folder": f}


class RenameIn(BaseModel):
    name: str


@router.patch("/{fid}")
def rename_folder(fid: str, req: RenameIn, user: dict = Depends(require_active)):
    _mine(fid, user)
    try:
        f = folders_store.rename_folder(fid, req.name)
    except folders_store.FolderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "folder_rename", fid, f["name"])
    return {"ok": True, "folder": f}


class MoveIn(BaseModel):
    parent_id: Optional[str] = None


@router.post("/{fid}/move")
def move_folder(fid: str, req: MoveIn, user: dict = Depends(require_active)):
    _mine(fid, user)
    if req.parent_id:
        # 옮길 자리도 내 것이어야 한다. 안 보면 **남의 트리에 내 폴더를 심을 수 있다.**
        _mine(req.parent_id, user)
    try:
        f = folders_store.move_folder(fid, req.parent_id)
    except folders_store.FolderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "folder_move", fid, "parent=%s" % (req.parent_id or "-"))
    return {"ok": True, "folder": f}


@router.delete("/{fid}")
def delete_folder(fid: str, user: dict = Depends(require_active)):
    f = _mine(fid, user)
    try:
        folders_store.delete_folder(fid)
    except folders_store.FolderError as e:
        # 「비어 있지 않다」는 잘못된 요청이지 없는 폴더가 아니다 — 400 으로 구분한다.
        raise HTTPException(status_code=400, detail=str(e))
    auth_store.audit(user["id"], "folder_delete", fid, f["name"])
    return {"ok": True}
