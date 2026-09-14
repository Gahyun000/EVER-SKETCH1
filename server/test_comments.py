"""앵커 메모 — 문서의 그 자리에 붙는 검토 의견.

지키려는 것
  1. 관리자는 남의 자료에 지적할 수 있고, 작성자는 자기 것에만, 열람자는 못 단다
  2. 지적은 **가리키는 곳**을 잃지 않는다(페이지·요소·칸)
  3. 해결은 스레드 단위 — 답글마다 상태가 따로 놀면 처리 여부를 아무도 못 본다
  4. 남의 지적을 함부로 지울 수 없다(반려 사유가 조용히 사라지면 안 된다)
  5. 자료를 지우면 지적도 함께 사라진다(죽은 id 를 가리킨 채 남지 않는다)
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "comments.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import comments as comments_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "comments.db")


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
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
        u = auth_store.signup(login, "password123", name, "본부", "writer")
        if role:
            auth_store.approve(admin["id"], u["id"], role)
        return auth_store.get_user(u["id"])

    writer = mk("exec1", "writer", "홍길동")
    other = mk("exec2", "writer", "이순신")
    viewer = mk("view1", "viewer", "열람자")

    proj = projects_store.create_project(
        name="홍길동 자료", state={"pages": [{"id": 1, "els": []}]}, owner_id=writer["id"])

    def as_user(login, pw="password123"):
        c = TestClient(make_app())
        assert c.post("/api/auth/login", json={"login_id": login, "password": pw}).status_code == 200
        return c

    return {"admin": admin, "writer": writer, "other": other, "viewer": viewer,
            "pid": proj["id"], "as_user": as_user,
            "as_admin": lambda: as_user("admin", "adminpw12345"),
            "anon": TestClient(make_app())}


def _add(client, pid, body="여기 수치가 실제와 다릅니다", **kw):
    payload = {"body": body, "page_id": 1}
    payload.update(kw)
    return client.post("/api/projects/%s/comments" % pid, json=payload)


# ══════════ 권한 ══════════
def test_관리자는_남의_자료에_지적할_수_있다(ctx):
    r = _add(ctx["as_admin"](), ctx["pid"], el_id=100006, cell="3_5")
    assert r.status_code == 200, r.text
    assert r.json()["comment"]["cell"] == "3_5"


def test_작성자는_자기_것에_달_수_있다(ctx):
    assert _add(ctx["as_user"]("exec1"), ctx["pid"]).status_code == 200


def test_다른_작성자는_남의_것에_못_단다(ctx):
    assert _add(ctx["as_user"]("exec2"), ctx["pid"]).status_code == 403


def test_열람자는_못_단다(ctx):
    assert _add(ctx["as_user"]("view1"), ctx["pid"]).status_code == 403


def test_비로그인은_못_단다(ctx):
    assert _add(ctx["anon"], ctx["pid"]).status_code == 401


def test_다른_작성자는_지적을_읽지도_못한다(ctx):
    """지적에는 남의 자료 내용이 그대로 인용된다."""
    _add(ctx["as_admin"](), ctx["pid"])
    assert ctx["as_user"]("exec2").get(
        "/api/projects/%s/comments" % ctx["pid"]).status_code == 403


# ══════════ 앵커 ══════════
def test_가리키는_곳이_그대로_남는다(ctx):
    _add(ctx["as_admin"](), ctx["pid"], el_id=42, cell="2_7", page_id=1)
    t = ctx["as_user"]("exec1").get("/api/projects/%s/comments" % ctx["pid"]).json()["comments"][0]
    assert (t["page_id"], t["el_id"], t["cell"]) == (1, 42, "2_7")


def test_페이지에만_붙일_수도_있다(ctx):
    """'이 장 전체' 에 대한 의견도 있다."""
    r = _add(ctx["as_admin"](), ctx["pid"])
    assert r.json()["comment"]["el_id"] is None


def test_빈_내용은_거부한다(ctx):
    assert _add(ctx["as_admin"](), ctx["pid"], body="   ").status_code == 400


def test_너무_긴_메모는_거부한다(ctx):
    r = _add(ctx["as_admin"](), ctx["pid"], body="가" * (comments_store.MAX_BODY + 1))
    assert r.status_code == 400


# ══════════ 스레드 ══════════
def test_답글은_같은_스레드에_같은_자리를_가리킨다(ctx):
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"], el_id=42, cell="2_7").json()["comment"]
    # 작성자가 답한다 — 답글에는 자리를 안 적어도 뿌리와 같은 곳을 가리켜야 한다.
    r = ctx["as_user"]("exec1").post(
        "/api/projects/%s/comments" % ctx["pid"],
        json={"body": "확인해서 고쳤습니다", "page_id": 99, "reply_to": root["id"]})
    assert r.status_code == 200, r.text
    reply = r.json()["comment"]
    assert reply["thread_id"] == root["id"]
    assert (reply["page_id"], reply["el_id"], reply["cell"]) == (1, 42, "2_7"), \
        "답글이 뿌리와 다른 곳을 가리키면 스레드가 두 곳을 가리키게 된다."

    threads = c.get("/api/projects/%s/comments" % ctx["pid"]).json()["comments"]
    assert len(threads) == 1 and len(threads[0]["replies"]) == 1


def test_다른_문서의_메모에는_답글을_달_수_없다(ctx):
    """허용하면 그 문서를 볼 권한이 없는 사람이 남의 스레드에 글을 남길 수 있다."""
    c = ctx["as_admin"]()
    other = projects_store.create_project(name="남의 것", state={"pages": []},
                                          owner_id=ctx["other"]["id"])
    root = _add(c, other["id"]).json()["comment"]
    r = c.post("/api/projects/%s/comments" % ctx["pid"],
               json={"body": "끼어들기", "page_id": 1, "reply_to": root["id"]})
    assert r.status_code == 400


# ══════════ 해결 ══════════
def test_해결은_스레드_단위다(ctx):
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    reply = c.post("/api/projects/%s/comments" % ctx["pid"],
                   json={"body": "답", "page_id": 1, "reply_to": root["id"]}).json()["comment"]
    # 답글 id 로 해결해도 뿌리에 적용된다
    r = c.post("/api/comments/%s/resolve" % reply["id"], json={"resolved": True})
    assert r.status_code == 200, r.text
    assert r.json()["comment"]["id"] == root["id"]
    assert r.json()["comment"]["resolved_at"] is not None


def test_지적받은_사람은_스스로_닫지_못한다(ctx):
    """규칙을 바꿨다.

    담당자가 자기에게 온 지적을 스스로 닫게 두면 "고쳤다" 와 "정말 고쳤다" 가
    구분되지 않는다. 그러면 발행 직전의 '미해결 0건' 이 아무것도 보장하지 못한다.
    담당자 쪽 손은 「고쳤습니다」다.
    """
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    r = ctx["as_user"]("exec1").post("/api/comments/%s/resolve" % root["id"],
                                     json={"resolved": True})
    assert r.status_code == 403

    # 대신 「고쳤습니다」 는 할 수 있다.
    f = ctx["as_user"]("exec1").post("/api/comments/%s/fixed" % root["id"],
                                     json={"fixed": True})
    assert f.status_code == 200, f.text
    assert f.json()["comment"]["fixed_at"] is not None
    assert f.json()["comment"]["resolved_at"] is None, "고쳤다고 닫히면 안 된다"


def test_지적한_사람이_닫는다(ctx):
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    r = c.post("/api/comments/%s/resolve" % root["id"], json={"resolved": True})
    assert r.status_code == 200
    assert r.json()["comment"]["resolved_at"] is not None


def test_고쳤다고_누르면_답글이_한_줄_달린다(ctx):
    """상태만 바뀌면 지적한 사람은 목록에서 무엇이 달라졌는지 알 수 없다."""
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    ctx["as_user"]("exec1").post("/api/comments/%s/fixed" % root["id"], json={"fixed": True})
    threads = c.get("/api/projects/%s/comments" % ctx["pid"]).json()["comments"]
    t = [x for x in threads if x["id"] == root["id"]][0]
    assert len(t["replies"]) == 1
    assert "고쳤습니다" in t["replies"][0]["body"]
    assert t["replies"][0]["author_id"] == ctx["writer"]["id"]


def test_고쳤다는_말을_직접_쓸_수_있다(ctx):
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    ctx["as_user"]("exec1").post("/api/comments/%s/fixed" % root["id"],
                                 json={"fixed": True, "body": "3월로 당겼습니다"})
    threads = c.get("/api/projects/%s/comments" % ctx["pid"]).json()["comments"]
    t = [x for x in threads if x["id"] == root["id"]][0]
    assert t["replies"][0]["body"] == "3월로 당겼습니다"


def test_해결하면_고침_표시가_지워진다(ctx):
    """남겨두면 '내 차례' 로 다시 세어져서, 해결했는데도 할 일이 줄지 않는다."""
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    ctx["as_user"]("exec1").post("/api/comments/%s/fixed" % root["id"], json={"fixed": True})
    out = c.post("/api/comments/%s/resolve" % root["id"], json={"resolved": True}).json()["comment"]
    assert out["resolved_at"] is not None
    assert out["fixed_at"] is None


def test_남의_자료에는_고쳤다고_누를_수_없다(ctx):
    """「고쳤습니다」는 지적받은 쪽 손이다. 동료가 대신 눌러 줄 수는 없다."""
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    r = ctx["as_user"]("exec2").post("/api/comments/%s/fixed" % root["id"], json={"fixed": True})
    assert r.status_code == 403


def test_관리자는_대신_닫을_수_있다(ctx):
    """리뷰어가 자리를 비운 회차가 영영 막히면 안 된다. 대신 기록에 남는다."""
    c = ctx["as_admin"]()
    # 자료 주인이 스스로 남긴 메모 — 지적한 사람은 exec1 이다.
    root = ctx["as_user"]("exec1").post(
        "/api/projects/%s/comments" % ctx["pid"],
        json={"body": "여기 확인 필요", "page_id": 1}).json()["comment"]
    r = c.post("/api/comments/%s/resolve" % root["id"], json={"resolved": True})
    assert r.status_code == 200


def test_다시_열_수_있다(ctx):
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    c.post("/api/comments/%s/resolve" % root["id"], json={"resolved": True})
    r = c.post("/api/comments/%s/resolve" % root["id"], json={"resolved": False})
    assert r.json()["comment"]["resolved_at"] is None


def test_미해결_수를_센다(ctx):
    c = ctx["as_admin"]()
    a = _add(c, ctx["pid"], body="첫째").json()["comment"]
    _add(c, ctx["pid"], body="둘째")
    assert comments_store.unresolved_count(ctx["pid"]) == 2
    c.post("/api/comments/%s/resolve" % a["id"], json={"resolved": True})
    assert comments_store.unresolved_count(ctx["pid"]) == 1


def test_여러_자료의_미해결_수를_한_번에_센다(ctx):
    """회차 화면에서 20명분을 한 줄씩 물어보면 화면이 뜨지 않는다."""
    c = ctx["as_admin"]()
    _add(c, ctx["pid"])
    other = projects_store.create_project(name="다른 것", state={"pages": []},
                                          owner_id=ctx["other"]["id"])
    counts = comments_store.counts_for([ctx["pid"], other["id"]])
    assert counts == {ctx["pid"]: 1}


# ══════════ 삭제 ══════════
def test_남의_지적은_함부로_못_지운다(ctx):
    """읽고 쓸 수 있다고 남의 지적을 지울 수 있으면 반려 사유가 조용히 사라진다."""
    root = _add(ctx["as_admin"](), ctx["pid"]).json()["comment"]
    r = ctx["as_user"]("exec1").delete("/api/comments/%s" % root["id"])
    assert r.status_code == 403
    assert comments_store.get(root["id"]) is not None


def test_자기가_쓴_것은_지울_수_있다(ctx):
    c = ctx["as_user"]("exec1")
    mine = _add(c, ctx["pid"], body="내 메모").json()["comment"]
    assert c.delete("/api/comments/%s" % mine["id"]).status_code == 200
    assert comments_store.get(mine["id"]) is None


def test_뿌리를_지우면_스레드가_통째로_사라진다(ctx):
    """답글만 남으면 무엇에 대한 답인지 알 수 없는 글이 된다."""
    c = ctx["as_admin"]()
    root = _add(c, ctx["pid"]).json()["comment"]
    reply = c.post("/api/projects/%s/comments" % ctx["pid"],
                   json={"body": "답", "page_id": 1, "reply_to": root["id"]}).json()["comment"]
    c.delete("/api/comments/%s" % root["id"])
    assert comments_store.get(reply["id"]) is None


def test_자료를_지우면_지적도_함께_사라진다(ctx):
    """죽은 project_id 를 가리킨 채 남으면, 지웠는데 지적 내용은 DB 에 남는다."""
    _add(ctx["as_admin"](), ctx["pid"])
    projects_store.delete_project(ctx["pid"])
    assert comments_store.list_for_project(ctx["pid"]) == []


def test_없는_메모는_404(ctx):
    assert ctx["as_admin"]().post("/api/comments/없는거/resolve",
                                  json={"resolved": True}).status_code == 404


# ══════════ 범위 앵커 ══════════
def test_범위를_그대로_저장한다(ctx):
    """로드맵 지적의 대부분은 칸 하나가 아니라 **구간**에 달린다.
    "3~5월 구간이 앞 장과 다릅니다" 를 왼쪽 위 한 칸으로만 저장하면,
    받는 사람은 어느 구간인지 글을 다시 읽어야 한다."""
    t = comments_store.add(ctx["pid"], ctx["admin"]["id"], "3~5월 구간이 앞 장과 다릅니다",
                           page_id=1, el_id=7, cell="3_3:3_5")
    assert t["cell"] == "3_3:3_5"


def test_거꾸로_끌어도_같은_값으로_저장된다(ctx):
    """끌어서 고르면 시작점이 오른쪽 아래일 수 있다. 정규화하지 않으면 같은
    범위가 네 가지 문자열로 저장되고, 핀을 그리는 쪽이 그 네 경우를 다 알아야 한다."""
    got = set()
    for cell in ("3_3:5_6", "5_6:3_3", "3_6:5_3", "5_3:3_6"):
        t = comments_store.add(ctx["pid"], ctx["admin"]["id"], "같은 범위", 1, 7, cell)
        got.add(t["cell"])
    assert got == {"3_3:5_6"}, got


def test_한_칸이면_콜론_없이_쓴다(ctx):
    """예전에 달린 의견과 같은 형식이어야 한다 — 형식이 갈리면 옛 지적이
    가리키던 자리를 잃는다."""
    t = comments_store.add(ctx["pid"], ctx["admin"]["id"], "한 칸", 1, 7, "4_4:4_4")
    assert t["cell"] == "4_4"


def test_말이_안_되는_앵커는_거부한다(ctx):
    for bad in ("3", "a_b", "3_", "-1_2", "3_5:x", "3_5:9999_1"):
        with pytest.raises(comments_store.CommentError):
            comments_store.add(ctx["pid"], ctx["admin"]["id"], "이상한 앵커", 1, 7, bad)


def test_답글은_범위까지_그대로_물려받는다(ctx):
    root = comments_store.add(ctx["pid"], ctx["admin"]["id"], "구간 확인", 1, 7, "2_2:2_9")
    rep = comments_store.add(ctx["pid"], ctx["writer"]["id"], "고쳤습니다", 1, None, None,
                             reply_to=root["id"])
    assert rep["cell"] == "2_2:2_9"
    assert rep["el_id"] == 7


# ══════════ 표가 바뀌면 앵커도 따라간다 ══════════
# 조용히 틀리는 종류다. 앵커를 안 옮기면 지적은 그대로인데 **엉뚱한 칸**을
# 가리키게 되고, 아무도 그 사실을 모른 채 회의에 들어간다.
import pytest as _pytest  # noqa: E402


@_pytest.mark.parametrize("cell,axis,at,delta,want", [
    # 행 추가 — 아래쪽이 밀린다
    ("3_5", "row", 2, +1, "4_5"),
    ("3_5", "row", 5, +1, "3_5"),          # 아래에 추가 — 그대로
    ("2_1:5_1", "row", 3, +1, "2_1:6_1"),  # 범위를 걸치면 아래쪽만 늘어난다
    # 행 삭제
    ("3_5", "row", 1, -1, "2_5"),
    ("3_5", "row", 3, -1, None),           # 그 줄이 사라졌다
    ("3_5", "row", 4, -1, "3_5"),          # 아래 줄 삭제 — 그대로
    ("2_1:5_1", "row", 3, -1, "2_1:4_1"),  # 범위가 한 칸 줄어든다
    ("3_1:3_9", "row", 3, -1, None),       # 한 줄짜리 범위 — 통째로 사라진다
    # 열도 같다
    ("3_5", "col", 2, +1, "3_6"),
    ("3_4:3_6", "col", 5, -1, "3_4:3_5"),
    ("3_4:3_6", "col", 9, -1, "3_4:3_6"),
])
def test_앵커가_행열_변화를_따라간다(cell, axis, at, delta, want):
    assert comments_store.shift_anchor(cell, axis, at, delta) == want


def test_가리킬_곳이_사라지면_남기되_표시한다(ctx):
    """지우는 것보다 낫다 — 검토 이력이 조용히 사라지는 것이 제일 나쁘다."""
    t = comments_store.add(ctx["pid"], ctx["admin"]["id"], "이 줄 확인", 1, 7, "3_5")
    out = comments_store.shift_anchors(ctx["pid"], 7, "row", 3, -1)
    assert out["lost"] == 1 and out["deleted"] == 0
    again = comments_store.get(t["id"])
    assert again is not None, "남아 있어야 한다"
    assert again["lost_at"] is not None


def test_원하면_함께_지운다(ctx):
    t = comments_store.add(ctx["pid"], ctx["admin"]["id"], "이 줄 확인", 1, 7, "3_5")
    out = comments_store.shift_anchors(ctx["pid"], 7, "row", 3, -1, on_lost="delete")
    assert out["deleted"] == 1
    assert comments_store.get(t["id"]) is None


def test_다른_표의_지적은_건드리지_않는다(ctx):
    a = comments_store.add(ctx["pid"], ctx["admin"]["id"], "표7", 1, 7, "3_5")
    b = comments_store.add(ctx["pid"], ctx["admin"]["id"], "표9", 1, 9, "3_5")
    comments_store.shift_anchors(ctx["pid"], 7, "row", 1, +1)
    assert comments_store.get(a["id"])["cell"] == "4_5"
    assert comments_store.get(b["id"])["cell"] == "3_5"
