#!/usr/bin/env python3
"""Create the standard project document tree and one-click runtime."""

from __future__ import annotations

import argparse
import json
import shlex
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from audit_ports import DEFAULT_REGISTRY, configured_ports, reserve


SKILL_ROOT = Path(__file__).resolve().parents[1]
ASSETS = SKILL_ROOT / "assets"
TEMPLATES = ASSETS / "project-templates"


def command_tokens(value: str | None) -> list[str]:
    return shlex.split(value) if value else []


def package_manager(directory: Path) -> tuple[str, list[str], list[str]]:
    if (directory / "pnpm-lock.yaml").exists():
        return "pnpm", ["pnpm", "install", "--frozen-lockfile"], ["pnpm-lock.yaml"]
    if (directory / "yarn.lock").exists():
        return "yarn", ["yarn", "install", "--frozen-lockfile"], ["yarn.lock"]
    if (directory / "bun.lockb").exists() or (directory / "bun.lock").exists():
        return "bun", ["bun", "install", "--frozen-lockfile"], ["bun.lockb", "bun.lock"]
    return "npm", ["npm", "ci"], ["package-lock.json", "npm-shrinkwrap.json"]


def detect_node(directory: Path, preferred_port: int) -> dict[str, Any] | None:
    package = directory / "package.json"
    if not package.exists():
        return None
    data = json.loads(package.read_text(encoding="utf-8"))
    scripts = data.get("scripts", {})
    script = "dev" if "dev" in scripts else "start" if "start" in scripts else None
    if not script:
        return None
    manager, install, locks = package_manager(directory)
    command = [manager, "run", script]
    dependencies = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    if "vite" in dependencies:
        command += ["--", "--host", "{host}", "--port", "{port}"]
    elif "next" in dependencies:
        command += ["--", "-H", "{host}", "-p", "{port}"]
    return {"command": command, "install": [install], "lockfiles": locks, "dependency_marker": "node_modules", "preferred_port": preferred_port}


def detect_python(directory: Path, preferred_port: int) -> dict[str, Any] | None:
    requirement = directory / "requirements.txt"
    pyproject = directory / "pyproject.toml"
    if not requirement.exists() and not pyproject.exists():
        return None
    lockfiles = [name for name in ("requirements.txt", "pyproject.toml", "poetry.lock", "uv.lock") if (directory / name).exists()]
    install: list[list[str]]
    if requirement.exists():
        install = [["{python}", "-m", "pip", "install", "-r", "requirements.txt"]]
    else:
        install = [["{python}", "-m", "pip", "install", "."]]
    app = "app.main:app" if (directory / "app" / "main.py").exists() else "main:app"
    return {"command": ["{python}", "-m", "uvicorn", app, "--host", "{host}", "--port", "{port}"], "install": install, "lockfiles": lockfiles, "dependency_marker": ".venv", "preferred_port": preferred_port}


def build_service(name: str, root: Path, relative: str, explicit: str | None, install: str | None, port: int) -> dict[str, Any]:
    directory = root / relative
    detected = detect_node(directory, port) or detect_python(directory, port) or {}
    command = command_tokens(explicit) or detected.get("command", [])
    if not command:
        raise RuntimeError(f"{name} 실행 명령을 감지하지 못했습니다. --{name}-command를 지정하세요.")
    install_commands = [command_tokens(install)] if install else detected.get("install", [])
    return {
        "name": name,
        "directory": relative,
        "command": command,
        "install": install_commands,
        "lockfiles": detected.get("lockfiles", []),
        "dependency_marker": detected.get("dependency_marker", ""),
        "preferred_port": port,
        "readiness_url": "http://{host}:{port}/",
        "environment": {},
    }


def copy_templates(root: Path, agent: str, compact_date: str) -> None:
    mappings = {
        "start_docs": {
            "01": "공통", "02": "회의록", "03": "요구사항", "04": "화면설계", "05": "DB설계", "06": "요구사항", "07": "승인", "08": "프로세스", "09": "사용자매뉴얼_약식", "10": "개발자매뉴얼_약식", "11": "운영배포매뉴얼_약식", "14": "승인", "15": "승인",
        },
        "qc_docs": {"01": "품질계획", "02": "테스트케이스", "03": "산출물별기준서", "04": "산출물별기준서", "05": "산출물별기준서"},
    }
    for source_group, destinations in mappings.items():
        for source in sorted((TEMPLATES / source_group).glob("*.md")):
            stem = source.stem.replace("_템플릿", "")
            destination = destinations.get(stem[:2], "공통")
            target = root / source_group / destination / f"{agent}_{stem}_{compact_date}.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(source, target)
    checklist = root / "start_docs" / f"{agent}_프로젝트착수_체크리스트_{compact_date}.md"
    if not checklist.exists():
        shutil.copy2(TEMPLATES / "프로젝트착수_체크리스트.md", checklist)


def write_if_missing(path: Path, content: str, executable: bool = False) -> None:
    if not path.exists():
        path.write_text(content, encoding="utf-8")
    if executable:
        path.chmod(path.stat().st_mode | 0o111)


def write_document_scaffold(root: Path, agent: str, compact: str, dashed: str, session_id: str) -> None:
    metadata = f"- 문서 상태: 초안\n- 작성 에이전트: {agent}\n- 작성일: {dashed} (KST)\n- 검토자: 미지정\n- 승인자: 미지정\n"
    documents = {
        root / "docs" / f"{agent}_문서인덱스_{compact}.md": f"# 프로젝트 문서 인덱스\n\n{metadata}\n## 정본과 승인 상태\n\n| 문서 ID | 경로 | 버전 | 상태 | 요구사항 ID | 검토/승인 |\n|---|---|---|---|---|---|\n",
        root / "docs" / "공통" / f"{agent}_공통정보_{compact}.md": f"# 공통 정보\n\n{metadata}\n## 용어·책임·공통 규칙\n\n",
        root / "docs" / "기획" / f"{agent}_기획인덱스_{compact}.md": f"# 기획 인덱스\n\n{metadata}\n## 목표·범위·우선순위·연결 요구사항\n\n",
        root / "docs" / "개발일지" / dashed / f"{agent}_개발진행대장_{compact}.md": f"# 개발진행대장\n\n{metadata}\n| 일시(KST) | 세션 ID | 주체 | 구분 | 요구/결함 ID | 작업명 | 변경 경로 | 검증 결과 | 상태 | 승인/확인 |\n|---|---|---|---|---|---|---|---|---|---|\n| {dashed} 00:00 | {session_id} | {agent} | 일반 | - | 프로젝트 착수 | - | 구조 생성 | 진행 | 미지정 |\n",
        root / "docs" / "계획" / dashed / f"{agent}_작업계획_{compact}.md": f"# 작업 계획\n\n{metadata}\n## 목적·제외 범위·완료조건·단계·자원 한도\n\n",
        root / "docs" / "분석" / dashed / f"{agent}_자료분석_{compact}.md": f"# 자료 분석\n\n{metadata}\n## 출처·사실·가정·누락·모순·영향\n\n",
        root / "docs" / "검토" / dashed / f"{agent}_표준적용검토_{compact}.md": f"# 표준 적용 검토\n\n{metadata}\n## 적용 수준·현재 게이트·통과 증적·차단 항목·예외\n\n",
        root / "docs" / "협업" / dashed / f"{session_id}_{agent}_요청_프로젝트착수_{compact}.md": f"# 협업 요청 — 프로젝트 착수\n\n{metadata}- 세션 ID: {session_id}\n\n## 요청·입력·기대 출력·완료조건\n\n",
        root / "docs" / "기술문서" / f"{agent}_기술문서인덱스_{compact}.md": f"# 기술문서 인덱스\n\n{metadata}\n| 기술문서 | 요구사항 | 설계/코드 | 테스트 | 버전 | 상태 |\n|---|---|---|---|---|---|\n",
        root / "docs" / "아이디어" / dashed / f"{agent}_아이디어_{compact}.md": f"# 아이디어 기록\n\n{metadata}\n> 승인 요구사항이 아니며 검토·변경승인 전 구현 기준으로 사용하지 않는다.\n",
    }
    for path, content in documents.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        write_if_missing(path, content)
    stable_index = root / "docs" / "index.md"
    write_if_missing(stable_index, f"# 문서 인덱스 포인터\n\n현재 Codex 문서 인덱스: [{agent}_문서인덱스_{compact}.md]({agent}_문서인덱스_{compact}.md)\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="유니에버 개발표준 프로젝트 부트스트랩")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--agent", default="코덱스")
    parser.add_argument("--session-id", default="SESSION-INIT")
    parser.add_argument("--frontend-dir", default="frontend")
    parser.add_argument("--backend-dir", default="backend")
    parser.add_argument("--frontend-command")
    parser.add_argument("--backend-command")
    parser.add_argument("--frontend-install")
    parser.add_argument("--backend-install")
    parser.add_argument("--frontend-port", type=int)
    parser.add_argument("--backend-port", type=int)
    parser.add_argument("--port-registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--reservation-name", help="포트 레지스트리 이름; 기본값은 프로젝트 폴더명")
    parser.add_argument("--allow-port-conflict", action="store_true", help="명시 포트의 레지스트리 충돌을 승인하고 계속")
    parser.add_argument("--install-policy", choices=("prompt", "auto", "never"), default="prompt")
    parser.add_argument("--t-level", choices=("T0", "T1", "T2", "T3"), default="T0")
    parser.add_argument("--include-end-docs", action="store_true", help="명시적 G6 준비 지시가 있을 때만 최종 매뉴얼 템플릿 복제")
    parser.add_argument("--docs-only", action="store_true")
    args = parser.parse_args()
    root = Path(args.project_root).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    today = datetime.now().astimezone()
    compact = today.strftime("%Y%m%d")
    dashed = today.strftime("%Y-%m-%d")

    directories = [
        "start_docs/회의록", "start_docs/요구사항", "start_docs/프로세스", "start_docs/화면설계", "start_docs/DB설계", "start_docs/사용자매뉴얼_약식", "start_docs/개발자매뉴얼_약식", "start_docs/운영배포매뉴얼_약식", "start_docs/승인",
        "qc_docs/품질계획", "qc_docs/테스트케이스", "qc_docs/산출물별기준서", "qc_docs/기준시안", "qc_docs/테스트증적", "qc_docs/결함",
        "docs/공통", "docs/기획", f"docs/개발일지/{dashed}", f"docs/계획/{dashed}", f"docs/분석/{dashed}", f"docs/검토/{dashed}", f"docs/협업/{dashed}", "docs/기술문서", f"docs/아이디어/{dashed}", "SKILL",
        "end_docs/사용자매뉴얼", "end_docs/개발자매뉴얼", "end_docs/운영배포매뉴얼", "end_docs/인수",
    ]
    for relative in directories:
        (root / relative).mkdir(parents=True, exist_ok=True)
    if args.t_level != "T0":
        for relative in ("harness/contracts", "harness/policies", "harness/tools", "harness/workflows", "harness/validators", "harness/checkpoints", "harness/telemetry", "harness/fixtures", "tests/harness"):
            (root / relative).mkdir(parents=True, exist_ok=True)
    copy_templates(root, args.agent, compact)
    if args.include_end_docs:
        end_destinations = {"01": "사용자매뉴얼", "02": "개발자매뉴얼", "03": "운영배포매뉴얼"}
        for source in sorted((TEMPLATES / "end_docs").glob("*.md")):
            stem = source.stem.replace("_템플릿", "")
            target = root / "end_docs" / end_destinations[stem[:2]] / f"{args.agent}_{stem}_{compact}.md"
            if not target.exists():
                shutil.copy2(source, target)
    write_document_scaffold(root, args.agent, compact, dashed, args.session_id)

    if args.docs_only:
        print(f"문서 구조 생성 완료: {root}")
        return 0
    if (args.frontend_port is None) != (args.backend_port is None):
        raise RuntimeError("--frontend-port와 --backend-port는 함께 지정하거나 모두 생략하세요.")
    if args.frontend_port is None:
        if not args.port_registry.is_file():
            raise RuntimeError(f"포트 레지스트리가 없습니다: {args.port_registry}")
        allocation = reserve(args.port_registry, args.reservation_name or root.name, str(root))
        frontend_port = allocation["frontend_port"]
        backend_port = allocation["backend_port"]
    else:
        frontend_port = args.frontend_port
        backend_port = args.backend_port
        if args.port_registry.is_file() and not args.allow_port_conflict:
            registry = json.loads(args.port_registry.read_text(encoding="utf-8"))
            used = configured_ports(registry.get("projects", []))
            for item in registry.get("reservations", []):
                used.update((int(item["frontend_port"]), int(item["backend_port"])))
            conflicts = sorted({frontend_port, backend_port} & used)
            if conflicts:
                raise RuntimeError(f"명시 포트가 레지스트리와 충돌합니다: {conflicts}. 다른 포트를 쓰거나 --allow-port-conflict로 명시 승인하세요.")
    for relative in (args.frontend_dir, args.backend_dir):
        if not (root / relative).is_dir():
            raise RuntimeError(f"서비스 디렉터리가 없습니다: {root / relative}")
    services = [
        build_service("frontend", root, args.frontend_dir, args.frontend_command, args.frontend_install, frontend_port),
        build_service("backend", root, args.backend_dir, args.backend_command, args.backend_install, backend_port),
    ]
    config = {"schema_version": 1, "agent": args.agent, "install_policy": args.install_policy, "open_browser": True, "browser_service": "frontend", "readiness_timeout_seconds": 60, "port_registry": str(args.port_registry), "services": services}
    (root / ".dev-standard.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tool_dir = root / "tools" / "dev_standard"
    tool_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ASSETS / "devctl.py", tool_dir / "devctl.py")
    shutil.copy2(ASSETS / "run.command", root / "run.command")
    shutil.copy2(ASSETS / "run.cmd", root / "run.cmd")
    (root / "run.command").chmod((root / "run.command").stat().st_mode | 0o111)
    gitignore = root / ".gitignore"
    existing_ignore = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    additions = [entry for entry in (".dev-standard/", ".venv/") if entry not in existing_ignore.splitlines()]
    if additions:
        prefix = "" if not existing_ignore or existing_ignore.endswith("\n") else "\n"
        gitignore.write_text(existing_ignore + prefix + "\n".join(additions) + "\n", encoding="utf-8")
    print(f"표준 구조와 원클릭 실행기 생성 완료: {root}")
    print("검사: python3 tools/dev_standard/devctl.py --check")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
