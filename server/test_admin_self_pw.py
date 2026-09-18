"""**관리자가 제 비밀번호를 옛 값 없이 정한다** — `POST /api/auth/password/force`.

2026-09-18 · 사용자 질문에서 나왔다. 「관리자는 비밀번호 잊으면 어떡함?」
재 보니 화면에는 길이 없었다 — 본인 초기화는 막혀 있고(`reset_password` 가 본인을 거부),
`change_password` 는 옛 값을 묻는다. 남는 것은 서버에서 `admin_cli reset-pw` 뿐이었다.

**「초기화」가 아니라 「직접 정하기」로 연 이유.** 본인 초기화를 여는 쪽이 말은 쉬운데
그 길은 사람을 가둔다 — 초기화는 세션을 끊으므로 내 창이 그 자리에서 로그인 화면으로
튕기고, 한 번만 보이는 임시 비밀번호가 그 화면과 함께 사라진다. 관리자가 한 명이면
그대로 갇힌다. 내가 정한 값이면 놓칠 글자가 없다.

── 여기서 지키는 계약 ──
  1. **관리자만.** 작성자·열람자가 부르면 403. 이 길이 새면 옛 비밀번호 확인이
     제품 전체에서 없는 것이나 같아진다.
  2. **대상은 언제나 부른 사람 자신.** 몸통에 남의 id 를 실을 자리 자체가 없다.
  3. **평범한 길은 그대로.** `/password` 는 여전히 옛 값을 묻는다 — 빈 문자열로
     통과되면 안 된다.
  4. **감사로그에 다른 이름으로 남는다**(`change_pw_noold`). 평범한 변경과 섞이면
     나중에 무엇이 있었는지 못 가린다.
  5. 바꾼 뒤 **세션은 끊긴다** — 일반 변경과 같게.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "selfpw.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "selfpw.db")
URL = "/api/auth/password/force"


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def ctx():
    """시드 관리자 한 명 + 승인된 작성자 + 열람자."""
    admin_pw = auth_store.ensure_seed_admin("adminpw12345")
    admin = [u for u in auth_store.list_users() if u["login_id"] == "admin"][0]
    w = auth_store.signup("writer1", "password123", "김가현", "사업본부", "writer")
    auth_store.approve(admin["id"], w["id"], "writer")
    v = auth_store.signup("viewer1", "password123", "홍길동", "영업", "viewer")
    auth_store.approve(admin["id"], v["id"], "viewer")
    app = FastAPI()
    app.include_router(auth_router)
    return app, admin, admin_pw


def login(app, login_id, pw) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"login_id": login_id, "password": pw})
    assert r.status_code == 200, r.text
    return c


# ── 되는 일 ─────────────────────────────────────
def test_관리자는_옛_값_없이_제_비밀번호를_정한다():
    app, admin, apw = ctx()
    c = login(app, "admin", apw)
    r = c.post(URL, json={"new_password": "newadminpw99"})
    assert r.status_code == 200, r.text
    tok, u = auth_store.login("admin", "newadminpw99")
    assert u["login_id"] == "admin"


def test_정한_값이_그대로_쓰인다_임시가_아니다():
    """초기화와 다른 점이 이것이다. 무작위 값이 오는 것이 아니라 **내가 친 값**이
    그대로 쓰이고, 다음 로그인에서 또 바꾸라고 하지 않는다 — 놓칠 글자가 없다."""
    app, admin, apw = ctx()
    c = login(app, "admin", apw)
    assert c.post(URL, json={"new_password": "chosenbyme12"}).status_code == 200
    u = auth_store.get_user(admin["id"])
    assert u["must_change_pw"] is False


def test_바꾸면_다른_기기의_세션이_끊긴다():
    app, admin, apw = ctx()
    other = login(app, "admin", apw)          # 다른 기기에서 열어 둔 창
    c = login(app, "admin", apw)
    assert c.post(URL, json={"new_password": "newadminpw99"}).status_code == 200
    assert other.get("/api/auth/me").json()["user"] is None


def test_감사로그에_다른_이름으로_남는다():
    """평범한 변경과 같은 이름으로 남기면, 나중에 「옛 값 없이 바꾼 일이 있었나」를
    되짚을 수 없다."""
    app, admin, apw = ctx()
    c = login(app, "admin", apw)
    assert c.post(URL, json={"new_password": "newadminpw99"}).status_code == 200
    # **읽는 길로 읽는다.** SQL 을 직접 치면 테이블 이름이 바뀌는 날 가드만 깨지고,
    # 정작 사람이 보는 화면(`list_audit`)에 안 뜨는 것은 못 잡는다.
    actions = [r["action"] for r in auth_store.list_audit(200) if r["user_id"] == admin["id"]]
    assert "change_pw_noold" in actions, actions
    assert "change_pw" not in actions, actions


# ── 막히는 일 ───────────────────────────────────
def test_작성자는_못_쓴다():
    app, admin, apw = ctx()
    c = login(app, "writer1", "password123")
    r = c.post(URL, json={"new_password": "writernewpw1"})
    assert r.status_code == 403, r.text
    # 그리고 실제로 안 바뀌었다 — 상태 코드만 보고 끝내면 「막았다고 적힌 채 바뀌는」 일이 생긴다.
    tok, u = auth_store.login("writer1", "password123")
    assert u["login_id"] == "writer1"


def test_열람자도_못_쓴다():
    app, admin, apw = ctx()
    c = login(app, "viewer1", "password123")
    assert c.post(URL, json={"new_password": "viewernewpw1"}).status_code == 403
    tok, u = auth_store.login("viewer1", "password123")
    assert u["login_id"] == "viewer1"


def test_로그인_안_했으면_못_쓴다():
    app, admin, apw = ctx()
    c = TestClient(app)
    assert c.post(URL, json={"new_password": "nobodypw1234"}).status_code in (401, 403)


def test_여덟자_미만은_거부한다():
    app, admin, apw = ctx()
    c = login(app, "admin", apw)
    r = c.post(URL, json={"new_password": "short7x"})
    assert r.status_code == 400
    tok, u = auth_store.login("admin", apw)   # 그대로다
    assert u["login_id"] == "admin"


def test_쓰던_값과_같으면_거부한다():
    """같은 값으로 「바꿨다」고 하면 바꾼 줄 알고 넘어간다."""
    app, admin, apw = ctx()
    c = login(app, "admin", apw)
    assert c.post(URL, json={"new_password": apw}).status_code == 400


def test_몸통에_남의_id_를_실어도_제_것만_바뀐다():
    """대상을 고를 자리가 없다는 것을 **실제로 실어 보고** 확인한다 —
    「자리가 없다」는 읽어서 아는 것이고, 이건 눌러 보고 아는 것이다."""
    app, admin, apw = ctx()
    w = [u for u in auth_store.list_users() if u["login_id"] == "writer1"][0]
    c = login(app, "admin", apw)
    r = c.post(URL, json={"new_password": "newadminpw99",
                          "user_id": w["id"], "target": w["id"]})
    assert r.status_code == 200, r.text
    tok, u = auth_store.login("writer1", "password123")   # 작성자는 그대로
    assert u["login_id"] == "writer1"
    tok, u2 = auth_store.login("admin", "newadminpw99")   # 바뀐 것은 나
    assert u2["login_id"] == "admin"


# ── 평범한 길은 그대로여야 한다 ───────────────────
def test_일반_변경은_여전히_옛_값을_묻는다():
    """이 길을 낸 뒤에 저 길이 헐거워지면, 옛 값 확인이 제품 전체에서 없는 것과 같아진다."""
    app, admin, apw = ctx()
    c = login(app, "writer1", "password123")
    r = c.post("/api/auth/password", json={"old_password": "", "new_password": "writernewpw1"})
    assert r.status_code == 400, r.text
    r2 = c.post("/api/auth/password", json={"old_password": "틀린값", "new_password": "writernewpw1"})
    assert r2.status_code == 400, r2.text


def test_관리자에게도_일반_변경의_옛_값_확인은_살아_있다():
    app, admin, apw = ctx()
    c = login(app, "admin", apw)
    r = c.post("/api/auth/password", json={"old_password": "", "new_password": "newadminpw99"})
    assert r.status_code == 400, r.text
