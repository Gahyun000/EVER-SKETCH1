"""자기검증 패스 (G6).

생성(BookPlan)·편집(edits/adds) 결과를 사람이 승인하기 전에 훑어 흔한 결함을 경고로 올린다.
- 빈 핵심 필드: 표지 제목·요약 본문·KPI/로드맵/시장/플로우/마인드맵의 내용이 통째로 비었는지.
- 과장 문구: '업계 최고/100% 보장/무조건' 류 근거 없는 과장(제조 임원 보고 톤에 부적합).
- 중복: 표지·목차 중복, 같은 제목 페이지 중복.

여기서는 **탐지만** 한다(자동 삭제·수정 안 함). 무엇을 고칠지는 사용자·대화가 결정한다(karpathy: 과잉구현 금지).
정본 카드 스펙은 card_catalog(G2). 반환 findings 는 {code, level, where, msg} 리스트.
"""
from __future__ import annotations

import re
from typing import Optional

from server.intent import card_catalog as cc

# 근거 없는 과장·절대화 표현(부분일치, 대소문자 무시). 제조 임원 보고 톤에서 지양.
EXAGGERATION = [
    "업계 최고", "세계 최초", "세계 최고", "국내 최초", "국내 유일", "국내 최고", "세계 유일",
    "최고의", "최상의", "압도적", "독보적", "유일무이", "전무후무", "초격차",
    "무조건", "100% 보장", "100%보장", "절대 실패 없", "절대적", "완벽한", "완벽하게",
    "혁신적", "게임체인저", "게임 체인저", "최첨단", "그 누구도", "단연코",
]

# 카드별 '적어도 하나는 채워야 하는' 내용 필드 그룹(비면 빈 페이지 경고).
_CONTENT_FIELDS: dict[str, list[str]] = {
    "cover": ["title"],
    "summary": ["body"],
    "kpi": ["k1", "k2", "k3"],
    "roadmap": ["p1", "p2"],
    "market": ["p1", "p2"],
    "flow": ["s1", "s2", "s3", "s4"],
    "mindmap": ["center", "b1", "b2", "b3", "b4", "b5"],
    "sticky": ["n1", "n2", "n3", "n4"],
    "board": ["n1", "n2", "n3", "n4", "n5", "n6"],
}


def _finding(code: str, level: str, where: str, msg: str) -> dict:
    return {"code": code, "level": level, "where": where, "msg": msg}


def scan_fields(cardkey: str, fields: Optional[dict], where: str = "", empty_check: bool = True) -> list[dict]:
    """한 페이지(또는 편집 결과)의 필드 값을 훑어 과장·빈내용 경고를 만든다.
    empty_check=False 면 과장만 본다(부분 편집처럼 일부 키만 온 경우 빈내용 오탐 방지)."""
    out: list[dict] = []
    fields = fields or {}
    label = where or (cc.CARDS_BY_KEY[cardkey].label if cc.is_card(cardkey) else cardkey)

    # 과장 문구
    for k, v in fields.items():
        s = str(v)
        low = s.lower()
        for bad in EXAGGERATION:
            if bad.lower() in low:
                out.append(_finding("exaggeration", "warn", label,
                                    f"[{label}] 과장 표현 ‘{bad}’ — 근거 있는 표현으로 다듬는 게 좋아요"))
                break  # 페이지·필드당 한 번만

    # 빈 핵심 필드(내용 통째로 빔)
    group = _CONTENT_FIELDS.get(cardkey) if empty_check else None
    if group:
        if not any(str(fields.get(g, "")).strip() for g in group):
            if cardkey == "cover":
                out.append(_finding("empty", "warn", label, "표지 제목이 비어 있어요"))
            else:
                out.append(_finding("empty", "info", label, f"[{label}] 내용이 비어 있어요 — 채워 주세요"))
    return out


def check_plan(plan: Optional[dict]) -> list[dict]:
    """BookPlan(생성 결과) 자기검증: 중복(표지·목차·제목) + 페이지별 과장·빈내용."""
    out: list[dict] = []
    pages = list((plan or {}).get("pages") or [])

    # 중복 표지/목차(kind 기준)
    covers = sum(1 for p in pages if cc.CARDS_BY_KEY.get(p.get("cardKey", ""), None) and cc.CARDS_BY_KEY[p["cardKey"]].kind == "cover")
    tocs = sum(1 for p in pages if p.get("cardKey") == "toc")
    if covers > 1:
        out.append(_finding("dup_cover", "warn", "표지", f"표지가 {covers}개 — 보통 1개면 충분해요"))
    if tocs > 1:
        out.append(_finding("dup_toc", "warn", "목차", f"목차가 {tocs}개 — 중복일 수 있어요"))

    # 같은 제목 중복
    titles: dict[str, int] = {}
    for p in pages:
        t = str((p.get("fields") or {}).get("title") or "").strip()
        if t:
            titles[t] = titles.get(t, 0) + 1
    for t, n in titles.items():
        if n > 1:
            out.append(_finding("dup_title", "info", t, f"제목 ‘{t}’ 페이지가 {n}개 — 중복 확인"))

    # 페이지별 과장·빈내용
    for i, p in enumerate(pages):
        ck = p.get("cardKey", "")
        where = str((p.get("fields") or {}).get("title") or "").strip() or f"{i + 1}번째({ck})"
        out.extend(scan_fields(ck, p.get("fields"), where))
    return out


def messages(findings: list[dict], limit: int = 4) -> list[str]:
    """findings → 사용자 노출용 짧은 메시지(중복 제거, 상한)."""
    seen: set[str] = set()
    msgs: list[str] = []
    for f in findings:
        m = f["msg"]
        if m in seen:
            continue
        seen.add(m)
        msgs.append(m)
        if len(msgs) >= limit:
            break
    return msgs
