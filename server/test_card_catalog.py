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
# 뒤에 `hidden: true` 가 붙을 수 있다 — 목록에서만 감춘 카드(2026-09-17).
CARD_RE = re.compile(
    r"\{\s*key:\s*'([a-z0-9]+)',\s*group:\s*'(frame|extra|viz)',(\s*hidden:\s*true,)?")
# 필드: f('key', ...) 또는 { key: 'key', label: ... }
FIELD_RE = re.compile(r"f\('([a-zA-Z0-9]+)'|\{\s*key:\s*'([a-zA-Z0-9]+)',\s*label:")


def parse_registry(txt: str):
    heads = [(m.group(1), bool(m.group(3)), m.start()) for m in CARD_RE.finditer(txt)]
    cards = []
    for i, (key, hidden, start) in enumerate(heads):
        end = heads[i + 1][2] if i + 1 < len(heads) else len(txt)
        block = txt[start:end]
        fkeys = [(m.group(1) or m.group(2)) for m in FIELD_RE.finditer(block)]
        cards.append((key, fkeys, hidden))
    return cards


fails = []


def check(cond, label):
    print(("✓ " if cond else "✗ ") + label)
    if not cond:
        fails.append(label)


parsed = parse_registry(REG)
parsed_keys = [k for k, _, _ in parsed]
mirror_keys = cc.card_keys()

check(len(parsed) >= 12, f"registry 파싱 카드 수 = {len(parsed)} (>=12)")
check(parsed_keys == mirror_keys, f"카드키 순서 일치\n   registry: {parsed_keys}\n   mirror  : {mirror_keys}")

for key, reg_fields, _ in parsed:
    mirror_fields = cc.fields_of(key)
    check(reg_fields == mirror_fields, f"[{key}] 필드키 일치  registry={reg_fields} mirror={mirror_fields}")

# ── 감춤 표시도 어긋나면 안 된다(2026-09-17) ──────────────────────────────────
# 정본에서 감췄는데 미러가 모르면 **AI 가 목록에 없는 카드를 계속 권한다.** 반대면
# 사람은 고를 수 있는데 AI 만 모르는 카드가 된다. 둘 다 조용해서 못 찾는 종류라 여기서 잡는다.
for key, _, reg_hidden in parsed:
    mirror_hidden = cc.CARDS_BY_KEY[key].hidden
    check(reg_hidden == mirror_hidden,
          f"[{key}] 감춤 표시 일치  registry={reg_hidden} mirror={mirror_hidden}")
check(sum(1 for _, _, h in parsed if h) == 6,
      "감춘 카드는 여섯 장 — 한 줄 요약·성과KPI·로드맵·시장경쟁·프로세스·덱 섹션")

# catalog_for_prompt 구조 점검(G3 재료)
prompt = cc.catalog_for_prompt()
prompt_keys = [e["cardKey"] for e in prompt]
visible = [c.key for c in cc.CATALOG if not c.hidden]

# **여기 둘은 2026-09-17 에 다시 썼다.** 지운 게 아니라 뜻을 옮겼다.
#
# ① 원래는 "catalog_for_prompt 카드 수 == 미러" 였다. 감춘 카드를 프롬프트에서 빼기로 하면서
#    이 말이 그대로면 거짓이 된다. 재던 것은 「프롬프트가 카탈로그와 따로 놀지 않는가」이므로,
#    **보이는 카드와 하나씩 맞는지**로 바꾼다. 수만 세면 딴 카드가 들어와도 통과한다 —
#    그래서 순서까지 같은지 본다.
check(prompt_keys == visible,
      f"프롬프트 = 감추지 않은 카드 전부, 순서까지\n   prompt : {prompt_keys}\n   visible: {visible}")
check(all(e.get("cardKey") in cc.CARDS_BY_KEY for e in prompt), "모든 프롬프트 항목 cardKey 유효")
check(not any(cc.CARDS_BY_KEY[k].hidden for k in prompt_keys),
      "감춘 카드는 AI 에게 안 권한다 — 목록에 없는 것이 만들어지면 출처를 못 푼다")

# ② 원래는 프롬프트 목록에서 kpi 를 꺼내 힌트를 봤다. kpi 를 감추면서 그 줄은 StopIteration 으로
#    죽는다. 재던 것은 「지표 카드에 수치 환각 방지 문구가 붙는가」이지 「프롬프트에 kpi 가 있는가」가
#    아니었다. 그래서 **힌트를 만드는 자리(hint_of)를 직접** 재도록 옮긴다 — 감췄다가 되살려도
#    이 성질은 그대로 지켜진다.
check("수치" in (cc.hint_of(cc.CARDS_BY_KEY["kpi"]) or ""),
      "kpi 에 수치 환각 방지 힌트 존재 — 감춰도 성질은 남는다")
check(cc.CARDS_BY_KEY["kpi"].hidden and "kpi" not in prompt_keys,
      "그러면서도 지금은 감춰져 있어 프롬프트에는 안 들어간다")

# **감췄어도 「이 카드가 뭐냐」는 대답해야 한다.** editor.py 가 이미 만들어 둔 쪽을 고칠 때
# is_card/fields_of 를 쓴다 — 여기서 모른다고 하면 예전 자료를 AI 로 못 고치게 된다.
check(cc.is_card("kpi") and cc.fields_of("dsection"),
      "감춘 카드도 is_card/fields_of 는 그대로 — 이미 만든 쪽은 계속 고칠 수 있어야 한다")
check(cc.is_card("cover") and not cc.is_card("nope"), "is_card 접근자")
check(cc.fields_of("kpi") == ["title", "k1", "k2", "k3"], "fields_of(kpi) 정확")

if fails:
    print(f"\n{len(fails)} FAIL")
    sys.exit(1)
print("\nALL PASS")
