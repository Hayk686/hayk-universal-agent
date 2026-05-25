"""API integration tests for daily tasks endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app
from app.policy.confirmation import issue_confirmation_token
from app.tasks.models import TaskCreate
from app.tasks.store import FileTasksStore


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    yield
    app.dependency_overrides.clear()


def _client(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    return TestClient(app)


def test_capabilities_daily_tasks(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    assert r.json()["dailyTasks"] is True


def test_create_and_list_tasks(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    created = client.post("/api/tasks", json={"title": "Ship slice 4", "description": "tasks"})
    assert created.status_code == 200
    task_id = created.json()["id"]
    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    ids = [t["id"] for t in listed.json()["tasks"]]
    assert task_id in ids


def test_get_update_done_task(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    created = client.post("/api/tasks", json={"title": "Lifecycle"})
    task_id = created.json()["id"]
    got = client.get(f"/api/tasks/{task_id}")
    assert got.status_code == 200
    patched = client.patch(f"/api/tasks/{task_id}", json={"title": "Updated"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Updated"
    done = client.post(f"/api/tasks/{task_id}/done", json={})
    assert done.status_code == 200
    assert done.json()["status"] == "done"


def test_snooze_task_minutes(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    created = client.post("/api/tasks", json={"title": "Snooze me"})
    task_id = created.json()["id"]
    r = client.post(f"/api/tasks/{task_id}/snooze", json={"minutes": 30})
    assert r.status_code == 200
    assert r.json()["status"] == "snoozed"
    assert r.json()["snoozedUntil"] is not None
    hidden = client.get("/api/tasks")
    assert all(t["id"] != task_id for t in hidden.json()["tasks"])
    shown = client.get("/api/tasks", params={"include_snoozed": True})
    assert any(t["id"] == task_id for t in shown.json()["tasks"])


def test_delete_requires_confirmation(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    created = client.post("/api/tasks", json={"title": "Delete me"})
    task_id = created.json()["id"]
    denied = client.delete(f"/api/tasks/{task_id}")
    assert denied.status_code == 403
    token = issue_confirmation_token("write task delete")
    ok = client.delete(f"/api/tasks/{task_id}", params={"policy_confirmation_token": token})
    assert ok.status_code == 200
    assert ok.json()["deleted"] is True
    assert client.get(f"/api/tasks/{task_id}").status_code == 404


def test_orchestration_creates_and_completes_linked_task(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _client(workspace, monkeypatch)
    plan = client.post(
        "/api/orchestration/plan",
        json={"task": "Long session work item", "createTask": True},
    )
    assert plan.status_code == 200
    body = plan.json()
    task_id = body.get("taskId")
    assert task_id
    wf_id = body["workflowId"]
    client.post(f"/api/orchestration/{wf_id}/execute", json={})
    completed = client.post(f"/api/orchestration/{wf_id}/execute", json={})
    assert completed.json()["status"] == "completed"
    task = client.get(f"/api/tasks/{task_id}").json()
    assert task["status"] == "done"
    assert task["workflowId"] == wf_id


def test_filter_tasks_by_status(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = FileTasksStore(root=workspace)
    t1 = store.create(TaskCreate(title="Open"))
    store.mark_done(t1.id)
    client = _client(workspace, monkeypatch)
    r = client.get("/api/tasks", params={"status": "pending"})
    assert r.status_code == 200
    assert r.json()["tasks"] == []
