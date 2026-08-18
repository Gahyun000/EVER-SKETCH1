"""G2 드리프트 가드 — 서버 카드 카탈로그 미러(card_catalog.py)가 정본 registry.ts 와 일치하는가.

registry.ts 를 파싱해 (카드키 순서 · 카드별 필드키)를 뽑아 미러와 정확히 비교한다.
registry.ts 를 바꾸고 미러를 안 고치면 이 테스트가 실패한다(드리프트 차단).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent  # repo root (server/ 의 부모)
sys.path.insert(0, str(ROOT))
from server.intent import card_catalog as cc  # noqa: E402

REG = (ROOT / "src" / "cards" / "registry.ts").read_text(encoding="utf-8")

# 카드 헤더: `{ key: 'X', group: 'frame|extra|viz'` (필드 오브젝트와 구분되는 시그니처)
CARD_RE = re.compile(r"\{\s*key:\s*'([a-z0-9]+)',\s*group:\s*'(frame|extra|viz)'")
# 필드: f('key', ...) 또는 { key: 'key', label: ... }
FIELD_RE = re.compile(r"f\('([a-zA-Z0-9]+)'|\{\s*key:\s*'([a-zA-Z0-9]+)',\s*label:")


def parse_registry(txt: str):
    heads = [(m.group(1), m.start()) for m in CARD_RE.finditer(txt)]
    cards = []
    for i, (key, start) in enumerate(heads):
        end = heads[i + 1][1] if i + 1 < len(heads) else len(txt)
        block = txt[start:end]
        fkeys = [(m.group(1) or m.group(2)) for m in FIELD_RE.finditer(block)]
        cards.append((key, fkeys))
    return cards


fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


parsed = parse_registry(REG)
parsed_keys = [k for k, _ in parsed]
mirror_keys = cc.card_keys()

check(len(parsed) >= 12, f"registry 파싱 카드 수 = {len(parsed)} (>=12)")
check(parsed_keys == mirror_keys, f"카드키 순서 일치\n   registry: {parsed_keys}\n   mirror  : {mirror_keys}")

for key, reg_fields in parsed:
    mirror_fields = cc.fields_of(key)
    check(reg_fields == mirror_fields, f"[{key}] 필드키 일치  registry={reg_fields} mirror={mirror_fields}")

# catalog_for_prompt 구조 점검(G3 재료)
prompt = cc.catalog_for_prompt()
check(len(prompt) == len(mirror_keys), "catalog_for_prompt 카드 수 == 미러")
check(all(e.get("cardKey") in cc.CARDS_BY_KEY for e in prompt), "모든 프롬프트 항목 cardKey 유효")
kpi = next(e for e in prompt if e["cardKey"] == "kpi")
check("수치" in (kpi.get("note") or ""), "kpi 항목에 수치 환각 방지 힌트 존재")
check(cc.is_card("cover") and not cc.is_card("nope"), "is_card 접근자")
check(cc.fields_of("kpi") == ["title", "k1", "k2", "k3"], "fields_of(kpi) 정확")

if fails:
    print(f"\n{len(fails)} FAIL")
    sys.exit(1)
print("\nALL PASS")
