"""Tests for path confinement and delete rules."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import api as api_module
from app.main import app
from app.safety import is_whitelisted_command, safe_join


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    yield
    app.dependency_overrides.clear()


def test_safe_join_rejects_parent_escape(tmp_path: Path) -> None:
    ws = tmp_path / "workspace"
    ws.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    with pytest.raises(PermissionError):
        safe_join(ws, "..", "outside", "secret.txt")


def test_safe_join_rejects_absolute_outside(tmp_path: Path) -> None:
    ws = tmp_path / "workspace"
    ws.mkdir()
    other = tmp_path / "other"
    other.mkdir()
    target = other / "x.txt"
    target.write_text("nope", encoding="utf-8")
    with pytest.raises(PermissionError):
        safe_join(ws, str(target))


def test_whitelist_includes_hermes_ping() -> None:
    assert is_whitelisted_command('hermes -z "Say exactly: OK"')


def test_whitelist_exact_match_only() -> None:
    assert is_whitelisted_command("pwd")
    assert not is_whitelisted_command("pwd && cat /etc/passwd")
    assert not is_whitelisted_command("rm -rf /")
    assert not is_whitelisted_command("hermes status ; rm -rf /")


def test_delete_rejects_playbook_via_files_api(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.delete("/api/files", params={"path": "playbooks/p.md"})
    assert r.status_code == 403


def test_list_files_by_folder(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.get("/api/files", params={"folder": "input"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "ok.txt"


def test_list_files_invalid_folder(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.get("/api/files", params={"folder": "etc"})
    assert r.status_code == 400


def _client_for_workspace(ws: Path) -> TestClient:
    def _ws_override() -> Path:
        return ws

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    return TestClient(app)


def test_delete_only_managed_files(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.delete("/api/files", params={"path": "input/ok.txt"})
    assert r.status_code == 200
    assert not (workspace / "input" / "ok.txt").exists()


def test_delete_rejects_agents_md(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.delete("/api/files", params={"path": "AGENTS.md"})
    assert r.status_code == 403
    assert (workspace / "AGENTS.md").exists()


def test_delete_rejects_directory(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.delete("/api/files", params={"path": "input"})
    assert r.status_code == 400


def test_delete_rejects_venv_file(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.delete("/api/files", params={"path": ".venv/bin/python"})
    assert r.status_code == 403


def test_delete_rejects_traversal(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    secret = workspace.parent / "secret.txt"
    secret.write_text("x", encoding="utf-8")
    r = client.delete("/api/files", params={"path": "../secret.txt"})
    assert r.status_code == 403
    assert secret.exists()


def test_agents_save_creates_backup(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.put("/api/agents-md", json={"content": "new"})
    assert r.status_code == 200
    body = r.json()
    assert body["saved"] == "true"
    assert body["backup"].startswith("AGENTS.md.bak.")
    backups = list(workspace.glob("AGENTS.md.bak.*"))
    assert len(backups) == 1


def test_playbook_save_creates_backup(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.put("/api/playbooks/p.md", json={"content": "edited"})
    assert r.status_code == 200
    body = r.json()
    assert body["saved"] == "true"
    assert "bak." in body["backup"]
    assert list(workspace.glob("playbooks/p.bak.*.md"))


def test_command_runner_rejects_arbitrary(workspace: Path) -> None:
    client = _client_for_workspace(workspace)
    r = client.post("/api/commands/run", json={"command": "echo hacked"})
    assert r.status_code == 403
    assert "whitelist" in r.json()["detail"]["policy"]["reason"]


def test_status_venv_python_symlink_target_outside_workspace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression: /api/status must not 403 when .venv/bin/python points outside ws."""
    monkeypatch.delenv("CHAT_TIMEOUT_SECONDS", raising=False)
    ws = tmp_path / "agent-workspace"
    for sub in ("input", "output", "reports", "playbooks"):
        (ws / sub).mkdir(parents=True)
    (ws / "AGENTS.md").write_text("# agents", encoding="utf-8")
    (ws / ".venv" / "bin").mkdir(parents=True)
    outside = tmp_path / "outside_python_stub"
    outside.write_text("#!/bin/sh\necho ok\n", encoding="utf-8")
    outside.chmod(0o755)
    link = ws / ".venv" / "bin" / "python"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("Could not create symlink (OS permissions)")

    client = _client_for_workspace(ws)
    r = client.get("/api/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["chatTimeoutSeconds"] == 300
    norm_path = body["venv"]["pythonPath"].replace("\\", "/")
    assert norm_path.endswith(".venv/bin/python")
    if os.name != "nt":
        assert body["venv"]["existsAndExecutable"] is True
