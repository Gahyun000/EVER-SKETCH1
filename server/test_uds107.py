"""UDS-107 보안 및 개인정보 표준 준수 검증.

각 테스트는 표준 조항에 1:1로 대응한다. 조항이 바뀌면 여기를 먼저 고친다.
"""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "uds107.db")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import projects as projects_store  # noqa: E402
from server.routes_auth import router as auth_router  # noqa: E402
from server.routes_projects import router as proj_router  # noqa: E402

_DB = str(pathlib.Path(_tmp) / "uds107.db")


@pytest.fixture(autouse=True)
def clean():
    os.environ["EVER_SKETCH_DB"] = _DB
    for suffix in ("", "-wal", "-shm"):
        f = pathlib.Path(_DB + suffix)
        if f.exists():
            f.unlink()
    yield


def app_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(proj_router)
    return TestClient(app)


def audit_actions() -> list[str]:
    c = auth_store._conn()
    try:
        return [r[0] for r in c.execute("SELECT action FROM AuditLogs").fetchall()]
    finally:
        c.close()


# ══════════ §4 인증과 권한 ══════════
def test_UDS107_4_서버가_UI숨김과_별개로_권한을_검증한다():
    """프런트를 거치지 않고 API 를 직접 불러도 막혀야 한다."""
    admin_pw = auth_store.ensure_seed_admin("adminpw12345")
    assert admin_pw
    u = auth_store.signup("writer", "password123", "작성자", "본부", "writer")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    auth_store.approve(admin["id"], u["id"], "writer")
    other = projects_store.create_project("타인", {"pages": []}, owner_id="u_other")

    c = app_client()
    c.post("/api/auth/login", json={"login_id": "writer", "password": "password123"})
    # 화면에 버튼이 없어도 API 는 열려 있을 수 있다 — 서버가 막아야 한다.
    assert c.get(f"/api/projects/{other['id']}").status_code == 403
    assert c.delete(f"/api/projects/{other['id']}").status_code == 403


def test_UDS107_4_관리자와_일반_사용자_권한이_분리된다():
    auth_store.ensure_seed_admin("adminpw12345")
    u = auth_store.signup("plain", "password123", "일반", "", "writer")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    auth_store.approve(admin["id"], u["id"], "writer")
    c = app_client()
    c.post("/api/auth/login", json={"login_id": "plain", "password": "password123"})
    assert c.get("/api/auth/users").status_code == 403


def test_UDS107_4_삭제가_감사로그에_남는다():
    """되돌릴 수 없는 작업 — 누가 무엇을 지웠는지 반드시 추적 가능해야 한다."""
    auth_store.ensure_seed_admin("adminpw12345")
    p = projects_store.create_project("지울 것", {"pages": []}, owner_id="u_x")
    c = app_client()
    c.post("/api/auth/login", json={"login_id": "admin", "password": "adminpw12345"})
    c.post("/api/auth/password", json={"old_password": "adminpw12345", "new_password": "realpw123456"})
    c.post("/api/auth/login", json={"login_id": "admin", "password": "realpw123456"})
    assert c.delete(f"/api/projects/{p['id']}").status_code == 200
    assert "delete_project" in audit_actions()


def test_UDS107_4_버전_삭제도_감사로그에_남는다():
    auth_store.ensure_seed_admin("adminpw12345")
    p = projects_store.create_project("이북", {"pages": [{"id": 1}]}, owner_id="u_x")
    v = projects_store.save_version(p["id"], {"pages": [{"id": 1}]}, label="v1")
    c = app_client()
    c.post("/api/auth/login", json={"login_id": "admin", "password": "adminpw12345"})
    c.post("/api/auth/password", json={"old_password": "adminpw12345", "new_password": "realpw123456"})
    c.post("/api/auth/login", json={"login_id": "admin", "password": "realpw123456"})
    assert c.delete(f"/api/projects/{p['id']}/versions/{v['id']}").status_code == 200
    assert "delete_version" in audit_actions()


def test_UDS107_4_권한변경이_감사로그에_남는다():
    auth_store.ensure_seed_admin("adminpw12345")
    u = auth_store.signup("target", "password123", "대상", "", "writer")
    admin = [x for x in auth_store.list_users() if x["login_id"] == "admin"][0]
    auth_store.approve(admin["id"], u["id"], "writer")
    auth_store.set_status(admin["id"], u["id"], "disabled")
    acts = audit_actions()
    assert "approve" in acts and "disable" in acts


# ══════════ §5 비밀정보 ══════════
def test_UDS107_5_비밀번호가_평문으로_저장되지_않는다():
    auth_store.signup("secret", "MySecretPw123", "비밀", "", "writer")
    c = auth_store._conn()
    try:
        row = c.execute("SELECT pw_hash FROM Users WHERE login_id='secret'").fetchone()
    finally:
        c.close()
    assert "MySecretPw123" not in row[0]
    assert row[0].startswith("pbkdf2$")


def test_UDS107_5_비밀번호가_감사로그에_남지_않는다():
    """로그도 데이터 분류 대상이다(§3). 인증정보가 흘러들면 안 된다."""
    auth_store.signup("logtest", "MySecretPw123", "로그", "", "writer")
    try:
        auth_store.login("logtest", "MySecretPw123")
    except auth_store.AuthError:
        pass
    c = auth_store._conn()
    try:
        rows = c.execute("SELECT target, detail FROM AuditLogs").fetchall()
    finally:
        c.close()
    blob = " ".join(str(x) for row in rows for x in row)
    assert "MySecretPw123" not in blob


# ══════════ §6 안전한 구현 ══════════
@pytest.mark.parametrize("login_id", [
    "ab",                       # 너무 짧음
    "x" * 33,                   # 너무 김
    "hong gildong",             # 공백
    "admin'--",                 # SQL 흉내
    "<script>alert(1)</script>",  # HTML 주입 흉내
    "관리자",                    # 비ASCII
    "a\nb",                     # 제어문자
])
def test_UDS107_6_아이디_형식과_길이를_검증한다(login_id):
    with pytest.raises(auth_store.AuthError):
        auth_store.signup(login_id, "password123", "이름", "", "writer")


def test_UDS107_6_비밀번호_길이_상한이_있다():
    """PBKDF2 는 입력 길이에 비례해 CPU를 쓴다. 상한이 없으면 연산 DoS 가 된다."""
    with pytest.raises(auth_store.AuthError):
        auth_store.signup("dosuser", "x" * 100_000, "이름", "", "writer")


def test_UDS107_6_로그인도_길이_상한을_먼저_적용한다():
    """검증 전에 잘라내야 한다 — 해시 계산까지 가면 이미 CPU를 쓴 뒤다."""
    auth_store.signup("victim", "password123", "이름", "", "writer")
    with pytest.raises(auth_store.AuthError):
        auth_store.login("victim", "x" * 100_000)


def test_UDS107_6_이름_부서_길이_상한():
    with pytest.raises(auth_store.AuthError):
        auth_store.signup("nameuser", "password123", "이" * 41, "", "writer")
    with pytest.raises(auth_store.AuthError):
        auth_store.signup("deptuser", "password123", "이름", "부" * 41, "writer")


def test_UDS107_6_SQL_인젝션이_먹히지_않는다():
    """파라미터 바인딩을 쓰므로 문자열이 그대로 값으로 처리된다."""
    auth_store.signup("normal", "password123", "정상", "", "writer")
    # 형식 검증에 먼저 걸리지만, 통과하더라도 값으로만 쓰인다는 것을 확인
    with pytest.raises(auth_store.AuthError):
        auth_store.login("'; DROP TABLE Users; --", "password123")
    assert auth_store.list_users()          # 테이블이 살아 있다


def test_UDS107_6_로그인_시도_제한():
    """권한 상승을 위협 모델에 포함 — 무차별 대입을 막는다."""
    auth_store.signup("bruteforce", "password123", "대상", "", "writer")
    for _ in range(auth_store.LOGIN_MAX_FAILS):
        with pytest.raises(auth_store.AuthError):
            auth_store.login("bruteforce", "wrongpassword")
    # 이제 올바른 비밀번호로도 막힌다
    with pytest.raises(auth_store.AuthError) as e:
        auth_store.login("bruteforce", "password123")
    assert "너무 많습니다" in str(e.value)
    assert "login_locked" in audit_actions()


def test_UDS107_6_잠금은_계정별로_분리된다():
    """한 계정이 잠겼다고 다른 사람이 못 들어오면 안 된다."""
    auth_store.signup("locked", "password123", "잠김", "", "writer")
    auth_store.signup("innocent", "password123", "정상", "", "writer")
    for _ in range(auth_store.LOGIN_MAX_FAILS):
        with pytest.raises(auth_store.AuthError):
            auth_store.login("locked", "wrongpassword")
    token, _ = auth_store.login("innocent", "password123")
    assert token


def test_UDS107_6_성공하면_잠금_카운터가_비워진다():
    """9번 틀리고 맞춘 사람이 다음날 1번만 틀려도 잠기면 안 된다."""
    auth_store.signup("recover", "password123", "복구", "", "writer")
    for _ in range(auth_store.LOGIN_MAX_FAILS - 1):
        with pytest.raises(auth_store.AuthError):
            auth_store.login("recover", "wrongpassword")
    assert auth_store.login("recover", "password123")[0]
    assert auth_store.recent_login_fails("recover") == 0


def test_UDS107_6_콘솔로_잠금을_해제할_수_있다():
    from server import admin_cli
    auth_store.signup("stuck", "password123", "잠김", "", "writer")
    for _ in range(auth_store.LOGIN_MAX_FAILS):
        with pytest.raises(auth_store.AuthError):
            auth_store.login("stuck", "wrongpassword")
    admin_cli.cmd_unlock("stuck")
    assert auth_store.login("stuck", "password123")[0]


def test_UDS107_6_오류_응답에_내부_경로가_없다():
    """오류 응답에 내부 경로, 스택, 쿼리, 비밀정보를 노출하지 않는다."""
    auth_store.ensure_seed_admin("adminpw12345")
    c = app_client()
    r = c.post("/api/auth/login", json={"login_id": "nosuch", "password": "wrongpassword"})
    body = r.text
    for leak in ("/Users/", "/home/", "Traceback", "sqlite3", "SELECT ", ".py"):
        assert leak not in body, "응답에 %s 가 노출됨: %s" % (leak, body[:200])


# ══════════ 신규 액션 판정 (W2 착수 조건) ══════════
from server.permissions import (  # noqa: E402
    Actor, Resource, decide, AI_USE, SETTINGS_MANAGE, PUBLISH,
)

_PEND = Actor(id="p", role="", status="pending")
_L1 = Actor(id="a", role="viewer", status="active")
_L2 = Actor(id="b", role="writer", status="active")
_L3 = Actor(id="c", role="admin", status="active")


def test_LLM설정은_L3만_판정():
    """API 키를 다루는 설정 — base_url 을 바꾸면 이후 모든 대화가 그쪽으로 간다."""
    assert decide(_L3, SETTINGS_MANAGE) is True
    for a in (_L2, _L1, _PEND, None):
        assert decide(a, SETTINGS_MANAGE) is False


def test_발행은_L3만_판정():
    """발행하면 L1 전원에게 공개된다. 작성자가 초안을 실수로 내보내면 되돌릴 수 없다."""
    assert decide(_L3, PUBLISH) is True
    for a in (_L2, _L1, _PEND, None):
        assert decide(a, PUBLISH) is False


def test_AI도구는_L2_이상():
    """L1 은 열람자다 — 작성 보조가 필요 없고, LLM 호출은 비용과 외부 전송을 수반한다."""
    assert decide(_L2, AI_USE) is True
    assert decide(_L3, AI_USE) is True
    assert decide(_L1, AI_USE) is False
    assert decide(_PEND, AI_USE) is False
    assert decide(None, AI_USE) is False


def test_AI도구는_리소스_없이도_판정된다():
    """챗봇은 특정 이북에 매이지 않는다. Resource 를 요구하면 항상 거부되어 버린다."""
    assert decide(_L2, AI_USE, None) is True
    assert decide(_L2, AI_USE, Resource(owner_id=None)) is True


def test_대화가_사용자별로_분리된다():
    """임원 A가 대화 id 만 알면 임원 B의 챗봇 대화를 읽던 문제."""
    from server import conversations as conv
    conv.append("cid_a", "user", "A의 비밀 이야기", user_id="u_a")
    conv.append("cid_b", "user", "B의 비밀 이야기", user_id="u_b")
    assert {c["id"] for c in conv.list_all("u_a")} == {"cid_a"}
    assert {c["id"] for c in conv.list_all("u_b")} == {"cid_b"}
    assert conv.owner_of("cid_a") == "u_a"
    # 관리자(user_id=None)는 전부 본다
    assert len(conv.list_all(None)) == 2


def test_주인_없는_대화는_최초_사용자에게_귀속된다():
    """단일 사용자 시절 대화(user_id 없음)를 다중 사용자 환경으로 넘길 때."""
    from server import conversations as conv
    conv.append("legacy", "user", "예전 대화")          # user_id 없이 생성
    assert conv.owner_of("legacy") is None
    conv.claim("legacy", "u_first")
    assert conv.owner_of("legacy") == "u_first"
    conv.claim("legacy", "u_second")                    # 이미 주인이 있으면 안 바뀐다
    assert conv.owner_of("legacy") == "u_first"


# ══════════ §5 프런트엔드 비밀정보 저장 금지 ══════════
def _frontend_sources():
    root = pathlib.Path(__file__).resolve().parent.parent
    src = root / "src"
    if not src.exists():
        pytest.skip("src/ 가 없는 환경")
    return [f for f in src.rglob("*.ts")] + [f for f in src.rglob("*.tsx")]


# ── 승인된 이탈 (2026-09-04) ────────────────────────────
# 원래 이 절의 계약은 "비밀번호를 브라우저 저장소에 절대 넣지 않는다" 였다.
# 사내망 전용이라는 전제에서, 더 안전한 두 대안(세션 30일 유지 · 브라우저 비밀번호
# 관리자)을 함께 제시한 뒤 **책임자가 저장 방식을 선택했다.**
# 기록: docs/작업대장/작업이력대장_2026-09-03_결재전환_표준팩재이식_P0_P1.md
#
# 그래서 계약을 없애지 않고 **좁혔다.** 비밀번호를 저장할 수 있는 파일은 딱 하나다.
# 다른 곳에서 같은 일이 시작되면 여기서 걸린다 — 예외가 조용히 번지는 것을 막는 것이
# 이 테스트의 새 임무다.
PW_STORE_ALLOWED = "remember.ts"


def test_UDS107_5_비밀번호_저장은_지정된_파일_한_곳에서만():
    """예외는 한 파일에 가둔다. 번지기 시작하면 어디까지 퍼졌는지 아무도 모른다.

    줄 단위가 아니라 **파일 단위**로 본다. 예전 검사는 `localStorage` 와 `password` 가
    같은 줄에 있을 때만 걸렸는데, 저장을 헬퍼 함수로 한 겹 감싸면 그대로 빠져나갔다.
    실제로 그런 일이 있었고 검사는 통과했다 — 안전해서가 아니라 못 봐서.
    """
    import re
    storage = re.compile(r"localStorage|sessionStorage|document\.cookie")
    secret = re.compile(r"password|passwd|\bpw\b|비밀번호", re.IGNORECASE)
    hits = []
    for f in _frontend_sources():
        if f.name == PW_STORE_ALLOWED:
            continue
        body = f.read_text(encoding="utf-8")
        if storage.search(body) and secret.search(body):
            hits.append(f.name)
    assert not hits, (
        "비밀번호와 브라우저 저장소를 함께 다루는 파일이 늘었습니다: %s\n"
        "저장은 %s 한 곳에서만 합니다." % (", ".join(sorted(hits)), PW_STORE_ALLOWED))


def test_UDS107_5_저장_키는_아이디와_비밀번호_둘뿐이다():
    root = pathlib.Path(__file__).resolve().parent.parent
    f = root / "src" / "auth" / PW_STORE_ALLOWED
    assert f.exists(), "%s 가 없습니다 — 파일을 옮겼다면 이 검사도 함께 옮기세요" % PW_STORE_ALLOWED
    import re
    keys = dict(re.findall(r"const (\w+_KEY) = '([^']+)'", f.read_text(encoding="utf-8")))
    assert keys == {"ID_KEY": "es_remember_login_id", "PW_KEY": "es_remember_pw"}, \
        "저장 키가 바뀌었거나 늘었습니다: %s" % keys


def test_UDS107_5_비밀번호_저장은_켠_사람에게만_일어난다():
    """기본값이 켜져 있으면 아무도 고르지 않은 위험을 전원이 지게 된다."""
    root = pathlib.Path(__file__).resolve().parent.parent
    body = (root / "src" / "auth" / "LoginScreen.tsx").read_text(encoding="utf-8")
    assert "useState(!!remembered.password)" in body, \
        "비밀번호 저장 체크박스의 기본값이 '이미 저장된 경우'가 아닙니다"
    assert "공용 PC" in body, "비밀번호 저장 위험을 알리는 문구가 없습니다"


def test_UDS107_5_비밀번호를_바꾸면_저장된_값을_지운다():
    """낡은 값이 자동으로 채워지면 사용자는 계정이 잠긴 줄 안다.

    이 프로젝트에서 실제로 두 번 난 혼란이다(비밀번호를 바꾸고 예전 값으로 로그인
    → 실패 → '계정이 사라졌다'). 자동 채움이 붙으면 더 자주 난다.
    """
    root = pathlib.Path(__file__).resolve().parent.parent
    body = (root / "src" / "auth" / "ChangePasswordForm.tsx").read_text(encoding="utf-8")
    assert "clearRememberedPassword()" in body, \
        "비밀번호 변경 후 저장된 비밀번호를 지우지 않습니다"


def test_UDS107_5_로그인_입력란에_autocomplete가_붙어있다():
    """브라우저 비밀번호 관리자가 동작하려면 username/current-password 가 정확해야 한다."""
    root = pathlib.Path(__file__).resolve().parent.parent
    f = root / "src" / "auth" / "LoginScreen.tsx"
    if not f.exists():
        pytest.skip("LoginScreen.tsx 없음")
    body = f.read_text(encoding="utf-8")
    assert 'autoComplete="username"' in body
    assert "'current-password'" in body and "'new-password'" in body
