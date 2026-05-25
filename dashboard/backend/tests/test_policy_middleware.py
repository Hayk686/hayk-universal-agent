"""Tests for policy observability middleware and API hooks."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app
from app.policy.confirmation import issue_confirmation_token


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    yield
    app.dependency_overrides.clear()


def test_middleware_attaches_run_id_header(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    events = tmp_path / "policy-events.jsonl"
    monkeypatch.setenv("POLICY_EVENTS_PATH", str(events))
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.headers.get("X-Run-Id")


def test_policy_check_endpoint(workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    events = tmp_path / "policy-events.jsonl"
    monkeypatch.setenv("POLICY_EVENTS_PATH", str(events))
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    client = TestClient(app)
    r = client.post(
        "/api/policy/check",
        json={
            "action": "exec hermes status",
            "context": {"kind": "exec", "command": "hermes status"},
        },
    )
    assert r.status_code == 200
    assert r.json()["allowed"] is True
    assert events.is_file()


def test_web_send_requires_confirmation(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))

    async def _no_exec(*_a, **_kw):
        raise AssertionError("subprocess should not run without confirmation")

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", _no_exec)

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    client = TestClient(app)
    r = client.post("/api/chat/web-send", json={"message": "search the web"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["policy"]["requiresConfirmation"] is True


def test_web_send_with_valid_token_proceeds(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    token = issue_confirmation_token("network web-send")

    class _Proc:
        returncode = 0

        async def communicate(self):
            return b"ok\n", None

        def kill(self):
            pass

        async def wait(self):
            pass

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _Proc()

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    client = TestClient(app)
    r = client.post(
        "/api/chat/web-send",
        json={"message": "search the web", "policyConfirmationToken": token},
    )
    assert r.status_code == 200
    assert r.headers.get("X-Run-Id")


def test_capabilities_endpoint() -> None:
    client = TestClient(app)
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["policyGate"] is True
    assert body["orchestrator"] is True
    assert body["memoryIndex"] is True
    assert body["artifactsIndex"] is True
    assert body["browserDriver"] is True


def test_policy_confirm_rejects_bad_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", "/tmp/ws")
    client = TestClient(app)
    r = client.post(
        "/api/policy/confirm",
        json={"action": "network web-send", "token": "bad.token"},
    )
    assert r.status_code == 400
