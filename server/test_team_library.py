"""팀 공유 회귀 테스트 (P6).

이 스위트가 지키는 것은 **한 문장**이다 — 승인되면 그 순간 같은 팀에 뜨고,
그 밖의 누구에게도 안 뜬다. 여기가 깨지면 남의 팀 자료가 새거나(권한 사고),
승인해도 아무 일이 안 일어난다(결재가 무의미해진다).

특히 **팀은 「지금 소속」이 아니라 「제출 시점의 팀」**(D9)이라는 규칙은
사람이 팀을 옮기고 나서야 드러난다. 옮기는 시나리오를 실제로 돌린다.
"""
import os
import pathlib
import re
import tempfile
import time

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "lib.db")

import pytest  # noqa: E402

from server import approvals as ap  # noqa: E402
from server import auth as auth_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server import team_library as lib  # noqa: E402
from server import teams as teams_store  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "lib.db")
DOC = {"title": "9월 자료", "pages": [{"id": 1}, {"id": 2}]}


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


class World:
    """관리자 1 · 작성자 2(같은 팀) · 작성자 1(다른 팀) · 열람자 1."""

    def __init__(self):
        auth_store.ensure_seed_admin("adminpw12345")
        self.admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
        self.sales = teams_store.create_team("영업1팀", self.admin["id"])
        self.tech = teams_store.create_team("기술2팀", self.admin["id"])
        self.a = self._user("writer_a", "김가현", self.sales["id"])
        self.b = self._user("writer_b", "이나연", self.sales["id"])
        self.c = self._user("writer_c", "박다솜", self.tech["id"])
        self.v = self._user("viewer_v", "최라온", None, role="viewer")

    def _user(self, login, name, team, role="writer"):
        u = auth_store.signup(login, "password123", name, "본부", role)
        auth_store.approve(self.admin["id"], u["id"], role)
        if team:
            teams_store.add_member(team, u["id"], self.admin["id"])
        return auth_store.get_user(u["id"])

    def actor(self, u):
        return auth_store.actor_of(auth_store.get_user(u["id"]))

    def approved(self, owner, name="9월 자료", decided_at=None):
        """제출하고 승인까지 한 번에. 승인 시각을 지정할 수 있다(월 묶음 검사용)."""
        p = projects_store.create_project(name, DOC, owner_id=owner["id"])
        a = ap.request(p["id"], owner["id"])
        a = ap.decide(a["id"], "approve", self.admin["id"])
        if decided_at is not None:
            _set_decided_at(a["id"], decided_at)
            a["decided_at"] = decided_at
        return p, a


    def again(self, owner, project_id, message=""):
        """이미 승인된 자료를 **다시 승인받는다.** P7 이후 이 길은 하나뿐이다 —
        수정 요청 → 허락 → 재제출 → 재승인. 승인본을 그대로 다시 낼 수는 없다."""
        rv = ap.request_revision(project_id, owner["id"], message)
        ap.decide_revision(rv["id"], "approve", self.admin["id"])
        a = ap.request(project_id, owner["id"])
        return ap.decide(a["id"], "approve", self.admin["id"])


def _set_decided_at(aid, ts):
    import sqlite3
    c = sqlite3.connect(_DB)
    c.execute("UPDATE Approvals SET decided_at=? WHERE id=?", (ts, aid))
    c.commit()
    c.close()


def _all_ids(view):
    return {it["id"] for t in view["teams"] for a in t["authors"]
            for m in a["months"] for it in m["items"]}


# ── 승인이 곧 공유 (D6) ─────────────────────────────
def test_승인하면_같은_팀에_바로_뜬다():
    """**P5 의 확인창이 「승인하면 같은 팀에 바로 공유됩니다」라고 약속했다.**
    그 문장이 참이 되는 자리가 여기다."""
    w = World()
    _, a = w.approved(w.a)
    assert a["id"] in _all_ids(lib.library(w.actor(w.b)))


def test_승인_전에는_팀에_안_뜬다():
    """대기 중인 제출본이 팀에 보이면 「승인이 곧 공유」가 「제출이 곧 공유」가 된다."""
    w = World()
    p = projects_store.create_project("9월 자료", DOC, owner_id=w.a["id"])
    ap.request(p["id"], w.a["id"])
    assert _all_ids(lib.library(w.actor(w.b))) == set()
    assert _all_ids(lib.library(w.actor(w.a))) == set()   # 낸 사람에게도 팀 공유엔 안 뜬다


def test_반려된_것도_회수한_것도_팀에_안_뜬다():
    w = World()
    p1 = projects_store.create_project("반려될 것", DOC, owner_id=w.a["id"])
    a1 = ap.request(p1["id"], w.a["id"])
    ap.decide(a1["id"], "reject", w.admin["id"], "다시")
    p2 = projects_store.create_project("거둘 것", DOC, owner_id=w.a["id"])
    a2 = ap.request(p2["id"], w.a["id"])
    ap.withdraw(a2["id"])
    assert _all_ids(lib.library(w.actor(w.a))) == set()


def test_다른_팀에는_안_뜬다():
    """가장 굵은 선. 기술2팀은 영업1팀 승인본을 목록에서도 못 본다."""
    w = World()
    _, a = w.approved(w.a)
    assert _all_ids(lib.library(w.actor(w.c))) == set()


def test_팀_없는_사람은_빈_목록을_본다():
    """오류가 아니라 **빈 목록**이다 — 아직 볼 게 없을 뿐이다."""
    w = World()
    w.approved(w.a)
    assert lib.library(w.actor(w.v)) == {"teams": []}


def test_관리자는_모든_팀을_본다():
    w = World()
    _, a1 = w.approved(w.a)
    _, a2 = w.approved(w.c)
    view = lib.library(w.actor(w.admin))
    assert _all_ids(view) == {a1["id"], a2["id"]}
    assert {t["name"] for t in view["teams"]} == {"영업1팀", "기술2팀"}


# ── 팀을 옮기면 (D9 · D18 · D19 · D23) ─────────────────────────────
def test_옮겨도_옛_자료는_옛_팀에_남는다():
    """**D18 — 자료는 만들어진 팀의 것이다.** 사람이 나가도 팀에 남는다."""
    w = World()
    _, a = w.approved(w.a)
    teams_store.add_member(w.tech["id"], w.a["id"], w.admin["id"])   # 영업1팀 → 기술2팀
    # 남은 영업1팀 사람은 계속 본다
    assert a["id"] in _all_ids(lib.library(w.actor(w.b)))
    # 옮겨 간 팀에는 안 따라간다
    assert a["id"] not in _all_ids(lib.library(w.actor(w.c)))


def test_옮긴_사람은_제_옛_자료만_이전_팀에서_본다():
    """**D23 — 이전 팀에서는 본인 것만.** 나연이 자료는 더는 안 보인다."""
    w = World()
    _, mine = w.approved(w.a, "내가 낸 것")
    _, hers = w.approved(w.b, "나연이가 낸 것")
    teams_store.add_member(w.tech["id"], w.a["id"], w.admin["id"])

    view = lib.library(w.actor(w.a))
    assert _all_ids(view) == {mine["id"]}
    past = [t for t in view["teams"] if t["id"] == w.sales["id"]][0]
    assert past["relation"] == lib.PAST
    assert past["readonly"] is True


def test_새로_들어온_사람은_그_팀의_옛_승인본을_본다():
    """자료는 사람이 아니라 팀의 것이므로(D18), 새 팀원은 그날부터 과거분을 본다."""
    w = World()
    _, a = w.approved(w.a)
    teams_store.add_member(w.sales["id"], w.c["id"], w.admin["id"])
    view = lib.library(w.actor(w.c))
    assert a["id"] in _all_ids(view)
    assert [t for t in view["teams"] if t["id"] == w.sales["id"]][0]["relation"] == lib.CURRENT


def test_현재_팀이_이전_팀보다_위에_온다():
    """매일 여는 곳이 스크롤 아래 있으면 안 된다."""
    w = World()
    w.approved(w.a, "영업에서 낸 것")
    teams_store.add_member(w.tech["id"], w.a["id"], w.admin["id"])
    w.approved(w.a, "기술에서 낸 것")
    rel = [t["relation"] for t in lib.library(w.actor(w.a))["teams"]]
    assert rel == [lib.CURRENT, lib.PAST]


def test_관리자에게_남의_팀은_이전_팀이_아니다():
    """**없는 근거로 「이전 팀입니다」라고 쓰지 않는다.** 관리자는 그 팀에 있었던 적이
    없을 수 있고, 팀 소속 이력을 저장하지 않으므로 알 방법도 없다."""
    w = World()
    w.approved(w.a)
    t = lib.library(w.actor(w.admin))["teams"][0]
    assert t["relation"] == lib.OTHER
    assert t["readonly"] is True


# ── 묶음: 팀 / 작성자 / 월 (D22) ─────────────────────────────
def test_작성자별로_묶고_본인이_맨_위다():
    w = World()
    w.approved(w.a, "가현 자료")
    w.approved(w.b, "나연 자료")
    team = lib.library(w.actor(w.b))["teams"][0]
    assert [a["name"] for a in team["authors"]] == ["이나연", "김가현"]
    assert team["authors"][0]["is_me"] is True
    assert team["count"] == 2


def _ms(y, mo, d):
    """**저장되는 단위 그대로**(밀리초). 초로 넣으면 테스트는 통과하면서
    실제 데이터에서는 연도가 58645 가 되는 것을 못 잡는다 — 2026-09-07 에 겪었다."""
    return time.mktime((y, mo, d, 12, 0, 0, 0, 0, -1)) * 1000


def test_월은_승인_시각으로_묶는다():
    """제출 시각이 아니다 — 9월 30일에 내고 10월 2일에 승인됐다면
    그 자료가 팀에 **존재하게 된 것**은 10월이다."""
    w = World()
    w.approved(w.a, "9월 것", decided_at=_ms(2026, 9, 20))
    w.approved(w.a, "10월 것", decided_at=_ms(2026, 10, 2))
    author = lib.library(w.actor(w.a))["teams"][0]["authors"][0]
    assert [m["ym"] for m in author["months"]] == ["2026-10", "2026-09"]   # 최근이 위


def test_승인_시각은_밀리초로_들어온다():
    """**단위를 못박는다.** `approvals._now()` 가 밀리초를 저장하므로 여기도 밀리초다.
    초로 읽으면 「승인일 미상」이 되고, 화면에서는 자료가 전부 한 덩어리로 묶인다."""
    w = World()
    _, a = w.approved(w.a, "9월 것")
    assert a["decided_at"] > 1e12, "decided_at 이 밀리초가 아니다"
    ym = lib.library(w.actor(w.a))["teams"][0]["authors"][0]["months"][0]["ym"]
    assert re.match(r"^\d{4}-\d{2}$", ym), "화면이 못 읽는 달 표기: %r" % ym
    assert ym == time.strftime("%Y-%m", time.localtime(a["decided_at"] / 1000.0))


def test_한_자료는_최신_승인본_하나만_뜬다():
    """3차까지 승인된 자료가 목록에 셋으로 늘어서면
    「어느 게 최신인가」를 사람이 매번 판단해야 한다."""
    w = World()
    p, first = w.approved(w.a, "여러 번 낸 것")
    second = w.again(w.a, p["id"])
    ids = _all_ids(lib.library(w.actor(w.b)))
    assert ids == {second["id"]}
    assert first["id"] not in ids
    assert second["round"] == 2


def test_지난_승인본은_이력으로_남는다():
    """목록에서 뺀 것이지 지운 것이 아니다."""
    w = World()
    p, first = w.approved(w.a, "여러 번 낸 것")
    second = w.again(w.a, p["id"])
    h = lib.history(w.actor(w.b), p["id"])
    assert [x["id"] for x in h] == [second["id"], first["id"]]   # 최근이 앞


def test_남의_팀_자료는_이력도_안_열린다():
    w = World()
    p, _ = w.approved(w.a)
    assert lib.history(w.actor(w.c), p["id"]) == []


# ── 한 건 열기 ─────────────────────────────
def test_승인본을_열면_얼어붙은_사본이_온다():
    """**§3.1 승인본과 작업본의 분리.** 작성자가 지금 그 자료를 고쳐도
    팀이 보는 그림은 안 흔들린다 — 승인은 *그때 그 문서*에 대한 승인이다."""
    w = World()
    p, a = w.approved(w.a)
    projects_store.save_project(p["id"], {"title": "완전히 다른 것", "pages": []})
    got = lib.visible_approval(w.actor(w.b), a["id"])
    assert got["snapshot"]["title"] == "9월 자료"
    assert len(got["snapshot"]["pages"]) == 2


def test_남의_팀_승인본은_id_를_알아도_못_연다():
    """화면을 안 거치고 직접 불러도 막힌다 — 「팀 공유에서 열었다」는
    화면의 사정이지 권한의 근거가 아니다."""
    w = World()
    _, a = w.approved(w.a)
    assert lib.visible_approval(w.actor(w.c), a["id"]) is None
    assert lib.visible_approval(w.actor(w.v), a["id"]) is None


def test_비로그인_비활성은_아무것도_못_본다():
    w = World()
    _, a = w.approved(w.a)
    assert lib.library(None) == {"teams": []}
    assert lib.visible_approval(None, a["id"]) is None
    auth_store.set_status(w.admin["id"], w.b["id"], "disabled")
    dead = auth_store.actor_of(auth_store.get_user(w.b["id"]))
    assert lib.library(dead) == {"teams": []}
    assert lib.visible_approval(dead, a["id"]) is None


# ══════════════════════════════════════════════
# 라우트 — 화면이 실제로 부르는 길
# ══════════════════════════════════════════════
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.routes_approvals import router as approvals_router  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as projects_router  # noqa: E402
from server.routes_team_library import router as library_router  # noqa: E402


def make_app() -> FastAPI:
    app = FastAPI()
    for r in (auth_router, projects_router, approvals_router, library_router):
        app.include_router(r)
    return app


def cli(app, login_id, pw="password123") -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"login_id": login_id, "password": pw})
    assert r.status_code == 200, r.text
    return c


def test_라우트_승인본이_같은_팀에_뜬다():
    app = make_app()
    w = World()
    _, a = w.approved(w.a)
    body = cli(app, "writer_b").get("/api/team-library").json()
    assert _all_ids(body) == {a["id"]}
    assert body["teams"][0]["name"] == "영업1팀"


def test_라우트_다른_팀에는_빈_목록이_온다():
    """**403 이 아니라 빈 목록**이다 — 볼 게 없는 것과 오류는 다르다."""
    app = make_app()
    w = World()
    w.approved(w.a)
    r = cli(app, "writer_c").get("/api/team-library")
    assert r.status_code == 200 and r.json()["teams"] == []


def test_라우트_열람자도_오류_대신_빈_화면을_본다():
    """L3 은 팀이 없다(D13 — 순수 개인 작업 공간). 팀 공유를 열면 조용히 비어 있어야지
    「권한이 없습니다」가 뜨면 안 된다 — 권한 문제가 아니라 아직 볼 게 없는 것이다."""
    app = make_app()
    w = World()
    w.approved(w.a)
    r = cli(app, "viewer_v").get("/api/team-library")
    assert r.status_code == 200 and r.json()["teams"] == []


def test_라우트_스냅샷을_연다():
    app = make_app()
    w = World()
    p, a = w.approved(w.a)
    got = cli(app, "writer_b").get("/api/team-library/approval/%s" % a["id"]).json()["approval"]
    assert got["snapshot"]["title"] == "9월 자료"
    assert got["requester_name"] == "김가현"


def test_라우트_남의_팀_승인본은_404():
    """403 이면 「그 id 는 있다」가 확인된다 — 남이 무엇을 냈는지가 샌다."""
    app = make_app()
    w = World()
    _, a = w.approved(w.a)
    assert cli(app, "writer_c").get(
        "/api/team-library/approval/%s" % a["id"]).status_code == 404
    assert cli(app, "viewer_v").get(
        "/api/team-library/approval/%s" % a["id"]).status_code == 404


def test_라우트_로그인하지_않으면_401():
    app = make_app()
    World()
    assert TestClient(app).get("/api/team-library").status_code == 401


# ── 결재함과 팀 공유는 다른 화면이다 ─────────────────────────────
def test_결재함에는_남의_승인본이_안_섞인다():
    """결재함이 답하는 질문은 「**내가 낸 것**이 지금 어떻게 됐나」 하나다.
    같은 팀 남의 승인본이 여기 섞이면 그 답이 목록 어딘가에 묻힌다."""
    app = make_app()
    w = World()
    _, hers = w.approved(w.b, "나연이 자료")
    _, mine = w.approved(w.a, "가현이 자료")
    box = cli(app, "writer_a").get("/api/approvals").json()["approvals"]
    assert [x["id"] for x in box] == [mine["id"]]
    # 그래도 팀 공유에서는 둘 다 보인다 — 결재함이 좁은 것은 권한이 아니라 화면 때문이다.
    assert _all_ids(cli(app, "writer_a").get("/api/team-library").json()) == \
        {mine["id"], hers["id"]}


def test_승인된_건은_같은_팀_사람도_열_수_있다():
    """P6 이전에는 404 였다. 팀 공유 화면이 이 길로 들어온다."""
    app = make_app()
    w = World()
    _, a = w.approved(w.a)
    assert cli(app, "writer_b").get("/api/approvals/%s" % a["id"]).status_code == 200


def test_대기중인_건은_같은_팀이어도_못_연다():
    """팀에 열리는 것은 **승인된 것**뿐이다(D6). 이 선이 P6 에서 흐려지면
    「제출이 곧 공유」가 된다."""
    app = make_app()
    w = World()
    p = projects_store.create_project("아직 검토 중", DOC, owner_id=w.a["id"])
    a = ap.request(p["id"], w.a["id"])
    assert cli(app, "writer_b").get("/api/approvals/%s" % a["id"]).status_code == 404


def test_결재_대화는_당사자만_본다():
    """**자료는 팀의 것이지만 대화는 아니다.** 「3쪽 수치가 작년 것입니다」 같은 지적이
    팀 전체에 흐르면 사람들이 결재함에서 솔직하게 지적하기를 그만둔다.

    감춘 사실 자체는 감추지 않는다 — 몇 마디 오갔는지는 남긴다."""
    app = make_app()
    w = World()
    p, a = w.approved(w.a)
    ad = cli(app, "admin", "adminpw12345")
    ad.post("/api/approvals/%s/comments" % a["id"], json={"body": "3쪽 수치를 확인해 주세요"})

    mine = cli(app, "writer_a").get("/api/approvals/%s" % a["id"]).json()["approval"]
    assert len(mine["comments"]) == 1 and not mine.get("comments_hidden")

    for path in ("/api/approvals/%s" % a["id"],
                 "/api/team-library/approval/%s" % a["id"]):
        got = cli(app, "writer_b").get(path).json()["approval"]
        assert got["comments"] == [], path
        assert got["comments_hidden"] is True, path
        assert got["comment_count"] == 1, path


def test_라우트_이력은_승인본만_거슬러_올라간다():
    app = make_app()
    w = World()
    p, first = w.approved(w.a, "여러 번 낸 것")
    second = w.again(w.a, p["id"])
    h = cli(app, "writer_b").get("/api/team-library/history/%s" % p["id"]).json()["history"]
    assert [x["id"] for x in h] == [second["id"], first["id"]]
    assert all("snapshot" not in x for x in h), "이력에 문서 전체가 딸려 나옵니다"
    assert cli(app, "writer_c").get(
        "/api/team-library/history/%s" % p["id"]).json()["history"] == []
