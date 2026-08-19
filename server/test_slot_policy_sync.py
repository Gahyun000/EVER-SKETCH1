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


def test_열_편집은_양쪽_모두_금지(ts_src):
    """가장 중요한 제약 — 한쪽에서라도 열리면 회차 취합이 깨진다."""
    for slot, policy in T.SLOT_POLICY.items():
        assert "col" not in policy.get("edit", []), "서버 %s 가 열 편집 허용" % slot
    body = ts_src.split("export const SLOT_POLICY")[1]
    assert "'col'" not in body, "프런트가 열 편집을 허용합니다"


def test_팔레트가_같다(ts_src):
    py = T.SLOT_POLICY["SLOT-A"]["cbgPalette"]
    ts_colors = re.findall(r"(?:done|plan|risk|hold):\s*'(#[0-9A-Fa-f]{6})'", ts_src)
    assert ts_colors == py, "팔레트가 다릅니다\n  서버: %s\n  프런트: %s" % (py, ts_colors)


def test_선택지가_같다(ts_src):
    for slot in ("SLOT-B", "SLOT-D"):
        py = T.SLOT_POLICY[slot]["choices"]["2"]
        block = _ts_block(ts_src, slot)
        m = re.search(r"choices:\s*\{\s*'2':\s*\[([^\]]*)\]", block)
        assert m, "%s 에 선택지가 없습니다" % slot
        ts_choices = re.findall(r"'([^']+)'", m.group(1))
        assert ts_choices == py, "%s 선택지가 다릅니다\n  서버: %s\n  프런트: %s" % (slot, py, ts_choices)


def test_프런트가_기본_거부다(ts_src):
    """모르는 슬롯을 허용하면, 슬롯을 추가하고 정책을 안 적었을 때 열려버린다."""
    fn = ts_src.split("export function slotAllows")[1].split("\n}")[0]
    assert "if (!p) return false" in fn, "slotAllows 가 모르는 슬롯을 거부하지 않습니다"


def test_자동채번_열이_잠긴다(ts_src):
    """목록 표의 0열은 자동 채번 — 사람이 고치면 번호가 어긋난다."""
    fn = ts_src.split("export function cellEditable")[1].split("\n}")[0]
    assert "c === 0" in fn and "SLOT-B" in fn, "0열 잠금이 없습니다"
