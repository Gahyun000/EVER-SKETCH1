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

# 로그인 가드를 붙일 수 없는 인증 경로와 그 사유.
# 전부 **로그인 전에 쓰는 기능**이라 세션이 존재하지 않는다.
NO_LOGIN_AUTH_ROUTES = {
    "/api/auth/login": "로그인 자체",
    "/api/auth/signup": "가입 자체",
    "/api/auth/logout": "세션이 이미 없을 수도 있다",
    "/api/auth/check-id": "가입 전 아이디 중복 확인. 가드 대신 시도 제한이 방어선이다"
                          " — 아래 test_중복확인은_시도제한을_반드시_건다 가 그걸 강제한다",
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


# 파일 → APIRouter(prefix=...) 값. **새 라우터 파일을 여기 안 적으면
# 그 파일 전체가 이 게이트를 조용히 면제받는다** —
# 아래 test_라우터_파일을_빠뜨리지_않았다 가 그걸 막는다(P6 에서 실제로 한 번 빠뜨렸다).
ROUTER_FILES = {
    "routes_projects.py": "",
    "routes_auth.py": "/api/auth",
    "routes_teams.py": "/api/teams",
    "routes_folders.py": "/api/folders",
    "routes_approvals.py": "/api/approvals",
    "routes_team_library.py": "/api/team-library",
}

ALL_ROUTES = _routes("app.py", "app")
for _f, _pfx in ROUTER_FILES.items():
    ALL_ROUTES += _routes(_f, "router", prefix=_pfx)


def test_라우트를_실제로_찾았다():
    """검사 대상이 0건이면 테스트가 조용히 통과한다 — 그걸 막는다."""
    assert len(ALL_ROUTES) >= 25, "라우트 파싱 실패: %d건" % len(ALL_ROUTES)


def test_라우터_파일을_빠뜨리지_않았다():
    """**목록을 손으로 관리하면 언젠가 빠뜨린다.** 실제로 P6 에서
    `routes_team_library.py` 를 빠뜨렸고, 게이트는 아무 말 없이 통과했다 —
    새 라우터 파일 하나가 통째로 무검사 상태였다는 뜻이다.

    파일 목록을 디스크에서 다시 읽어 대조한다. 이제 라우터 파일을 만드는 것만으로
    이 테스트가 깨지고, 사람은 `ROUTER_FILES` 에 한 줄을 적게 된다.
    """
    found = sorted(f.name for f in SRC_DIR.glob("routes_*.py"))
    missing = [f for f in found if f not in ROUTER_FILES]
    assert not missing, "라우터 파일이 검사 목록에 없습니다: %s" % ", ".join(missing)


@pytest.mark.parametrize("method,path,body", ALL_ROUTES,
                         ids=[f"{m} {p}" for m, p, _ in ALL_ROUTES])
def test_모든_엔드포인트에_로그인_가드가_있다(method, path, body):
    if (method, path) in PUBLIC_ALLOWLIST:
        pytest.skip("공개 허용: %s" % PUBLIC_ALLOWLIST[(method, path)])
    # 인증 계열은 로그인 자체를 처리하므로 자기만의 의존성을 쓴다.
    if path.startswith("/api/auth/"):
        assert ("require_login" in body or "require_active" in body
                or "current_user" in body or path in NO_LOGIN_AUTH_ROUTES), \
            "%s %s 에 인증 의존성이 없습니다" % (method, path)
        return
    assert "require_active" in body, "%s %s 에 require_active 가 없습니다" % (method, path)


@pytest.mark.parametrize("method,path,body", ALL_ROUTES,
                         ids=[f"{m} {p}" for m, p, _ in ALL_ROUTES])
def test_모든_엔드포인트가_권한을_판정한다(method, path, body):
    """로그인만 확인하고 레벨을 안 보면 L1 이 전부 호출할 수 있다."""
    if (method, path) in PUBLIC_ALLOWLIST:
        pytest.skip("공개 허용")
    if path in NO_LOGIN_AUTH_ROUTES or path in ("/api/auth/me", "/api/auth/password"):
        return   # 로그인 전이거나 본인 계정 조작 — 레벨과 무관
    # 목록 계열은 permissions 의 가시성 판정 함수를 쓴다(라우터가 레벨을 직접 비교하면 안 된다).
    # 폴더는 「없음」과 「남의 것」을 구분해 알려주면 안 되므로 403 대신 404 를 낸다.
    # require_action 은 403 을 던지므로 쓸 수 없고, 대신 _mine() 이
    # perm.decide(FOLDER_MANAGE) 를 거친다 — 아래 test_폴더는_단일_판정을_거친다 가 그걸 강제한다.
    # 폴더·결재는 「없음」과 「남의 것」을 구분해 알려주면 안 되므로 403 대신 404 를 낸다.
    # require_action 은 403 을 던지므로 쓸 수 없다. 대신 소유 확인 헬퍼가
    # perm.decide 를 거친다 — 아래 두 테스트가 그걸 강제한다.
    assert ("require_action" in body or "require_project" in body
            or "can_grant_role" in body or "visible_project_filter" in body
            or (path.startswith("/api/folders") and "_mine(" in body)
            or (path.startswith("/api/approvals")
                and ("_mine_or_404(" in body or "_own_comment_or_404(" in body))
            # 팀 공유는 라우터가 아니라 `team_library` 가 건마다 판정한다
            # (목록 자체는 누구나 부를 수 있고, 볼 게 없으면 빈 목록이다).
            # 아래 test_팀공유는_단일_판정을_거친다 가 그 면제를 지킨다.
            or (path.startswith("/api/team-library") and "team_library." in body)
            ), \
        "%s %s 가 권한을 판정하지 않습니다" % (method, path)


def test_중복확인은_시도제한을_반드시_건다():
    """`/api/auth/check-id` 는 로그인 가드를 면제받았다. **공짜로 면제되면 안 된다.**

    이 엔드포인트는 계정 존재 여부를 알려주므로, 가드가 없는 대신
    시도 제한이 유일한 방어선이다. 누군가 나중에 제한을 걷어내면 여기서 걸린다.
    """
    body = [b for m, p, b in ALL_ROUTES if p == "/api/auth/check-id"][0]
    assert "login_id_taken" in body, "중복 확인이 저장소 함수를 거치지 않습니다"
    assert "RateLimited" in body and "429" in body, "시도 제한이 429 로 이어지지 않습니다"

    src = (SRC_DIR / "auth.py").read_text(encoding="utf-8")
    assert "CHECK_ID_MAX" in src and "recent_check_ids" in src, "시도 제한 자체가 없습니다"
    assert "audit(None, \"check_id\"" in src, "확인 시도가 감사로그에 남지 않습니다"


def test_중복확인은_계정_정보를_돌려주지_않는다():
    """이름·부서·상태가 딸려 나가면 중복 확인이 사내 인명부가 된다."""
    body = [b for m, p, b in ALL_ROUTES if p == "/api/auth/check-id"][0]
    for leak in ("_public(", "name", "dept", "role", "status"):
        assert leak not in body.split("return")[-1], \
            "/api/auth/check-id 응답에 %s 가 섞여 있습니다" % leak


def test_폴더는_단일_판정을_거친다():
    """폴더 라우트는 403 대신 404 를 내느라 `require_action` 을 못 쓴다.
    **그 면제를 공짜로 두지 않는다** — 판정은 여전히 `permissions.decide()` 하나가 해야 한다.

    남의 폴더에 403 을 주면 「그 id 는 있다」가 확인되어 **남의 폴더 존재가 새어 나간다.**
    폴더 이름은 사적 메모에 가깝다(D20). 그래서 없음과 남의 것을 똑같이 404 로 뭉갠다.
    """
    src = (SRC_DIR / "routes_folders.py").read_text(encoding="utf-8")
    assert "perm.decide(" in src and "FOLDER_MANAGE" in src, \
        "폴더 판정이 permissions.decide() 를 거치지 않습니다"
    assert "status_code=404" in src, "남의 폴더에 404 를 주지 않습니다(존재가 샙니다)"
    # 주석에서 「403 을 주면 안 된다」고 설명하는 것은 괜찮다. **내는 것**만 잡는다.
    assert "status_code=403" not in src, \
        "폴더 라우트가 403 을 냅니다 — 그 자체로 남의 폴더 존재를 알려줍니다"
    # 모든 폴더 라우트가 _mine() 을 거친다(목록·생성은 부모가 있을 때만)
    for m, p, body in ALL_ROUTES:
        if p.startswith("/api/folders"):
            assert "_mine(" in body, "%s %s 가 소유 확인을 건너뜁니다" % (m, p)


def test_결재는_남의_건에_404_를_낸다():
    """결재 건 id 에 403 을 주면 「그 id 는 있다」가 확인된다 — 남이 무엇을 냈는지가 샌다.
    없음과 남의 것을 똑같이 404 로 뭉갠다(폴더와 같은 이유)."""
    src = (SRC_DIR / "routes_approvals.py").read_text(encoding="utf-8")
    assert "status_code=404" in src
    assert "status_code=403" not in src, \
        "결재 라우트가 403 을 냅니다 — 그 자체로 남의 결재 건 존재를 알려줍니다"
    assert "perm.decide(" in src or "require_action" in src, \
        "결재 판정이 permissions 를 거치지 않습니다"


def test_팀공유는_단일_판정을_거친다():
    """팀 공유 라우터는 `require_action` 을 안 쓴다 — 목록은 **누구나** 부를 수 있고
    무엇이 보이는지는 건마다 갈리기 때문이다(팀이 없으면 403 이 아니라 빈 목록이다).
    **그 면제를 공짜로 두지 않는다.**

    ① 판정은 `permissions.can_see_approval()` 하나만 한다 — 결재 API 와 같은 함수다.
       두 벌이 되는 순간 「팀 공유에는 뜨는데 열면 404」 가 생긴다.
    ② 역할·팀을 직접 비교하지 않는다. `role ==` 나 `team_ids in` 이 여기 생기면
       그게 곧 두 번째 규칙이다.
    ③ 승인본만 읽는다. 대기·반려 건이 팀에 새면 D6(승인이 곧 공유)이 무너진다.
    ④ 못 보는 건에는 404 — 403 은 「그 id 는 있다」를 확인해 준다.
    """
    lib = (SRC_DIR / "team_library.py").read_text(encoding="utf-8")
    rt = (SRC_DIR / "routes_team_library.py").read_text(encoding="utf-8")

    assert "perm.can_see_approval(" in lib, "팀 공유가 permissions 를 거치지 않습니다"
    assert 'status="approved"' in lib, "팀 공유가 승인본만 읽는지 확인할 수 없습니다"

    code = "\n".join(l for l in lib.split("\n") if not l.lstrip().startswith("#"))
    for banned in ("role ==", 'role == "admin"', "== ADMIN"):
        assert banned not in code, "팀 공유가 역할을 직접 비교합니다: %s" % banned

    assert "status_code=404" in rt
    assert "status_code=403" not in rt, \
        "팀 공유가 403 을 냅니다 — 그 자체로 남의 승인본 존재를 알려줍니다"


def test_결재함과_팀공유가_같은_규칙을_쓴다():
    """**결재함은 화면이고 `can_see_approval` 은 권한이다.** 결재함이 좁은 것은
    「내가 낸 것이 어떻게 됐나」에 답하기 위해서지 권한이 좁아서가 아니다 —
    그 구분이 흐려지면 팀 공유가 자기만의 규칙을 새로 적게 된다."""
    src = (SRC_DIR / "routes_approvals.py").read_text(encoding="utf-8")
    assert "perm.can_see_approval(" in src, \
        "결재 API 가 팀 공유와 다른 규칙을 씁니다"


def test_결재_코멘트는_제_것만_고친다():
    """**관리자도 남의 말은 못 고친다.** 남의 말을 고칠 수 있으면
    결재 이력이 기록이 아니라 편집물이 된다."""
    src = (SRC_DIR / "routes_approvals.py").read_text(encoding="utf-8")
    assert 'c["author"] != user["id"]' in src, "코멘트 작성자 확인이 없습니다"
    for m, p, body in ALL_ROUTES:
        if p.startswith("/api/approvals/comments/"):
            assert "_own_comment_or_404(" in body, "%s %s 가 작성자를 확인하지 않습니다" % (m, p)


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


# ══════════ 권한을 숫자로 판정하지 않는다 ══════════
def _perm_sources():
    """권한 판정에 관여하는 서버 파일들."""
    names = ["permissions.py", "authdeps.py", "auth.py", "app.py",
             "routes_auth.py", "routes_projects.py", "routes_teams.py",
             "routes_folders.py", "routes_approvals.py", "admin_cli.py"]
    return [(n, (SRC_DIR / n).read_text(encoding="utf-8")) for n in names
            if (SRC_DIR / n).exists()]


def test_권한을_숫자_레벨로_비교하지_않는다():
    """`if level == 3` 류가 되살아나면 등급 체계를 바꿀 때 조용히 반대로 동작한다.

    권한은 역할명(admin/writer/viewer)으로만 판정한다.
    표시용 등급(DISPLAY_GRADE)은 화면 라벨에만 쓴다.
    """
    import re
    bad = re.compile(r'\[["\']level["\']\]\s*[=!<>]=|\blevel\s*[=!<>]=\s*[0-9]|'
                     r'\blevel\s*[<>]\s*[0-9]')
    hits = []
    for name, src in _perm_sources():
        in_doc = False
        for i, line in enumerate(src.split("\n"), 1):
            stripped = line.strip()
            # 독스트링 블록은 통째로 건너뛴다 — 설명 문장에 예시 코드가 들어 있다.
            if stripped.count('"""') == 1:
                in_doc = not in_doc
                continue
            if in_doc or stripped.startswith("#") or stripped.startswith('"""'):
                continue
            if "add_heading" in line:
                continue          # python-docx 의 제목 수준 — 권한과 무관
            if bad.search(line):
                hits.append("%s:%d  %s" % (name, i, stripped[:80]))
    assert not hits, "권한을 숫자로 판정하는 코드가 있습니다:\n" + "\n".join(hits)


def test_표시용_등급이_판정_경로에_없다():
    """DISPLAY_GRADE·grade_of 가 라우터나 판정에 쓰이면 전환의 의미가 사라진다."""
    for name, src in _perm_sources():
        if name in ("permissions.py", "routes_auth.py", "admin_cli.py"):
            continue      # 정의부와 화면 응답 조립부는 예외
        for token in ("DISPLAY_GRADE", "grade_of(", "role_of_grade("):
            assert token not in src, "%s 가 표시용 등급을 참조합니다: %s" % (name, token)


def test_프런트도_숫자_레벨을_쓰지_않는다():
    import re
    root = SRC_DIR.parent / "src" / "auth"
    if not root.exists():
        pytest.skip("src/auth 없음")
    bad = re.compile(r'\.level\b|\[["\']level["\']\]|LEVEL_LABEL|requested_level')
    hits = []
    for f in list(root.glob("*.ts")) + list(root.glob("*.tsx")):
        for i, line in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
            if bad.search(line):
                hits.append("%s:%d  %s" % (f.name, i, line.strip()[:80]))
    assert not hits, "프런트에 숫자 레벨이 남아 있습니다:\n" + "\n".join(hits)
