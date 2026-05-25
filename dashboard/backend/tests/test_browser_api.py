"""API integration tests for browser driver endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.browser.driver import StubBrowserDriver, browser_policy_action, clear_action_cache, set_browser_driver
from app.browser.models import BrowserActionType
from app.main import app
from app.observability.events import events_log_path
from app.policy.confirmation import issue_confirmation_token


@pytest.fixture(autouse=True)
def _reset_browser_state() -> None:
    clear_action_cache()
    set_browser_driver(None)
    yield
    app.dependency_overrides.clear()
    clear_action_cache()
    set_browser_driver(None)


def _client(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    monkeypatch.setenv("POLICY_EVENTS_PATH", str(workspace / "logs" / "policy-events.jsonl"))
    set_browser_driver(StubBrowserDriver())

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    return TestClient(app)


def test_capabilities_browser_driver(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    assert r.json()["browserDriver"] is True


def test_browser_action_requires_confirmation(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.post(
        "/api/browser/action",
        json={"action": "navigate", "url": "https://example.com"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["policy"]["requiresConfirmation"] is True


def test_browser_action_happy_path(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    token = issue_confirmation_token("browser navigate")
    r = client.post(
        "/api/browser/action",
        json={
            "action": "navigate",
            "url": "https://example.com",
            "policyConfirmationToken": token,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["actionId"]
    assert body["snapshotText"]

    cached = client.get(f"/api/browser/action/{body['actionId']}")
    assert cached.status_code == 200
    assert cached.json()["actionId"] == body["actionId"]


def test_browser_action_get_not_found(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/browser/action/missing-id")
    assert r.status_code == 404


def test_browser_sessions_stub(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/browser/sessions")
    assert r.status_code == 200
    sessions = r.json()["sessions"]
    assert len(sessions) >= 1
    assert sessions[0]["id"]


def test_browser_action_links_workflow(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    plan = client.post("/api/orchestration/plan", json={"task": "click the login button in browser"})
    assert plan.status_code == 200
    workflow_id = plan.json()["workflowId"]
    assert plan.json()["browserPreflightRequired"] is True

    token = issue_confirmation_token("browser click")
    r = client.post(
        "/api/browser/action",
        json={
            "action": "click",
            "selector": "@e1",
            "workflowId": workflow_id,
            "policyConfirmationToken": token,
        },
    )
    assert r.status_code == 200
    action_id = r.json()["actionId"]

    wf = client.get(f"/api/orchestration/{workflow_id}")
    assert wf.status_code == 200
    assert wf.json()["browserActionId"] == action_id


def test_browser_emits_observability_event(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    token = issue_confirmation_token("browser snapshot")
    client.post(
        "/api/browser/action",
        json={
            "action": "snapshot",
            "url": "https://example.com",
            "policyConfirmationToken": token,
        },
    )
    log_path = events_log_path()
    assert log_path.is_file()
    events = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    browser_events = [e for e in events if e.get("layer") == "browser"]
    assert browser_events
    redacted = browser_events[-1].get("inputsRedacted", {})
    assert redacted.get("action") == "snapshot"
    assert redacted.get("urlDomain") == "example.com"


def test_browser_analyze_still_requires_confirmation(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)

    async def _no_exec(*_a, **_kw):
        raise AssertionError("subprocess should not run")

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", _no_exec)
    r = client.post("/api/browser/analyze", json={"visibleText": "Some page text"})
    assert r.status_code == 403


def test_browser_analyze_policy_action_string() -> None:
    assert browser_policy_action(BrowserActionType.NAVIGATE) == "browser navigate"
