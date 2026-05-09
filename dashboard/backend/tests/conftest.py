"""Shared pytest fixtures for dashboard backend tests."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    ws = tmp_path / "agent-workspace"
    for sub in ("input", "output", "reports", "playbooks"):
        (ws / sub).mkdir(parents=True)
    (ws / "input" / "ok.txt").write_text("ok", encoding="utf-8")
    (ws / ".venv" / "bin").mkdir(parents=True)
    (ws / ".venv" / "bin" / "python").write_text("#fake", encoding="utf-8")
    (ws / "AGENTS.md").write_text("# agents", encoding="utf-8")
    (ws / "playbooks" / "p.md").write_text("x", encoding="utf-8")
    return ws
