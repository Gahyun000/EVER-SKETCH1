"""P1 — 회차 없이 표준 양식으로 새 이북 만들기.

**왜 이 스위트가 있는가.**
표준 양식이 세상에 나오는 길은 배부 API 하나뿐이었고, 그 API 는 회차 id 를 요구했다.
회차를 걷어내면 표준 양식은 만들 방법이 없어진다 — 파일은 멀쩡히 남아 있는데
아무도 쓸 수 없는, 가장 알아채기 어려운 종류의 고장이다.

여기서 못박는 것은 **회차에 기대지 않는 진입점**이다.
(회차는 P2 에서 실제로 사라졌다. 이 스위트가 그 사이 표준 양식을 붙들고 있었다.)
(전환 계획 `docs/전환계획_결재중심_v0.2_20260903.md` P1)
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
_DB = str(pathlib.Path(_tmp) / "tplproj.db")
os.environ["EVER_SKETCH_DB"] = _DB

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import template_seed  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

PATH = "/api/projects/from-template"


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
    return app


def texts(state: dict) -> list[str]:
    """양식 안의 모든 글자. 표 셀까지 훑는다."""
    out: list[str] = [state.get("title") or ""]
    for page in state.get("pages") or []:
        for el in page.get("els") or []:
            if isinstance(el.get("text"), str):
                out.append(el["text"])
            for row in el.get("cells") or []:
                for cell in row or []:
                    if isinstance(cell, str):
                        out.append(cell)
                    elif isinstance(cell, dict) and isinstance(cell.get("t"), str):
                        out.append(cell["t"])
    return out


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

    def mk(login, role, name, dept):
        u = auth_store.signup(login, "password123", name, dept, "writer")
        if role:
            auth_store.approve(admin["id"], u["id"], role)
        return auth_store.get_user(u["id"])

    writer = mk("writer", "writer", "김가현", "SI개발본부")
    viewer = mk("viewer", "viewer", "이열람", "경영지원")
    pending = mk("pend", "", "박대기", "총무")

    def as_user(login, pw="password123"):
        c = TestClient(make_app())
        if login:
            r = c.post("/api/auth/login", json={"login_id": login, "password": pw})
            assert r.status_code == 200, r.text
        return c

    class C:
        pass

    c = C()
    c.writer, c.viewer, c.pending, c.admin = writer, viewer, pending, admin
    c.as_user = as_user
    c.anon = TestClient(make_app())
    return c


# ══════════ 만들어진다 ══════════

def test_작성자가_회차_없이_표준_양식을_만든다(ctx):
    r = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["owner_id"] == ctx.writer["id"]
    assert "cycle_id" not in p                  # 회차는 흔적도 남지 않았다


def test_만들어진_것이_표준_양식_정본과_같다(ctx):
    r = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"})
    got = r.json()["state"]
    want = template_seed.build_template_state("2026-10", "김가현", "SI개발본부")
    assert got == want


def test_가로_한_장이다(ctx):
    st = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"}).json()["state"]
    assert st["orientation"] == "landscape"     # 빈 슬라이드는 portrait 다. 섞이면 안 된다
    assert len(st["pages"]) == 1                # 1인 1장


def test_세_구획이_모두_있다(ctx):
    st = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"}).json()["state"]
    slots = {el.get("slot") for el in st["pages"][0]["els"]}
    assert {"SLOT-A", "SLOT-B", "SLOT-C"} <= slots


def test_작성자_이름과_부서가_양식에_박힌다(ctx):
    st = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"}).json()["state"]
    joined = " ".join(texts(st))
    assert "김가현" in joined
    assert "SI개발본부" in joined


def test_만들자마자_내_목록에_보인다(ctx):
    c = ctx.as_user("writer")
    pid = c.post(PATH, json={"period_ym": "2026-10"}).json()["id"]
    ids = [p["id"] for p in c.get("/api/projects").json()["projects"]]
    assert pid in ids


# ══════════ 회차가 남긴 말이 없다 (D7) ══════════

def test_제출기한_문구가_없다(ctx):
    """기한은 회차가 정하던 것이다. 회차가 없으면 채울 근거가 없다."""
    st = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"}).json()["state"]
    assert not [t for t in texts(st) if "제출기한" in t]


def test_회차라는_말이_남아_있지_않다(ctx):
    """개인이 직접 만드는 양식에 '회차'라고 적혀 있으면 없는 제도를 가리킨다."""
    st = ctx.as_user("writer").post(PATH, json={"period_ym": "2026-10"}).json()["state"]
    assert not [t for t in texts(st) if "회차" in t]


# ══════════ 거절된다 ══════════

@pytest.mark.parametrize("bad", ["", "2026", "2026-13", "2026-00", "그냥글자", "2026/10"])
def test_말이_안_되는_기간은_거절한다(ctx, bad):
    r = ctx.as_user("writer").post(PATH, json={"period_ym": bad})
    assert r.status_code == 400, f"{bad!r} → {r.status_code}"


def test_열람자는_만들_수_없다(ctx):
    assert ctx.as_user("viewer").post(PATH, json={"period_ym": "2026-10"}).status_code == 403


def test_승인_대기_계정은_만들_수_없다(ctx):
    assert ctx.as_user("pend").post(PATH, json={"period_ym": "2026-10"}).status_code == 403


def test_로그인하지_않으면_만들_수_없다(ctx):
    assert ctx.anon.post(PATH, json={"period_ym": "2026-10"}).status_code == 401


def test_관리자도_만들_수_있다(ctx):
    c = ctx.as_user("admin", "adminpw12345")
    assert c.post(PATH, json={"period_ym": "2026-10"}).status_code == 200
