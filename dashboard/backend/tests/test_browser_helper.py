"""Tests for POST /api/browser/analyze."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app
from app.policy.confirmation import issue_confirmation_token


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    yield
    app.dependency_overrides.clear()


def _client_for_workspace(ws):
    def _ws_override():
        return ws

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    return TestClient(app)


def test_browser_analyze_rejects_empty_visible_text(workspace, monkeypatch) -> None:
    async def _no_exec(*_a, **_kw):
        raise AssertionError("subprocess should not run")

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", _no_exec)
    client = _client_for_workspace(workspace)
    r = client.post("/api/browser/analyze", json={"visibleText": "   "})
    assert r.status_code == 422


def test_browser_analyze_uses_free_model_without_shell(workspace, monkeypatch) -> None:
    monkeypatch.delenv("HERMES_BIN", raising=False)
    monkeypatch.delenv("AGENT_WORKHORSE_MODEL", raising=False)
    monkeypatch.delenv("AGENT_ALLOW_PAID_MODELS", raising=False)
    captured: dict = {}

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        assert "shell" not in kwargs
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=("Коротко: ok\n".encode("utf-8"), None))
        proc.returncode = 0
        proc.kill = MagicMock()
        return proc

    monkeypatch.setattr(
        api_module.asyncio,
        "create_subprocess_exec",
        fake_create_subprocess_exec,
    )
    token = issue_confirmation_token("browser analyze")
    client = _client_for_workspace(workspace)
    r = client.post(
        "/api/browser/analyze",
        json={
            "url": "https://example.test/task",
            "title": "Task",
            "visibleText": "Question: choose the best category\nA\nB",
            "mode": "workhorse",
            "policyConfirmationToken": token,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["exitCode"] == 0
    assert body["mode"] == "browser-analyze"
    assert body["model"] == "minimax/minimax-m2.5:free"
    assert "ok" in body["response"]
    assert captured["args"][0:2] == ("hermes", "-z")
    assert "--provider" in captured["args"]
    assert "--model" in captured["args"]
    assert captured["args"][-4:] == (
        "--provider",
        "openrouter",
        "--model",
        "minimax/minimax-m2.5:free",
    )
    prompt = captured["args"][2]
    assert "Visible page text:" in prompt
    assert "Question: choose the best category" in prompt
    assert captured["kwargs"]["cwd"] == str(workspace)


def test_browser_analyze_rejects_paid_model_by_default(workspace, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_WORKHORSE_MODEL", "vendor/paid-model")
    monkeypatch.delenv("AGENT_ALLOW_PAID_MODELS", raising=False)

    async def _no_exec(*_a, **_kw):
        raise AssertionError("subprocess should not run")

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", _no_exec)
    token = issue_confirmation_token("browser analyze")
    client = _client_for_workspace(workspace)
    r = client.post(
        "/api/browser/analyze",
        json={
            "visibleText": "Question text",
            "mode": "workhorse",
            "policyConfirmationToken": token,
        },
    )
    assert r.status_code == 500
    assert "must be a free model" in r.json()["detail"]
