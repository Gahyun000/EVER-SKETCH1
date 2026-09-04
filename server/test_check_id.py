"""아이디 중복 확인 — `GET /api/auth/check-id`.

이 엔드포인트는 **계정 존재 여부를 알려준다.** 이 제품의 다른 곳은 정확히 그 반대다 —
로그인 실패는 "아이디 또는 비밀번호"로 뭉개고, 자료 조회는 404 와 403 을 통일한다.

그래도 넣는 근거: **이미 새고 있다.** 가입 폼에 아이디를 넣고 제출하면 지금도
"이미 사용 중인 아이디입니다"가 그대로 나온다. 이 API 는 없던 구멍을 뚫는 게 아니라
**있는 구멍을 빠르게** 만든다. 그래서 막을 것은 "알려주는 것"이 아니라
**"빠르게 많이 묻는 것"** 이다 — 그게 이 파일이 지키는 계약이다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "checkid.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "checkid.db")


@pytest.fixture(autouse=True)
def clean_db():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def app_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_router)
    return TestClient(app)


def ask(c: TestClient, login_id: str):
    return c.get("/api/auth/check-id", params={"login_id": login_id})


# ── 기본 동작 ────────────────────────────────────
def test_비어_있는_아이디는_사용할_수_있다():
    c = app_client()
    r = ask(c, "newbie")
    assert r.status_code == 200
    assert r.json() == {"available": True}


def test_이미_쓰는_아이디는_사용할_수_없다():
    auth_store.signup("gahyun", "password123", "김가현", "사업본부", "writer")
    c = app_client()
    assert ask(c, "gahyun").json() == {"available": False}


def test_대소문자와_공백을_서버에서도_정규화한다():
    """화면이 정규화해서 보내지만 서버가 믿고 그대로 조회하면,
    화면을 거치지 않은 호출에서 「GAHYUN 은 비어 있다」가 나온다."""
    auth_store.signup("gahyun", "password123", "김가현", "사업본부", "writer")
    c = app_client()
    assert ask(c, "  GaHyun  ").json() == {"available": False}


def test_로그인_없이_호출된다():
    """가입 전에 쓰는 기능이라 로그인 가드를 붙일 수 없다.
    그래서 아래 시도 제한이 **유일한 방어선**이다."""
    c = app_client()
    assert ask(c, "newbie").status_code == 200


# ── 응답을 나누지 않는다 ─────────────────────────
def test_형식이_틀려도_같은_모양으로_답한다():
    """「이미 있음」과 「못 쓰는 형식」을 나눠 답하면 응답 모양 자체가 정보가 된다.
    형식은 화면이 서버에 묻지 않고도 판정하므로, 여기서 자세히 말할 이유도 없다."""
    c = app_client()
    for bad in ("ab", "a" * 33, "김가현이", "kim gh", "GAHYUN!"):
        r = ask(c, bad)
        assert r.status_code == 200, bad
        assert r.json() == {"available": False}, bad


def test_응답에_계정_정보가_섞이지_않는다():
    """이름·부서·상태가 딸려 나오면 중복 확인이 사내 인명부가 된다."""
    auth_store.signup("gahyun", "password123", "김가현", "사업본부", "writer")
    c = app_client()
    body = ask(c, "gahyun").json()
    assert set(body.keys()) == {"available"}
    assert "김가현" not in str(body) and "사업본부" not in str(body)


# ── 시도 제한 ───────────────────────────────────
def test_너무_많이_물으면_거절한다():
    """이 API 의 위험은 "알려주는 것"이 아니라 "빠르게 많이 묻는 것"이다.
    사람이 가입하며 누르는 횟수는 몇 번이고, 긁는 쪽은 수천 번이다."""
    c = app_client()
    limit = auth_store.CHECK_ID_MAX
    for i in range(limit):
        assert ask(c, "probe%d" % i).status_code == 200, i
    r = ask(c, "probe_over")
    assert r.status_code == 429
    assert "detail" in r.json()


def test_제한에_걸려도_존재_여부를_흘리지_않는다():
    """429 를 존재하는 아이디에만 주면 그 자체가 답이 된다."""
    auth_store.signup("gahyun", "password123", "김가현", "", "writer")
    c = app_client()
    for i in range(auth_store.CHECK_ID_MAX):
        ask(c, "probe%d" % i)
    assert ask(c, "gahyun").status_code == 429
    assert ask(c, "nobody_here").status_code == 429


def test_시도가_감사로그에_남는다():
    """긁힌 사실을 나중에 확인할 방법이 없으면 「제한을 걸었다」고 말할 수 있을 뿐이다."""
    c = app_client()
    ask(c, "newbie")
    actions = [a["action"] for a in auth_store.list_audit(limit=50)]
    assert "check_id" in actions


def test_거절도_감사로그에_남는다():
    c = app_client()
    for i in range(auth_store.CHECK_ID_MAX + 1):
        ask(c, "probe%d" % i)
    actions = [a["action"] for a in auth_store.list_audit(limit=200)]
    assert "check_id_blocked" in actions


def test_감사로그에_아이디를_통째로_남기지_않는다():
    """긁힌 아이디 목록을 그대로 적어 두면, 감사로그를 보는 것만으로
    누가 무엇을 캐 갔는지가 아니라 **캐 간 결과**가 재현된다."""
    c = app_client()
    ask(c, "secret_person")
    rows = [a for a in auth_store.list_audit(limit=50) if a["action"] == "check_id"]
    assert rows
    joined = " ".join("%s %s" % (r["target"], r["detail"]) for r in rows)
    assert "secret_person" not in joined


def test_제한은_시간창_안에서만_센다():
    """영구 카운터면 오래 쓴 사무실 IP 는 언젠가 영원히 막힌다."""
    c = app_client()
    for i in range(auth_store.CHECK_ID_MAX):
        ask(c, "probe%d" % i)
    assert ask(c, "again").status_code == 429
    # 창 밖으로 밀어낸다 — 기록의 시각을 과거로 옮긴다.
    conn = auth_store._conn()
    try:
        conn.execute("UPDATE AuditLogs SET ts = ts - ? WHERE action='check_id'",
                     (auth_store.CHECK_ID_WINDOW_MS + 1000,))
        conn.commit()
    finally:
        conn.close()
    assert ask(c, "again").status_code == 200


def test_사람이_가입하는_횟수는_넉넉히_통과한다():
    """제한이 사람을 막으면 그건 기능이 아니라 고장이다."""
    assert auth_store.CHECK_ID_MAX >= 20
