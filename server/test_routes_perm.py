"""W1 완료 게이트 — 4계정 × 전 엔드포인트 회귀 테스트.

실제 라우터(routes_auth · routes_projects)를 올려서 HTTP로 때린다.
`permissions.decide()` 단위 테스트와 별개로 **배선이 빠진 곳**을 잡기 위한 스위트다.
가드를 안 붙인 엔드포인트가 하나라도 있으면 여기서 걸린다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "routes.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
    return app


_DB = str(pathlib.Path(_tmp) / "routes.db")


@pytest.fixture()
def ctx():
    """DB를 비우고 4계정 + 프로젝트 3건을 만든다."""
    os.environ["EVER_SKETCH_DB"] = _DB      # 모듈 간 DB 공유 방지
    p = pathlib.Path(_DB)
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(str(p) + suffix)
        if f.exists():
            f.unlink()

    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]

    def mk(login, role):
        u = auth_store.signup(login, "password123", login, "본부", "writer")
        if role:
            auth_store.approve(admin["id"], u["id"], role)
        return auth_store.get_user(u["id"])

    pend = mk("pend", "")
    l1 = mk("viewer", "viewer")
    l2 = mk("writer", "writer")
    l2b = mk("writer2", "writer")

    own = projects_store.create_project("작성자 이북", {"pages": [{"id": 1}]}, owner_id=l2["id"])
    other = projects_store.create_project("타인 이북", {"pages": [{"id": 1}]}, owner_id=l2b["id"])
    pub = projects_store.create_project("발행본", {"pages": [{"id": 1}]}, owner_id=l2b["id"])
    projects_store.set_published(pub["id"], "eb_2026_10")

    ver = projects_store.save_version(own["id"], {"pages": [{"id": 1}]}, label="v1")
    other_ver = projects_store.save_version(other["id"], {"pages": [{"id": 1}]}, label="v1")

    client = TestClient(make_app())

    def as_user(login):
        c = TestClient(make_app())
        if login:
            r = c.post("/api/auth/login", json={"login_id": login, "password": "password123"})
            assert r.status_code == 200, r.text
        return c

    def as_admin():
        c = TestClient(make_app())
        r = c.post("/api/auth/login", json={"login_id": "admin", "password": "adminpw12345"})
        assert r.status_code == 200, r.text
        return c

    return {
        "admin": admin, "pend": pend, "l1": l1, "l2": l2, "l2b": l2b,
        "own": own["id"], "other": other["id"], "pub": pub["id"],
        "ver": ver["id"], "other_ver": other_ver["id"],
        "anon": client, "as_user": as_user, "as_admin": as_admin,
    }


# ═══════════ 가입 · 로그인 ═══════════
def test_가입해도_실권한은_안_나간다(ctx):
    c = ctx["anon"]
    r = c.post("/api/auth/signup", json={
        "login_id": "sneaky", "password": "password123", "name": "침입자",
        "dept": "", "requested_role": "admin",          # L3를 희망해도
    })
    assert r.status_code == 200 and r.json()["status"] == "pending"
    u = [x for x in auth_store.list_users() if x["login_id"] == "sneaky"][0]
    assert u["role"] == "" and u["status"] == "pending"

    # 로그인은 되지만 아무것도 못 본다
    c2 = ctx["as_user"]("sneaky")
    assert c2.get("/api/projects").status_code == 403


def test_비로그인은_전부_401(ctx):
    c = ctx["anon"]
    for method, path in [
        ("get", "/api/projects"), ("post", "/api/projects"),
        ("get", "/api/projects/%s" % ctx["own"]),
        ("put", "/api/projects/%s" % ctx["own"]),
        ("delete", "/api/projects/%s" % ctx["own"]),
        ("get", "/api/notes?project_id=%s" % ctx["own"]),
        ("get", "/api/auth/users"),
    ]:
        kw = {"json": {}} if method in ("post", "put") else {}
        r = getattr(c, method)(path, **kw)
        assert r.status_code == 401, "%s %s → %d" % (method, path, r.status_code)


def test_me는_비로그인도_200(ctx):
    r = ctx["anon"].get("/api/auth/me")
    assert r.status_code == 200 and r.json()["user"] is None


def test_로그아웃하면_세션이_죽는다(ctx):
    c = ctx["as_user"]("writer")
    assert c.get("/api/projects").status_code == 200
    c.post("/api/auth/logout")
    assert c.get("/api/projects").status_code == 401


# ═══════════ 승인 대기 ═══════════
def test_승인대기는_전부_403(ctx):
    c = ctx["as_user"]("pend")
    assert c.get("/api/auth/me").json()["user"]["status"] == "pending"   # 본인 정보는 본다
    for method, path in [
        ("get", "/api/projects"),
        ("get", "/api/projects/%s" % ctx["pub"]),
        ("put", "/api/projects/%s" % ctx["own"]),
        ("delete", "/api/projects/%s" % ctx["own"]),
        ("get", "/api/notes?project_id=%s" % ctx["own"]),
        ("get", "/api/auth/users"),
    ]:
        kw = {"json": {"state": {}}} if method == "put" else {}
        r = getattr(c, method)(path, **kw)
        assert r.status_code == 403, "%s %s → %d" % (method, path, r.status_code)


# ═══════════ L1 열람자 ═══════════
def test_열람자는_발행본만_목록에_보인다(ctx):
    c = ctx["as_user"]("viewer")
    ids = {p["id"] for p in c.get("/api/projects").json()["projects"]}
    assert ids == {ctx["pub"]}


def test_열람자는_미발행_이북을_못_연다(ctx):
    c = ctx["as_user"]("viewer")
    assert c.get("/api/projects/%s" % ctx["pub"]).status_code == 200
    assert c.get("/api/projects/%s" % ctx["own"]).status_code == 403
    assert c.get("/api/projects/%s" % ctx["other"]).status_code == 403


def test_열람자는_편집_삭제_불가(ctx):
    c = ctx["as_user"]("viewer")
    assert c.put("/api/projects/%s" % ctx["pub"], json={"state": {}}).status_code == 403
    assert c.patch("/api/projects/%s" % ctx["pub"], json={"name": "x"}).status_code == 403
    assert c.delete("/api/projects/%s" % ctx["pub"]).status_code == 403
    assert c.post("/api/projects", json={"name": "새것"}).status_code == 403


def test_열람자는_메모를_읽지도_쓰지도_못한다(ctx):
    """확정 사항 — L1에게는 메모 존재 자체를 노출하지 않는다. 빈 목록이 아니라 403."""
    c = ctx["as_user"]("viewer")
    assert c.get("/api/notes?project_id=%s" % ctx["pub"]).status_code == 403
    r = c.post("/api/notes", json={"project_id": ctx["pub"], "id": "n1", "blocks": []})
    assert r.status_code == 403


def test_열람자는_발행본_버전도_읽지만_수정_불가(ctx):
    c = ctx["as_user"]("viewer")
    assert c.get("/api/projects/%s/versions" % ctx["pub"]).status_code == 200
    assert c.post("/api/projects/%s/versions" % ctx["pub"],
                  json={"state": {"pages": []}}).status_code == 403


# ═══════════ L2 작성자 ═══════════
def test_작성자_목록은_본인_것과_발행본만(ctx):
    c = ctx["as_user"]("writer")
    ids = {p["id"] for p in c.get("/api/projects").json()["projects"]}
    assert ids == {ctx["own"], ctx["pub"]}
    assert ctx["other"] not in ids


def test_작성자는_타인_이북에_접근_불가(ctx):
    c = ctx["as_user"]("writer")
    assert c.get("/api/projects/%s" % ctx["other"]).status_code == 403
    assert c.put("/api/projects/%s" % ctx["other"], json={"state": {}}).status_code == 403
    assert c.patch("/api/projects/%s" % ctx["other"], json={"name": "x"}).status_code == 403


def test_작성자는_본인_이북을_수정한다(ctx):
    c = ctx["as_user"]("writer")
    assert c.get("/api/projects/%s" % ctx["own"]).status_code == 200
    assert c.put("/api/projects/%s" % ctx["own"],
                 json={"state": {"pages": [{"id": 1}]}}).status_code == 200


def test_작성자는_본인_것도_삭제_불가(ctx):
    """회차 자료 유실 방지 — 삭제는 L3만."""
    c = ctx["as_user"]("writer")
    assert c.delete("/api/projects/%s" % ctx["own"]).status_code == 403
    assert c.delete("/api/projects/%s" % ctx["other"]).status_code == 403
    assert c.delete("/api/projects/%s/versions/%s" % (ctx["own"], ctx["ver"])).status_code == 403


def test_작성자가_만든_이북은_본인_소유(ctx):
    c = ctx["as_user"]("writer")
    r = c.post("/api/projects", json={"name": "새 이북", "state": {"pages": []}})
    assert r.status_code == 200
    assert r.json()["owner_id"] == ctx["l2"]["id"]


def test_작성자는_본인_이북_메모만(ctx):
    c = ctx["as_user"]("writer")
    assert c.get("/api/notes?project_id=%s" % ctx["own"]).status_code == 200
    assert c.get("/api/notes?project_id=%s" % ctx["other"]).status_code == 403
    r = c.post("/api/notes", json={"project_id": ctx["own"], "id": "n1", "blocks": []})
    assert r.status_code == 200
    r = c.post("/api/notes", json={"project_id": ctx["other"], "id": "n2", "blocks": []})
    assert r.status_code == 403


def test_작성자는_타인_메모를_삭제할_수_없다(ctx):
    """메모 id 만 알아도 지워지면 안 된다 — 소속 이북 기준으로 판정해야 한다."""
    admin = ctx["as_admin"]()
    admin.post("/api/notes", json={"project_id": ctx["other"], "id": "victim", "blocks": []})
    c = ctx["as_user"]("writer")
    assert c.delete("/api/notes/victim").status_code == 403


def test_작성자는_사용자관리_불가(ctx):
    c = ctx["as_user"]("writer")
    assert c.get("/api/auth/users").status_code == 403
    assert c.post("/api/auth/users/%s/approve" % ctx["pend"]["id"],
                  json={"role": "admin"}).status_code == 403
    assert c.post("/api/auth/users/%s/status" % ctx["l1"]["id"],
                  json={"status": "disabled"}).status_code == 403


# ═══════════ 버전 교차 접근 ═══════════
def test_내_pid에_남의_vid를_붙일_수_없다(ctx):
    """기존 라우터는 pid를 무시하고 vid로만 조회했다. 그 구멍이 막혔는지 확인."""
    c = ctx["as_user"]("writer")
    r = c.get("/api/projects/%s/versions/%s" % (ctx["own"], ctx["other_ver"]))
    assert r.status_code == 404
    r = c.patch("/api/projects/%s/versions/%s" % (ctx["own"], ctx["other_ver"]),
                json={"label": "탈취"})
    assert r.status_code == 404
    # 원본 버전의 라벨이 그대로인지
    assert projects_store.get_version(ctx["other_ver"])["label"] == "v1"


def test_본인_버전은_정상_조회(ctx):
    c = ctx["as_user"]("writer")
    r = c.get("/api/projects/%s/versions/%s" % (ctx["own"], ctx["ver"]))
    assert r.status_code == 200 and r.json()["id"] == ctx["ver"]


# ═══════════ L3 관리자 ═══════════
def test_관리자는_전부_본다(ctx):
    c = ctx["as_admin"]()
    ids = {p["id"] for p in c.get("/api/projects").json()["projects"]}
    assert {ctx["own"], ctx["other"], ctx["pub"]} <= ids


def test_관리자는_타인_이북_수정_삭제_가능(ctx):
    c = ctx["as_admin"]()
    assert c.put("/api/projects/%s" % ctx["other"],
                 json={"state": {"pages": []}}).status_code == 200
    assert c.delete("/api/projects/%s" % ctx["other"]).status_code == 200


def test_관리자_승인_흐름(ctx):
    c = ctx["as_admin"]()
    r = c.post("/api/auth/users/%s/approve" % ctx["pend"]["id"], json={"role": "writer"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "writer"
    c2 = ctx["as_user"]("pend")
    assert c2.get("/api/projects").status_code == 200      # 이제 들어온다


def test_관리자는_자기_레벨을_못_바꾼다(ctx):
    c = ctx["as_admin"]()
    r = c.post("/api/auth/users/%s/approve" % ctx["admin"]["id"], json={"role": "viewer"})
    assert r.status_code == 403 and "자기 자신" in r.json()["detail"]


def test_마지막_관리자_비활성화_거부(ctx):
    c = ctx["as_admin"]()
    other_admin = auth_store.signup("admin2", "password123", "관리자2", "", "admin")
    r = c.post("/api/auth/users/%s/status" % other_admin["id"], json={"status": "disabled"})
    assert r.status_code == 200          # 아직 승인 전이라 관리자가 아니다 — 그냥 비활성
    # 시드 관리자를 본인이 끄려 하면 자기 자신이라 거부
    r = c.post("/api/auth/users/%s/status" % ctx["admin"]["id"], json={"status": "disabled"})
    assert r.status_code == 400


# ═══════════ 강등 즉시 반영 ═══════════
def test_강등하면_기존_세션이_즉시_끊긴다(ctx):
    """작성자로 로그인해 둔 세션이, 관리자가 열람자로 내리는 순간 무효가 되어야 한다."""
    c = ctx["as_user"]("writer")
    assert c.get("/api/projects/%s" % ctx["own"]).status_code == 200
    ctx["as_admin"]().post("/api/auth/users/%s/approve" % ctx["l2"]["id"], json={"role": "viewer"})
    assert c.get("/api/projects/%s" % ctx["own"]).status_code == 401     # 세션 소멸


def test_비활성화하면_기존_세션이_끊긴다(ctx):
    c = ctx["as_user"]("writer")
    assert c.get("/api/projects").status_code == 200
    ctx["as_admin"]().post("/api/auth/users/%s/status" % ctx["l2"]["id"],
                           json={"status": "disabled"})
    assert c.get("/api/projects").status_code == 401


# ═══════════ 소유자 없는 레거시 데이터 ═══════════
def test_소유자_없는_이북은_작성자에게_안_보인다(ctx):
    """이관 전 레거시 프로젝트가 L2에게 노출되지 않아야 한다."""
    orphan = projects_store.create_project("레거시", {"pages": []}, owner_id=None)
    c = ctx["as_user"]("writer")
    ids = {p["id"] for p in c.get("/api/projects").json()["projects"]}
    assert orphan["id"] not in ids
    assert c.get("/api/projects/%s" % orphan["id"]).status_code == 403
    # L3에게는 보인다(재배정해야 하므로)
    admin = ctx["as_admin"]()
    assert admin.get("/api/projects/%s" % orphan["id"]).status_code == 200


# ═══════════ 존재하지 않는 id ═══════════
def test_없는_프로젝트는_작성자에게_403_관리자에게_404(ctx):
    """id 존재 여부가 권한 없는 사용자에게 새어나가지 않도록."""
    assert ctx["as_user"]("writer").get("/api/projects/p_nonexistent").status_code == 403
    assert ctx["as_admin"]().get("/api/projects/p_nonexistent").status_code == 404


# ═══════════ 쿠키 속성 ═══════════
def test_세션_쿠키는_HttpOnly이고_HTTP에서는_Secure가_없다(ctx):
    c = TestClient(make_app())
    r = c.post("/api/auth/login", json={"login_id": "writer", "password": "password123"})
    raw = r.headers.get("set-cookie", "")
    assert "httponly" in raw.lower()
    assert "samesite=lax" in raw.lower()
    # 사내망 HTTP 배포 — Secure 를 붙이면 쿠키가 저장되지 않아 로그인 자체가 안 된다.
    assert "secure" not in raw.lower()


# ═══════════ 웹에서 비밀번호 바꾸기 ═══════════
# 화면에 버튼을 달았다(UserBar → ChangePasswordDialog). 그 버튼이 두드리는 길을
# 여기서 검증한다. 강제 변경 화면 말고는 바꿀 문이 없던 시절에는 이 경로가
# 사실상 한 번만 쓰이고 잊혔다.

def test_웹에서_비밀번호를_바꾼다(ctx):
    c = ctx["as_user"]("writer")
    r = c.post("/api/auth/password",
               json={"old_password": "password123", "new_password": "brandnewpw456"})
    assert r.status_code == 200, r.text

    # 새 비밀번호로 들어가진다.
    fresh = ctx["as_user"](None)
    assert fresh.post("/api/auth/login",
                      json={"login_id": "writer", "password": "brandnewpw456"}).status_code == 200
    # 옛 비밀번호는 더 이상 통하지 않는다.
    assert fresh.post("/api/auth/login",
                      json={"login_id": "writer", "password": "password123"}).status_code == 401


def test_바꾸면_다른_기기의_세션이_끊긴다(ctx):
    """같은 계정으로 열어 둔 다른 창은 그 즉시 남의 손이 된다 —
    비밀번호를 바꾸는 이유의 절반이 이것이다."""
    other = ctx["as_user"]("writer")          # 다른 기기라고 치자
    assert other.get("/api/projects").status_code == 200

    ctx["as_user"]("writer").post(
        "/api/auth/password",
        json={"old_password": "password123", "new_password": "brandnewpw456"})

    assert other.get("/api/projects").status_code == 401


def test_현재_비밀번호가_틀리면_거부한다(ctx):
    c = ctx["as_user"]("writer")
    r = c.post("/api/auth/password",
               json={"old_password": "틀린비밀번호", "new_password": "brandnewpw456"})
    assert r.status_code == 400
    # 거부됐으면 원래 비밀번호가 그대로 살아 있어야 한다.
    assert ctx["as_user"](None).post(
        "/api/auth/login", json={"login_id": "writer", "password": "password123"}).status_code == 200


def test_너무_짧은_비밀번호는_거부한다(ctx):
    r = ctx["as_user"]("writer").post(
        "/api/auth/password", json={"old_password": "password123", "new_password": "short7"})
    assert r.status_code == 400


def test_로그인하지_않으면_바꿀_수_없다(ctx):
    r = ctx["anon"].post("/api/auth/password",
                         json={"old_password": "password123", "new_password": "brandnewpw456"})
    assert r.status_code == 401

