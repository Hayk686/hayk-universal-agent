"""Tests for POST /api/chat/send (Hermes one-shot, no shell)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    yield
    app.dependency_overrides.clear()


def _client_for_workspace(ws):
    def _ws_override():
        return ws

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    return TestClient(app)


def test_chat_send_rejects_empty_message(workspace, monkeypatch) -> None:
    async def _no_exec(*_a, **_kw):
        raise AssertionError("subprocess should not run")

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", _no_exec)
    client = _client_for_workspace(workspace)
    r = client.post("/api/chat/send", json={"message": ""})
    assert r.status_code == 422
    r2 = client.post("/api/chat/send", json={"message": "   \t  "})
    assert r2.status_code == 422


def test_chat_send_rejects_too_long_message(workspace, monkeypatch) -> None:
    async def _no_exec(*_a, **_kw):
        raise AssertionError("subprocess should not run")

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", _no_exec)
    client = _client_for_workspace(workspace)
    r = client.post("/api/chat/send", json={"message": "x" * 8001})
    assert r.status_code == 422


def test_chat_send_uses_subprocess_exec_without_shell(workspace, monkeypatch) -> None:
    monkeypatch.delenv("HERMES_BIN", raising=False)
    captured: dict = {}

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        assert "shell" not in kwargs
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"ok from hermes\n", None))
        proc.returncode = 0
        proc.kill = MagicMock()
        return proc

    monkeypatch.setattr(
        api_module.asyncio,
        "create_subprocess_exec",
        fake_create_subprocess_exec,
    )
    client = _client_for_workspace(workspace)
    r = client.post("/api/chat/send", json={"message": "  hello pi  "})
    assert r.status_code == 200
    body = r.json()
    assert body["exitCode"] == 0
    assert body["mode"] == "oneshot"
    assert "ok from hermes" in body["response"]
    assert body["durationMs"] >= 0
    assert captured["args"] == ("hermes", "-z", "hello pi")
    assert captured["kwargs"]["cwd"] == str(workspace)


def test_chat_send_uses_hermes_bin_when_set(workspace, monkeypatch) -> None:
    monkeypatch.setenv("HERMES_BIN", "/home/ubuntu/.local/bin/hermes")
    captured: dict = {}

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        assert "shell" not in kwargs
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"ok\n", None))
        proc.returncode = 0
        proc.kill = MagicMock()
        return proc

    monkeypatch.setattr(
        api_module.asyncio,
        "create_subprocess_exec",
        fake_create_subprocess_exec,
    )
    client = _client_for_workspace(workspace)
    r = client.post("/api/chat/send", json={"message": "ping"})
    assert r.status_code == 200
    assert captured["args"] == ("/home/ubuntu/.local/bin/hermes", "-z", "ping")


def test_logs_hermes_uses_hermes_bin_when_set(monkeypatch) -> None:
    monkeypatch.setenv("HERMES_BIN", "/opt/hermes")
    captured: dict = {}

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"log\n", None))
        proc.returncode = 0
        proc.kill = MagicMock()
        return proc

    monkeypatch.setattr(
        api_module.asyncio,
        "create_subprocess_exec",
        fake_create_subprocess_exec,
    )
    client = TestClient(app)
    r = client.get("/api/logs/hermes")
    assert r.status_code == 200
    assert captured["args"] == ("/opt/hermes", "logs", "--since", "1h")


def test_logs_errors_uses_hermes_bin_when_set(monkeypatch) -> None:
    monkeypatch.setenv("HERMES_BIN", "/opt/hermes")
    captured: dict = {}

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"err\n", None))
        proc.returncode = 0
        proc.kill = MagicMock()
        return proc

    monkeypatch.setattr(
        api_module.asyncio,
        "create_subprocess_exec",
        fake_create_subprocess_exec,
    )
    client = TestClient(app)
    r = client.get("/api/logs/errors")
    assert r.status_code == 200
    assert captured["args"] == ("/opt/hermes", "logs", "errors")
