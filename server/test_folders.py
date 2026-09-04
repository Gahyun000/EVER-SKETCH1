"""개인 폴더 — `Folders(owner_id)` (P4).

`ebook_html1` 의 폴더를 옮겨 오되 **세 가지를 바꾼다.**

1. **`owner_id` 신설 — 사설 트리.** 남의 폴더는 목록에도 없고, id 를 알아도 못 만지고,
   **이름조차 새지 않는다.** 폴더 이름은 그 사람의 사적 메모에 가깝다
   (「2026 재무 구조조정」 같은 이름이 목록에 뜨면 그 자체가 정보다).
   **관리자도 예외가 아니다** — 관리자는 남의 자료를 보지만, 남의 서랍을 정리할 이유는 없다.
2. **깊이 3 제한**(D24). 원본에는 제한이 없었다.
3. **빈 폴더만 삭제**(D20). 원본 `delete_folder` 는 하위 폴더와 그 안의 자료까지
   **통째로 지운다.** 그대로 옮겼으면 폴더 하나 지우다 남의 결재 이력이 있는 자료까지 사라진다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "folders.db")

import pytest  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import folders as fs  # noqa: E402
from server import permissions as perm  # noqa: E402
from server import projects as projects_store  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "folders.db")
ME, YOU = "u_me", "u_you"


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def mk(name, owner=ME, parent=None):
    return fs.create_folder(name, owner, parent)


# ── 만들기 ───────────────────────────────────────
def test_폴더를_만들면_id와_이름이_돌아온다():
    f = mk("2026 계획")
    assert f["name"] == "2026 계획" and f["id"].startswith("f")
    assert f["owner_id"] == ME and f["parent_id"] is None


def test_이름이_비면_만들_수_없다():
    """원본은 빈 이름을 「새 폴더」로 바꿔 줬다. 그러면 「새 폴더」가 여러 개 쌓인다 —
    이름으로 찾을 수 없는 폴더는 정리 도구가 아니다."""
    for bad in ("", "   ", None):
        with pytest.raises(fs.FolderError):
            mk(bad)


def test_같은_부모_아래_이름은_겹칠_수_없다():
    """경로가 곧 이름이다. 「2026 계획」이 나란히 둘이면 어느 쪽에 넣었는지 알 수 없다."""
    mk("2026 계획")
    with pytest.raises(fs.FolderError):
        mk("2026 계획")


def test_부모가_다르면_같은_이름을_쓸_수_있다():
    a = mk("A"); b = mk("B")
    mk("계획", parent=a["id"]); mk("계획", parent=b["id"])   # 안 터진다


def test_남의_폴더와는_이름이_겹쳐도_된다():
    """사설 트리다. 남이 「2026 계획」을 쓴다고 내가 못 쓸 이유가 없다."""
    mk("2026 계획", owner=YOU)
    mk("2026 계획", owner=ME)


# ── 깊이 (D24) ───────────────────────────────────
def test_깊이는_3까지():
    a = mk("1단")
    b = mk("2단", parent=a["id"])
    c = mk("3단", parent=b["id"])
    assert fs.depth_of(c["id"]) == 3
    with pytest.raises(fs.FolderError) as e:
        mk("4단", parent=c["id"])
    assert "3" in str(e.value)


def test_깊이_제한값이_계획서와_같다():
    assert fs.MAX_DEPTH == 3


# ── 목록 · 경로 ──────────────────────────────────
def test_최상위_목록은_부모가_없는_것만():
    a = mk("A"); mk("A-1", parent=a["id"]); mk("B")
    assert [f["name"] for f in fs.list_folders(ME)] == ["A", "B"]


def test_목록은_이름순():
    for n in ("다", "가", "나"):
        mk(n)
    assert [f["name"] for f in fs.list_folders(ME)] == ["가", "나", "다"]


def test_목록에_안에_든_개수가_함께_온다():
    """들어가 보지 않고도 빈 폴더인지 알아야 지울지 말지 판단한다."""
    a = mk("A")
    mk("A-1", parent=a["id"])
    top = fs.list_folders(ME)[0]
    assert top["folder_count"] == 1 and top["project_count"] == 0


def test_경로는_루트부터_차례로():
    a = mk("2026"); b = mk("1분기", parent=a["id"]); c = mk("영업", parent=b["id"])
    assert [p["name"] for p in fs.folder_path(c["id"])] == ["2026", "1분기", "영업"]
    assert fs.folder_path(None) == []


# ── 남의 것은 없는 것과 같다 ──────────────────────
def test_남의_폴더는_목록에_없다():
    mk("남의 폴더", owner=YOU)
    assert fs.list_folders(ME) == []


def test_남의_폴더_이름은_새지_않는다():
    """P4 완료 판정이 그대로 이 문장이다 — 「남의 폴더명이 안 샌다」."""
    you = mk("2026 재무 구조조정", owner=YOU)
    dump = str(fs.list_folders(ME)) + str(fs.folder_path(None))
    assert "구조조정" not in dump
    # 소유자가 함께 오므로 라우터가 남의 것임을 알고 막을 수 있다
    assert fs.get_folder(you["id"])["owner_id"] == YOU


def test_소유자별로_따로_센다():
    mk("A", owner=ME); mk("B", owner=YOU)
    assert len(fs.list_folders(ME)) == 1 and len(fs.list_folders(YOU)) == 1


# ── 이름 변경 · 이동 ─────────────────────────────
def test_이름을_바꾼다():
    f = mk("옛 이름")
    fs.rename_folder(f["id"], "새 이름")
    assert fs.get_folder(f["id"])["name"] == "새 이름"


def test_이름을_바꿀_때도_형제와_겹치면_안_된다():
    mk("A"); b = mk("B")
    with pytest.raises(fs.FolderError):
        fs.rename_folder(b["id"], "A")


def test_자기_자신으로는_옮길_수_없다():
    a = mk("A")
    with pytest.raises(fs.FolderError):
        fs.move_folder(a["id"], a["id"])


def test_자기_하위로는_옮길_수_없다():
    """허용하면 트리가 고리가 되고, 그 순간 경로를 그리는 코드가 무한히 돈다."""
    a = mk("A"); b = mk("A-1", parent=a["id"])
    with pytest.raises(fs.FolderError):
        fs.move_folder(a["id"], b["id"])


def test_옮겨서_깊이가_넘치면_거부한다():
    """**옮기는 폴더 자체의 키**를 함께 봐야 한다. 두 단짜리 가지를 3단 자리에 붙이면
    바닥이 5단이 된다 — 만들 때만 막으면 이 길로 새어 나간다."""
    a = mk("1단"); b = mk("2단", parent=a["id"]); mk("3단", parent=b["id"])
    tall = mk("가지")                      # 가지 아래 한 단 더
    fs.create_folder("가지-1", ME, tall["id"])
    with pytest.raises(fs.FolderError):
        fs.move_folder(tall["id"], b["id"])   # 2단 밑 → 가지(3단) + 가지-1(4단)


def test_깊이가_남으면_옮길_수_있다():
    a = mk("1단"); tall = mk("가지")
    fs.create_folder("가지-1", ME, tall["id"])
    fs.move_folder(tall["id"], a["id"])    # 가지(2단) + 가지-1(3단) → 괜찮다
    assert fs.get_folder(tall["id"])["parent_id"] == a["id"]


# ── 삭제 (D20) ───────────────────────────────────
def test_빈_폴더는_지울_수_있다():
    f = mk("빈 폴더")
    fs.delete_folder(f["id"])
    assert fs.get_folder(f["id"]) is None


def test_하위_폴더가_있으면_못_지운다():
    a = mk("A"); mk("A-1", parent=a["id"])
    with pytest.raises(fs.FolderError):
        fs.delete_folder(a["id"])
    assert fs.get_folder(a["id"]) is not None


def test_자료가_들어_있으면_못_지운다():
    """**원본은 폴더째 지우면서 안의 자료까지 지웠다.** 그대로 옮겼으면
    폴더 하나 정리하다 결재 이력이 붙은 자료가 함께 사라진다."""
    a = mk("A")
    projects_store.create_project("자료", {"pages": []}, owner_id=ME, folder_id=a["id"])
    with pytest.raises(fs.FolderError) as e:
        fs.delete_folder(a["id"])
    assert "자료" in str(e.value)


def test_없는_폴더를_지우면_오류():
    with pytest.raises(fs.FolderError):
        fs.delete_folder("f_없음")


# ── 권한 : 관리자도 남의 폴더는 못 만진다 ────────────
def test_FOLDER_MANAGE_는_소유자만():
    me = perm.Actor(id=ME, role=perm.WRITER, status="active")
    mine = perm.Resource(owner_id=ME)
    yours = perm.Resource(owner_id=YOU)
    assert perm.decide(me, perm.FOLDER_MANAGE, mine) is True
    assert perm.decide(me, perm.FOLDER_MANAGE, yours) is False


def test_관리자도_남의_폴더는_못_만진다():
    """관리자는 남의 **자료**는 본다(결재해야 하므로). 그러나 **서랍**은 다르다 —
    폴더는 정리 도구일 뿐이고(D20), 남의 정리를 대신할 이유가 없다.
    관리자에게 전부 허용하는 기본 규칙보다 **먼저** 판정한다."""
    admin = perm.Actor(id="u_admin", role=perm.ADMIN, status="active")
    assert perm.decide(admin, perm.FOLDER_MANAGE, perm.Resource(owner_id=ME)) is False
    assert perm.decide(admin, perm.FOLDER_MANAGE, perm.Resource(owner_id="u_admin")) is True
    # 자료는 여전히 본다 — 두 규칙이 서로 다른 것을 말한다
    assert perm.decide(admin, perm.READ, perm.Resource(owner_id=ME)) is True


def test_열람자도_자기_폴더는_만진다():
    """D13 — L3 도 개인 스케치를 만든다. 그러면 정리할 서랍도 있어야 한다."""
    v = perm.Actor(id=ME, role=perm.VIEWER, status="active")
    assert perm.decide(v, perm.FOLDER_MANAGE, perm.Resource(owner_id=ME)) is True


def test_비로그인은_거부():
    assert perm.decide(None, perm.FOLDER_MANAGE, perm.Resource(owner_id=ME)) is False


def test_소유자를_모르면_거부():
    me = perm.Actor(id=ME, role=perm.WRITER, status="active")
    assert perm.decide(me, perm.FOLDER_MANAGE, None) is False
    assert perm.decide(me, perm.FOLDER_MANAGE, perm.Resource()) is False


def test_FOLDER_MANAGE_는_전체_액션_목록에_있다():
    assert perm.FOLDER_MANAGE in perm.ALL_ACTIONS


# ══════════════════════════════════════════════
# 라우트 — 남의 폴더는 「없는 것」과 같다
# ══════════════════════════════════════════════
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_folders import router as folders_router  # noqa: E402


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(folders_router)
    return app


def account(login, role="writer"):
    u = auth_store.signup(login, "password123", login, "사업본부", role)
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    return auth_store.approve(admin["id"], u["id"], role)


def client(app, login_id, pw="password123") -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"login_id": login_id, "password": pw})
    assert r.status_code == 200, r.text
    return c


def test_라우트_만들기와_목록():
    app = make_app()
    account("writer1")
    c = client(app, "writer1")
    r = c.post("/api/folders", json={"name": "2026 계획"})
    assert r.status_code == 200, r.text
    fid = r.json()["folder"]["id"]
    body = c.get("/api/folders").json()
    assert [f["name"] for f in body["folders"]] == ["2026 계획"]
    assert body["max_depth"] == fs.MAX_DEPTH
    assert c.get("/api/folders", params={"parent": fid}).json()["path"][0]["name"] == "2026 계획"


def test_라우트_남의_폴더는_404():
    """**403 이 아니라 404.** 403 을 주면 「그 id 는 있다」가 확인되어
    남의 폴더 존재가 새어 나간다."""
    app = make_app()
    account("writer1"); account("writer2")
    mine = client(app, "writer1").post("/api/folders", json={"name": "내 폴더"}).json()["folder"]["id"]
    other = client(app, "writer2")
    assert other.get("/api/folders", params={"parent": mine}).status_code == 404
    assert other.patch("/api/folders/%s" % mine, json={"name": "가로채기"}).status_code == 404
    assert other.delete("/api/folders/%s" % mine).status_code == 404
    assert other.post("/api/folders/%s/move" % mine, json={"parent_id": None}).status_code == 404
    # 없는 id 와 **같은** 응답이어야 한다
    assert other.delete("/api/folders/f_없음").status_code == 404


def test_라우트_관리자도_남의_폴더는_404():
    app = make_app()
    account("writer1")
    mine = client(app, "writer1").post("/api/folders", json={"name": "내 폴더"}).json()["folder"]["id"]
    admin = client(app, "admin", "adminpw12345")
    assert admin.get("/api/folders", params={"parent": mine}).status_code == 404
    assert admin.delete("/api/folders/%s" % mine).status_code == 404
    # 관리자 목록에도 안 뜬다 — 이름이 새지 않는다
    assert admin.get("/api/folders").json()["folders"] == []


def test_라우트_남의_트리에_내_폴더를_심을_수_없다():
    """옮길 **자리**도 내 것인지 봐야 한다. 안 보면 남의 트리에 폴더가 꽂힌다."""
    app = make_app()
    account("writer1"); account("writer2")
    theirs = client(app, "writer2").post("/api/folders", json={"name": "남의 폴더"}).json()["folder"]["id"]
    me = client(app, "writer1")
    mine = me.post("/api/folders", json={"name": "내 폴더"}).json()["folder"]["id"]
    assert me.post("/api/folders/%s/move" % mine, json={"parent_id": theirs}).status_code == 404


def test_라우트_깊이와_삭제_가드():
    app = make_app()
    account("writer1")
    c = client(app, "writer1")
    a = c.post("/api/folders", json={"name": "1단"}).json()["folder"]["id"]
    b = c.post("/api/folders", json={"name": "2단", "parent_id": a}).json()["folder"]["id"]
    d = c.post("/api/folders", json={"name": "3단", "parent_id": b}).json()["folder"]["id"]
    r = c.post("/api/folders", json={"name": "4단", "parent_id": d})
    assert r.status_code == 400 and "3" in r.json()["detail"]
    assert c.delete("/api/folders/%s" % a).status_code == 400     # 하위가 있다
    assert c.delete("/api/folders/%s" % d).status_code == 200     # 빈 폴더


def test_라우트_비로그인은_401():
    app = make_app()
    assert TestClient(app).get("/api/folders").status_code == 401


# ══════════════════════════════════════════════
# 자료 × 폴더 — 두 조건은 AND 로 묶인다 (D20)
# ══════════════════════════════════════════════
from server.routes_projects import router as projects_router  # noqa: E402


def app_with_projects() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(folders_router)
    app.include_router(projects_router)
    return app


def test_폴더로_자료를_거른다():
    app = app_with_projects()
    account("writer1")
    c = client(app, "writer1")
    fid = c.post("/api/folders", json={"name": "2026"}).json()["folder"]["id"]
    c.post("/api/projects", json={"name": "폴더 안", "folder_id": fid})
    c.post("/api/projects", json={"name": "최상위"})

    everything = [p["name"] for p in c.get("/api/projects").json()["projects"]]
    assert sorted(everything) == ["최상위", "폴더 안"], "기본은 서랍을 안 가린다"

    top = [p["name"] for p in c.get("/api/projects", params={"all": "false"}).json()["projects"]]
    assert top == ["최상위"], "all=false 면 최상위만"

    inside = [p["name"] for p in
              c.get("/api/projects", params={"all": "false", "folder": fid}).json()["projects"]]
    assert inside == ["폴더 안"]


def test_폴더는_가시성을_넓히지_못한다():
    """**두 조건은 AND 다**(D20). 같은 폴더에 있다고 남의 자료가 보이면
    폴더가 권한 장치가 되고, 그러면 「이 폴더에 넣으면 누가 보지」를 매번 생각해야 한다."""
    app = app_with_projects()
    account("writer1"); account("writer2")
    a = client(app, "writer1")
    fid = a.post("/api/folders", json={"name": "공용처럼 보이는 폴더"}).json()["folder"]["id"]
    a.post("/api/projects", json={"name": "내 자료", "folder_id": fid})

    b = client(app, "writer2")
    # 남의 폴더 id 로는 아무것도 못 본다 — 없는 것과 같다
    assert b.get("/api/projects", params={"all": "false", "folder": fid}).status_code == 404
    assert [p["name"] for p in b.get("/api/projects").json()["projects"]] == []


def test_남의_폴더에는_자료를_못_넣는다():
    app = app_with_projects()
    account("writer1"); account("writer2")
    fid = client(app, "writer1").post("/api/folders", json={"name": "내 폴더"}).json()["folder"]["id"]
    b = client(app, "writer2")
    assert b.post("/api/projects", json={"name": "몰래", "folder_id": fid}).status_code == 404


def test_관리자는_남의_자료는_보되_폴더로는_못_찾는다():
    """관리자에게 자료는 보인다(결재해야 하므로). 그러나 **서랍은 안 보인다** —
    남의 폴더 id 로 좁히려 하면 없는 것과 같은 404 다."""
    app = app_with_projects()
    account("writer1")
    a = client(app, "writer1")
    fid = a.post("/api/folders", json={"name": "내 폴더"}).json()["folder"]["id"]
    a.post("/api/projects", json={"name": "남의 자료", "folder_id": fid})
    ad = client(app, "admin", "adminpw12345")
    assert "남의 자료" in [p["name"] for p in ad.get("/api/projects").json()["projects"]]
    assert ad.get("/api/projects", params={"all": "false", "folder": fid}).status_code == 404


def test_자료에_folder_id_가_함께_온다():
    """화면이 「이 자료가 어느 서랍에 있나」를 알아야 옮기기를 그릴 수 있다."""
    app = app_with_projects()
    account("writer1")
    c = client(app, "writer1")
    fid = c.post("/api/folders", json={"name": "2026"}).json()["folder"]["id"]
    c.post("/api/projects", json={"name": "자료", "folder_id": fid})
    p = c.get("/api/projects").json()["projects"][0]
    assert p["folder_id"] == fid


def test_전부_평평하게_받는다():
    """검색 범위(D27 — 검색은 하위를 본다)를 계산하려면 트리 전체가 필요하다.
    한 단씩 물으면 검색할 때마다 요청이 줄줄이 나간다."""
    app = make_app()
    account("writer1"); account("writer2")
    c = client(app, "writer1")
    a = c.post("/api/folders", json={"name": "A"}).json()["folder"]["id"]
    c.post("/api/folders", json={"name": "A-1", "parent_id": a})
    c.post("/api/folders", json={"name": "B"})
    client(app, "writer2").post("/api/folders", json={"name": "남의 것"})

    one = c.get("/api/folders").json()["folders"]
    assert [f["name"] for f in one] == ["A", "B"], "기본은 한 단만"
    every = c.get("/api/folders", params={"all": "true"}).json()["folders"]
    assert [f["name"] for f in every] == ["A", "A-1", "B"], "all=true 면 전부"
    assert "남의 것" not in str(every), "남의 폴더는 all=true 에서도 안 샌다"
