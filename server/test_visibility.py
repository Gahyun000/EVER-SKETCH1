"""누가 무엇을 볼 수 있는가 — 역할 × 회차 단계 전체 표.

왜 표로 검사하는가:
열람 범위는 **틀려도 화면이 멀쩡해 보이는** 종류의 규칙이다. 너무 넓으면
남의 부서 초안이 새어 나가고, 너무 좁으면 "3~5월 구간이 앞 장과 다릅니다"
같은 지적을 애초에 할 수 없다. 둘 다 조용히 잘못된다.

그래서 규칙 하나하나를 따로 검사하지 않고, **판정해야 할 칸을 전부 적어 놓고**
그 표와 코드를 맞춘다. 규칙을 바꾸면 표가 먼저 틀어져서 눈에 띈다.

읽는 법 — 각 칸은 (보는 사람, 자료 주인, 회차 단계) → 되는 것들.
"""
from server.permissions import (
    AI_USE,
    COMMENT_READ,
    COMMENT_RESOLVE,
    COMMENT_WRITE,
    DELETE,
    READ,
    WRITE,
    Actor,
    Resource,
    decide,
    visible_project_filter,
)

ADMIN = Actor(id="u_admin", role="admin", status="active")
ME = Actor(id="u_me", role="writer", status="active")
PEER = Actor(id="u_peer", role="writer", status="active")
OUTSIDER = Actor(id="u_out", role="writer", status="active")   # 이 회차에 배부본이 없다
VIEWER = Actor(id="u_view", role="viewer", status="active")

STAGES = ("draft", "writing", "review", "published", "closed")


def doc(owner: str, stage: str, *, same_cycle: bool, published: bool = False) -> Resource:
    """'그 회차의 어느 배부본' 을 나타낸다."""
    return Resource(owner_id=owner, cycle_status=stage, published=published, same_cycle=same_cycle)


# ══════════ 본인 자료 ══════════
def test_본인_자료는_어느_단계에서도_보인다():
    for st in STAGES:
        assert decide(ME, READ, doc("u_me", st, same_cycle=True)) is True, st


def test_본인_자료는_발행_전까지_고칠_수_있다():
    for st in ("draft", "writing", "review"):
        assert decide(ME, WRITE, doc("u_me", st, same_cycle=True)) is True, st


def test_발행되거나_마감되면_본인_것도_잠긴다():
    """확정본이 나간 뒤 원본이 바뀌면, 회의에서 본 자료와 시스템 안의 자료가
    서로 다른 말을 하게 된다."""
    for st in ("published", "closed"):
        assert decide(ME, WRITE, doc("u_me", st, same_cycle=True)) is False, st


def test_회차에_속하지_않은_개인_이북은_잠기지_않는다():
    """회차 밖에서 혼자 만드는 이북까지 발행 규칙에 걸리면 안 된다."""
    solo = Resource(owner_id="u_me", cycle_status=None, published=False)
    assert decide(ME, WRITE, solo) is True


# ══════════ 같은 회차 동료 ══════════
def test_동료의_장은_배부가_나간_뒤부터_보인다():
    seen = {st: decide(PEER, READ, doc("u_me", st, same_cycle=True)) for st in STAGES}
    assert seen == {
        "draft": False,       # 아직 아무에게도 안 나간 회차
        "writing": True,
        "review": True,
        "published": True,
        "closed": True,
    }, seen


def test_동료의_장은_어느_단계에서도_고칠_수_없다():
    for st in STAGES:
        assert decide(PEER, WRITE, doc("u_me", st, same_cycle=True)) is False, st
        assert decide(PEER, DELETE, doc("u_me", st, same_cycle=True)) is False, st


def test_동료_지적은_검토_단계부터():
    """작성 중에는 달지 않는다 — 아직 쓰는 중인 것에 지적이 달리면 쓰는 사람이 흔들린다."""
    got = {st: decide(PEER, COMMENT_WRITE, doc("u_me", st, same_cycle=True)) for st in STAGES}
    assert got == {
        "draft": False,
        "writing": False,
        "review": True,
        "published": True,
        "closed": False,     # 끝난 회차에 새 지적을 달 이유가 없다
    }, got


def test_볼_수_있으면_거기_달린_지적도_보인다():
    """자료는 보이는데 거기 달린 지적은 안 보이면, 같은 지적이 두 번 달린다."""
    for st in ("writing", "review", "published", "closed"):
        assert decide(PEER, COMMENT_READ, doc("u_me", st, same_cycle=True)) is True, st
    assert decide(PEER, COMMENT_READ, doc("u_me", "draft", same_cycle=True)) is False


def test_해결_권한은_지적_권한과_같이_간다():
    for st in STAGES:
        w = decide(PEER, COMMENT_WRITE, doc("u_me", st, same_cycle=True))
        r = decide(PEER, COMMENT_RESOLVE, doc("u_me", st, same_cycle=True))
        assert w == r, st


# ══════════ 회차 밖 작성자 ══════════
def test_회차_밖_작성자에게는_아무_단계에서도_안_보인다():
    """'작성자' 라는 이유만으로 남의 회의 자료가 보이면 안 된다.
    보이는 근거는 역할이 아니라 **같은 회차에 배부본이 있다**는 사실이다."""
    for st in STAGES:
        d = doc("u_me", st, same_cycle=False)
        assert decide(OUTSIDER, READ, d) is False, st
        assert decide(OUTSIDER, COMMENT_READ, d) is False, st
        assert decide(OUTSIDER, COMMENT_WRITE, d) is False, st


def test_발행본은_회차_밖_작성자에게도_보인다():
    d = doc("u_me", "published", same_cycle=False, published=True)
    assert decide(OUTSIDER, READ, d) is True
    assert decide(OUTSIDER, WRITE, d) is False


# ══════════ 열람자 ══════════
def test_열람자는_발행본만_읽는다():
    for st in STAGES:
        assert decide(VIEWER, READ, doc("u_me", st, same_cycle=True)) is False, st
    assert decide(VIEWER, READ, doc("u_me", "published", same_cycle=True, published=True)) is True


def test_열람자에게는_지적이_존재하지_않는다():
    """확정 사항 — 메모는 존재 자체를 노출하지 않는다."""
    d = doc("u_me", "published", same_cycle=True, published=True)
    for act in (COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE, WRITE, DELETE, AI_USE):
        assert decide(VIEWER, act, d) is False, act


# ══════════ 관리자 ══════════
def test_관리자는_모든_단계에서_전부_된다():
    for st in STAGES:
        d = doc("u_me", st, same_cycle=False)
        for act in (READ, WRITE, DELETE, COMMENT_READ, COMMENT_WRITE, COMMENT_RESOLVE):
            assert decide(ADMIN, act, d) is True, (st, act)


# ══════════ 목록과 개별 판정이 어긋나지 않는다 ══════════
def test_목록_필터_이름이_바뀌면_여기서_걸린다():
    """'목록엔 보이는데 열면 403' 은 원인을 짚기 가장 어려운 버그다.
    필터 이름은 여기와 projects.list_projects 두 곳에서만 쓴다."""
    assert visible_project_filter(ADMIN) == "all"
    assert visible_project_filter(ME) == "own_or_cycle_or_published"
    assert visible_project_filter(VIEWER) == "published"


def test_승인대기_비활성_비로그인은_전부_거부():
    pending = Actor(id="u_p", role="writer", status="pending")
    disabled = Actor(id="u_d", role="writer", status="disabled")
    d = doc("u_me", "review", same_cycle=True)
    for who in (pending, disabled, None):
        for act in (READ, WRITE, COMMENT_READ, COMMENT_WRITE):
            assert decide(who, act, d) is False, (who, act)


# ══════════ 서버가 '무엇을 할 수 있는지' 를 함께 내려준다 ══════════
def test_열_때_할_수_있는_일이_함께_온다(tmp_path, monkeypatch):
    """화면이 역할·회차 단계를 보고 권한을 다시 계산하면 규칙이 두 곳에 생기고
    반드시 어긋난다. 그때 사용자에게는 '눌리는데 403' 으로 보인다."""
    import os
    os.environ["EVER_SKETCH_DB"] = str(tmp_path / "vis.db")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from server import auth as auth_store
    from server import cycles as cycles_store
    from server.routes_auth import router as auth_router
    from server.routes_cycles import router as cycles_router
    from server.routes_projects import router as proj_router

    app = FastAPI()
    for r in (auth_router, proj_router, cycles_router):
        app.include_router(r)

    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    for i in (1, 2):
        u = auth_store.signup("exec%d" % i, "password123", "임원%d" % i, "본부%d" % i, "writer")
        auth_store.approve(admin["id"], u["id"], "writer")

    def login(lid, pw="password123"):
        c = TestClient(app)
        assert c.post("/api/auth/login", json={"login_id": lid, "password": pw}).status_code == 200
        return c

    ac = login("admin", "adminpw12345")
    cid = ac.post("/api/cycles", json={"period_ym": "2026-11"}).json()["cycle"]["id"]
    ac.post("/api/cycles/%s/distribute" % cid, json={})
    rows = cycles_store.list_cycle_projects(cid)
    w1 = [p for p in rows if "임원1" in (p["name"] or "")][0]
    w2 = [p for p in rows if "임원2" in (p["name"] or "")][0]

    c1 = login("exec1")
    own = c1.get("/api/projects/%s" % w1["id"]).json()["access"]
    assert own["mine"] is True and own["can_write"] is True and own["can_comment"] is True

    peer = c1.get("/api/projects/%s" % w2["id"]).json()["access"]
    assert peer["mine"] is False
    assert peer["can_write"] is False, "동료 장은 읽기 전용이다"
    assert peer["can_comment"] is False, "작성 중에는 남의 장에 지적하지 않는다"

    # 검토 단계로 넘기면 지적이 열린다
    ac.post("/api/cycles/%s/status" % cid, json={"status": "review"})
    peer2 = c1.get("/api/projects/%s" % w2["id"]).json()["access"]
    assert peer2["can_write"] is False
    assert peer2["can_comment"] is True
    assert peer2["cycle_status"] == "review"

    # 발행하면 내 것도 잠긴다
    ac.post("/api/cycles/%s/status" % cid, json={"status": "published"})
    own2 = c1.get("/api/projects/%s" % w1["id"]).json()["access"]
    assert own2["can_write"] is False, "확정본이 나간 뒤에 원본이 바뀌면 안 된다"


def test_열람자에게는_회차_명단이_보이지_않는다(tmp_path):
    """동료끼리 서로의 장을 보게 열면서 **열람자에게까지 열려 있었다.**

    발행된 회차에서 열람자가 받은 것은 '이름 목록 + 미해결 지적 수' 였다.
    열지도 못하는 자료의 명단이고, 게다가 메모는 열람자에게 **존재 자체를
    노출하지 않는다**(확정 사항). 참여한 사람에게만 명단을 준다.
    """
    import os
    os.environ["EVER_SKETCH_DB"] = str(tmp_path / "vis2.db")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from server import auth as auth_store
    from server import cycles as cycles_store
    from server.routes_auth import router as auth_router
    from server.routes_cycles import router as cycles_router
    from server.routes_projects import router as proj_router

    app = FastAPI()
    for r in (auth_router, proj_router, cycles_router):
        app.include_router(r)

    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    for lid, role in (("exec1", "writer"), ("exec2", "writer"), ("view1", "viewer")):
        u = auth_store.signup(lid, "password123", lid, "본부", "writer")
        auth_store.approve(admin["id"], u["id"], role)

    def login(lid, pw="password123"):
        c = TestClient(app)
        assert c.post("/api/auth/login", json={"login_id": lid, "password": pw}).status_code == 200
        return c

    ac = login("admin", "adminpw12345")
    cid = ac.post("/api/cycles", json={"period_ym": "2026-12"}).json()["cycle"]["id"]
    ac.post("/api/cycles/%s/distribute" % cid, json={})
    pid = cycles_store.list_cycle_projects(cid)[0]["id"]
    ac.post("/api/projects/%s/comments" % pid, json={"body": "지적", "page_id": 1})
    ac.post("/api/cycles/%s/status" % cid, json={"status": "review"})
    ac.post("/api/cycles/%s/status" % cid, json={"status": "published"})

    got = login("view1").get("/api/cycles/%s" % cid).json()
    assert got["projects"] == [], "열람자에게 명단이 가면 안 된다"
    assert "progress" not in got

    # 참여한 사람에게는 그대로 보인다
    joined = login("exec1").get("/api/cycles/%s" % cid).json()
    assert len(joined["projects"]) == 2
