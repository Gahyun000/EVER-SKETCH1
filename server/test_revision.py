"""수정 요청 흐름 회귀 테스트 (P7 · D8).

이 스위트가 지키는 **한 문장**: 승인된 자료를 고치는 동안에도
**팀이 보던 그림은 안 흔들린다.** 승인본은 얼어 있고, 열리는 것은 작업본뿐이다.

여기가 깨지면 「어제 승인한 것과 다른 게 떠 있다」가 매일 일어나거나,
반대로 승인받은 사람이 제 자료를 영영 못 고치게 된다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "rev.db")

import pytest  # noqa: E402

from server import approvals as ap  # noqa: E402
from server import auth as auth_store  # noqa: E402
from server import doc_state as ds  # noqa: E402
from server import permissions as perm  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server import team_library as lib  # noqa: E402
from server import teams as teams_store  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "rev.db")
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
    def __init__(self):
        auth_store.ensure_seed_admin("adminpw12345")
        self.admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
        self.team = teams_store.create_team("영업1팀", self.admin["id"])
        self.a = self._user("writer_a", "김가현")
        self.b = self._user("writer_b", "이나연")

    def _user(self, login, name, role="writer"):
        u = auth_store.signup(login, "password123", name, "본부", role)
        auth_store.approve(self.admin["id"], u["id"], role)
        teams_store.add_member(self.team["id"], u["id"], self.admin["id"])
        return auth_store.get_user(u["id"])

    def actor(self, u):
        return auth_store.actor_of(auth_store.get_user(u["id"]))

    def approved(self, owner=None, name="9월 자료"):
        owner = owner or self.a
        p = projects_store.create_project(name, DOC, owner_id=owner["id"])
        a = ap.request(p["id"], owner["id"])
        return p, ap.decide(a["id"], "approve", self.admin["id"])


def _team_ids(actor):
    return {i["id"] for t in lib.library(actor)["teams"] for au in t["authors"]
            for m in au["months"] for i in m["items"]}


def _team_items(actor):
    return [i for t in lib.library(actor)["teams"] for au in t["authors"]
            for m in au["months"] for i in m["items"]]


# ── 잠금 ─────────────────────────────
def test_승인되면_잠긴다():
    """**팀이 보고 있는 자료다.** 잠그지 않으면 「팀이 본 것」과 「지금 문서」가
    소리 없이 달라지고, 승인 도장이 무엇에 찍힌 것인지 알 수 없어진다."""
    w = World()
    p, _ = w.approved()
    assert ap.state_of(p["id"]) == ds.APPROVED
    res = perm.Resource(owner_id=w.a["id"], locked=True)
    assert perm.decide(w.actor(w.a), perm.WRITE, res) is False


def test_승인된_자료는_그냥_다시_못_낸다():
    """**수정 요청 흐름을 우회하는 뒷문을 막는다.** 재제출이 그냥 되면
    「고치려면 허락받는다」(D8)는 규칙이 아무것도 안 지킨다."""
    w = World()
    p, _ = w.approved()
    with pytest.raises(ap.ApprovalError) as e:
        ap.request(p["id"], w.a["id"])
    assert "수정 요청" in str(e.value)


def test_반려된_자료는_바로_고친다():
    """고치라고 돌려준 것이다. 잠근 채로 돌려주면 고칠 수가 없다."""
    w = World()
    p = projects_store.create_project("9월 자료", DOC, owner_id=w.a["id"])
    a = ap.request(p["id"], w.a["id"])
    ap.decide(a["id"], "reject", w.admin["id"], "다시")
    assert ap.state_of(p["id"]) == ds.REJECTED
    assert ds.is_locked(ds.REJECTED) is False


# ── 수정 요청 ─────────────────────────────
def test_승인본에만_수정_요청을_낸다():
    w = World()
    p = projects_store.create_project("아직 초안", DOC, owner_id=w.a["id"])
    with pytest.raises(ap.ApprovalError) as e:
        ap.request_revision(p["id"], w.a["id"])
    assert "바로 고칠 수 있" in str(e.value)


def test_수정_요청은_회차를_안_올린다():
    """**회차는 결재를 받은 「문서」의 번호다.** 수정 요청 행에는 문서가 없다 —
    올리면 승인본이 2건인데 「3회차」라고 적히고, 그때부터
    「3회차 승인본」이 무엇을 가리키는지 모르게 된다."""
    w = World()
    p, first = w.approved()
    assert first["round"] == 1
    rv = ap.request_revision(p["id"], w.a["id"], "수치를 고치겠습니다")
    assert rv["round"] == 1 and rv["kind"] == "revision"
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    second = ap.decide(ap.request(p["id"], w.a["id"])["id"], "approve", w.admin["id"])
    assert second["round"] == 2


def test_수정_요청_행에는_스냅샷이_없다():
    """**문서가 아니라 허락을 청하는 행이다.** 스냅샷을 얼리면
    「그때 그 문서」가 두 벌이 되고, 어느 것이 승인본인지 알 수 없어진다."""
    w = World()
    p, _ = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    assert not rv.get("snapshot")
    assert rv["page_count"] == 0


def test_수정_요청_중에는_아직_못_고친다():
    """허락을 기다리는 중이다. 여기서 열어 주면 「요청」이 형식이 된다."""
    w = World()
    p, _ = w.approved()
    ap.request_revision(p["id"], w.a["id"])
    assert ap.state_of(p["id"]) == ds.REVISION_PENDING
    assert ds.is_locked(ds.REVISION_PENDING) is True


def test_두_번_요청하지_못한다():
    w = World()
    p, _ = w.approved()
    ap.request_revision(p["id"], w.a["id"])
    with pytest.raises(ap.ApprovalError) as e:
        ap.request_revision(p["id"], w.a["id"])
    assert "이미" in str(e.value)


def test_허락받으면_고칠_수_있다():
    w = World()
    p, _ = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"], "고치세요")
    assert ap.state_of(p["id"]) == ds.REVISING
    assert ds.is_locked(ds.REVISING) is False


def test_거절당하면_승인된_채로_남는다():
    """**되돌아갈 자리가 승인본뿐이다.** 여기서 초안으로 떨어뜨리면
    승인받은 자료의 잠금이 거절 한 번에 풀린다."""
    w = World()
    p, _ = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "reject", w.admin["id"], "이번 달은 그대로 갑니다")
    assert ap.state_of(p["id"]) == ds.APPROVED


def test_수정_요청이_아닌_건에는_수정_결정을_못_한다():
    """일반 결재를 「수정 허락」으로 처리하면 회차 개념이 통째로 어긋난다."""
    w = World()
    p = projects_store.create_project("9월 자료", DOC, owner_id=w.a["id"])
    a = ap.request(p["id"], w.a["id"])
    with pytest.raises(ap.ApprovalError) as e:
        ap.decide_revision(a["id"], "approve", w.admin["id"])
    assert "수정 요청이 아닙니다" in str(e.value)


def test_수정을_그만둘_수_있다():
    """**「수정 중」이 영원히 남는 것을 막는 유일한 길이다.**
    몇 달째 「곧 바뀐다」는 글자를 단 승인본은 그 글자가 아무 뜻도 없다."""
    w = World()
    p, first = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    ap.end_revision(rv["id"])
    assert ap.state_of(p["id"]) == ds.APPROVED
    # 승인본은 애초에 손대지 않았으므로 팀 화면에는 아무 일도 일어나지 않는다.
    assert _team_ids(w.actor(w.b)) == {first["id"]}


def test_수정을_그만둬도_고친_내용은_안_지운다():
    """남의 작업을 대신 버리지 않는다. 승인본에 반영이 안 될 뿐이다."""
    w = World()
    p, _ = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    projects_store.save_project(p["id"], {"title": "고친 것", "pages": [{"id": 9}]})
    ap.end_revision(rv["id"])
    assert projects_store.get_project(p["id"])["state"]["title"] == "고친 것"


def test_대기중인_요청은_그만두기가_아니다():
    """아직 허락도 안 났는데 「그만둔다」고 하면 무엇을 그만두는지 모호하다 —
    그건 `withdraw`(요청 회수)다."""
    w = World()
    p, _ = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    with pytest.raises(ap.ApprovalError):
        ap.end_revision(rv["id"])


# ── 팀이 보는 그림은 안 흔들린다 (D8 — P7 의 전부) ─────────────────────────────
def test_수정_요청을_내도_팀은_승인본을_그대로_본다():
    w = World()
    p, first = w.approved()
    ap.request_revision(p["id"], w.a["id"])
    assert _team_ids(w.actor(w.b)) == {first["id"]}


def test_수정_중에도_팀은_승인본을_그대로_본다():
    """**P7 의 핵심.** 작업본을 아무리 뜯어고쳐도 팀의 그림은 얼어 있다."""
    w = World()
    p, first = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    projects_store.save_project(p["id"], {"title": "완전히 다른 것", "pages": []})

    snap = lib.visible_approval(w.actor(w.b), first["id"])
    assert snap["snapshot"]["title"] == "9월 자료"
    assert len(snap["snapshot"]["pages"]) == 2
    assert _team_ids(w.actor(w.b)) == {first["id"]}


def test_수정_중이라는_글자가_얹힌다():
    """그림은 안 바뀌되 **곧 바뀔 자료임은 알려준다.**
    글자로 붙는다 — 색으로만 상태를 구분하지 않는다(표준)."""
    w = World()
    p, first = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    it = _team_items(w.actor(w.b))[0]
    assert it["doc_state"] == ds.REVISING
    assert it["doc_state_label"] == "수정 중"


def test_수정_요청_중이라는_글자도_얹힌다():
    w = World()
    p, _ = w.approved()
    ap.request_revision(p["id"], w.a["id"])
    assert _team_items(w.actor(w.b))[0]["doc_state_label"] == "수정 요청 중"


def test_승인된_수정_요청이_팀_목록에_빈_자료로_뜨지_않는다():
    """**허락 행도 `status='approved'` 가 된다.** 걸러 내지 않으면 스냅샷 없는
    빈 자료가 팀 목록에 하나 더 뜬다 — 눌러도 아무것도 안 나오는 줄이다."""
    w = World()
    p, first = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    assert _team_ids(w.actor(w.b)) == {first["id"]}
    assert rv["id"] not in _team_ids(w.actor(w.admin))
    # 이력에도 안 섞인다 — 「몇 번째 승인본인가」를 세는 자리다.
    assert [x["id"] for x in lib.history(w.actor(w.b), p["id"])] == [first["id"]]


def test_재승인되면_그때_바뀐다():
    """수정이 끝나고 **다시 승인이 나야** 팀의 그림이 교체된다."""
    w = World()
    p, first = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    projects_store.save_project(p["id"], {"title": "10월 개정판", "pages": [{"id": 1}]})

    resub = ap.request(p["id"], w.a["id"])
    assert _team_ids(w.actor(w.b)) == {first["id"]}, "재제출만으로는 안 바뀐다"
    second = ap.decide(resub["id"], "approve", w.admin["id"])
    assert _team_ids(w.actor(w.b)) == {second["id"]}
    got = lib.visible_approval(w.actor(w.b), second["id"])
    assert got["snapshot"]["title"] == "10월 개정판" and got["round"] == 2


def test_지난_승인본은_이력에_남는다():
    w = World()
    p, first = w.approved()
    rv = ap.request_revision(p["id"], w.a["id"])
    ap.decide_revision(rv["id"], "approve", w.admin["id"])
    second = ap.decide(ap.request(p["id"], w.a["id"])["id"], "approve", w.admin["id"])
    assert [x["id"] for x in lib.history(w.actor(w.b), p["id"])] == [second["id"], first["id"]]


# ── 권한 ─────────────────────────────
def test_남의_자료에는_수정_요청을_못_낸다():
    w = World()
    res = perm.Resource(owner_id=w.a["id"])
    assert perm.decide(w.actor(w.b), perm.REVISION_REQUEST, res) is False
    assert perm.decide(w.actor(w.a), perm.REVISION_REQUEST, res) is True


def test_수정_허락은_관리자만():
    """결재자는 한 명이다(D11). 작성자끼리 서로 허락해 주면 결재가 무의미해진다."""
    w = World()
    assert perm.decide(w.actor(w.a), perm.REVISION_DECIDE) is False
    assert perm.decide(w.actor(w.admin), perm.REVISION_DECIDE) is True


def test_새_액션이_전체_목록에_있다():
    assert perm.REVISION_REQUEST in perm.ALL_ACTIONS
    assert perm.REVISION_DECIDE in perm.ALL_ACTIONS


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


def test_라우터가_잠금을_채운다():
    """**`Resource.locked` 의 기본값은 `False`(=열림) 라 안전한 쪽이 아니다.**
    라우터가 안 채우면 승인된 자료가 그냥 고쳐진다 — 결재자가 본 것과 작성자가
    가진 것이 소리 없이 갈라진다. `has_approval_history` 와 같은 이유로 여기서 지킨다."""
    app = make_app()
    w = World()
    p, _ = w.approved()
    c = cli(app, "writer_a")
    assert c.put("/api/projects/%s" % p["id"],
                 json={"state": {"pages": []}}).status_code == 403
    assert c.patch("/api/projects/%s" % p["id"], json={"name": "다른 이름"}).status_code == 403


def test_라우트_왜_잠겼는지까지_말한다():
    """`can_write: false` 만 주면 화면은 「권한이 없습니다」밖에 못 쓰고,
    사람은 **제 자료가 왜 안 고쳐지는지** 모른다."""
    app = make_app()
    w = World()
    p, _ = w.approved()
    acc = cli(app, "writer_a").get("/api/projects/%s" % p["id"]).json()["access"]
    assert acc["state"] == ds.APPROVED and acc["locked"] is True
    assert acc["can_write"] is False and acc["can_submit"] is False
    assert acc["can_request_revision"] is True


def test_라우트_초안에는_수정_요청_버튼이_없다():
    """아직 승인 안 된 자료는 요청할 것 없이 그냥 고치면 된다 —
    버튼이 있으면 눌러 보고 400 을 받는다."""
    app = make_app()
    w = World()
    p = projects_store.create_project("초안", DOC, owner_id=w.a["id"])
    acc = cli(app, "writer_a").get("/api/projects/%s" % p["id"]).json()["access"]
    assert acc["state"] == ds.DRAFT and acc["locked"] is False
    assert acc["can_write"] is True and acc["can_submit"] is True
    assert acc["can_request_revision"] is False


def test_라우트_수정_요청부터_재승인까지():
    app = make_app()
    w = World()
    p, first = w.approved()
    ca, cb, ad = cli(app, "writer_a"), cli(app, "writer_b"), cli(app, "admin", "adminpw12345")

    r = ca.post("/api/approvals/revision-request",
                json={"project_id": p["id"], "message": "3쪽 수치를 고치겠습니다"})
    assert r.status_code == 200, r.text
    rv = r.json()["approval"]
    assert rv["kind"] == "revision" and rv["status"] == "pending"

    # 아직 못 고친다
    assert ca.put("/api/projects/%s" % p["id"], json={"state": DOC}).status_code == 403

    r = ad.post("/api/approvals/%s/revision-decide" % rv["id"],
                json={"action": "approve", "message": "고치세요"})
    assert r.status_code == 200, r.text

    # 이제 고쳐진다 — 그런데 팀 화면은 그대로다
    assert ca.put("/api/projects/%s" % p["id"],
                  json={"state": {"title": "10월 개정판", "pages": [{"id": 1}]}}).status_code == 200
    ids = {i["id"] for t in cb.get("/api/team-library").json()["teams"]
           for a in t["authors"] for m in a["months"] for i in m["items"]}
    assert ids == {first["id"]}, "재승인 전에는 팀 그림이 안 바뀐다"

    r = ca.post("/api/approvals/request", json={"project_id": p["id"]})
    assert r.status_code == 200, r.text
    second = ad.post("/api/approvals/%s/decide" % r.json()["approval"]["id"],
                     json={"action": "approve"}).json()["approval"]
    ids = {i["id"] for t in cb.get("/api/team-library").json()["teams"]
           for a in t["authors"] for m in a["months"] for i in m["items"]}
    assert ids == {second["id"]} and second["round"] == 2


def test_라우트_수정_허락은_관리자만():
    app = make_app()
    w = World()
    p, _ = w.approved()
    rv = cli(app, "writer_a").post("/api/approvals/revision-request",
                                   json={"project_id": p["id"]}).json()["approval"]
    for who in ("writer_a", "writer_b"):
        assert cli(app, who).post("/api/approvals/%s/revision-decide" % rv["id"],
                                  json={"action": "approve"}).status_code == 403


def test_라우트_남의_자료에는_수정_요청을_못_낸다():
    app = make_app()
    w = World()
    p, _ = w.approved()
    assert cli(app, "writer_b").post("/api/approvals/revision-request",
                                     json={"project_id": p["id"]}).status_code == 403


def test_라우트_수정_그만두기는_낸_사람만():
    """**관리자라도 남의 수정을 대신 그만두지 않는다.** 그만두는 것은
    「안 고치겠다」는 뜻이고, 그 판단은 고치는 사람 몫이다."""
    app = make_app()
    w = World()
    p, _ = w.approved()
    ca, ad = cli(app, "writer_a"), cli(app, "admin", "adminpw12345")
    rv = ca.post("/api/approvals/revision-request",
                 json={"project_id": p["id"]}).json()["approval"]
    ad.post("/api/approvals/%s/revision-decide" % rv["id"], json={"action": "approve"})

    assert ad.post("/api/approvals/%s/revision-end" % rv["id"]).status_code == 404
    assert cli(app, "writer_b").post(
        "/api/approvals/%s/revision-end" % rv["id"]).status_code == 404
    assert ca.post("/api/approvals/%s/revision-end" % rv["id"]).status_code == 200
    assert ca.get("/api/projects/%s" % p["id"]).json()["access"]["state"] == ds.APPROVED


def test_라우트_상태표가_파생_상태를_같이_준다():
    """화면이 `kind` 와 `status` 를 보고 스스로 짜맞추게 두면
    서버와 화면이 서로 다른 상태를 말하는 날이 온다."""
    app = make_app()
    w = World()
    p, _ = w.approved()
    ca, ad = cli(app, "writer_a"), cli(app, "admin", "adminpw12345")
    rv = ca.post("/api/approvals/revision-request",
                 json={"project_id": p["id"]}).json()["approval"]
    ad.post("/api/approvals/%s/revision-decide" % rv["id"], json={"action": "approve"})

    chip = ca.get("/api/approvals/status-map").json()["status_map"][p["id"]]
    assert chip["state"] == ds.REVISING and chip["locked"] is False


def test_라우트_잠겨서_못_내는_것과_자격이_없는_것을_갈라_말한다():
    """**「권한이 없습니다」로 뭉개면 사람이 멈춘다.**
    제 승인본을 다시 내려던 사람은 「내 자료인데 왜 권한이 없지」에서 멈추고,
    무엇을 해야 하는지(수정 요청) 알 길이 없다."""
    app = make_app()
    w = World()
    p, _ = w.approved()

    r = cli(app, "writer_a").post("/api/approvals/request", json={"project_id": p["id"]})
    assert r.status_code == 400, "잠긴 내 자료는 400 + 이유"
    assert "수정 요청" in r.json()["detail"]

    # 남의 자료는 여전히 403 — **이유를 알려주지 않는다.** 상태를 말해 주면
    # 남의 자료가 지금 어떤 상태인지가 새어 나간다.
    r2 = cli(app, "writer_b").post("/api/approvals/request", json={"project_id": p["id"]})
    assert r2.status_code == 403
    assert "수정 요청" not in r2.json()["detail"]


def test_이유는_한_곳에서만_말한다():
    """`submit_block_reason` 이 없으면 저장소와 라우터가 각자 문구를 갖게 되고,
    둘은 언젠가 다른 말을 한다."""
    w = World()
    p, _ = w.approved()
    why = ap.submit_block_reason(p["id"])
    assert why and "수정 요청" in why
    with pytest.raises(ap.ApprovalError) as e:
        ap.request(p["id"], w.a["id"])
    assert str(e.value) == why


def test_낼_수_있으면_막는_이유가_없다():
    w = World()
    p = projects_store.create_project("초안", DOC, owner_id=w.a["id"])
    assert ap.submit_block_reason(p["id"]) is None
