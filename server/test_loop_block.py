"""**이벤트 루프를 막는 길이 다시 생기지 않게.** (2026-09-21)

사용자: 「폴더가 자주 안 불러와진다」. 보내 준 개발자도구 화면에서 **index.html 조차
(pending)** 이었다 — 폴더 API 하나가 느린 게 아니라 서버가 통째로 안 받는 상태다.

찾아보니 `POST /api/deck` 만 `async def` 인 채로 `convert()` 를 **그 자리에서** 불렀다.
그 한 줄이 HTML→PPTX→PDF→썸네일을 다 하고, 요약을 켜면 LLM 을 최대 90초 기다린다.
그동안 uvicorn 은 아무 요청도 받지 못한다. `def` 로 선언된 엔드포인트는 FastAPI 가
작업 실(threadpool)로 돌려 주므로 같은 일을 해도 서버가 멈추지 않는다 —
**막히는 것은 `async def` 안에서 기다리는 동기 호출뿐이다.**

그래서 이 검사는 `app.py` 의 `async def` 엔드포인트만 보고, 그 안에서 오래 걸리는
동기 호출을 **직접** 부르지 않는지 본다. 새 엔드포인트를 `async def` 로 만들면서
무거운 일을 그냥 부르면 여기서 걸린다.

실행: python3 -m pytest server/test_loop_block.py -q
"""
from __future__ import annotations

import pathlib
import re
import threading

from fastapi.testclient import TestClient

HERE = pathlib.Path(__file__).resolve().parent
SRC = (HERE / "app.py").read_text(encoding="utf-8")

# 오래 걸리는 동기 호출. `await run_in_threadpool(...)` 로 감싸면 인자 자리에 오므로
# 「이름 바로 뒤에 여는 괄호」만 잡는다.
BLOCKING = ("convert(", "convert_stream(", "urlopen(", "subprocess.run(")


def _async_endpoint_bodies() -> dict[str, str]:
    """`async def` 로 선언된 라우트 함수의 몸통만 뽑는다(다음 최상위 def 까지)."""
    out: dict[str, str] = {}
    for m in re.finditer(r"^async def (\w+)\(", SRC, re.M):
        name, start = m.group(1), m.start()
        nxt = re.search(r"^(async def |def |@app\.|class )", SRC[m.end():], re.M)
        out[name] = SRC[start:m.end() + (nxt.start() if nxt else len(SRC))]
    return out


def test_async_엔드포인트가_루프를_막지_않는다():
    bad = []
    for name, body in _async_endpoint_bodies().items():
        # 중첩 def(안쪽 동기 함수)는 작업 실에서 도는 제너레이터·콜백이라 뺀다.
        outer = re.split(r"\n    def ", body)[0]
        for call in BLOCKING:
            if call in outer and ("run_in_threadpool" not in outer.split(call)[0][-60:]):
                bad.append((name, call))
    assert not bad, (
        "async def 엔드포인트가 동기 호출을 그 자리에서 기다린다 — 그동안 서버가 통째로 멈춘다: "
        + ", ".join("%s → %s" % (n, c) for n, c in bad)
    )


def test_deck_은_작업_실로_내보낸다():
    body = _async_endpoint_bodies()["deck"]
    assert "run_in_threadpool(convert" in body, "/api/deck 이 다시 루프에서 변환하고 있다"


def test_멈춤_감시가_뜬다():
    """감시는 **자동으로** 떠야 한다 — 사람이 켜야 하는 감시는 멈춘 날 꺼져 있다."""
    import server.app as A
    with TestClient(A.app):
        names = [t.name for t in threading.enumerate()]
    assert "stall-watch" in names, "멈춤 감시 실이 안 떴다: %s" % names


def test_감시가_라우트로_잡히지_않는다():
    """`on_event` 로 달면 라우트 목록에 끼어 「엔드포인트마다 가드」 검사를 떨어뜨린다."""
    import server.app as A
    assert not any(getattr(r, "name", "") == "startup" for r in A.app.routes)
