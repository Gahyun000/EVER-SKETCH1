"""뿌리에 놓인 파일이 실제로 나오는가.

2026-09-15 · 사용자가 로그에서 잡아 줬다 — ``GET /favicon.svg 404``.
파일은 ``dist/`` 에 멀쩡히 있었는데, ``@app.get("/{shell_path}")`` 가 ``/`` 에 붙인
StaticFiles **보다 먼저** 등록돼 있어서 한 칸짜리 주소를 전부 가로채고 있었다.
파비콘만이 아니라 ``apple-touch-icon.png`` · ``tutorial.html`` ·
``demo-storyboard.gif`` 까지 다 404 였다.

여기서 지키는 것.
  · 뿌리 파일은 나온다
  · 화면 주소(``/inbox`` …)는 여전히 index.html 을 받는다
  · **없는 주소는 여전히 404 다** — 오타를 「내 자료」로 삼켜 주면 주소가 화면과
    다른 말을 하게 된다
  · ``..`` 로 dist 밖을 못 읽는다
"""
import pytest
from fastapi.testclient import TestClient

from server import app as app_mod


@pytest.fixture()
def cli(tmp_path, monkeypatch):
    """dist 를 흉내 낸다 — 진짜 빌드 결과에 기대면 빌드 안 한 곳에서 시험이 깨진다."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>셸</html>", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (dist / "tutorial.html").write_text("<html>튜토리얼</html>", encoding="utf-8")
    (tmp_path / "비밀.txt").write_text("밖에 있는 파일", encoding="utf-8")
    monkeypatch.setattr(app_mod, "DIST", dist)
    return TestClient(app_mod.app)


def test_뿌리_파일이_나온다(cli):
    r = cli.get("/favicon.svg")
    assert r.status_code == 200, "파일이 있는데 404 면 파비콘이 안 뜬다"
    assert "<svg" in r.text

    r2 = cli.get("/tutorial.html")
    assert r2.status_code == 200 and "튜토리얼" in r2.text


def test_화면_주소는_셸을_받는다(cli):
    for p in app_mod.SHELL_PATHS:
        r = cli.get("/" + p)
        assert r.status_code == 200, p
        assert "셸" in r.text, "%s 는 index.html 을 받아야 한다 (새로고침이 통해야 한다)" % p


def test_없는_주소는_404_그대로(cli):
    """오타를 삼켜 주지 않는다 — 주소가 화면과 다른 말을 하면 안 된다."""
    assert cli.get("/없는화면").status_code == 404
    assert cli.get("/inbox2").status_code == 404


def test_주소로는_밖에_못_나간다(cli):
    """한 칸짜리 자리라 `/` 가 안 들어오므로, **주소로는** 밖을 가리킬 수 없다."""
    for bad in ("..", "%2e%2e", "....", "%2e%2e%2f%EB%B9%84%EB%B0%80.txt"):
        r = cli.get("/" + bad)
        assert r.status_code in (404, 400, 307), "%s 로 dist 밖이 열리면 안 된다 (%s)" % (bad, r.status_code)
        assert "밖에 있는 파일" not in r.text


def test_함수를_직접_불러도_밖에_못_나간다(tmp_path, monkeypatch):
    """**여기가 그 막이를 실제로 건드리는 자리다.**

    위 시험은 HTTP 를 거치는데, 라우팅이 `..` 를 먼저 정리해 버려서 함수까지 오지
    않는다. 그래서 막이를 빼도 위 시험은 통과했다 — 아무것도 안 지키고 있었던 셈이다.
    길이 하나뿐일 때는 그래도 되지만, 이 자리가 나중에 여러 칸을 받게 되면 바로
    구멍이 된다. 함수를 직접 불러서 그 규칙 자체를 못 박는다.
    """
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("셸", encoding="utf-8")
    (tmp_path / "비밀.txt").write_text("밖에 있는 파일", encoding="utf-8")
    monkeypatch.setattr(app_mod, "DIST", dist)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        app_mod.spa_shell_view("../비밀.txt")
    assert e.value.status_code == 404

    # 안에 있는 것은 그대로 준다 — 막이가 멀쩡한 길까지 막으면 안 된다.
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    assert app_mod.spa_shell_view("favicon.svg").status_code == 200
