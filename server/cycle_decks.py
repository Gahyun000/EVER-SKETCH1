"""회차에 올린 실물 PPT — 슬라이드별 배부.

왜 이게 필요한가
    처음 설계는 "우리가 만든 표준 양식을 배부한다" 였다. 그런데 임원회의 자료는
    이미 존재하고, 이미 20명이 같은 틀로 쓰고 있다. 우리 양식을 강요하면
    20명이 각자 자기 자료를 우리 틀에 옮겨 적어야 한다 — 아무도 안 한다.

    그래서 방향을 뒤집었다. **실물 PPT 를 올리면 슬라이드가 그대로 뿌려진다.**
    관리자는 "3번 슬라이드는 곽두섭 상무" 처럼 슬라이드마다 담당자를 지정하고,
    각자는 자기 슬라이드만 받아 그 자리에서 고친다.

공통 슬라이드
    표지·목차처럼 모두가 봐야 하는 장은 `common` 으로 지정한다. 배부본 맨 앞에 붙는다.
    이걸 없애면 관리자가 표지를 20번 중복 지정해야 한다.

멱등성
    `distribute()` 와 같은 규칙 — **이미 배부받은 사람은 건너뛴다.**
    배부 버튼은 반드시 두 번 눌린다.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Optional

from server import cycles as cycles_store
from server import projects as projects_store
from server.cycles import CycleError

# 변환 결과(그림은 data URL 로 들어간다)를 통째로 DB 에 넣는다.
# 상한이 없으면 그림 많은 파일 하나로 DB 가 부풀어 백업·복원이 불가능해진다.
MAX_DECK_JSON_BYTES = 48 * 1024 * 1024


def _now() -> int:
    return int(time.time() * 1000)


def _conn() -> sqlite3.Connection:
    c = cycles_store._conn()
    c.execute(
        "CREATE TABLE IF NOT EXISTS CycleDecks("
        "id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, "
        "slide_count INTEGER NOT NULL, slides TEXT NOT NULL, pages TEXT NOT NULL, "
        "warnings TEXT NOT NULL, uploaded_by TEXT, uploaded_at REAL NOT NULL)"
    )
    # 변환기 판을 함께 남긴다. 이미 만들어진 DB 도 있으므로 없으면 붙인다.
    cols = {r[1] for r in c.execute("PRAGMA table_info(CycleDecks)").fetchall()}
    if "converter" not in cols:
        c.execute("ALTER TABLE CycleDecks ADD COLUMN converter TEXT DEFAULT ''")
    c.commit()
    return c


def save_deck(cid: str, filename: str, data: bytes, uploaded_by: str) -> dict:
    """PPT 를 변환해 회차에 붙인다. 한 회차에 한 벌 — 다시 올리면 갈아탄다.

    이미 배부가 끝난 회차에 새 PPT 를 얹으면, 이미 나간 배부본과 원본이 어긋난다.
    그래서 배부본이 하나라도 있으면 거부한다(먼저 회차를 새로 열게 한다).
    """
    from server import pptx_import      # 무거운 의존성 — 여기서만 부른다

    cycle = cycles_store.get_cycle(cid)
    if not cycle:
        raise CycleError("회차를 찾을 수 없습니다.")
    if cycle["status"] == "closed":
        raise CycleError("마감된 회차에는 올릴 수 없습니다.")
    if cycles_store.list_cycle_projects(cid):
        raise CycleError(
            "이미 배부한 회차입니다. 원본을 바꾸면 이미 나간 자료와 어긋납니다. "
            "새 회차를 열어 주세요.")

    result = pptx_import.pptx_to_pages(data, filename)
    pages_json = json.dumps(result["pages"], ensure_ascii=False)
    if len(pages_json.encode("utf-8")) > MAX_DECK_JSON_BYTES:
        raise CycleError(
            "그림이 많아 변환 결과가 너무 큽니다. 그림을 줄이거나 해상도를 낮춰 다시 올려 주세요.")

    c = _conn()
    try:
        c.execute("DELETE FROM CycleDecks WHERE cycle_id=?", (cid,))
        c.execute(
            "INSERT INTO CycleDecks(id,cycle_id,filename,slide_count,slides,pages,"
            "warnings,uploaded_by,uploaded_at,converter) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (("d" + uuid.uuid4().hex[:12]), cid, filename, len(result["pages"]),
             json.dumps(result["slides"], ensure_ascii=False), pages_json,
             json.dumps(result["warnings"], ensure_ascii=False), uploaded_by, _now(),
             pptx_import.CONVERTER_VERSION),
        )
        c.commit()
    finally:
        c.close()
    return get_deck(cid)          # type: ignore[return-value]


def get_deck(cid: str) -> Optional[dict]:
    """배부 화면용 요약 — **pages 는 빼고 돌려준다.**

    변환된 페이지는 수십 MB 가 될 수 있다. 목록 화면에서 그걸 매번 실어 보내면
    화면이 뜨지 않는다. 페이지가 필요한 곳은 배부 한 곳뿐이다.
    """
    c = _conn()
    try:
        r = c.execute(
            "SELECT id,cycle_id,filename,slide_count,slides,warnings,uploaded_by,"
            "uploaded_at,converter FROM CycleDecks WHERE cycle_id=?", (cid,)).fetchone()
    finally:
        c.close()
    if not r:
        return None
    from server import pptx_import      # 가벼운 상수만 쓴다(pptx 를 불러오지 않는다)

    converter = r[8] or ""
    return {"id": r[0], "cycle_id": r[1], "filename": r[2], "slide_count": r[3],
            "slides": json.loads(r[4]), "warnings": json.loads(r[5]),
            "uploaded_by": r[6], "uploaded_at": r[7],
            "converter": converter,
            # 예전 변환기로 읽은 자료다 — 그때의 버그가 그대로 남아 있다.
            # 화면이 이걸 말해 주지 않으면, 고쳐도 사용자 눈에는 똑같이 보인다.
            "stale": converter != pptx_import.CONVERTER_VERSION}


def get_deck_pages(cid: str) -> list[dict]:
    c = _conn()
    try:
        r = c.execute("SELECT pages FROM CycleDecks WHERE cycle_id=?", (cid,)).fetchone()
    finally:
        c.close()
    return json.loads(r[0]) if r else []


def delete_deck(cid: str) -> bool:
    c = _conn()
    try:
        cur = c.execute("DELETE FROM CycleDecks WHERE cycle_id=?", (cid,))
        c.commit()
        return cur.rowcount > 0
    finally:
        c.close()


def _renumber(pages: list[dict]) -> list[dict]:
    """페이지 id 를 1부터 다시 매긴다.

    원본 슬라이드 번호를 그대로 쓰면 3번 슬라이드만 받은 사람의 문서가
    '3페이지짜리인데 1·2가 없는' 상태가 된다. 편집기가 그 상태를 다루지 못한다.
    """
    out = []
    for i, p in enumerate(pages):
        q = json.loads(json.dumps(p))     # 깊은 복사 — 원본 캐시를 공유하면 한 명의 편집이 전원에게 번진다
        q["id"] = i + 1
        out.append(q)
    return out


def distribute_slides(cid: str, assignments: list[dict], people: list[dict],
                      common: Optional[list[int]] = None) -> dict:
    """슬라이드를 담당자별로 묶어 1인 1문서로 배부한다.

    `assignments`: [{"slide": 슬라이드번호(0부터), "user_id": 사용자id}, ...]
    `people`:      [{"id","name","dept"}, ...]  — 활성 계정만 넘어와야 한다
    `common`:      모두에게 앞에 붙일 슬라이드 번호 목록
    """
    cycle = cycles_store.get_cycle(cid)
    if not cycle:
        raise CycleError("회차를 찾을 수 없습니다.")
    if cycle["status"] == "closed":
        raise CycleError("마감된 회차에는 배부할 수 없습니다.")

    pages = get_deck_pages(cid)
    if not pages:
        raise CycleError("이 회차에 올린 PPT 가 없습니다. 먼저 파일을 올려 주세요.")
    n = len(pages)

    by_id = {p["id"]: p for p in people}
    common = sorted(set(common or []))
    for i in common:
        if not (0 <= i < n):
            raise CycleError("공통 슬라이드 번호가 범위를 벗어났습니다: %d" % (i + 1))

    # 담당자별 슬라이드 묶기 — 슬라이드 순서를 유지한다(원본 흐름이 곧 보고 순서다).
    grouped: dict[str, list[int]] = {}
    for a in assignments:
        idx, uid = a.get("slide"), a.get("user_id")
        if not isinstance(idx, int) or not (0 <= idx < n):
            raise CycleError("슬라이드 번호가 범위를 벗어났습니다: %s" % (idx,))
        if uid not in by_id:
            raise CycleError("승인되지 않았거나 없는 계정이 지정됐습니다.")
        grouped.setdefault(uid, [])
        if idx not in grouped[uid]:
            grouped[uid].append(idx)
    if not grouped:
        raise CycleError("담당자를 지정한 슬라이드가 없습니다.")
    for uid in grouped:
        grouped[uid].sort()

    existing = {p["owner_id"] for p in cycles_store.list_cycle_projects(cid)}
    created, skipped = [], []
    for uid, idxs in grouped.items():
        if uid in existing:
            skipped.append(uid)
            continue
        person = by_id[uid]
        picked = [pages[i] for i in common] + [pages[i] for i in idxs if i not in common]
        mine = _renumber(picked)
        title = "%s — %s" % (cycle["title"], person.get("name") or "")
        state = {
            "title": title.strip(" —"),
            "orientation": "landscape",
            "theme": "light",
            "font": "auto",
            "size": "m",
            "pages": mine,
            "selectedPageId": mine[0]["id"],
        }
        proj = projects_store.create_project(
            name=state["title"], state=state, owner_id=uid, cycle_id=cid)
        created.append({"project_id": proj["id"], "owner_id": uid,
                        "name": person.get("name") or "", "slides": idxs,
                        "page_count": len(mine)})
        existing.add(uid)

    if created and cycle["status"] == "draft":
        cycles_store.set_cycle_status(cid, "writing")

    return {"cycle_id": cid, "created": created, "skipped": skipped,
            "created_count": len(created), "skipped_count": len(skipped)}
