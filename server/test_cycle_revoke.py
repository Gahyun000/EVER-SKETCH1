"""배부 회수 — 되돌릴 수 없는 조작이라 가장 조심스럽게 못 박는다.

지키려는 것
  1. 관리자만 회수한다
  2. **이 회차의 배부본만** 지운다 (바깥 id 를 넘겨도 남의 문서가 안 지워진다)
  3. 무엇이 사라지는지 미리 셀 수 있다 (관리자가 감으로 누르지 않게)
  4. 확인 없이는 지워지지 않는다
  5. 지울 땐 딸린 것까지 전부 (버전·메모) — 지웠다고 한 게 남아 있으면 안 된다
  6. 감사로그가 남는다
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "revoke.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import cycles as cycles_store  # noqa: E402
from server import notes as notes_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_cycles import router as cycles_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "revoke.db")


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
    app.include_router(cycles_router)
    return app


@pytest.fixture()
def ctx():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()

    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]

    def mk(login, role, name):
        u = auth_store.signup(login, "password123", name, "사업본부", "writer")
        if role:
            auth_store.approve(admin["id"], u["id"], role)
        return auth_store.get_user(u["id"])

    execs = [mk("exec%d" % i, "writer", "임원%d" % i) for i in (1, 2, 3)]

    def as_user(login, pw="password123"):
        c = TestClient(make_app())
        assert c.post("/api/auth/login", json={"login_id": login, "password": pw}).status_code == 200
        return c

    c = as_user("admin", "adminpw12345")
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})

    return {"admin": admin, "execs": execs, "cid": cid, "as_user": as_user,
            "as_admin": lambda: as_user("admin", "adminpw12345"),
            "anon": TestClient(make_app())}


def _write(pid: str, text: str, r: int = 2, col: int = 1) -> None:
    """배부본에 사람이 글자를 채워 넣은 상태를 만든다."""
    full = projects_store.get_project(pid)
    state = full["state"]
    road = next(e for e in state["pages"][0]["els"]
                if e.get("slot") == "SLOT-A" and e["type"] == "table")
    road["cells"][r][col] = text
    projects_store.save_project(pid, state)


# ══════════ 권한 ══════════
def test_작성자는_회수할_수_없다(ctx):
    r = ctx["as_user"]("exec1").post("/api/cycles/%s/revoke" % ctx["cid"],
                                     json={"confirm": True})
    assert r.status_code == 403


def test_비로그인은_회수할_수_없다(ctx):
    assert ctx["anon"].post("/api/cycles/%s/revoke" % ctx["cid"],
                            json={"confirm": True}).status_code == 401


def test_작성자는_미리보기도_볼_수_없다(ctx):
    """미리보기에는 누가 얼마나 썼는지가 담긴다 — 남의 작업량이 새면 안 된다."""
    assert ctx["as_user"]("exec1").get(
        "/api/cycles/%s/revoke-preview" % ctx["cid"]).status_code == 403


# ══════════ 미리보기 ══════════
def test_미리보기는_지우지_않는다(ctx):
    c = ctx["as_admin"]()
    before = len(cycles_store.list_cycle_projects(ctx["cid"]))
    r = c.get("/api/cycles/%s/revoke-preview" % ctx["cid"])
    assert r.status_code == 200
    assert r.json()["total"] == 3
    assert len(cycles_store.list_cycle_projects(ctx["cid"])) == before


def test_미리보기가_작성한_칸_수를_센다(ctx):
    """'정말 지울까요?' 만으로는 무엇이 사라지는지 알 수 없다."""
    rows = cycles_store.list_cycle_projects(ctx["cid"])
    _write(rows[0]["id"], "회계 고도화")
    _write(rows[0]["id"], "세무 자동화", r=3)

    body = ctx["as_admin"]().get("/api/cycles/%s/revoke-preview" % ctx["cid"]).json()
    mine = [x for x in body["items"] if x["project_id"] == rows[0]["id"]][0]
    others = [x for x in body["items"] if x["project_id"] != rows[0]["id"]]
    assert mine["filled_cells"] == 2
    assert all(x["filled_cells"] == 0 for x in others), "빈 양식은 0칸이어야 한다"
    assert body["with_content"] == 1


def test_빈_양식은_작성분으로_세지_않는다(ctx):
    """머리글(연도·월)은 회차에서 계산된 값이지 사람이 쓴 게 아니다."""
    body = ctx["as_admin"]().get("/api/cycles/%s/revoke-preview" % ctx["cid"]).json()
    assert body["with_content"] == 0
    assert all(x["filled_cells"] == 0 for x in body["items"])


# ══════════ 확인 ══════════
def test_확인_없이는_지워지지_않는다(ctx):
    c = ctx["as_admin"]()
    r = c.post("/api/cycles/%s/revoke" % ctx["cid"], json={})
    assert r.status_code == 400
    assert len(cycles_store.list_cycle_projects(ctx["cid"])) == 3


# ══════════ 회수 ══════════
def test_개인별_회수는_그_사람_것만_지운다(ctx):
    c = ctx["as_admin"]()
    rows = cycles_store.list_cycle_projects(ctx["cid"])
    target = rows[0]
    r = c.post("/api/cycles/%s/revoke" % ctx["cid"],
               json={"project_ids": [target["id"]], "confirm": True})
    assert r.status_code == 200, r.text
    assert r.json()["removed_count"] == 1
    left = cycles_store.list_cycle_projects(ctx["cid"])
    assert len(left) == 2
    assert target["id"] not in {p["id"] for p in left}


def test_전체_취소는_회차의_배부본만_지운다(ctx):
    """다른 회차·개인 이북은 건드리지 않는다."""
    c = ctx["as_admin"]()
    outside = projects_store.create_project(
        name="내 개인 이북", state={"pages": []}, owner_id=ctx["execs"][0]["id"])

    r = c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    assert r.status_code == 200
    assert r.json()["removed_count"] == 3
    assert cycles_store.list_cycle_projects(ctx["cid"]) == []
    assert projects_store.get_project(outside["id"]) is not None, \
        "회차 밖 이북이 함께 지워졌습니다."


def test_남의_회차_id를_넘겨도_지워지지_않는다(ctx):
    """바깥에서 온 id 를 그대로 지우면 실수 한 번에 남의 문서가 사라진다."""
    c = ctx["as_admin"]()
    outside = projects_store.create_project(
        name="남의 이북", state={"pages": []}, owner_id=ctx["execs"][1]["id"])
    r = c.post("/api/cycles/%s/revoke" % ctx["cid"],
               json={"project_ids": [outside["id"]], "confirm": True})
    assert r.status_code == 400
    assert projects_store.get_project(outside["id"]) is not None


def test_회수하면_메모와_버전도_함께_사라진다(ctx):
    """지웠다고 말한 것이 DB 에 남아 있으면 안 된다(회수 사유가 오배부라면 개인정보 문제)."""
    c = ctx["as_admin"]()
    pid = cycles_store.list_cycle_projects(ctx["cid"])[0]["id"]
    notes_store.upsert_note(pid, "n1", "메모 제목", [{"t": "text", "v": "내용"}], False, 0)
    assert len(notes_store.list_notes(pid)) == 1

    c.post("/api/cycles/%s/revoke" % ctx["cid"],
           json={"project_ids": [pid], "confirm": True})
    assert projects_store.get_project(pid) is None
    assert notes_store.list_notes(pid) == [], "회수했는데 메모가 남아 있습니다."


def test_전부_회수하면_회차가_준비로_돌아간다(ctx):
    """배부본이 하나도 없는데 '작성중' 이라고 떠 있으면 관리자가 상태를 못 믿는다."""
    c = ctx["as_admin"]()
    assert cycles_store.get_cycle(ctx["cid"])["status"] == "writing"
    c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    assert cycles_store.get_cycle(ctx["cid"])["status"] == "draft"


def test_일부만_회수하면_상태는_그대로다(ctx):
    c = ctx["as_admin"]()
    pid = cycles_store.list_cycle_projects(ctx["cid"])[0]["id"]
    c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"project_ids": [pid], "confirm": True})
    assert cycles_store.get_cycle(ctx["cid"])["status"] == "writing"


def test_회수_후_다시_배부할_수_있다(ctx):
    """잘못 배부했을 때의 실제 복구 경로 — 회수하고 올바른 방식으로 다시 배부한다."""
    c = ctx["as_admin"]()
    c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    r = c.post("/api/cycles/%s/distribute" % ctx["cid"], json={})
    assert r.status_code == 200
    assert r.json()["created_count"] == 3


def test_회수는_감사로그에_남는다(ctx):
    c = ctx["as_admin"]()
    rows = cycles_store.list_cycle_projects(ctx["cid"])
    _write(rows[0]["id"], "무언가 작성함")
    c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    logs = [x for x in auth_store.list_audit(200) if x["action"] == "cycle_revoke"]
    assert logs, "회수 기록이 없습니다 — 되돌릴 수 없는 조작은 반드시 남아야 합니다."
    assert "3건 회수" in logs[0]["detail"]
    assert "작성 칸 1개" in logs[0]["detail"]


def test_회수할_게_없으면_알려준다(ctx):
    c = ctx["as_admin"]()
    c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    r = c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    assert r.status_code == 400
    assert "없습니다" in r.json()["detail"]


def test_마감된_회차는_회수할_수_없다(ctx):
    """마감은 종착이다. 마감 후에 자료가 사라지면 회의록과 어긋난다."""
    c = ctx["as_admin"]()
    cycles_store.set_cycle_status(ctx["cid"], "closed")
    r = c.post("/api/cycles/%s/revoke" % ctx["cid"], json={"confirm": True})
    assert r.status_code == 400
    assert len(cycles_store.list_cycle_projects(ctx["cid"])) == 3
