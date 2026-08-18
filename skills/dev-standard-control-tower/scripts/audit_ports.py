#!/usr/bin/env python3
"""Audit configured frontend/backend ports and maintain a collision-safe registry."""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROJECTS = SKILL_ROOT / "references" / "agent-projects.json"
DEFAULT_REGISTRY = SKILL_ROOT / "references" / "agent-port-registry.json"
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "coverage", "__pycache__", "site-packages", "vendor", "public", "static", "assets"}
INFRA_PORTS = {21, 22, 25, 53, 80, 443, 3306, 5432, 5672, 6379, 9090, 9200, 9300, 11434, 27017}
URL_RE = re.compile(r"(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[:](\d{2,5})", re.I)
FLAG_RE = re.compile(r"(?:--port(?:=|\s+)|\bport\s*[:=]\s*|\b[A-Z][A-Z0-9_]*PORT\s*[:=]\s*[\"']?)(\d{2,5})", re.I)
DOCKER_RE = re.compile(r"[\"']?(\d{2,5}):\d{2,5}[\"']?")
SHELL_DEFAULT_RE = re.compile(r"\$\{[A-Z][A-Z0-9_]*PORT:-([0-9]{2,5})\}", re.I)


def candidate_file(path: Path) -> bool:
    name = path.name.lower()
    if name.endswith((".lock", ".map", ".min.js", ".min.css")) or path.stat().st_size > 1_000_000:
        return False
    if any(part.lower() in SKIP_DIRS for part in path.parts):
        return False
    if name in {"package.json", "pyproject.toml", "readme.md", "agents.md", "claude.md", "startup_guide.md", "technical.md"}:
        return True
    if name.startswith((".env", "dockerfile", "docker-compose", "compose.", "vite.config", "next.config")):
        return True
    if any(token in name for token in ("start", "run", "serve", "launch", "stop")) and path.suffix.lower() in {".py", ".js", ".ts", ".sh", ".command", ".bat", ".cmd", ".ps1", ".yml", ".yaml"}:
        return True
    if name in {"main.py", "server.py", "app.py", "config.py", "settings.py"}:
        return True
    return path.suffix.lower() in {".yml", ".yaml", ".toml"} and "test" not in name


def source_score(relative: str) -> int:
    lower = relative.lower()
    name = Path(lower).name
    if "backup" in lower or "legacy" in lower:
        return 15
    if "/test" in lower or name.startswith("test_"):
        return 5
    if "/docs/" in f"/{lower}" or name in {"readme.md", "technical.md"}:
        return 25
    if name.startswith(".env"):
        return 65 if "example" in name else 100
    if name == "package.json" or name.startswith(("vite.config", "next.config", "docker-compose", "compose.")):
        return 95
    if any(token in name for token in ("start", "run", "serve", "launch")):
        return 90
    if name in {"main.py", "server.py", "app.py", "config.py", "settings.py"}:
        return 80
    return 55


def classify(relative: str, line: str, port: int) -> str:
    text = f"{relative} {line}".lower()
    if port in INFRA_PORTS:
        return "auxiliary"
    front = any(token in text for token in ("frontend", "front_port", "vite", "next", "react", "ui_port", "web_port", "streamlit"))
    back = any(token in text for token in ("backend", "back_port", "api_port", "uvicorn", "fastapi", "flask", "django", "gunicorn", "server_port"))
    if front and not back:
        return "frontend"
    if back and not front:
        return "backend"
    if "/frontend/" in f"/{relative.lower()}/" or Path(relative).name.lower().startswith("vite.config"):
        return "frontend"
    if "/backend/" in f"/{relative.lower()}/" or Path(relative).name.lower() in {"main.py", "server.py", "app.py"}:
        return "backend"
    if 5000 <= port < 8000 or 3000 <= port < 5000:
        return "frontend"
    if 8000 <= port < 20000:
        return "backend"
    return "unknown"


def scan_project(project: dict[str, Any]) -> dict[str, Any]:
    root = Path(project["path"])
    if not root.is_dir():
        return {**project, "status": "missing", "frontend_ports": [], "backend_ports": [], "auxiliary_ports": [], "evidence": []}
    hits: list[dict[str, Any]] = []
    scores: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for current, dirs, files in os.walk(root):
        dirs[:] = [name for name in dirs if name.lower() not in SKIP_DIRS]
        for filename in files:
            path = Path(current) / filename
            try:
                if not candidate_file(path):
                    continue
                relative = str(path.relative_to(root))
                for number, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                    ports = {int(match) for match in URL_RE.findall(line)} | {int(match) for match in FLAG_RE.findall(line)} | {int(match) for match in SHELL_DEFAULT_RE.findall(line)}
                    if "ports:" in line.lower() or "docker" in relative.lower() or "compose" in relative.lower():
                        ports |= {int(match) for match in DOCKER_RE.findall(line)}
                    for port in sorted(value for value in ports if 1 <= value <= 65535):
                        role = classify(relative, line, port)
                        score = source_score(relative)
                        scores[role][port] += score
                        hits.append({"role": role, "port": port, "file": relative, "line": number, "score": score, "excerpt": line.strip()[:240]})
            except (OSError, UnicodeError):
                continue

    def ranked(role: str) -> list[int]:
        values = scores.get(role, {})
        if not values:
            return []
        highest = max(values.values())
        return [port for port, score in sorted(values.items(), key=lambda item: (-item[1], item[0])) if score >= max(50, highest * 0.45)]

    frontend = ranked("frontend")
    backend = ranked("backend")
    auxiliary = ranked("auxiliary")
    override = project.get("override")
    if override:
        frontend = [int(port) for port in override.get("frontend_ports", [])]
        backend = [int(port) for port in override.get("backend_ports", [])]
        auxiliary = [int(port) for port in override.get("auxiliary_ports", [])]
    top_hits = sorted(hits, key=lambda hit: (-hit["score"], hit["role"], hit["port"], hit["file"], hit["line"]))[:20]
    if override:
        ordered_pairs: list[tuple[str, int]] = []
        for role, values in (("frontend", frontend[:1]), ("backend", backend[:1]), ("frontend", frontend[1:]), ("backend", backend[1:]), ("auxiliary", auxiliary)):
            ordered_pairs.extend((role, port) for port in values)
        selected: list[dict[str, Any]] = []
        for role, port in ordered_pairs:
            candidates = [hit for hit in hits if hit["role"] == role and hit["port"] == port] or [hit for hit in hits if hit["port"] == port]
            if candidates:
                def evidence_rank(hit: dict[str, Any]) -> tuple[int, int, str, int]:
                    excerpt = hit["excerpt"]
                    filename = Path(hit["file"]).name.lower()
                    direct = bool(FLAG_RE.search(excerpt) or SHELL_DEFAULT_RE.search(excerpt) or DOCKER_RE.search(excerpt) or any(token in filename for token in ("start", "run", "serve", "launch")))
                    return (-int(direct), -hit["score"], hit["file"], hit["line"])
                selected.append(sorted(candidates, key=evidence_rank)[0])
        if selected:
            top_hits = selected[:20]
    result = {key: value for key, value in project.items() if key != "override"}
    status = "audited-verified" if override and (frontend or backend or auxiliary) else "not-applicable" if override else "audited" if hits else "no-port-found"
    return {**result, "status": status, "frontend_ports": frontend, "backend_ports": backend, "auxiliary_ports": auxiliary, "note": override.get("note", "") if override else "자동 탐지", "evidence": top_hits}


def configured_ports(projects: list[dict[str, Any]]) -> set[int]:
    return {int(port) for project in projects for key in ("frontend_ports", "backend_ports", "auxiliary_ports") for port in project.get(key, [])}


def port_available(port: int) -> bool | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", port))
        return True
    except PermissionError:
        return None
    except OSError:
        return False


def collisions(projects: list[dict[str, Any]]) -> dict[str, list[str]]:
    owners: dict[int, list[str]] = defaultdict(list)
    for project in projects:
        for role in ("frontend", "backend"):
            for port in project.get(f"{role}_ports", []):
                owners[int(port)].append(f"{project['name']}:{role}")
    return {str(port): names for port, names in sorted(owners.items()) if len(names) > 1}


def audit(project_file: Path, output: Path) -> dict[str, Any]:
    source = json.loads(project_file.read_text(encoding="utf-8"))
    projects = [scan_project(project) for project in source["projects"]]
    ports = configured_ports(projects)
    active = {str(port): available is False for port in sorted(ports) if (available := port_available(port)) is not None}
    registry = {
        "schema_version": 1,
        "audited_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": str(project_file),
        "policy": {"frontend_range": [5200, 5499], "backend_range": [8800, 9199], "runtime_probe": True, "strict_port": True},
        "projects": projects,
        "collisions": collisions(projects),
        "active_at_audit": active,
        "reservations": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    lock = output.with_suffix(output.suffix + ".lock")
    descriptor: int | None = None
    deadline = time.time() + 10
    while descriptor is None:
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            if time.time() >= deadline:
                raise RuntimeError(f"포트 레지스트리 잠금을 얻지 못했습니다: {lock}")
            time.sleep(0.1)
    try:
        if output.exists():
            previous = json.loads(output.read_text(encoding="utf-8"))
            registry["reservations"] = previous.get("reservations", [])
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, output)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        lock.unlink(missing_ok=True)
    return registry


def next_free(used: set[int], start: int, end: int) -> int:
    for port in range(start, end + 1):
        if port in used:
            continue
        available = port_available(port)
        if available is not False:
            return port
    raise RuntimeError(f"포트 범위 {start}-{end}가 소진되었습니다.")


def reserve(registry_path: Path, name: str, project_root: str) -> dict[str, int]:
    lock = registry_path.with_suffix(registry_path.suffix + ".lock")
    deadline = time.time() + 10
    descriptor: int | None = None
    while descriptor is None:
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            if time.time() >= deadline:
                raise RuntimeError(f"포트 레지스트리 잠금을 얻지 못했습니다: {lock}")
            time.sleep(0.1)
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        resolved_root = str(Path(project_root).expanduser().resolve())
        for item in registry.get("reservations", []):
            if item.get("name") == name and item.get("project_root") == resolved_root:
                return {"frontend_port": int(item["frontend_port"]), "backend_port": int(item["backend_port"])}
        used = configured_ports(registry.get("projects", []))
        for item in registry.get("reservations", []):
            # Keep compatibility with the older registry reservation shape,
            # which stores frontend_ports/backend_ports arrays.
            if "frontend_port" in item:
                used.add(int(item["frontend_port"]))
            else:
                used.update(int(port) for port in item.get("frontend_ports", []))
            if "backend_port" in item:
                used.add(int(item["backend_port"]))
            else:
                used.update(int(port) for port in item.get("backend_ports", []))
        front_start, front_end = registry["policy"]["frontend_range"]
        back_start, back_end = registry["policy"]["backend_range"]
        frontend = next_free(used, int(front_start), int(front_end))
        used.add(frontend)
        backend = next_free(used, int(back_start), int(back_end))
        reservation = {"name": name, "project_root": resolved_root, "frontend_port": frontend, "backend_port": backend, "reserved_at": datetime.now().astimezone().isoformat(timespec="seconds")}
        registry.setdefault("reservations", []).append(reservation)
        temporary = registry_path.with_suffix(registry_path.suffix + ".tmp")
        temporary.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, registry_path)
        return {"frontend_port": frontend, "backend_port": backend}
    finally:
        if descriptor is not None:
            os.close(descriptor)
        lock.unlink(missing_ok=True)


def validate_registry(registry_path: Path) -> None:
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    projects = registry.get("projects", [])
    errors: list[str] = []
    if registry.get("schema_version") != 1:
        errors.append("unsupported schema_version")
    if len(projects) < 24:
        errors.append(f"expected at least 24 projects, got {len(projects)}")
    names = [project.get("name") for project in projects]
    paths = [project.get("path") for project in projects]
    if len(set(names)) != len(names):
        errors.append("duplicate project names")
    if len(set(paths)) != len(paths):
        errors.append("duplicate project paths")
    for project in projects:
        for key in ("frontend_ports", "backend_ports", "auxiliary_ports"):
            values = project.get(key, [])
            if len(values) != len(set(values)) or any(not isinstance(port, int) or not 1 <= port <= 65535 for port in values):
                errors.append(f"{project.get('name')}: invalid or duplicate {key}")
    if registry.get("collisions") != collisions(projects):
        errors.append("collision map is stale")
    used = configured_ports(projects)
    reserved: set[int] = set()
    for item in registry.get("reservations", []):
        frontend_values = item.get("frontend_ports", [item["frontend_port"]] if "frontend_port" in item else [])
        backend_values = item.get("backend_ports", [item["backend_port"]] if "backend_port" in item else [])
        pair = {int(port) for port in frontend_values + backend_values}
        if not pair or pair & used or pair & reserved:
            errors.append(f"invalid reservation: {item.get('name')}")
        reserved.update(pair)
    if errors:
        raise RuntimeError("; ".join(errors))
    print(f"Registry validation passed: {len(projects)} projects, {len(configured_ports(projects))} unique ports, {len(registry['collisions'])} collision groups, {len(registry.get('reservations', []))} reservations")


def main() -> int:
    parser = argparse.ArgumentParser(description="에이전트 프로젝트 포트 감사·예약")
    sub = parser.add_subparsers(dest="command", required=True)
    audit_parser = sub.add_parser("audit")
    audit_parser.add_argument("--projects", type=Path, default=DEFAULT_PROJECTS)
    audit_parser.add_argument("--output", type=Path, default=DEFAULT_REGISTRY)
    reserve_parser = sub.add_parser("reserve")
    reserve_parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    reserve_parser.add_argument("--name", required=True)
    reserve_parser.add_argument("--project-root", required=True)
    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    args = parser.parse_args()
    try:
        if args.command == "audit":
            registry = audit(args.projects, args.output)
            print(f"Audited {len(registry['projects'])} projects; collisions={len(registry['collisions'])}; output={args.output}")
        elif args.command == "reserve":
            allocation = reserve(args.registry, args.name, args.project_root)
            print(json.dumps(allocation, ensure_ascii=False))
        else:
            validate_registry(args.registry)
        return 0
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
