"""팀 저장소 · 팀 관리 API — P3.

팀은 **가시성의 단위**다(D1). P6 에서 "같은 팀 승인본"을 판정하려면 팀이 먼저 있어야 한다.
여기서 못박는 것은 세 가지다.

1. **한 시점 한 팀** (Q2 기본안) — 팀에 넣으면 이전 팀에서 빠진다. 스키마는 다중 소속을
   허용하지만(`TeamMembers` PK 가 (team_id, user_id)) 운영은 한 팀으로 간다.
   "현재 팀 / 이전 팀"(D19)이 성립하려면 현재 팀이 하나여야 한다.
2. **팀원이 있는 팀은 못 지운다** — 지우는 순간 그 팀에 붙은 자료가 갈 곳을 잃는다.
3. **팀이 바뀌어도 세션을 끊지 않는다** — 역할 변경과 다르다. 역할은 토큰에 실린 권한을
   바꾸지만, 팀은 `actor_of()` 가 매 요청 DB 에서 다시 읽는다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "teams.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import teams as teams_store  # noqa: E402
from server import permissions as perm  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_teams import router as teams_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "teams.db")


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def mk_user(login, role="writer"):
    """가입 → 승인까지. 팀에 넣을 수 있는 상태의 계정을 만든다."""
    u = auth_store.signup(login, "password123", login, "사업본부", role)
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    return auth_store.approve(admin["id"], u["id"], role)


def seed_admin():
    auth_store.ensure_seed_admin("adminpw12345")
    return [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]


# ── 팀 만들기 ────────────────────────────────────
def test_팀을_만들면_id와_이름이_돌아온다():
    a = seed_admin()
    t = teams_store.create_team("영업1팀", a["id"])
    assert t["name"] == "영업1팀"
    assert t["id"].startswith("t")
    assert teams_store.get_team(t["id"])["name"] == "영업1팀"


def test_같은_이름의_팀은_두_번_만들_수_없다():
    """이름이 겹치면 L1 이 어느 팀에 넣는지 화면에서 구분할 수 없다.
    팀 공유 폴더가 「팀/작성자명/」(D22)이므로 경로까지 겹친다."""
    a = seed_admin()
    teams_store.create_team("영업1팀", a["id"])
    with pytest.raises(teams_store.TeamError):
        teams_store.create_team("영업1팀", a["id"])


def test_이름이_비면_팀을_만들_수_없다():
    a = seed_admin()
    for bad in ("", "   ", None):
        with pytest.raises(teams_store.TeamError):
            teams_store.create_team(bad, a["id"])


def test_팀_이름을_바꾼다():
    a = seed_admin()
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.rename_team(t["id"], "영업2팀")
    assert teams_store.get_team(t["id"])["name"] == "영업2팀"


def test_없는_팀은_None():
    assert teams_store.get_team("t_없음") is None


def test_팀_목록은_이름순():
    a = seed_admin()
    for n in ("다팀", "가팀", "나팀"):
        teams_store.create_team(n, a["id"])
    assert [t["name"] for t in teams_store.list_teams()] == ["가팀", "나팀", "다팀"]


# ── 팀원 편성 ────────────────────────────────────
def test_팀원을_넣으면_소속에_나온다():
    a = seed_admin()
    u = mk_user("writer1")
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    assert teams_store.list_members(t["id"]) == [u["id"]]
    assert teams_store.team_ids_of(u["id"]) == (t["id"],)


def test_소속이_없으면_빈_튜플():
    u = mk_user("writer1")
    assert teams_store.team_ids_of(u["id"]) == ()


def test_같은_사람을_두_번_넣어도_한_번만():
    a = seed_admin()
    u = mk_user("writer1")
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    assert teams_store.list_members(t["id"]) == [u["id"]]


def test_팀에_넣으면_이전_팀에서_빠진다():
    """한 시점 한 팀(Q2). 「현재 팀 / 이전 팀」 구분(D19)이 성립하려면 현재 팀이 하나여야 한다."""
    a = seed_admin()
    u = mk_user("writer1")
    t1 = teams_store.create_team("A팀", a["id"])
    t2 = teams_store.create_team("B팀", a["id"])
    teams_store.add_member(t1["id"], u["id"], a["id"])
    moved = teams_store.add_member(t2["id"], u["id"], a["id"])
    assert moved == [t1["id"]]                       # 어디서 옮겼는지 알려준다
    assert teams_store.team_ids_of(u["id"]) == (t2["id"],)
    assert teams_store.list_members(t1["id"]) == []


def test_옮긴_적이_없으면_빈_목록을_돌려준다():
    a = seed_admin()
    u = mk_user("writer1")
    t = teams_store.create_team("A팀", a["id"])
    assert teams_store.add_member(t["id"], u["id"], a["id"]) == []


def test_팀원을_빼면_소속에서_사라진다():
    a = seed_admin()
    u = mk_user("writer1")
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    teams_store.remove_member(t["id"], u["id"])
    assert teams_store.team_ids_of(u["id"]) == ()


# ── 팀 삭제 ─────────────────────────────────────
def test_팀원이_있으면_팀을_지울_수_없다():
    """지우면 그 팀에 붙은 자료가 갈 곳을 잃는다. 먼저 사람을 빼게 만든다."""
    a = seed_admin()
    u = mk_user("writer1")
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    with pytest.raises(teams_store.TeamError):
        teams_store.delete_team(t["id"])
    assert teams_store.get_team(t["id"]) is not None


def test_빈_팀은_지울_수_있다():
    a = seed_admin()
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.delete_team(t["id"])
    assert teams_store.get_team(t["id"]) is None


# ── 권한 ────────────────────────────────────────
def test_TEAM_MANAGE_는_관리자만():
    admin = perm.Actor(id="a", role=perm.ADMIN, status="active")
    writer = perm.Actor(id="w", role=perm.WRITER, status="active")
    viewer = perm.Actor(id="v", role=perm.VIEWER, status="active")
    assert perm.decide(admin, perm.TEAM_MANAGE) is True
    assert perm.decide(writer, perm.TEAM_MANAGE) is False
    assert perm.decide(viewer, perm.TEAM_MANAGE) is False


def test_TEAM_MANAGE_는_전체_액션_목록에_있다():
    """빠지면 decide() 가 '오타난 액션'으로 보고 조용히 거부한다 — 관리자에게도."""
    assert perm.TEAM_MANAGE in perm.ALL_ACTIONS


def test_Actor_의_팀은_기본이_빈_튜플():
    """기존 Actor(...) 생성 코드가 인자 하나 늘었다고 깨지면 안 된다."""
    assert perm.Actor(id="x", role=perm.WRITER, status="active").team_ids == ()


def test_actor_of_가_팀을_채운다():
    a = seed_admin()
    u = mk_user("writer1")
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    assert auth_store.actor_of(auth_store.get_user(u["id"])).team_ids == (t["id"],)


def test_팀이_바뀌어도_세션은_살아_있다():
    """역할 변경과 다르다. 역할은 토큰이 들고 있던 권한을 바꾸므로 세션을 끊지만,
    팀은 요청마다 actor_of() 가 DB 에서 다시 읽으므로 끊을 이유가 없다.
    끊으면 L1 이 팀을 편성할 때마다 팀원 전원이 튕긴다."""
    a = seed_admin()
    u = mk_user("writer1")
    token, _ = auth_store.login("writer1", "password123")
    t = teams_store.create_team("영업1팀", a["id"])
    teams_store.add_member(t["id"], u["id"], a["id"])
    assert auth_store.user_by_token(token) is not None
    assert auth_store.actor_of(auth_store.user_by_token(token)).team_ids == (t["id"],)


# ── 라우트 ───────────────────────────────────────
def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(teams_router)
    return app


def login_client(login_id: str, pw: str) -> TestClient:
    c = TestClient(make_app())
    r = c.post("/api/auth/login", json={"login_id": login_id, "password": pw})
    assert r.status_code == 200, r.text
    return c


def test_작성자는_팀_API_에_403():
    seed_admin()
    mk_user("writer1")
    c = login_client("writer1", "password123")
    assert c.get("/api/teams").status_code == 403
    assert c.post("/api/teams", json={"name": "몰래팀"}).status_code == 403


def test_비로그인은_팀_API_에_401():
    c = TestClient(make_app())
    assert c.get("/api/teams").status_code == 401


def test_관리자는_팀을_만들고_팀원을_넣는다():
    seed_admin()
    u = mk_user("writer1")
    c = login_client("admin", "adminpw12345")

    r = c.post("/api/teams", json={"name": "영업1팀"})
    assert r.status_code == 200, r.text
    tid = r.json()["team"]["id"]

    r = c.post("/api/teams/%s/members" % tid, json={"user_id": u["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["moved_from"] == []

    r = c.get("/api/teams")
    teams = r.json()["teams"]
    assert len(teams) == 1
    # 화면이 이름을 보여줘야 하므로 사용자 정보까지 실어 준다 — 목록마다 되묻지 않게.
    assert [m["id"] for m in teams[0]["members"]] == [u["id"]]
    assert teams[0]["members"][0]["name"] == "writer1"


def test_없는_사용자는_팀에_못_넣는다():
    seed_admin()
    c = login_client("admin", "adminpw12345")
    tid = c.post("/api/teams", json={"name": "영업1팀"}).json()["team"]["id"]
    assert c.post("/api/teams/%s/members" % tid, json={"user_id": "u_없음"}).status_code == 400


def test_승인_대기_계정은_팀에_못_넣는다():
    """승인 전 계정을 팀에 넣으면, 승인되는 순간 본인도 모르게 팀 자료가 열린다."""
    seed_admin()
    pending = auth_store.signup("nobody", "password123", "무명", "사업본부", "writer")
    c = login_client("admin", "adminpw12345")
    tid = c.post("/api/teams", json={"name": "영업1팀"}).json()["team"]["id"]
    r = c.post("/api/teams/%s/members" % tid, json={"user_id": pending["id"]})
    assert r.status_code == 400


def test_관리자는_팀에_넣지_않는다():
    """L1 은 모든 팀을 보고(7.1) 스위치로 공유한다(D15) — 팀에 넣어도 달라지는 게 없다.
    아무 효과 없는 조작을 허용하면 잘못된 기대만 남는다. 화면에서도 목록에 넣지 않는다."""
    a = seed_admin()
    c = login_client("admin", "adminpw12345")
    tid = c.post("/api/teams", json={"name": "영업1팀"}).json()["team"]["id"]
    r = c.post("/api/teams/%s/members" % tid, json={"user_id": a["id"]})
    assert r.status_code == 400
    assert "관리자" in r.json()["detail"]


def test_없는_팀에_넣으면_404():
    seed_admin()
    u = mk_user("writer1")
    c = login_client("admin", "adminpw12345")
    assert c.post("/api/teams/t_없음/members", json={"user_id": u["id"]}).status_code == 404


def test_팀원을_옮기면_어디서_옮겼는지_알려준다():
    """화면이 「A팀에서 B팀으로 옮겼습니다」라고 말할 수 있어야 한다.
    조용히 빼면 L1 은 자기가 무엇을 했는지 모른다."""
    seed_admin()
    u = mk_user("writer1")
    c = login_client("admin", "adminpw12345")
    t1 = c.post("/api/teams", json={"name": "A팀"}).json()["team"]["id"]
    t2 = c.post("/api/teams", json={"name": "B팀"}).json()["team"]["id"]
    c.post("/api/teams/%s/members" % t1, json={"user_id": u["id"]})
    r = c.post("/api/teams/%s/members" % t2, json={"user_id": u["id"]})
    assert r.json()["moved_from"] == [{"id": t1, "name": "A팀"}]


def test_팀원_삭제와_팀_삭제():
    seed_admin()
    u = mk_user("writer1")
    c = login_client("admin", "adminpw12345")
    tid = c.post("/api/teams", json={"name": "영업1팀"}).json()["team"]["id"]
    c.post("/api/teams/%s/members" % tid, json={"user_id": u["id"]})

    assert c.delete("/api/teams/%s" % tid).status_code == 400      # 팀원이 있다
    assert c.delete("/api/teams/%s/members/%s" % (tid, u["id"])).status_code == 200
    assert c.delete("/api/teams/%s" % tid).status_code == 200


def test_팀_이름_변경_라우트():
    seed_admin()
    c = login_client("admin", "adminpw12345")
    tid = c.post("/api/teams", json={"name": "영업1팀"}).json()["team"]["id"]
    assert c.patch("/api/teams/%s" % tid, json={"name": "영업2팀"}).status_code == 200
    assert c.get("/api/teams").json()["teams"][0]["name"] == "영업2팀"


def test_이름이_겹치면_400():
    seed_admin()
    c = login_client("admin", "adminpw12345")
    c.post("/api/teams", json={"name": "영업1팀"})
    assert c.post("/api/teams", json={"name": "영업1팀"}).status_code == 400
