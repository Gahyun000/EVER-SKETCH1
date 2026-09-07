"""「1인 1세트」가 **저장할 때 실제로 걸리는가**.

이 스위트가 없으면 template_guard.py 는 예전 slot_allows() 와 같은 신세가 된다 —
문서에는 규칙이 있고 코드에도 함수가 있는데 저장 경로가 안 부르는 상태.
그게 이 저장소에서 이미 두 번 일어났다(슬롯 정책, 「1인 1장」).

지키는 것과 안 지키는 것을 여기서 눈으로 갈라 둔다.

    지킨다   SLOT-A/B/C 가 각각 하나씩 · 열 수가 정본과 같다
    안 지킨다 쪽수 — 몇 장이든 좋다
"""
import copy
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
_DB = str(pathlib.Path(_tmp) / "tplguard.db")
os.environ["EVER_SKETCH_DB"] = _DB

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import template_guard as guard  # noqa: E402
from server import template_seed as ts  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

TPL = "/api/projects/from-template"
NEW = "/api/projects"


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
    return app


def canon() -> dict:
    return ts.build_template_state("2026-10", "김가현", "SI개발본부")


def table(state: dict, slot: str) -> dict:
    for page in state["pages"]:
        for el in page["els"]:
            if el.get("slot") == slot and el.get("type") == "table":
                return el
    raise AssertionError("%s 표가 없다" % slot)


@pytest.fixture()
def ctx():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    u = auth_store.signup("writer", "password123", "김가현", "SI개발본부", "writer")
    auth_store.approve(admin["id"], u["id"], "writer")

    c = TestClient(make_app())
    assert c.post("/api/auth/login",
                  json={"login_id": "writer", "password": "password123"}).status_code == 200
    return c


def save(c, pid, state):
    return c.put("%s/%s" % (NEW, pid), json={"state": state, "name": "저장"})


def new_tpl(c):
    r = c.post(TPL, json={"period_ym": "2026-10"})
    assert r.status_code == 200, r.text
    return r.json()["id"], r.json()["state"]


# ══════════ 순수 판정 ══════════

def test_정본은_통과한다(ctx):
    """제일 먼저 확인할 것. 정본조차 못 지나가는 검사는 검사가 아니라 고장이다."""
    assert guard.check_state(canon()) is None


def test_이름표_글상자를_표로_잘못_세지_않는다(ctx):
    """SLOT-A 라는 slot 을 로드맵 표와 '① 로드맵 / 마일스톤' 제목 글상자가 함께 쓴다.
    둘을 같이 세면 정본이 「SLOT-A 가 둘」로 거부된다 — 실제로 조심해야 하는 자리다."""
    st = canon()
    names = [el.get("slot") for p in st["pages"] for el in p["els"]]
    assert names.count("SLOT-A") >= 2          # 표 + 제목 글상자
    assert guard.check_state(st) is None


def test_표가_없어지면_이유를_말한다(ctx):
    st = canon()
    for page in st["pages"]:
        page["els"] = [e for e in page["els"]
                       if not (e.get("slot") == "SLOT-A" and e.get("type") == "table")]
    why = guard.check_state(st)
    assert why and "로드맵" in why and "되돌리" in why


def test_표가_둘이면_거부한다(ctx):
    """복사·붙여넣기로 로드맵이 둘이 되면 취합이 어느 것이 진짜인지 못 정한다."""
    st = canon()
    st["pages"][0]["els"].append(copy.deepcopy(table(st, "SLOT-A")))
    why = guard.check_state(st)
    assert why and "2개" in why


def test_열_수가_달라지면_거부한다(ctx):
    st = canon()
    table(st, "SLOT-A")["cols"] = 17
    why = guard.check_state(st)
    assert why and "18칸" in why and "17칸" in why


def test_세_슬롯을_모두_본다(ctx):
    for slot in ("SLOT-A", "SLOT-B", "SLOT-C"):
        st = canon()
        for page in st["pages"]:
            page["els"] = [e for e in page["els"]
                           if not (e.get("slot") == slot and e.get("type") == "table")]
        assert guard.check_state(st), "%s 가 없어져도 통과했다" % slot


# ══════════ 쪽수는 세지 않는다 ══════════

def test_쪽을_늘려도_통과한다(ctx):
    """「1인 1장」이 「1인 1세트」로 바뀐 지점. 내용이 많은 임원은 장을 늘려 쓴다."""
    st = canon()
    st["pages"].append({"id": 2, "cardKey": "slide", "fields": {}, "free": True,
                        "els": [], "conns": [], "strokes": [], "blocks": [],
                        "bg": "", "role": "content"})
    assert guard.check_state(st) is None


def test_슬롯을_다른_쪽으로_옮겨도_통과한다(ctx):
    """1쪽 로드맵 · 2쪽 진행현황으로 나누는 것이 바로 이 경우다.
    취합은 슬롯 이름으로 찾지 쪽 번호로 찾지 않는다."""
    st = canon()
    moved = [e for e in st["pages"][0]["els"] if e.get("slot") in ("SLOT-B", "SLOT-C")]
    st["pages"][0]["els"] = [e for e in st["pages"][0]["els"] if e not in moved]
    st["pages"].append({"id": 2, "cardKey": "slide", "fields": {}, "free": True,
                        "els": moved, "conns": [], "strokes": [], "blocks": [],
                        "bg": "", "role": "content"})
    assert guard.check_state(st) is None


def test_이어진_조각은_하나로_센다(ctx):
    """아직 조각을 만드는 기능은 없다. 그래도 규칙을 지금 넓게 적어 둔다 —
    나중에 표가 다음 장으로 이어질 때 이 규칙을 어기지 않아도 되도록."""
    st = canon()
    piece = copy.deepcopy(table(st, "SLOT-A"))
    piece["contFrom"] = 5                       # 앞 조각에서 이어짐
    st["pages"][0]["els"].append(piece)
    assert guard.check_state(st) is None


# ══════════ 저장 경로에서 실제로 걸린다 ══════════

def test_표준_양식_저장은_검사를_거친다(ctx):
    pid, st = new_tpl(ctx)
    for page in st["pages"]:
        page["els"] = [e for e in page["els"] if e.get("type") != "table"]
    r = save(ctx, pid, st)
    assert r.status_code == 400, r.text
    assert "로드맵" in r.json()["detail"]


def test_거부된_저장은_예전_내용을_남긴다(ctx):
    """거부해 놓고 반쯤 저장하면 가장 나쁘다."""
    pid, st = new_tpl(ctx)
    broken = copy.deepcopy(st)
    for page in broken["pages"]:
        page["els"] = []
    save(ctx, pid, broken)
    got = ctx.get("%s/%s" % (NEW, pid)).json()["state"]
    assert got == st


def test_멀쩡한_저장은_지나간다(ctx):
    pid, st = new_tpl(ctx)
    st["title"] = "고친 제목"
    table(st, "SLOT-A")["cells"][2][1] = "새 프로젝트"
    r = save(ctx, pid, st)
    assert r.status_code == 200, r.text
    assert ctx.get("%s/%s" % (NEW, pid)).json()["state"]["title"] == "고친 제목"


def test_자유_이북은_검사하지_않는다(ctx):
    """표시가 없는 자료까지 막으면 스케치 한 장 못 그린다."""
    pid = ctx.post(NEW, json={"name": "자유", "state": {"pages": []}}).json()["id"]
    assert save(ctx, pid, {"pages": []}).status_code == 200


def test_거부_문구는_무엇을_해야_할지_말한다(ctx):
    """「검증 실패」 같은 말은 되돌릴 방법을 알려 주지 않는다."""
    pid, st = new_tpl(ctx)
    for page in st["pages"]:
        page["els"] = [e for e in page["els"] if e.get("type") != "table"]
    detail = save(ctx, pid, st).json()["detail"]
    assert "표준 양식" in detail
    assert any(w in detail for w in ("되돌리", "실행 취소", "지워"))
