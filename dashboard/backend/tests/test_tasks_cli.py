"""CLI smoke tests for hermes tasks subcommands."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _hermes_agent_dir() -> Path:
    return _repo_root() / "hermes" / "hermes-agent"


def _run_cli(args: list[str], *, workspace: Path) -> subprocess.CompletedProcess[str]:
    hermes_dir = _hermes_agent_dir()
    backend = _repo_root() / "hayk-universal-agent" / "dashboard" / "backend"
    env = {
        **dict(__import__("os").environ),
        "WORKSPACE_ROOT": str(workspace),
        "PYTHONPATH": str(backend),
    }
    return subprocess.run(
        [sys.executable, "-m", "hermes_cli.main", *args],
        cwd=str(hermes_dir),
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_cli_tasks_list_empty(workspace: Path) -> None:
    if not _hermes_agent_dir().is_dir():
        pytest_skip = __import__("pytest").skip
        pytest_skip("hermes-agent not present")
    result = _run_cli(["tasks", "list"], workspace=workspace)
    assert result.returncode == 0
    assert "No tasks" in result.stdout or "tasks" in result.stdout.lower()


def test_cli_tasks_add_and_list(workspace: Path) -> None:
    if not _hermes_agent_dir().is_dir():
        pytest_skip = __import__("pytest").skip
        pytest_skip("hermes-agent not present")
    add = _run_cli(["tasks", "add", "CLI task"], workspace=workspace)
    assert add.returncode == 0
    assert "Created task" in add.stdout
    listed = _run_cli(["tasks", "list", "--json"], workspace=workspace)
    assert listed.returncode == 0
    assert "CLI task" in listed.stdout
