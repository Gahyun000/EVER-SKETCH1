"""슬롯 정책이 서버와 프런트에서 어긋나지 않는지 검사.

프런트(`src/template/slots.ts`)는 버튼을 숨기기 위한 **사본**이다.
사본이 원본보다 느슨해지면 화면에서는 되는데 서버가 거부하는 상태가 되고,
반대로 빡빡해지면 되는 기능이 화면에서 사라진다. 둘 다 조용히 일어난다.

TypeScript 를 실행하지 않고 소스를 파싱해 비교한다 —
파이썬 테스트 스위트 안에서 돌아야 CI 한 번으로 잡히기 때문이다.
"""
import pathlib
import re

import pytest

from server import template_seed as T

TS = pathlib.Path(__file__).resolve().parent.parent / "src" / "template" / "slots.ts"


@pytest.fixture(scope="module")
def ts_src() -> str:
    if not TS.exists():
        pytest.skip("src/template/slots.ts 없음")
    return TS.read_text(encoding="utf-8")


def _ts_block(src: str, slot: str) -> str:
    """slots.ts 의 SLOT_POLICY 에서 한 슬롯 항목만 떼어낸다."""
    body = src.split("export const SLOT_POLICY")[1]
    key = "'%s':" % slot if ("'%s':" % slot) in body else "%s:" % slot
    seg = body.split(key, 1)[1]
    # 중괄호 균형으로 항목 끝을 찾는다.
    depth, out = 0, []
    for ch in seg:
        out.append(ch)
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                break
    return "".join(out)


@pytest.mark.parametrize("slot", sorted(T.SLOT_POLICY.keys()))
def test_슬롯_목록이_같다(ts_src, slot):
    body = ts_src.split("export const SLOT_POLICY")[1]
    assert ("'%s':" % slot) in body or ("  %s:" % slot) in body, \
        "프런트에 %s 슬롯이 없습니다" % slot


@pytest.mark.parametrize("slot", sorted(T.SLOT_POLICY.keys()))
def test_허용_편집_목록이_같다(ts_src, slot):
    py_ops = set(T.SLOT_POLICY[slot].get("edit", []))
    block = _ts_block(ts_src, slot)
    edit_part = re.search(r"edit:\s*\[([^\]]*)\]", block)
    ts_ops = set(re.findall(r"'([a-z]+)'", edit_part.group(1))) if edit_part else set()
    # 프런트에만 있는 'format'(글자 서식)은 서버 판정 대상이 아니다 — 제외하고 비교.
    assert (py_ops - {"format"}) == (ts_ops - {"format"}), \
        "%s 편집 허용이 다릅니다\n  서버: %s\n  프런트: %s" % (slot, sorted(py_ops), sorted(ts_ops))


@pytest.mark.parametrize("slot", sorted(T.SLOT_POLICY.keys()))
def test_잠금_행_수가_같다(ts_src, slot):
    py_locked = T.SLOT_POLICY[slot].get("lockedRows", 0)
    block = _ts_block(ts_src, slot)
    m = re.search(r"lockedRows:\s*(\d+)", block)
    ts_locked = int(m.group(1)) if m else 0
    assert py_locked == ts_locked, \
        "%s 잠금 행 수가 다릅니다 (서버 %d / 프런트 %d)" % (slot, py_locked, ts_locked)


@pytest.mark.parametrize("slot", sorted(T.SLOT_POLICY.keys()))
def test_문구_열림이_같다(ts_src, slot):
    """`edit` 는 표 동작만 다룬다. 글상자 문구는 `text` 가 정한다 —
    한쪽만 고치면 「화면에서는 고쳐지는데 정책에는 잠겼다고 적힌」 상태가 되고,
    그건 예전에 head 슬롯에서 실제로 오래 있었던 일이다."""
    py_text = T.SLOT_POLICY[slot].get("text", "open")
    block = _ts_block(ts_src, slot)
    m = re.search(r"text:\s*'(open|locked)'", block)
    ts_text = m.group(1) if m else "open"
    assert py_text == ts_text, \
        "%s 문구 열림이 다릅니다 (서버 %s / 프런트 %s)" % (slot, py_text, ts_text)


@pytest.mark.parametrize("slot", sorted(T.SLOT_POLICY.keys()))
def test_머리글_편집_허용이_같다(ts_src, slot):
    """`lockedRows` 는 「머리글이 몇 행인가」, `headerEdit` 은 「그 글자를 고칠 수 있는가」.
    한쪽 사본만 열면 화면에서는 써지는데 정책에는 잠겼다고 적힌 상태가 된다."""
    py = bool(T.SLOT_POLICY[slot].get("headerEdit", False))
    block = _ts_block(ts_src, slot)
    ts_val = bool(re.search(r"headerEdit:\s*true", block))
    assert py == ts_val, \
        "%s 머리글 편집 허용이 다릅니다 (서버 %s / 프런트 %s)" % (slot, py, ts_val)


def test_열_편집은_양쪽_모두_금지(ts_src):
    """가장 중요한 제약 — 한쪽에서라도 열리면 회차 취합이 깨진다.

    **범위를 좁혀 다시 썼다**(2026-09-16). 예전에는 `SLOT_POLICY` 뒤의 **파일 끝까지**
    훑으며 `'col'` 이라는 글자를 찾았다. 그런데 그 뒤에 TODAY 마커 코드가 들어오면서
    `{ kind: 'col'; col: number }` 라는 **타입 이름**이 걸려 거짓으로 실패했다.

    글자를 못 찾게 코드를 비틀거나 검사를 지우는 것은 답이 아니다. 지켜야 할 것은
    「**정책 표에** 'col' 이 없다」이지 「파일 어디에도 col 이라는 글자가 없다」가 아니다.
    그래서 각 슬롯 항목만 떼어(`_ts_block`) 그 안을 본다 — 다른 검사들이 이미 쓰는 길이다.
    """
    for slot, policy in T.SLOT_POLICY.items():
        assert "col" not in policy.get("edit", []), "서버 %s 가 열 편집 허용" % slot
        block = _ts_block(ts_src, slot)
        assert "'col'" not in block, "프런트 %s 가 열 편집을 허용합니다" % slot


def test_팔레트가_같다(ts_src):
    py = T.SLOT_POLICY["SLOT-A"]["cbgPalette"]
    m = re.search(r"STAGE_COLORS\s*=\s*\[([^\]]*)\]", ts_src)
    assert m, "프런트에 STAGE_COLORS 가 없습니다"
    ts_colors = re.findall(r"'(#[0-9A-Fa-f]{6})'", m.group(1))
    assert ts_colors == py, "팔레트가 다릅니다\n  서버: %s\n  프런트: %s" % (py, ts_colors)


def test_머리글_색이_같다(ts_src):
    m = re.search(r"HEADER_BG\s*=\s*'(#[0-9A-Fa-f]{6})'", ts_src)
    assert m, "프런트에 HEADER_BG 가 없습니다"
    assert m.group(1) == T.HEADER_BG


@pytest.mark.parametrize("slot", sorted(T.SLOT_POLICY.keys()))
def test_선택지가_같다(ts_src, slot):
    """v2.0 정본에는 드롭다운 열이 없다 — 한쪽에만 생기면 잡아낸다."""
    py = T.SLOT_POLICY[slot].get("choices") or {}
    block = _ts_block(ts_src, slot)
    ts_has = "choices:" in block
    assert bool(py) == ts_has, \
        "%s 선택지 유무가 다릅니다 (서버 %s / 프런트 %s)" % (slot, bool(py), ts_has)
    for col, values in py.items():
        m = re.search(r"choices:\s*\{\s*'%s':\s*\[([^\]]*)\]" % col, block)
        assert m, "%s 의 %s열 선택지가 프런트에 없습니다" % (slot, col)
        assert re.findall(r"'([^']+)'", m.group(1)) == list(values)


def test_프런트가_기본_거부다(ts_src):
    """모르는 슬롯을 허용하면, 슬롯을 추가하고 정책을 안 적었을 때 열려버린다."""
    fn = ts_src.split("export function slotAllows")[1].split("\n}")[0]
    assert "if (!p) return false" in fn, "slotAllows 가 모르는 슬롯을 거부하지 않습니다"


def test_머리글_행이_잠긴다(ts_src):
    """머리글은 연도·월처럼 회차에서 계산된 값이다. 사람이 고치면 정본이 갈라진다.

    (v1.0 의 '자동 채번 0열' 잠금은 없앴다 — 실물 양식에 번호 열이 없다.
     대신 그 규칙이 되살아나지 않는지도 함께 본다.)
    """
    fn = ts_src.split("export function cellEditable")[1].split("\n}")[0]
    assert "r < lockedRowCount(slot)" in fn, "머리글 행 잠금이 없습니다"
    assert "c === 0" not in fn, "없앤 자동 채번 잠금이 되살아났습니다"


def test_슬롯_수가_같다(ts_src):
    """프런트에만 남은 유령 슬롯(SLOT-D 등)이 있으면 화면에서 되는데 서버가 거부한다."""
    body = ts_src.split("export const SLOT_POLICY")[1].split("\n}")[0]
    ts_slots = set(re.findall(r"'(SLOT-[A-Z])':", body)) | set(re.findall(r"^\s+(head|foot):", body, re.M))
    assert ts_slots == set(T.SLOT_POLICY.keys()), \
        "슬롯 목록이 다릅니다\n  서버: %s\n  프런트: %s" % (sorted(T.SLOT_POLICY), sorted(ts_slots))


def test_로드맵_1월_열_index가_같다(ts_src):
    """TODAY 마커의 자동 계산이 이 값 위에 서 있다.

    프런트가 `ROADMAP_MONTH_COL0 + (이번달 - 1)` 로 열을 구하는데, 이 값이
    서버 표 구조와 어긋나면 마커가 엉뚱한 달 위에 선다 — 화면에는 멀쩡히
    'TODAY' 라고 적혀 있어서 틀린 줄 모른다.
    """
    m = re.search(r"ROADMAP_MONTH_COL0\s*=\s*(\d+)", ts_src)
    assert m, "프런트에 ROADMAP_MONTH_COL0 이 없습니다"
    assert int(m.group(1)) == T.COL_MONTH_FIRST, \
        "1월 열 index 가 다릅니다 — 서버 %d / 프런트 %s" % (T.COL_MONTH_FIRST, m.group(1))
