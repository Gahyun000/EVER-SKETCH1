"""LLM 환경설정 저장소 — Agentic-PM의 App_Settings(llm.*) 방식을 ebook_html용으로 이식.

우선순위: App_Settings 행 > 환경변수(LLM_*) > 기본값. api_key는 서버에만 저장한다.
(원본: Agentic-PM/backend/pm_agents/llm_settings.py — 로직 동일, 로컬 단일 사용자용으로 축약)
"""
from __future__ import annotations

import os
import sqlite3
import pathlib
from typing import Any, Optional

HERE = pathlib.Path(__file__).resolve().parent
DB_PATH = pathlib.Path(os.environ.get("EBOOK_HTML_DB") or (HERE / "ebook_html.db"))

NAMESPACE = "llm"
LLM_SETTING_FIELDS = ("provider", "base_url", "user_id", "api_key", "model", "enabled", "timeout")

_DEFAULTS: dict[str, Any] = {
    "provider": "self", "base_url": "", "user_id": "", "api_key": "",
    "model": "", "enabled": True, "timeout": 45.0,
}
_ENV_FALLBACK = {
    "provider": "LLM_PROVIDER", "base_url": "LLM_BASE_URL", "user_id": "LLM_USER_ID",
    "api_key": "LLM_API_KEY", "model": "LLM_MODEL", "enabled": "LLM_ENABLED", "timeout": "LLM_TIMEOUT",
}

_DDL = """
CREATE TABLE IF NOT EXISTS App_Settings (
    setting_key   TEXT NOT NULL PRIMARY KEY,
    setting_value TEXT NULL,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by    TEXT NULL
);
"""


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(_DDL)
        conn.commit()
    finally:
        conn.close()


def _coerce_bool(value: Any, default: bool) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on", "y", "t")


def _coerce_float(value: Any, default: float) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def llm_configured(provider: str, base_url: str, api_key: str, model: str, user_id: str = "", enabled: bool = True) -> bool:
    if not enabled or not base_url or not api_key or not model:
        return False
    return bool(user_id) if (provider or "self").lower() == "self" else True


def _read_raw(conn: sqlite3.Connection) -> dict[str, str]:
    raw: dict[str, str] = {}
    try:
        rows = conn.execute(
            "SELECT setting_key, setting_value FROM App_Settings WHERE setting_key LIKE ?",
            (f"{NAMESPACE}.%",),
        ).fetchall()
    except sqlite3.OperationalError:
        return raw
    for r in rows:
        key, val = r["setting_key"], r["setting_value"]
        short = key.split(".", 1)[1] if "." in key else key
        raw[short] = "" if val is None else str(val)
    return raw


def load_llm_settings(conn: Optional[sqlite3.Connection] = None) -> dict:
    own = conn is None
    conn = conn or get_connection()
    try:
        raw = _read_raw(conn)
    finally:
        if own:
            conn.close()

    resolved: dict[str, Any] = {}
    for field in LLM_SETTING_FIELDS:
        value = raw.get(field, "").strip()
        if not value:
            env_val = os.environ.get(_ENV_FALLBACK[field])
            if env_val:
                value = env_val
        resolved[field] = value

    provider = (resolved["provider"] or _DEFAULTS["provider"]).strip().lower()
    base_url = (resolved["base_url"] or _DEFAULTS["base_url"]).strip()
    user_id = (resolved["user_id"] or _DEFAULTS["user_id"]).strip()
    api_key = resolved["api_key"] or _DEFAULTS["api_key"]
    model = (resolved["model"] or _DEFAULTS["model"]).strip()
    enabled = _coerce_bool(resolved["enabled"], _DEFAULTS["enabled"])
    timeout = _coerce_float(resolved["timeout"], _DEFAULTS["timeout"])
    configured = llm_configured(provider, base_url, api_key, model, user_id, enabled)

    return {
        "provider": provider, "base_url": base_url, "user_id": user_id, "api_key": api_key,
        "model": model, "enabled": enabled, "timeout": timeout, "configured": configured,
    }


def save_llm_settings(values: dict, conn: Optional[sqlite3.Connection] = None, updated_by: Optional[str] = None) -> dict:
    own = conn is None
    conn = conn or get_connection()
    try:
        for field in LLM_SETTING_FIELDS:
            if field not in values or values[field] is None:
                continue
            v = values[field]
            stored = ("true" if v else "false") if isinstance(v, bool) else str(v)
            conn.execute(
                """
                INSERT INTO App_Settings (setting_key, setting_value, updated_at, updated_by)
                VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = excluded.setting_value,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = excluded.updated_by
                """,
                (f"{NAMESPACE}.{field}", stored, updated_by),
            )
        conn.commit()
        return load_llm_settings(conn)
    finally:
        if own:
            conn.close()


def mask_key(v: Optional[str]) -> str:
    if not v:
        return ""
    s = str(v)
    if len(s) <= 12:
        return "*" * len(s)
    return f"{s[:8]}…{s[-4:]}"


def llm_endpoint(provider: str, base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        return ""
    provider = (provider or "self").lower()
    if base.endswith(("completions", "messages", "generate")):
        return base
    if provider == "anthropic":
        return base + "/messages"
    return base + "/chat/completions"
