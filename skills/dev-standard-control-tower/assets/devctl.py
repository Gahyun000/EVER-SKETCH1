#!/usr/bin/env python3
"""Portable, dependency-free frontend/backend process supervisor."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_config(root: Path) -> dict[str, Any]:
    path = root / ".dev-standard.json"
    if not path.is_file():
        raise RuntimeError(f"설정 파일이 없습니다: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("services"), list):
        raise RuntimeError("지원하지 않는 .dev-standard.json 형식입니다.")
    return data


def free_port(preferred: int, reserved: set[int]) -> int:
    for port in range(preferred, min(preferred + 200, 65536)):
        if port in reserved:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
        reserved.add(port)
        return port
    raise RuntimeError(f"포트 {preferred} 이후 200개 범위에서 빈 포트를 찾지 못했습니다.")


def venv_python(root: Path) -> str:
    if os.name == "nt":
        return str(root / ".venv" / "Scripts" / "python.exe")
    return str(root / ".venv" / "bin" / "python")


def expand(tokens: list[str], root: Path, port: int) -> list[str]:
    values = {"{host}": "127.0.0.1", "{port}": str(port), "{python}": venv_python(root)}
    return [values.get(token, token.replace("{port}", str(port)).replace("{host}", "127.0.0.1").replace("{python}", venv_python(root))) for token in tokens]


def dependency_fingerprint(directory: Path, lockfiles: list[str]) -> str:
    digest = hashlib.sha256()
    found = False
    for relative in lockfiles:
        path = directory / relative
        if path.is_file():
            found = True
            digest.update(relative.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest() if found else "NO_LOCKFILE"


def install_needed(root: Path, service: dict[str, Any], state: dict[str, Any]) -> tuple[bool, str]:
    directory = root / service["directory"]
    fingerprint = dependency_fingerprint(directory, service.get("lockfiles", []))
    if not service.get("install"):
        return False, fingerprint
    marker = service.get("dependency_marker")
    marker_missing = bool(marker) and not (directory / marker).exists() and not (root / marker).exists()
    previous = state.get("dependencies", {}).get(service["name"])
    return marker_missing or previous != fingerprint, fingerprint


def approved(policy: str, service_name: str, cli_approval: bool) -> bool:
    if cli_approval or policy == "auto":
        return True
    if policy == "never" or not sys.stdin.isatty():
        return False
    answer = input(f"[{service_name}] 잠금 파일 기반 의존성을 설치할까요? [y/N] ").strip().lower()
    return answer in {"y", "yes", "예"}


def run_install(root: Path, service: dict[str, Any], policy: str, cli_approval: bool) -> None:
    commands = service.get("install", [])
    if not commands:
        raise RuntimeError(f"[{service['name']}] 설치 명령이 정의되지 않았습니다.")
    lockfiles = service.get("lockfiles", [])
    directory = root / service["directory"]
    if not lockfiles:
        raise RuntimeError(f"[{service['name']}] 잠금 파일이 선언되지 않아 자동 설치를 중단했습니다.")
    if not any((directory / lockfile).is_file() for lockfile in lockfiles):
        raise RuntimeError(f"[{service['name']}] 선언된 잠금 파일이 없어 자동 설치를 중단했습니다.")
    if not approved(policy, service["name"], cli_approval):
        raise RuntimeError(f"[{service['name']}] 필요한 의존성 설치가 승인되지 않았습니다.")
    if any("{python}" in token for command in commands for token in command) and not Path(venv_python(root)).exists():
        subprocess.run([sys.executable, "-m", "venv", str(root / ".venv")], check=True)
    for command in commands:
        argv = expand(command, root, 0)
        print(f"[{service['name']}] 설치: {' '.join(argv)}")
        subprocess.run(argv, cwd=directory, check=True)


def ready(url: str, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 100 <= response.status < 500
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def stop_processes(processes: list[subprocess.Popen[Any]]) -> None:
    for process in reversed(processes):
        if process.poll() is not None:
            continue
        try:
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.time() + 5
    while time.time() < deadline and any(p.poll() is None for p in processes):
        time.sleep(0.1)
    for process in processes:
        if process.poll() is None:
            process.kill()


def main() -> int:
    parser = argparse.ArgumentParser(description="표준 프로젝트 원클릭 실행기")
    parser.add_argument("--check", action="store_true", help="설정, 경로, 명령, 포트만 검사")
    parser.add_argument("--approve-install", action="store_true", help="이번 실행의 잠금 파일 기반 설치 승인")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--duration", type=float, help="테스트용 자동 종료 시간(초)")
    args = parser.parse_args()
    root = project_root()
    config = load_config(root)
    runtime_dir = root / ".dev-standard"
    log_dir = runtime_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    state_path = runtime_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    reserved: set[int] = set()
    prepared: list[tuple[dict[str, Any], int, str]] = []

    for service in config["services"]:
        directory = root / service["directory"]
        if not directory.is_dir():
            raise RuntimeError(f"[{service['name']}] 디렉터리가 없습니다: {directory}")
        if not service.get("command"):
            raise RuntimeError(f"[{service['name']}] 실행 명령이 비어 있습니다.")
        port = free_port(int(service["preferred_port"]), reserved)
        readiness = service.get("readiness_url", "http://{host}:{port}/").replace("{host}", "127.0.0.1").replace("{port}", str(port))
        prepared.append((service, port, readiness))

    if args.check:
        for service, port, readiness in prepared:
            needed, _ = install_needed(root, service, state)
            print(f"OK {service['name']}: dir={service['directory']} port={port} install_needed={str(needed).lower()} readiness={readiness}")
        return 0

    policy = config.get("install_policy", "prompt")
    fingerprints: dict[str, str] = {}
    for service, _, _ in prepared:
        needed, fingerprint = install_needed(root, service, state)
        if needed:
            run_install(root, service, policy, args.approve_install)
        fingerprints[service["name"]] = fingerprint

    processes: list[subprocess.Popen[Any]] = []
    log_handles: list[Any] = []
    runtime_services: list[dict[str, Any]] = []
    try:
        for service, port, readiness in prepared:
            directory = root / service["directory"]
            env = os.environ.copy()
            env.update({"HOST": "127.0.0.1", "PORT": str(port), "FRONTEND_PORT": str(port), "BACKEND_PORT": str(port), **service.get("environment", {})})
            argv = expand(service["command"], root, port)
            log_path = log_dir / f"{service['name']}.log"
            log_handle = log_path.open("a", encoding="utf-8")
            log_handles.append(log_handle)
            options: dict[str, Any] = {"cwd": directory, "env": env, "stdout": log_handle, "stderr": subprocess.STDOUT}
            if os.name == "nt":
                options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                options["start_new_session"] = True
            process = subprocess.Popen(argv, **options)
            processes.append(process)
            runtime_services.append({"name": service["name"], "pid": process.pid, "port": port, "url": readiness, "log": str(log_path.relative_to(root))})
            print(f"[{service['name']}] pid={process.pid} port={port} log={log_path.relative_to(root)}")

        deadline = time.time() + float(config.get("readiness_timeout_seconds", 60))
        pending = {entry[0]["name"]: entry[2] for entry in prepared}
        while pending and time.time() < deadline:
            for process, (service, _, _) in zip(processes, prepared):
                if process.poll() is not None:
                    raise RuntimeError(f"[{service['name']}] 준비 전에 종료되었습니다. 로그를 확인하세요.")
            for name, url in list(pending.items()):
                if ready(url):
                    print(f"[{name}] 준비 완료: {url}")
                    del pending[name]
            time.sleep(0.25)
        if pending:
            raise RuntimeError(f"준비 시간 초과: {', '.join(pending)}")

        frontend = next((item for item in runtime_services if item["name"] == config.get("browser_service", "frontend")), runtime_services[-1])
        state = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "dependencies": fingerprints, "services": runtime_services}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"브라우저 주소: {frontend['url']}")
        print("종료: Ctrl+C")
        if config.get("open_browser", True) and not args.no_browser:
            webbrowser.open(frontend["url"])
        if args.duration is not None:
            time.sleep(max(0, args.duration))
            return 0
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        return 1
    except KeyboardInterrupt:
        print("종료 요청을 처리합니다.")
        return 0
    finally:
        stop_processes(processes)
        for handle in log_handles:
            handle.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
