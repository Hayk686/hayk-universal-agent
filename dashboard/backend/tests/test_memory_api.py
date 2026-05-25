"""API integration tests for memory and artifact endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app
from app.memory.models import ActiveContext
from app.memory.store import FileMemoryStore
from app.policy.confirmation import issue_confirmation_token


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


def test_capabilities_memory_and_artifacts(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["memoryIndex"] is True
    assert body["artifactsIndex"] is True


def test_get_active_context_default(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/memory/active-context")
    assert r.status_code == 200
    assert r.json()["title"] == ""


def test_put_active_context_requires_confirmation(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _client(workspace, monkeypatch)
    r = client.put(
        "/api/memory/active-context",
        json={"title": "Ops", "summary": "Focus", "keyPoints": ["slice3"]},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["policy"]["requiresConfirmation"] is True


def test_put_active_context_with_token(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _client(workspace, monkeypatch)
    token = issue_confirmation_token("write memory active-context")
    r = client.put(
        "/api/memory/active-context",
        json={
            "title": "Ops",
            "summary": "Focus",
            "keyPoints": ["slice3"],
            "policyConfirmationToken": token,
        },
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Ops"
    r2 = client.get("/api/memory/active-context")
    assert r2.json()["keyPoints"] == ["slice3"]


def test_memory_summary_endpoint(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    FileMemoryStore(root=workspace).set_active_context(
        ActiveContext(title="Summary test", key_points=["one"])
    )
    client = _client(workspace, monkeypatch)
    r = client.get("/api/memory/summary")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Summary test"
    assert "keyPoints" in body
    assert body["entryCount"] >= 0


def test_list_artifacts_empty_then_scan(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (workspace / "output" / "a.txt").write_text("a", encoding="utf-8")
    client = _client(workspace, monkeypatch)
    r = client.get("/api/artifacts")
    assert r.status_code == 200
    arts = r.json()["artifacts"]
    assert any(a["path"] == "output/a.txt" for a in arts)


def test_list_artifacts_filter_run_id(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.artifacts.index import FileArtifactIndex

    FileArtifactIndex(root=workspace).register_artifact(path="output/x.txt", run_id="run-42")
    client = _client(workspace, monkeypatch)
    r = client.get("/api/artifacts", params={"run_id": "run-42"})
    assert r.status_code == 200
    assert all(a.get("runId") == "run-42" for a in r.json()["artifacts"])


def test_list_artifacts_filter_workflow_id(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.artifacts.index import FileArtifactIndex

    FileArtifactIndex(root=workspace).register_artifact(
        path=".hermes/workflows/wf-1.json",
        workflow_id="wf-1",
    )
    client = _client(workspace, monkeypatch)
    r = client.get("/api/artifacts", params={"workflow_id": "wf-1"})
    assert r.status_code == 200
    assert len(r.json()["artifacts"]) >= 1


def test_get_artifact_with_preview(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.artifacts.index import FileArtifactIndex

    (workspace / "output" / "preview.txt").write_text("hello preview", encoding="utf-8")
    rec = FileArtifactIndex(root=workspace).register_artifact(path="output/preview.txt")
    client = _client(workspace, monkeypatch)
    r = client.get(f"/api/artifacts/{rec.id}", params={"preview": True})
    assert r.status_code == 200
    assert "hello preview" in r.json().get("contentPreview", "")


def test_get_artifact_not_found(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/artifacts/missing-id")
    assert r.status_code == 404


def test_orchestration_completion_updates_memory(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _client(workspace, monkeypatch)
    plan = client.post("/api/orchestration/plan", json={"task": "What is HTTP?"})
    assert plan.status_code == 200
    wf_id = plan.json()["workflowId"]
    e1 = client.post(f"/api/orchestration/{wf_id}/execute", json={})
    e2 = client.post(f"/api/orchestration/{wf_id}/execute", json={})
    assert e1.status_code == 200
    assert e2.status_code == 200
    assert e2.json()["status"] == "completed"
    ctx = client.get("/api/memory/active-context").json()
    assert wf_id in ctx.get("recentWorkflowIds", [])
