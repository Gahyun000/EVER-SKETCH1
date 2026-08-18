import os
import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parent.parent

SCRIPT_TESTS = [
    "server/test_card_catalog.py",
    "server/test_planner.py",
    "server/test_create_lane.py",
    "server/test_editor.py",
    "server/test_edit_lane.py",
    "server/test_self_check.py",
    "server/test_settings_store.py",
    "server/deck/test_extractor.py",
    "server/deck/test_deck_theme_sync.py",
]


def test_script_harnesses_pass():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    failures = []
    for rel in SCRIPT_TESTS:
        proc = subprocess.run(
            [sys.executable, rel],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            failures.append(
                f"{rel} exited {proc.returncode}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
            )
    assert not failures, "\n\n".join(failures)
