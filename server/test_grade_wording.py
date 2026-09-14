"""등급 숫자와 역할 이름이 **짝이 맞는지** 지킨다.

**왜 생겼나.** 2026-09-14, 5장짜리 사상 슬라이드를 쓰려고 사실을 확인하다가
`app.py` 에서 「발행은 L3만. … L1 열람자 전원에게 공개되고」를 봤다. 판정은
`perm.PUBLISH` = 관리자 전용이라 **동작은 맞았고 글만 반대**였다 — 등급 숫자를
「1등급이 최고」로 뒤집기 전(L1=열람 … L3=관리)의 옛 표기가 남아 있었던 것이다.

사람은 주석을 읽고 코드를 고친다. 반대로 적힌 주석은 **틀린 코드보다 오래 산다** —
테스트가 안 잡기 때문이다. 훑어보니 5개 파일 12곳이었고, 그중 둘은 **테스트 이름**
(`test_발행은_L3만_판정`)이었다. 테스트 이름이 반대면 읽는 사람이 제일 먼저 속는다.

**무엇을 지키나.** 「숫자 + 역할 이름」이 붙어 나오면 `DISPLAY_GRADE` 와 맞아야 한다.
숫자만 적고 역할을 안 밝히는 말(「L3만」)은 **그 자체가 애매해서** 금지한다 —
이번 실수가 정확히 그 형태였다. 그리고 `_L1/_L2/_L3` 같은 이름도 쓰지 않는다.
숫자를 다시 매기는 것은 답이 아니다. 뒤집히면 또 반대가 된다.
"""
import pathlib
import re

from server.permissions import DISPLAY_GRADE, ROLE_NAMES

_HERE = pathlib.Path(__file__).resolve().parent
_ROOT = _HERE.parent

# 등급 → 한글 역할 이름 (판정이 아니라 **표시** 규칙이다. permissions.DISPLAY_GRADE 가 원본)
GRADE_NAME = {g: ROLE_NAMES[r] for r, g in DISPLAY_GRADE.items()}   # {1:'관리자', 2:'작성자', 3:'열람자'}

# 「L2 작성자」 · 「Lv1 관리자」 · 「L3 은 순수 열람자였다」 를 모두 잡는다.
RE_PAIR = re.compile(r"L[v]?([123])\s*(?:등급)?\s*(?:은|는|이|가|도|만|의)?\s*(관리자|작성자|열람자)")
# 숫자만으로 권한을 말하는 꼴 — 「L3만」 「L1 만」. 역할을 밝히면 위 규칙이 검사한다.
RE_BARE = re.compile(r"L[v]?[123]\s*만")
RE_IDENT = re.compile(r"\b_L[123]\b")


def _files():
    for pat in ("server/*.py", "src/**/*.ts", "src/**/*.tsx", "*.mjs"):
        for f in _ROOT.glob(pat):
            if "node_modules" in f.parts or "_backup" in f.parts:
                continue
            yield f


def test_등급_숫자와_역할_이름이_짝이_맞는다():
    bad = []
    for f in _files():
        if f.name == pathlib.Path(__file__).name:
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            for g, name in RE_PAIR.findall(line):
                if GRADE_NAME[int(g)] != name:
                    bad.append("%s:%d  L%s 인데 「%s」 라고 적혀 있다 (L%s = %s)"
                               % (f.relative_to(_ROOT), i, g, name, g, GRADE_NAME[int(g)]))
    assert not bad, "등급 숫자와 역할 이름이 어긋납니다:\n  " + "\n  ".join(bad)


def test_숫자만으로_권한을_말하지_않는다():
    """「L3만」은 읽는 사람이 어느 쪽인지 알 수 없다 — 역할 이름을 쓴다."""
    bad = []
    for f in _files():
        if f.name == pathlib.Path(__file__).name:
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if RE_BARE.search(line):
                bad.append("%s:%d  %s" % (f.relative_to(_ROOT), i, line.strip()[:90]))
    assert not bad, "숫자만으로 권한을 말한 곳이 있습니다(「관리자만」처럼 역할로 쓰세요):\n  " + "\n  ".join(bad)


def test_숫자로_변수_이름을_짓지_않는다():
    bad = []
    for f in _files():
        if f.name == pathlib.Path(__file__).name:
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if RE_IDENT.search(line):
                bad.append("%s:%d  %s" % (f.relative_to(_ROOT), i, line.strip()[:90]))
    assert not bad, "_L1/_L2/_L3 대신 역할 이름을 쓰세요:\n  " + "\n  ".join(bad)


def test_이_검사가_살아_있다():
    """규칙을 뒤집은 문장을 넣어 보고 실제로 걸리는지 확인한다."""
    assert RE_PAIR.findall("발행은 L1 열람자 전원에게") == [("1", "열람자")]
    assert GRADE_NAME[1] == "관리자" and GRADE_NAME[3] == "열람자"
    assert RE_BARE.search("발행은 L3만.")
    assert RE_IDENT.search("_L3 = Actor(")
    # 맞게 쓴 문장은 안 걸린다.
    assert GRADE_NAME[int(RE_PAIR.findall("Lv2 작성자")[0][0])] == RE_PAIR.findall("Lv2 작성자")[0][1]
    assert not RE_BARE.search("관리자만 본다")
