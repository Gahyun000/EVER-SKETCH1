"""전 엔드포인트 인증 배선 검사 (UDS-107 §4 — 서버는 UI 숨김과 별개로 권한을 검증한다).

여기서 잡으려는 것은 "가드를 붙이는 걸 깜빡한 라우트"다.
새 엔드포인트를 추가하고 가드를 안 붙이면 이 테스트가 실패한다 —
사람이 기억할 일이 아니라 스위트가 기억할 일이다.

app.py 는 무거운 의존성(pptx·docx·fitz)을 끌어오므로 import 하지 않고,
소스를 AST 로 읽어 데코레이터와 본문을 검사한다.
"""
import ast
import pathlib

import pytest

SRC_DIR = pathlib.Path(__file__).resolve().parent

# 인증 없이 열어두는 엔드포인트와 그 사유. 여기 없는 것은 전부 가드가 있어야 한다.
PUBLIC_ALLOWLIST = {
    ("GET", "/api/health"): "기동 확인용. 내부 경로를 돌려주지 않는다",
}


def _routes(filename: str, app_var: str, prefix: str = ""):
    """(메서드, 경로, 함수본문) 목록. prefix 는 APIRouter(prefix=...) 값."""
    src = (SRC_DIR / filename).read_text(encoding="utf-8")
    lines = src.split("\n")
    tree = ast.parse(src)
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for d in node.decorator_list:
            if (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
                    and isinstance(d.func.value, ast.Name) and d.func.value.id == app_var):
                path = prefix + (d.args[0].value if d.args else "?")
                body = "\n".join(lines[node.lineno - 1:node.end_lineno])
                out.append((d.func.attr.upper(), path, body))
    return out


ALL_ROUTES = (
    _routes("app.py", "app")
    + _routes("routes_projects.py", "router")
    + _routes("routes_auth.py", "router", prefix="/api/auth")   # APIRouter(prefix=...)
)


def test_라우트를_실제로_찾았다():
    """검사 대상이 0건이면 테스트가 조용히 통과한다 — 그걸 막는다."""
    assert len(ALL_ROUTES) >= 25, "라우트 파싱 실패: %d건" % len(ALL_ROUTES)


@pytest.mark.parametrize("method,path,body", ALL_ROUTES,
                         ids=[f"{m} {p}" for m, p, _ in ALL_ROUTES])
def test_모든_엔드포인트에_로그인_가드가_있다(method, path, body):
    if (method, path) in PUBLIC_ALLOWLIST:
        pytest.skip("공개 허용: %s" % PUBLIC_ALLOWLIST[(method, path)])
    # 인증 계열은 로그인 자체를 처리하므로 자기만의 의존성을 쓴다.
    if path.startswith("/api/auth/"):
        assert ("require_login" in body or "require_active" in body
                or "current_user" in body or path in ("/api/auth/login", "/api/auth/signup",
                                                      "/api/auth/logout")), \
            "%s %s 에 인증 의존성이 없습니다" % (method, path)
        return
    assert "require_active" in body, "%s %s 에 require_active 가 없습니다" % (method, path)


@pytest.mark.parametrize("method,path,body", ALL_ROUTES,
                         ids=[f"{m} {p}" for m, p, _ in ALL_ROUTES])
def test_모든_엔드포인트가_권한을_판정한다(method, path, body):
    """로그인만 확인하고 레벨을 안 보면 L1 이 전부 호출할 수 있다."""
    if (method, path) in PUBLIC_ALLOWLIST:
        pytest.skip("공개 허용")
    if path in ("/api/auth/login", "/api/auth/signup", "/api/auth/logout",
                "/api/auth/me", "/api/auth/password"):
        return   # 로그인 전이거나 본인 계정 조작 — 레벨과 무관
    assert ("require_action" in body or "require_project" in body
            or "can_grant_level" in body or "visible_project_filter" in body), \
        "%s %s 가 권한을 판정하지 않습니다" % (method, path)


def test_공개_허용목록이_최소한으로_유지된다():
    """허용목록이 늘어나면 그만큼 구멍이 늘어난다. 늘릴 때 이 테스트를 함께 고치게 한다."""
    assert len(PUBLIC_ALLOWLIST) == 1, "공개 엔드포인트가 늘었습니다: %s" % list(PUBLIC_ALLOWLIST)


def test_health가_내부_경로를_노출하지_않는다():
    body = [b for m, p, b in ALL_ROUTES if p == "/api/health"][0]
    for leak in ("str(GEN_PY)", "str(EBOOKS)", "str(HERE)", "str(DIST)"):
        assert leak not in body, "/api/health 가 내부 경로를 노출합니다: %s" % leak


def test_LLM설정은_L3만():
    for m, p, body in ALL_ROUTES:
        if p.startswith("/api/settings/llm"):
            assert "SETTINGS_MANAGE" in body, "%s %s 가 L3 전용이 아닙니다" % (m, p)


def test_발행은_L3만():
    body = [b for m, p, b in ALL_ROUTES if p == "/api/build"][0]
    assert "perm.PUBLISH" in body


def test_대화_조회는_소유를_확인한다():
    for m, p, body in ALL_ROUTES:
        if p.startswith("/api/chat/conversations/"):
            assert "_require_own_conversation" in body, "%s %s 가 대화 소유를 확인하지 않습니다" % (m, p)
        if p in ("/api/chat/v2", "/api/chat/v2/stream", "/api/chat/reset"):
            assert "_own_or_claim_conversation" in body, "%s %s 가 대화 소유를 확정하지 않습니다" % (m, p)
