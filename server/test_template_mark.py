"""「이 이북이 표준 양식인가」를 서버가 알아볼 수 있는가.

**왜 이게 따로 필요한가.**
`template_seed.TEMPLATE_VERSION = "v2.0"` 은 처음부터 있었지만 **아무 데도 저장되지
않았다.** 표준 양식으로 만들어도 남는 것은 `state` 뿐이라, 서버 입장에서 자유 이북과
구별할 방법이 없었다. 그래서 사양서에 적힌 잠금들이 하나도 걸리지 못했다 —
`slot_allows()` 는 테스트에서만 쓰였고, 저장 경로는 보내온 `state` 를 그대로 받아
적었다. 「문서에는 잠겨 있다고 적혀 있는데 실제로는 안 잠긴」 상태였다.

여기서 못박는 것은 **표시가 남는가**와 **그 표시를 사용자가 자칭할 수 없는가** 둘이다.
두 번째가 핵심이다 — 잠금을 자기가 풀 수 있으면 잠금이 아니다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
_DB = str(pathlib.Path(_tmp) / "tplmark.db")
os.environ["EVER_SKETCH_DB"] = _DB

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server import template_seed  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

TPL = "/api/projects/from-template"
NEW = "/api/projects"


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
    return app


@pytest.fixture()
def ctx():
    os.environ["EVER_SKETCH_DB"] = _DB
    p = pathlib.Path(_DB)
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(str(p) + suffix)
        if f.exists():
            f.unlink()

    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    u = auth_store.signup("writer", "password123", "김가현", "SI개발본부", "writer")
    auth_store.approve(admin["id"], u["id"], "writer")

    def as_user(login="writer", pw="password123"):
        c = TestClient(make_app())
        r = c.post("/api/auth/login", json={"login_id": login, "password": pw})
        assert r.status_code == 200, r.text
        return c

    class C:
        pass

    c = C()
    c.writer = auth_store.get_user(u["id"])
    c.as_user = as_user
    return c


# ══════════ 표시가 남는다 ══════════

def test_표준_양식으로_만들면_표시가_남는다(ctx):
    r = ctx.as_user().post(TPL, json={"period_ym": "2026-10"})
    assert r.status_code == 200, r.text
    assert r.json()["template"] == template_seed.TEMPLATE_VERSION


def test_표시는_참거짓이_아니라_판_번호다(ctx):
    """양식이 v3.0 이 되어도 v2.0 으로 만든 자료는 그때 규칙으로 판정해야 한다.
    참/거짓만 적으면 어느 규칙으로 볼지 알 길이 없다."""
    pid = ctx.as_user().post(TPL, json={"period_ym": "2026-10"}).json()["id"]
    assert projects_store.get_project_meta(pid)["template"] == "v2.0"


def test_다시_열어도_표시가_따라온다(ctx):
    pid = ctx.as_user().post(TPL, json={"period_ym": "2026-10"}).json()["id"]
    got = ctx.as_user().get("%s/%s" % (NEW, pid)).json()
    assert got["template"] == template_seed.TEMPLATE_VERSION


def test_목록에도_표시가_보인다(ctx):
    """어느 자료가 표준 양식인지 화면이 알아야 「＋ 새 페이지」 같은 걸 가릴 수 있다."""
    ctx.as_user().post(TPL, json={"period_ym": "2026-10"})
    rows = ctx.as_user().get(NEW).json()["projects"]
    assert [x["template"] for x in rows] == [template_seed.TEMPLATE_VERSION]


# ══════════ 자칭할 수 없다 ══════════

def test_자유_이북에는_표시가_없다(ctx):
    r = ctx.as_user().post(NEW, json={"name": "내 스케치", "state": {"pages": []}})
    assert r.status_code == 200, r.text
    assert r.json()["template"] is None


def test_요청에_표시를_적어_보내도_무시된다(ctx):
    """**이 테스트가 이 파일의 이유다.** 표시를 요청에서 받으면
    아무나 「나는 표준 양식이다」라고 말할 수 있고, 반대로 표준 양식이 스스로
    「나는 아니다」라고 말해 검사를 빠져나갈 수 있다."""
    r = ctx.as_user().post(NEW, json={"name": "사칭", "state": {"pages": []},
                                      "template": "v2.0"})
    assert r.status_code == 200, r.text
    assert r.json()["template"] is None
    assert projects_store.get_project_meta(r.json()["id"])["template"] is None


def test_state_안에_적어_보내도_무시된다(ctx):
    """state 는 브라우저가 통째로 덮어쓰는 값이다 — 표시가 거기 있으면 잠금이 아니다."""
    r = ctx.as_user().post(NEW, json={"name": "사칭2",
                                      "state": {"pages": [], "template": "v2.0",
                                                "templateVersion": "v2.0"}})
    assert projects_store.get_project_meta(r.json()["id"])["template"] is None


def test_저장해도_표시가_사라지지_않는다(ctx):
    """작성자가 내용을 고치는 것과 「이게 표준 양식인가」는 별개다.
    저장 한 번으로 표시가 날아가면 그 뒤로는 아무 검사도 안 걸린다."""
    c = ctx.as_user()
    pid = c.post(TPL, json={"period_ym": "2026-10"}).json()["id"]
    r = c.put("%s/%s" % (NEW, pid), json={"state": {"pages": []}, "name": "고친 것"})
    assert r.status_code == 200, r.text
    assert projects_store.get_project_meta(pid)["template"] == template_seed.TEMPLATE_VERSION


def test_저장으로_표시를_새로_붙일_수도_없다(ctx):
    c = ctx.as_user()
    pid = c.post(NEW, json={"name": "자유", "state": {"pages": []}}).json()["id"]
    c.put("%s/%s" % (NEW, pid), json={"state": {"pages": [], "template": "v2.0"},
                                      "name": "자유"})
    assert projects_store.get_project_meta(pid)["template"] is None


# ══════════ 예전 자료 ══════════

def test_컬럼이_없던_시절_자료는_표시가_없다(ctx):
    """표시를 넣기 전에 만든 자료가 있다. 그것들을 「표준 양식이 아니다」로 보는 것은
    맞다 — 실제로 표준 양식이었더라도, 없는 근거로 있다고 단정하는 것보다 낫다.
    (`_EXTRA_COLS` 의 ALTER TABLE 경로가 조용히 NULL 을 채운다.)"""
    p = projects_store.create_project("옛날 것", {"pages": []}, owner_id=ctx.writer["id"])
    assert p["template"] is None
    assert projects_store.get_project_meta(p["id"])["template"] is None
