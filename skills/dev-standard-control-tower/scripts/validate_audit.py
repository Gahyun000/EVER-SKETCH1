#!/usr/bin/env python3
"""Validate the preserved 96-item sketch-to-standard audit mapping."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


MAPPING = Path(__file__).resolve().parents[1] / "references" / "source-audit-mapping.json"
REQUIRED_FIELDS = {"id", "section", "number", "text", "status", "evidence", "note"}
REQUIRED_SECTIONS = {"개요", "핵심 철학", "프로젝트 진행 절차", "개발 지침"}


def main() -> int:
    data = json.loads(MAPPING.read_text(encoding="utf-8"))
    errors: list[str] = []
    if not isinstance(data, list) or len(data) != 96:
        errors.append(f"expected 96 entries, got {len(data) if isinstance(data, list) else 'non-list'}")
        data = data if isinstance(data, list) else []
    ids = [str(item.get("id", "")) for item in data]
    duplicates = [key for key, count in Counter(ids).items() if count > 1]
    if duplicates:
        errors.append(f"duplicate ids: {', '.join(duplicates)}")
    sections = {str(item.get("section", "")) for item in data}
    missing_sections = REQUIRED_SECTIONS - sections
    if missing_sections:
        errors.append(f"missing sections: {', '.join(sorted(missing_sections))}")
    for index, item in enumerate(data, 1):
        missing = REQUIRED_FIELDS - set(item)
        if missing:
            errors.append(f"entry {index}: missing {', '.join(sorted(missing))}")
        if not str(item.get("text", "")).strip() or not str(item.get("evidence", "")).strip():
            errors.append(f"entry {index}: empty requirement text or evidence")
    if errors:
        print("Audit validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    statuses = Counter(str(item["status"]) for item in data)
    print(f"Audit validation passed: 96 unique requirements, {len(sections)} sections, statuses={dict(statuses)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
