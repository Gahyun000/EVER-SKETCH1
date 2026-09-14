"""서버측 카드 카탈로그 미러 (G2).

정본(single source of truth)은 프론트 `src/cards/registry.ts` 이다. 이 파일은 그 미러이며,
플래너(G3)가 "쓸 수 있는 카드와 각 필드"를 프롬프트로 주입받는 재료로 쓴다.

드리프트 방지: `server/test_card_catalog.py` 가 registry.ts 를 파싱해 (카드키 순서·카드별 필드키)가
이 미러와 정확히 일치하는지 검증한다. registry.ts 를 바꾸면 이 미러도 함께 고쳐야 테스트가 통과한다.

LLM 프롬프트 배선은 여기서 하지 않는다(G3). 여기는 데이터 + 접근자까지만.
"""
from __future__ import annotations

from dataclasses import dataclass, field as dfield
from typing import Optional


@dataclass(frozen=True)
class CatField:
    key: str
    label: str
    example: str = ""


@dataclass(frozen=True)
class CatCard:
    key: str
    label: str                    # 좌측 팔레트 라벨
    title: str                    # 카드 기본 제목
    group: str                    # frame | extra | viz
    fields: tuple[CatField, ...] = ()
    kind: Optional[str] = None    # cover | back | toc
    viz: Optional[str] = None     # flow | mindmap | sticky | board | note
    kpi: bool = False


def _f(key: str, label: str, example: str = "") -> CatField:
    return CatField(key, label, example)


# ── registry.ts CARD_REGISTRY 미러 (순서·필드키 동일) ──────────────────────────
CATALOG: tuple[CatCard, ...] = (
    CatCard("cover", "표지", "유니에버 AX 사업모델", "frame", kind="cover",
            fields=(_f("title", "제목", "유니에버 AX 사업모델"), _f("sub", "부제", "2026 경영보고"))),
    CatCard("toc", "목차(자동)", "목차", "frame", kind="toc", fields=()),
    CatCard("note", "빈 페이지(블록·토글)", "새 페이지", "frame", viz="note", fields=()),
    CatCard("closing", "마무리", "함께 시작합시다", "frame", kind="back",
            fields=(_f("title", "한 줄 메시지", "지금이 가장 잘 시작할 수 있는 때입니다"), _f("sub", "연락/링크(선택)"))),
    CatCard("summary", "한 줄 요약", "핵심 요약", "extra",
            fields=(_f("title", "제목", "핵심 요약"), _f("body", "한 문장", "현장 데이터로 품질을 바꾸는 AX 사업"))),
    CatCard("kpi", "성과·KPI", "기대 성과", "extra", kpi=True,
            fields=(_f("title", "제목", "기대 성과"), _f("k1", "지표 1 (이름:값)", "불량률:-30%"),
                    _f("k2", "지표 2", "검사시간:-40%"), _f("k3", "지표 3", "ROI:14개월"))),
    CatCard("roadmap", "로드맵", "로드맵", "extra",
            fields=(_f("title", "제목", "로드맵"), _f("p1", "단계 (이름:시기)", "PoC : 1분기"),
                    _f("p2", "단계", "확산 : 3분기"))),
    CatCard("market", "시장·경쟁", "시장과 경쟁", "extra",
            fields=(_f("title", "제목", "시장과 경쟁"), _f("p1", "시장 한 줄", "국내 품질SW 3천억"),
                    _f("p2", "우위", "현장 특화 데이터"))),
    CatCard("flow", "프로세스(플로우)", "도입 프로세스", "viz", viz="flow",
            fields=(_f("title", "제목", "도입 프로세스"), _f("s1", "단계 1", "데이터 연결"),
                    _f("s2", "단계 2", "AI 학습"), _f("s3", "단계 3", "현장 적용"),
                    _f("s4", "단계 4 (선택)", "성과 검증"))),
    # 트리는 **카드가 아니라 펼침**이다(store.addCard 가 가로채서 요소로 편다).
    # 그래도 registry.ts 목록에는 있으므로 **여기 순서에도 같이 있어야 한다** —
    # 2026-09-14 트리를 넣고 pytest 를 안 돌려서 이 줄이 빠진 채 나흘 갔다.
    # `fields` 는 비어 있다: 내용은 머메이드 원문에서 온다.
    CatCard("tree", "트리 · 머메이드", "흐름도", "viz", viz="flow", fields=()),
    CatCard("mindmap", "마인드맵", "AX 추진 영역", "viz", viz="mindmap",
            fields=(_f("title", "제목", "AX 추진 영역"), _f("center", "중심 주제", "유니에버 AX"),
                    _f("b1", "가지 1", "품질"), _f("b2", "가지 2", "생산"), _f("b3", "가지 3", "물류"),
                    _f("b4", "가지 4 (선택)", "경영정보"), _f("b5", "가지 5 (선택)"),
                    # 2026-09-14: 가지 수를 넣을 때 고를 수 있게 되면서 여덟까지 늘었다.
                    # **registry.ts 와 칸 이름·순서가 같아야 한다** — test_card_catalog.py 가 대조한다.
                    _f("b6", "가지 6 (선택)"), _f("b7", "가지 7 (선택)"),
                    _f("b8", "가지 8 (선택)"))),
    CatCard("sticky", "스티키 메모", "아이디어 메모", "viz", viz="sticky",
            fields=(_f("title", "제목", "아이디어 메모"), _f("n1", "메모 1", "현장 니즈 인터뷰"),
                    _f("n2", "메모 2", "PoC 대상 라인"), _f("n3", "메모 3", "ROI 계산"),
                    _f("n4", "메모 4 (선택)"))),
    CatCard("board", "자유 메모 보드", "자유 보드", "viz", viz="board",
            fields=(_f("title", "제목", "자유 보드"), _f("n1", "메모 1", "핵심 가설"),
                    _f("n2", "메모 2", "리스크"), _f("n3", "메모 3", "다음 액션"),
                    _f("n4", "메모 4", "질문"), _f("n5", "메모 5 (선택)"), _f("n6", "메모 6 (선택)"))),
    # 덱-섹션(P1) — deck_builder 섹션 슬라이드처럼 렌더되는 편집형 카드. c1~c6 = "제목|설명".
    CatCard("dsection", "덱 섹션", "섹션", "extra",
            fields=(_f("markN", "번호", "01"), _f("title", "제목", "제조 현장의 활용 분야"),
                    _f("sub", "부제", "현장 데이터를 하나의 흐름으로 모읍니다."), _f("cols", "열 수 (2/3)", "3"),
                    _f("c1", "카드 1 (제목|설명)", "품질|찾고·보고·판정합니다"),
                    _f("c2", "카드 2 (제목|설명)", "지식|흩어진 문서를 답으로"),
                    _f("c3", "카드 3 (제목|설명)", "설비|예측하고 지시서까지"),
                    _f("c4", "카드 4 (제목|설명)", "경영|숫자를 판단 가능한 요약으로"),
                    _f("c5", "카드 5 (선택)", ""), _f("c6", "카드 6 (선택)", ""))),
)

CARDS_BY_KEY: dict[str, CatCard] = {c.key: c for c in CATALOG}


# ── 접근자 ─────────────────────────────────────────────────────────────────
def is_card(key: str) -> bool:
    return key in CARDS_BY_KEY


def card_keys() -> list[str]:
    return [c.key for c in CATALOG]


def fields_of(key: str) -> list[str]:
    c = CARDS_BY_KEY.get(key)
    return [f.key for f in c.fields] if c else []


def catalog_for_prompt() -> list[dict]:
    """플래너 LLM 프롬프트에 넣을 압축 카탈로그(설명·필드·예시). G3에서 소비."""
    out: list[dict] = []
    for c in CATALOG:
        hint = None
        if c.viz == "note":
            hint = "자유 텍스트 블록 페이지(필드 없음). 제목/문단은 본문 블록으로 채움"
        elif c.kind == "toc":
            hint = "목차는 자동 생성(필드 없음)"
        elif c.kpi:
            hint = "지표는 '이름:값' 형식(예 불량률:-30%). 근거 없는 수치는 만들지 말 것"
        elif c.key == "dsection":
            hint = "덱 섹션 — 제목/부제 + 카드 c1~c6(각 '제목|설명'). 가져온 문서 섹션 편집용"
        elif c.viz:
            hint = f"다이어그램({c.viz}) — 각 항목은 짧은 명사구"
        entry = {
            "cardKey": c.key,
            "설명": c.label,
            "fields": [{"key": f.key, "label": f.label, "example": f.example} for f in c.fields],
        }
        if hint:
            entry["note"] = hint
        out.append(entry)
    return out


if __name__ == "__main__":  # 간단 점검용
    import json
    print(json.dumps(catalog_for_prompt(), ensure_ascii=False, indent=2))
