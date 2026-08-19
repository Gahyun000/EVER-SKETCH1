"""W2 완료 게이트 — 가상 회차 1건 → 5인 배부 성공.

계획서 §8 W2 의 게이트 문구를 그대로 테스트로 옮겼다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "cycles.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import cycles as cycles_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server import template_seed  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_cycles import router as cycles_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "cycles.db")


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

    def mk(login, level, name, dept="사업본부"):
        u = auth_store.signup(login, "password123", name, dept, 2)
        if level:
            auth_store.approve(admin["id"], u["id"], level)
        return auth_store.get_user(u["id"])

    # 임원 5인(L2) + 열람자 1 + 대기 1
    execs = [mk("exec%d" % i, 2, "임원%d" % i, "제%d본부" % i) for i in range(1, 6)]
    viewer = mk("viewer", 1, "열람자")
    pending = mk("pend", 0, "대기자")

    def as_user(login, pw="password123"):
        c = TestClient(make_app())
        r = c.post("/api/auth/login", json={"login_id": login, "password": pw})
        assert r.status_code == 200, r.text
        return c

    return {"admin": admin, "execs": execs, "viewer": viewer, "pending": pending,
            "as_user": as_user, "as_admin": lambda: as_user("admin", "adminpw12345"),
            "anon": TestClient(make_app())}


# ══════════ W2 게이트: 회차 1건 → 5인 배부 ══════════
def test_게이트_가상회차_1건_5인_배부_성공(ctx):
    c = ctx["as_admin"]()
    r = c.post("/api/cycles", json={"period_ym": "2026-10"})
    assert r.status_code == 200, r.text
    cid = r.json()["cycle"]["id"]
    assert r.json()["cycle"]["title"] == "2026년 10월 임원회의"

    r = c.post("/api/cycles/%s/distribute" % cid, json={})
    assert r.status_code == 200, r.text
    assert r.json()["created_count"] == 5          # L2 5인에게만
    assert r.json()["skipped_count"] == 0

    rows = cycles_store.list_cycle_projects(cid)
    assert len(rows) == 5
    owners = {p["owner_id"] for p in rows}
    assert owners == {e["id"] for e in ctx["execs"]}     # 각자 다른 소유자
    assert len(owners) == 5                              # 한 사람에게 몰리지 않았다


def test_배부본은_각자에게만_보인다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})

    c1 = ctx["as_user"]("exec1")
    mine = c1.get("/api/projects").json()["projects"]
    assert len(mine) == 1
    assert mine[0]["owner_id"] == ctx["execs"][0]["id"]

    # 남의 배부본은 열리지 않는다
    others = [p for p in cycles_store.list_cycle_projects(cid)
              if p["owner_id"] != ctx["execs"][0]["id"]]
    assert c1.get("/api/projects/%s" % others[0]["id"]).status_code == 403


def test_배부는_멱등하다(ctx):
    """개설 화면에서 버튼을 두 번 누르는 일은 반드시 일어난다."""
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    first = c.post("/api/cycles/%s/distribute" % cid, json={}).json()
    second = c.post("/api/cycles/%s/distribute" % cid, json={}).json()
    assert first["created_count"] == 5
    assert second["created_count"] == 0 and second["skipped_count"] == 5
    assert len(cycles_store.list_cycle_projects(cid)) == 5      # 10장이 되지 않는다


def test_L1과_승인대기는_배부_대상이_아니다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    owners = {p["owner_id"] for p in cycles_store.list_cycle_projects(cid)}
    assert ctx["viewer"]["id"] not in owners
    assert ctx["pending"]["id"] not in owners


def test_대상자를_지정해_배부할_수_있다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    two = [ctx["execs"][0]["id"], ctx["execs"][1]["id"]]
    r = c.post("/api/cycles/%s/distribute" % cid, json={"user_ids": two})
    assert r.json()["created_count"] == 2


def test_승인되지_않은_계정에는_배부할_수_없다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    r = c.post("/api/cycles/%s/distribute" % cid,
               json={"user_ids": [ctx["pending"]["id"]]})
    assert r.status_code == 400


def test_작성자가_없으면_배부가_거부되고_이유를_알려준다(ctx):
    """조용히 0건 성공하면 관리자가 배부된 줄 안다."""
    admin = ctx["admin"]
    for e in ctx["execs"]:
        auth_store.set_status(admin["id"], e["id"], "disabled")
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    r = c.post("/api/cycles/%s/distribute" % cid, json={})
    assert r.status_code == 400
    assert "승인" in r.json()["detail"]


# ══════════ 배부본 내용 ══════════
def test_배부본에_템플릿_4블록이_들어있다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    pid = cycles_store.list_cycle_projects(cid)[0]["id"]
    state = projects_store.get_project(pid)["state"]
    assert len(state["pages"]) == 1                     # 1인 1장
    slots = {e.get("slot") for e in state["pages"][0]["els"]}
    assert {"SLOT-A", "SLOT-B", "SLOT-C", "SLOT-D"} <= slots


def test_배부본의_연도와_Today가_회차에_맞는다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2027-03"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    pid = cycles_store.list_cycle_projects(cid)[0]["id"]
    els = projects_store.get_project(pid)["state"]["pages"][0]["els"]
    road = [e for e in els if e.get("slot") == "SLOT-A" and e["type"] == "table"][0]
    assert road["cells"][0][template_seed.COL_MONTH_FIRST] == "2027"
    assert road["cells"][0][template_seed.COL_EXT_FIRST] == "2028"
    assert road["today"] == template_seed.COL_MONTH_FIRST + 2      # 3월


def test_배부본에_작성자_이름이_들어간다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    for row in cycles_store.list_cycle_projects(cid):
        state = projects_store.get_project(row["id"])["state"]
        blob = " ".join(e.get("text", "") for e in state["pages"][0]["els"])
        who = [e for e in ctx["execs"] if e["id"] == row["owner_id"]][0]
        assert who["name"] in blob


# ══════════ 회차 개설 검증 ══════════
def test_같은_달에_회차를_두_번_열_수_없다(ctx):
    """임원이 어느 회차에 써야 할지 알 수 없게 된다."""
    c = ctx["as_admin"]()
    assert c.post("/api/cycles", json={"period_ym": "2026-10"}).status_code == 200
    r = c.post("/api/cycles", json={"period_ym": "2026-10"})
    assert r.status_code == 400 and "이미" in r.json()["detail"]


def test_마감된_달은_다시_열_수_있다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    cycles_store.set_cycle_status(cid, "closed")
    assert c.post("/api/cycles", json={"period_ym": "2026-10"}).status_code == 200


@pytest.mark.parametrize("bad", ["2026", "2026-13", "26-10", "", "abc"])
def test_잘못된_기간은_거부된다(ctx, bad):
    c = ctx["as_admin"]()
    assert c.post("/api/cycles", json={"period_ym": bad}).status_code == 400


# ══════════ 상태 전이 ══════════
def test_배부하면_작성_단계로_넘어간다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    assert cycles_store.get_cycle(cid)["status"] == "draft"
    c.post("/api/cycles/%s/distribute" % cid, json={})
    assert cycles_store.get_cycle(cid)["status"] == "writing"


def test_상태_전이_규칙(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    assert c.post("/api/cycles/%s/status" % cid, json={"status": "writing"}).status_code == 200
    # draft 를 건너뛴 발행은 불가
    assert c.post("/api/cycles/%s/status" % cid, json={"status": "published"}).status_code == 400
    assert c.post("/api/cycles/%s/status" % cid, json={"status": "review"}).status_code == 200
    assert c.post("/api/cycles/%s/status" % cid, json={"status": "published"}).status_code == 200


def test_마감된_회차는_되돌릴_수_없다(ctx):
    """되돌리려면 새 회차를 연다 — 마감 후 수정이 조용히 일어나면 안 된다."""
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    cycles_store.set_cycle_status(cid, "closed")
    for s in ("draft", "writing", "review", "published"):
        assert c.post("/api/cycles/%s/status" % cid, json={"status": s}).status_code == 400


def test_마감된_회차에는_배부할_수_없다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    cycles_store.set_cycle_status(cid, "closed")
    assert c.post("/api/cycles/%s/distribute" % cid, json={}).status_code == 400


# ══════════ 권한 ══════════
def test_회차_개설은_L3만(ctx):
    for login in ("exec1", "viewer"):
        c = ctx["as_user"](login)
        assert c.post("/api/cycles", json={"period_ym": "2026-11"}).status_code == 403


def test_배부는_L3만(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    assert ctx["as_user"]("exec1").post(
        "/api/cycles/%s/distribute" % cid, json={}).status_code == 403


def test_비로그인은_회차를_볼_수_없다(ctx):
    assert ctx["anon"].get("/api/cycles").status_code == 401


def test_승인대기는_회차를_볼_수_없다(ctx):
    assert ctx["as_user"]("pend").get("/api/cycles").status_code == 403


def test_L1은_발행된_회차만_본다(ctx):
    c = ctx["as_admin"]()
    a = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    b = c.post("/api/cycles", json={"period_ym": "2026-11"}).json()["cycle"]["id"]
    for s in ("writing", "review", "published"):
        c.post("/api/cycles/%s/status" % b, json={"status": s})

    v = ctx["as_user"]("viewer")
    ids = {x["id"] for x in v.get("/api/cycles").json()["cycles"]}
    assert ids == {b}
    assert v.get("/api/cycles/%s" % a).status_code == 403     # 진행 중 회차는 존재도 모른다


def test_L3만_전체_진행현황을_본다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})

    admin_view = c.get("/api/cycles/%s" % cid).json()
    assert admin_view["progress"]["total"] == 5
    assert len(admin_view["projects"]) == 5

    exec_view = ctx["as_user"]("exec1").get("/api/cycles/%s" % cid).json()
    assert "progress" not in exec_view          # 남이 냈는지 여부는 알 필요 없다
    assert len(exec_view["projects"]) == 1


# ══════════ 제출 상태 ══════════
def test_작성자가_제출하면_현황에_잡힌다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    pid = [p for p in cycles_store.list_cycle_projects(cid)
           if p["owner_id"] == ctx["execs"][0]["id"]][0]["id"]

    e1 = ctx["as_user"]("exec1")
    assert e1.post("/api/cycles/projects/%s/submit" % pid,
                   json={"status": "submitted"}).status_code == 200
    assert cycles_store.cycle_progress(cid)["submitted"] == 1


def test_작성자는_남의_것을_제출할_수_없다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    other = [p for p in cycles_store.list_cycle_projects(cid)
             if p["owner_id"] != ctx["execs"][0]["id"]][0]["id"]
    assert ctx["as_user"]("exec1").post(
        "/api/cycles/projects/%s/submit" % other, json={"status": "submitted"}).status_code == 403


def test_반려와_승인은_L3만(ctx):
    """검토하는 쪽 판단이다 — 작성자가 스스로 승인하면 검토가 무의미해진다."""
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    pid = [p for p in cycles_store.list_cycle_projects(cid)
           if p["owner_id"] == ctx["execs"][0]["id"]][0]["id"]

    e1 = ctx["as_user"]("exec1")
    assert e1.post("/api/cycles/projects/%s/submit" % pid,
                   json={"status": "approved"}).status_code == 403
    assert e1.post("/api/cycles/projects/%s/submit" % pid,
                   json={"status": "returned"}).status_code == 403
    assert c.post("/api/cycles/projects/%s/submit" % pid,
                  json={"status": "returned"}).status_code == 200


def test_모르는_제출_상태는_거부(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    pid = cycles_store.list_cycle_projects(cid)[0]["id"]
    assert c.post("/api/cycles/projects/%s/submit" % pid,
                  json={"status": "완료됨"}).status_code in (400, 422)


# ══════════ 템플릿 ══════════
def test_정본_등록은_멱등하다(ctx):
    a = cycles_store.ensure_default_template("u1")
    b = cycles_store.ensure_default_template("u2")
    assert a["id"] == b["id"]
    assert len(cycles_store.list_templates()) == 1


def test_회차가_정본을_참조한다(ctx):
    c = ctx["as_admin"]()
    cyc = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]
    tpl = cycles_store.get_template(cyc["template_id"])
    assert tpl["version"] == template_seed.TEMPLATE_VERSION
    # 회차마다 그 시점의 정본이 무엇이었는지 남는다
    assert tpl["slot_policy"]["SLOT-A"]["cbgPalette"]


def test_템플릿_목록은_L3만(ctx):
    assert ctx["as_user"]("exec1").get("/api/cycles/templates/list").status_code == 403
    assert ctx["as_admin"]().get("/api/cycles/templates/list").status_code == 200


# ══════════ 감사로그 ══════════
def test_회차_개설과_배부가_감사로그에_남는다(ctx):
    c = ctx["as_admin"]()
    cid = c.post("/api/cycles", json={"period_ym": "2026-10"}).json()["cycle"]["id"]
    c.post("/api/cycles/%s/distribute" % cid, json={})
    conn = auth_store._conn()
    acts = [r[0] for r in conn.execute("SELECT action FROM AuditLogs").fetchall()]
    conn.close()
    assert "cycle_create" in acts and "cycle_distribute" in acts
