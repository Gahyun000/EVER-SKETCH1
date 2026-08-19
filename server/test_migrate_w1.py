"""이관 스크립트 테스트 — 멱등성과 백업이 핵심."""
import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["EVER_SKETCH_DB"] = str(pathlib.Path(_tmp) / "mig.db")

import pytest  # noqa: E402

from server import auth as auth_store  # noqa: E402
from server import migrate_w1  # noqa: E402
from server import projects as projects_store  # noqa: E402


_DB = str(pathlib.Path(_tmp) / "mig.db")


@pytest.fixture(autouse=True)
def clean():
    os.environ["EVER_SKETCH_DB"] = _DB      # 모듈 간 DB 공유 방지(위 test_auth 주석 참고)
    d = pathlib.Path(_tmp)
    for f in d.iterdir():
        if f.is_file():
            f.unlink()
    yield


def test_소유자_없는_프로젝트를_관리자에게_붙인다():
    a = projects_store.create_project("레거시 A", {"pages": []}, owner_id=None)
    b = projects_store.create_project("레거시 B", {"pages": []}, owner_id=None)
    rep = migrate_w1.run()
    assert rep["orphan_count"] == 2
    admin_id = rep["admin_id"]
    assert projects_store.get_project_meta(a["id"])["owner_id"] == admin_id
    assert projects_store.get_project_meta(b["id"])["owner_id"] == admin_id


def test_이미_소유자가_있으면_건드리지_않는다():
    keep = projects_store.create_project("내 것", {"pages": []}, owner_id="u_someone")
    migrate_w1.run()
    assert projects_store.get_project_meta(keep["id"])["owner_id"] == "u_someone"


def test_두_번_돌려도_결과가_같다():
    """멱등 — 재실행이 안전해야 운영 중에도 마음 놓고 돌린다."""
    p = projects_store.create_project("레거시", {"pages": []}, owner_id=None)
    r1 = migrate_w1.run()
    r2 = migrate_w1.run()
    assert r1["orphan_count"] == 1
    assert r2["orphan_count"] == 0                     # 두 번째는 대상이 없다
    assert r1["admin_id"] == r2["admin_id"]            # 관리자도 새로 만들지 않는다
    assert projects_store.get_project_meta(p["id"])["owner_id"] == r1["admin_id"]


def test_모의_실행은_아무것도_바꾸지_않는다():
    auth_store.ensure_seed_admin("adminpw12345")
    p = projects_store.create_project("레거시", {"pages": []}, owner_id=None)
    rep = migrate_w1.run(dry_run=True)
    assert rep["orphan_count"] == 1
    assert rep["dry_run"] is True
    assert projects_store.get_project_meta(p["id"])["owner_id"] is None   # 그대로
    assert not rep.get("backup")


def test_백업_파일을_남긴다():
    projects_store.create_project("레거시", {"pages": []}, owner_id=None)
    rep = migrate_w1.run()
    assert rep["backup"] and pathlib.Path(rep["backup"]).exists()


def test_이관_사실이_감사로그에_남는다():
    projects_store.create_project("레거시", {"pages": []}, owner_id=None)
    migrate_w1.run()
    c = auth_store._conn()
    actions = [r[0] for r in c.execute("SELECT action FROM AuditLogs").fetchall()]
    c.close()
    assert "migrate_owner" in actions


def test_이관_후_L2에게는_여전히_안_보인다():
    """관리자 소유가 됐으므로 L2 목록에는 안 나온다. 재배정 전까지는 정상."""
    projects_store.create_project("레거시", {"pages": []}, owner_id=None)
    rep = migrate_w1.run()
    from server.permissions import visible_project_filter, Actor
    l2 = Actor(id="u_l2", role="writer", status="active")
    vis = visible_project_filter(l2)
    rows = projects_store.list_projects(vis, "u_l2")
    assert rows == []
    # 관리자는 본다
    admin = Actor(id=rep["admin_id"], role="admin", status="active")
    assert len(projects_store.list_projects(visible_project_filter(admin), admin.id)) == 1
