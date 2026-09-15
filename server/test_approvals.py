"""결재 — `Approvals` / `ApprovalComments` (P5).

`ebook_html1/server/approvals.py` 를 옮겨 오되 **다섯 군데를 바꾼다.**

1. **`team_id` 신설 (D9의 열쇠).** 요청 시점의 팀을 못박는다. 가시성을 「현재 소속」이 아니라
   「승인 당시 팀」으로 판정하면, 사람이 B팀으로 옮겨도 A팀 시절 자료는 A팀에 남는다.
   **팀이 없으면 제출할 수 없다** — 승인돼도 공유될 곳이 없다.
2. **`requester`/`approver` 가 표시 이름이 아니라 `Users.id`.** 이름은 바뀐다.
   이름으로 적어 두면 「누가 승인했는가」가 개명 한 번에 흐려진다.
3. **`delete_approval` 을 옮기지 않는다.** 결재 이력은 지우지 않는다 —
   「이력이 있으면 자료를 못 지운다」(D16)가 규칙인데 이력 자체를 지울 수 있으면 그 규칙이 없는 것과 같다.
4. **권한을 붙인다.** 원본은 누구나 아무 결재나 결정할 수 있었다(혼자 쓰는 도구였다).
   여기서는 `SUBMIT`(본인 자료만) · `DECIDE`(관리자만)를 `permissions.decide()` 가 판정한다.
5. **D16 삭제 규칙을 연다.** 결재 이력이 없으면 작성자도 제 자료를 지울 수 있다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "approvals.db")

import pytest  # noqa: E402

from server import approvals as ap  # noqa: E402
from server import auth as auth_store  # noqa: E402
from server import permissions as perm  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server import teams as teams_store  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "approvals.db")
DOC = {"title": "9월 임원회의", "pages": [{"id": 1}, {"id": 2}]}


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def ctx():
    """관리자 · 작성자 · 팀 · 작성자 소유 자료 하나."""
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    w = auth_store.signup("writer1", "password123", "김가현", "사업본부", "writer")
    auth_store.approve(admin["id"], w["id"], "writer")
    t = teams_store.create_team("영업1팀", admin["id"])
    teams_store.add_member(t["id"], w["id"], admin["id"])
    p = projects_store.create_project("9월 자료", DOC, owner_id=w["id"])
    return admin, auth_store.get_user(w["id"]), t, p


# ── 제출 ─────────────────────────────────────────
def test_제출하면_대기_상태가_된다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"], "검토 부탁드립니다")
    assert a["status"] == "pending" and a["round"] == 1
    assert a["requester"] == w["id"] and a["request_message"] == "검토 부탁드립니다"
    assert a["page_count"] == 2


def test_제출_시점의_팀을_못박는다():
    """**D9의 열쇠.** 「현재 소속」이 아니라 「승인 당시 팀」으로 가시성을 판정하면,
    사람이 옮겨도 옛 자료는 옛 팀에 남는다."""
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    assert a["team_id"] == t["id"]
    # 사람이 다른 팀으로 옮겨도 결재 건의 팀은 그대로다
    t2 = teams_store.create_team("기술2팀", admin["id"])
    teams_store.add_member(t2["id"], w["id"], admin["id"])
    assert ap.get_approval(a["id"])["team_id"] == t["id"]


def test_팀이_없으면_제출할_수_없다():
    """승인돼도 공유될 곳이 없다. 「승인이 곧 공유」(D6)인데 갈 팀이 없으면
    승인이 아무 일도 하지 않는다."""
    admin, w, t, p = ctx()
    teams_store.remove_member(t["id"], w["id"])
    with pytest.raises(ap.ApprovalError) as e:
        ap.request(p["id"], w["id"])
    assert "팀" in str(e.value)


def test_슬라이드가_없으면_제출할_수_없다():
    admin, w, t, p = ctx()
    empty = projects_store.create_project("빈 자료", {"pages": []}, owner_id=w["id"])
    with pytest.raises(ap.ApprovalError):
        ap.request(empty["id"], w["id"])


def test_이미_대기_중이면_또_제출할_수_없다():
    admin, w, t, p = ctx()
    ap.request(p["id"], w["id"])
    with pytest.raises(ap.ApprovalError) as e:
        ap.request(p["id"], w["id"])
    assert "대기" in str(e.value)


def test_반려된_뒤에는_다시_제출할_수_있고_회차가_오른다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    ap.decide(a["id"], "reject", admin["id"], "표가 안 맞습니다")
    a2 = ap.request(p["id"], w["id"])
    assert a2["round"] == 2 and a2["status"] == "pending"


def test_제출하면_그_시점_문서가_얼어붙는다():
    """승인은 **그때 본 것**에 대한 승인이다. 뒤에 고쳐도 승인본은 안 바뀐다."""
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    projects_store.save_project(p["id"], {"title": "고친 뒤", "pages": [{"id": 9}]})
    frozen = ap.get_approval(a["id"])["snapshot"]
    assert frozen["title"] == "9월 임원회의" and len(frozen["pages"]) == 2


# ── 결정 ─────────────────────────────────────────
def test_승인하면_승인자와_시각이_남는다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    d = ap.decide(a["id"], "approve", admin["id"], "좋습니다")
    assert d["status"] == "approved" and d["approver"] == admin["id"]
    assert d["decision_message"] == "좋습니다" and d["decided_at"]


def test_반려도_같은_자리에_남는다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    d = ap.decide(a["id"], "reject", admin["id"], "3쪽 숫자 확인")
    assert d["status"] == "rejected" and d["decision_message"] == "3쪽 숫자 확인"


def test_이미_처리된_건은_다시_못_바꾼다():
    """되돌리기는 P7 의 「수정 요청」이 한다. 여기서 뒤집을 수 있으면
    승인 시각이 무슨 뜻인지 알 수 없어진다."""
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    ap.decide(a["id"], "approve", admin["id"])
    with pytest.raises(ap.ApprovalError):
        ap.decide(a["id"], "reject", admin["id"])


def test_모르는_동작은_거부():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    with pytest.raises(ap.ApprovalError):
        ap.decide(a["id"], "approve_maybe", admin["id"])


def test_작성자가_대기_중인_요청을_회수한다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    d = ap.withdraw(a["id"])
    assert d["status"] == "withdrawn"
    # 회수한 뒤에는 다시 낼 수 있다
    assert ap.request(p["id"], w["id"])["round"] == 2


def test_이미_처리된_건은_못_회수한다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    ap.decide(a["id"], "approve", admin["id"])
    with pytest.raises(ap.ApprovalError):
        ap.withdraw(a["id"])


# ── 이력은 지우지 않는다 ─────────────────────────
def test_결재_이력을_지우는_길이_없다():
    """원본에는 `delete_approval` 이 있었다. 옮기지 않았다 —
    「이력이 있으면 자료를 못 지운다」(D16)가 규칙인데 이력을 지울 수 있으면 그 규칙이 없는 것과 같다."""
    assert not hasattr(ap, "delete_approval")


def test_이력이_있으면_자료를_못_지운다():
    """D16. 결재를 한 번이라도 탄 자료는 남의 눈에 든 자료다."""
    admin, w, t, p = ctx()
    assert ap.has_history(p["id"]) is False
    ap.request(p["id"], w["id"])
    assert ap.has_history(p["id"]) is True


def test_회수한_것도_이력이다():
    """제출했다가 회수한 것도 남이 봤을 수 있다. 「없었던 일」로 만들지 않는다."""
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    ap.withdraw(a["id"])
    assert ap.has_history(p["id"]) is True


# ── 조회 ─────────────────────────────────────────
def test_목록은_최신순이고_상태로_거른다():
    admin, w, t, p = ctx()
    a1 = ap.request(p["id"], w["id"])
    ap.decide(a1["id"], "reject", admin["id"])
    ap.request(p["id"], w["id"])
    assert [x["round"] for x in ap.list_approvals()] == [2, 1]
    assert [x["status"] for x in ap.list_approvals(status="pending")] == ["pending"]


def test_자료별_최신_건을_준다():
    admin, w, t, p = ctx()
    a1 = ap.request(p["id"], w["id"])
    ap.decide(a1["id"], "reject", admin["id"])
    ap.request(p["id"], w["id"])
    assert ap.latest_for_project(p["id"])["round"] == 2
    assert ap.latest_for_project("p_없음") is None


def test_상태표는_자료별_최신만_담는다():
    """라이브러리 목록에 상태 칩을 붙일 때 한 번에 가져온다 — 건마다 되묻지 않게."""
    admin, w, t, p = ctx()
    a1 = ap.request(p["id"], w["id"])
    ap.decide(a1["id"], "approve", admin["id"])
    m = ap.status_map()
    assert m[p["id"]]["status"] == "approved" and m[p["id"]]["round"] == 1


def test_목록에는_스냅샷이_안_실린다():
    """스냅샷은 문서 전체다. 목록마다 실으면 응답이 통째로 무거워진다."""
    admin, w, t, p = ctx()
    ap.request(p["id"], w["id"])
    assert "snapshot" not in ap.list_approvals()[0]
    assert "snapshot" in ap.get_approval(ap.list_approvals()[0]["id"])


# ── 슬라이드별 코멘트 ────────────────────────────
def test_쪽마다_코멘트를_단다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    ap.add_comment(a["id"], "이 표 숫자 확인", admin["id"], page_id=1, page_no=1)
    ap.add_comment(a["id"], "전체적으로 좋습니다", admin["id"])
    cs = ap.get_approval(a["id"])["comments"]
    assert len(cs) == 2
    assert cs[0]["page_no"] == 1 and cs[1]["page_id"] is None


def test_빈_코멘트는_안_달린다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    with pytest.raises(ap.ApprovalError):
        ap.add_comment(a["id"], "   ", admin["id"])


def test_없는_결재에는_코멘트를_못_단다():
    admin, w, t, p = ctx()
    with pytest.raises(ap.ApprovalError):
        ap.add_comment("a_없음", "안녕", admin["id"])


def test_코멘트_개수가_목록에_함께_온다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    ap.add_comment(a["id"], "하나", admin["id"])
    assert ap.list_approvals()[0]["comment_count"] == 1


def test_코멘트를_고치고_지운다():
    admin, w, t, p = ctx()
    a = ap.request(p["id"], w["id"])
    c = ap.add_comment(a["id"], "옛 내용", admin["id"])
    ap.update_comment(c["id"], "새 내용")
    assert ap.get_approval(a["id"])["comments"][0]["body"] == "새 내용"
    ap.delete_comment(c["id"])
    assert ap.get_approval(a["id"])["comments"] == []


# ── 권한 ─────────────────────────────────────────
def test_SUBMIT_은_본인_자료만():
    w = perm.Actor(id="u_w", role=perm.WRITER, status="active")
    assert perm.decide(w, perm.SUBMIT, perm.Resource(owner_id="u_w")) is True
    assert perm.decide(w, perm.SUBMIT, perm.Resource(owner_id="u_other")) is False


def test_열람자는_제출하지_못한다():
    """D13 — L3 도 개인 스케치는 만든다. 그러나 **제출은 못 한다**(순수 개인 작업 공간)."""
    v = perm.Actor(id="u_v", role=perm.VIEWER, status="active")
    assert perm.decide(v, perm.SUBMIT, perm.Resource(owner_id="u_v")) is False


def test_DECIDE_는_관리자만():
    """결재자는 L1 한 명이다(D11)."""
    admin = perm.Actor(id="u_a", role=perm.ADMIN, status="active")
    w = perm.Actor(id="u_w", role=perm.WRITER, status="active")
    assert perm.decide(admin, perm.DECIDE) is True
    assert perm.decide(w, perm.DECIDE, perm.Resource(owner_id="u_w")) is False


def test_새_액션이_전체_목록에_있다():
    assert perm.SUBMIT in perm.ALL_ACTIONS and perm.DECIDE in perm.ALL_ACTIONS


# ══════════════════════════════════════════════
# 라우트 — 누가 무엇을 볼 수 있는가
# ══════════════════════════════════════════════
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.routes_approvals import router as approvals_router  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as projects_router  # noqa: E402


def make_app() -> FastAPI:
    app = FastAPI()
    for r in (auth_router, projects_router, approvals_router):
        app.include_router(r)
    return app


def acct(login, role="writer"):
    u = auth_store.signup(login, "password123", login, "사업본부", role)
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    return auth_store.approve(admin["id"], u["id"], role)


def cli(app, login_id, pw="password123") -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"login_id": login_id, "password": pw}).status_code == 200
    return c


def two_writers(app):
    """관리자 + 작성자 둘, 각자 팀에 넣고 각자 자료 하나씩 제출."""
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    a1, a2 = acct("writer1"), acct("writer2")
    t = teams_store.create_team("영업1팀", admin["id"])
    teams_store.add_member(t["id"], a1["id"], admin["id"])
    teams_store.add_member(t["id"], a2["id"], admin["id"])
    out = {}
    for login, u in (("writer1", a1), ("writer2", a2)):
        c = cli(app, login)
        pid = c.post("/api/projects", json={"name": login + " 자료",
                                            "state": {"pages": [{"id": 1}]}}).json()["id"]
        r = c.post("/api/approvals/request", json={"project_id": pid})
        assert r.status_code == 200, r.text
        out[login] = {"client": c, "user": u, "pid": pid, "aid": r.json()["approval"]["id"]}
    return admin, out


def test_라우트_제출부터_승인까지():
    app = make_app()
    admin, w = two_writers(app)
    ad = cli(app, "admin", "adminpw12345")
    aid = w["writer1"]["aid"]
    r = ad.post("/api/approvals/%s/decide" % aid, json={"action": "approve", "message": "좋습니다"})
    assert r.status_code == 200
    a = r.json()["approval"]
    assert a["status"] == "approved" and a["approver_name"] == "시스템 관리자"


def test_라우트_작성자는_본인이_낸_것만_본다():
    """같은 팀이어도 **남의 제출본은 못 본다** — 팀 공유는 승인된 것에만 열린다(D6, P6)."""
    app = make_app()
    admin, w = two_writers(app)
    c1 = w["writer1"]["client"]
    got = [a["id"] for a in c1.get("/api/approvals").json()["approvals"]]
    assert got == [w["writer1"]["aid"]]
    # 남의 건은 **404** — 403 이면 「그 id 는 있다」가 확인된다
    assert c1.get("/api/approvals/%s" % w["writer2"]["aid"]).status_code == 404


def test_라우트_관리자는_전부_본다():
    app = make_app()
    admin, w = two_writers(app)
    ad = cli(app, "admin", "adminpw12345")
    body = ad.get("/api/approvals").json()
    assert len(body["approvals"]) == 2 and body["counts"]["pending"] == 2
    assert all(a["requester_name"] for a in body["approvals"]), "이름을 붙여 준다"


def test_라우트_작성자는_결정하지_못한다():
    app = make_app()
    admin, w = two_writers(app)
    c1 = w["writer1"]["client"]
    r = c1.post("/api/approvals/%s/decide" % w["writer1"]["aid"], json={"action": "approve"})
    assert r.status_code == 403, "제 것이라고 스스로 승인할 수는 없다(D11)"


def test_라우트_남의_건은_못_회수한다():
    app = make_app()
    admin, w = two_writers(app)
    assert w["writer1"]["client"].post(
        "/api/approvals/%s/withdraw" % w["writer2"]["aid"]).status_code == 404


def test_라우트_관리자도_남의_건을_대신_회수하지_못한다():
    """관리자가 대신 회수하면 **「반려」와 구분이 안 된다** — 결재 이력이 무슨 일이 있었는지
    말해주지 못하게 된다."""
    app = make_app()
    admin, w = two_writers(app)
    ad = cli(app, "admin", "adminpw12345")
    assert ad.post("/api/approvals/%s/withdraw" % w["writer1"]["aid"]).status_code == 404


def test_라우트_열람자는_제출하지_못한다():
    app = make_app()
    auth_store.ensure_seed_admin("adminpw12345")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    v = acct("viewer1", "viewer")
    t = teams_store.create_team("영업1팀", admin["id"])
    teams_store.add_member(t["id"], v["id"], admin["id"])
    c = cli(app, "viewer1")
    pid = projects_store.create_project("열람자 스케치", DOC, owner_id=v["id"])["id"]
    assert c.post("/api/approvals/request", json={"project_id": pid}).status_code == 403


def test_라우트_코멘트는_양쪽이_주고받는다():
    """관리자는 지적하고, 낸 사람은 답한다. 한쪽만 열면 대화가 안 된다."""
    app = make_app()
    admin, w = two_writers(app)
    aid = w["writer1"]["aid"]
    ad = cli(app, "admin", "adminpw12345")
    assert ad.post("/api/approvals/%s/comments" % aid,
                   json={"body": "3쪽 숫자 확인", "page_id": 1, "page_no": 1}).status_code == 200
    assert w["writer1"]["client"].post("/api/approvals/%s/comments" % aid,
                                       json={"body": "고쳤습니다"}).status_code == 200
    cs = ad.get("/api/approvals/%s" % aid).json()["approval"]["comments"]
    assert [c["body"] for c in cs] == ["3쪽 숫자 확인", "고쳤습니다"]
    assert all(c["author_name"] for c in cs)


def test_라우트_남의_결재에는_코멘트를_못_단다():
    app = make_app()
    admin, w = two_writers(app)
    assert w["writer1"]["client"].post(
        "/api/approvals/%s/comments" % w["writer2"]["aid"], json={"body": "훔쳐보기"}).status_code == 404


def test_라우트_관리자도_남의_말은_못_고친다():
    """남의 말을 고칠 수 있으면 결재 이력이 기록이 아니라 **편집물**이 된다."""
    app = make_app()
    admin, w = two_writers(app)
    aid = w["writer1"]["aid"]
    cid = w["writer1"]["client"].post("/api/approvals/%s/comments" % aid,
                                      json={"body": "제 말"}).json()["comment"]["id"]
    ad = cli(app, "admin", "adminpw12345")
    assert ad.patch("/api/approvals/comments/%s" % cid, json={"body": "고쳐치기"}).status_code == 404
    assert ad.delete("/api/approvals/comments/%s" % cid).status_code == 404
    # 제 말은 고친다
    assert w["writer1"]["client"].patch("/api/approvals/comments/%s" % cid,
                                        json={"body": "다시 씀"}).status_code == 200


def test_라우트_상태표는_본인_자료만():
    """자료 목록에 상태 칩을 붙이는 자리다. 여기서 남의 자료 id 가 새면 안 된다."""
    app = make_app()
    admin, w = two_writers(app)
    m = w["writer1"]["client"].get("/api/approvals/status-map").json()["status_map"]
    assert list(m) == [w["writer1"]["pid"]]
    ad = cli(app, "admin", "adminpw12345")
    assert len(ad.get("/api/approvals/status-map").json()["status_map"]) == 2


def test_라우트_상태표의_결재자는_결정_뒤에만_있다():
    """자료 목록의 「결재자」 열이 여기서 온다.

    **결재자는 미리 정해지지 않는다.** 이 도구는 결재선을 세우지 않고 Lv1 이면 누구나
    결재한다. 그래서 「결재 중」인 자료의 결재자 칸은 비어 있는 게 맞다 —
    없는 이름을 지어내 채우면 목록이 거짓말을 한다."""
    app = make_app()
    admin, w = two_writers(app)
    c = w["writer1"]["client"]
    pid = w["writer1"]["pid"]

    m = c.get("/api/approvals/status-map").json()["status_map"]
    assert m[pid]["approver"] == "", "결재 중에는 결재자가 없다"
    assert m[pid]["approver_name"] == "", "이름 칸도 비어 있다"

    ad = cli(app, "admin", "adminpw12345")
    aid = m[pid]["approval_id"]
    assert ad.post("/api/approvals/%s/decide" % aid, json={"action": "approve"}).status_code == 200

    m2 = c.get("/api/approvals/status-map").json()["status_map"]
    assert m2[pid]["approver"], "결정이 나면 결재자 id 가 들어온다"
    assert m2[pid]["approver_name"] == "시스템 관리자", \
        "**이름은 서버가 붙인다** — 화면이 id 로 이름을 되묻지 않는다"
    # 저장은 여전히 id 다. 개명 한 번에 「누가 승인했는가」가 흐려지면 안 된다.
    assert m2[pid]["approver"] != m2[pid]["approver_name"]


def test_라우트_남의_결재자_이름은_안_샌다():
    """이름은 **거른 뒤에** 붙인다. 순서가 뒤집히면 남의 자료의 결재자가 새어 나간다."""
    app = make_app()
    admin, w = two_writers(app)
    m = w["writer1"]["client"].get("/api/approvals/status-map").json()["status_map"]
    assert list(m) == [w["writer1"]["pid"]]
    assert all("approver_name" in v for v in m.values()), "본인 것에는 이름 칸이 붙어 있다"


def test_라우트_비로그인은_401():
    app = make_app()
    assert TestClient(app).get("/api/approvals").status_code == 401
