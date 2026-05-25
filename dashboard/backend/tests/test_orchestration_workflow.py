"""Tests for orchestrator plan → execute → pause → resume."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app
from app.orchestration.models import OrchestratorMode, StepStatus
from app.orchestration.orchestrator import Orchestrator, WorkflowPausedError
from app.orchestration.workflow_store import FileWorkflowStore
from app.policy.confirmation import issue_confirmation_token


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def orch(workspace: Path) -> Orchestrator:
    return Orchestrator(FileWorkflowStore(root=workspace))


def test_plan_creates_two_steps(orch: Orchestrator) -> None:
    wf = orch.plan("What is HTTP?", run_id="run-1")
    assert wf.mode == OrchestratorMode.FAST
    assert len(wf.steps) == 2
    assert wf.steps[0].status == StepStatus.PENDING
    assert wf.steps[0].action == "policy pre-check"


def test_execute_advances_through_steps(orch: Orchestrator) -> None:
    wf = orch.plan("What is HTTP?")
    wf = orch.execute_step(wf.workflow_id)
    assert wf.steps[0].status == StepStatus.COMPLETED
    assert wf.steps[1].status == StepStatus.PENDING
    wf = orch.execute_step(wf.workflow_id)
    assert wf.steps[1].status == StepStatus.COMPLETED
    assert wf.status == StepStatus.COMPLETED


def test_pause_blocks_execute(orch: Orchestrator) -> None:
    wf = orch.plan("Plan file migration steps")
    orch.pause(wf.workflow_id)
    with pytest.raises(WorkflowPausedError):
        orch.execute_step(wf.workflow_id)
    resumed = orch.resume(wf.workflow_id)
    assert resumed.paused is False
    assert resumed.status == StepStatus.PENDING


def test_pause_marks_running_step_paused(orch: Orchestrator) -> None:
    wf = orch.plan("Diagnose broken agent logs")
    orch.execute_step(wf.workflow_id)
    wf = orch.get(wf.workflow_id)
    wf.steps[1].status = StepStatus.RUNNING
    orch._store.save(wf)
    paused = orch.pause(wf.workflow_id)
    assert paused.steps[1].status == StepStatus.PAUSED
    assert paused.status == StepStatus.PAUSED


def test_web_step_requires_confirmation_without_token(orch: Orchestrator) -> None:
    wf = orch.plan("Search the web for Hayk agent docs")
    assert wf.mode == OrchestratorMode.WEB
    orch.execute_step(wf.workflow_id)
    wf = orch.execute_step(wf.workflow_id)
    assert wf.steps[1].status == StepStatus.FAILED
    assert "confirmation" in (wf.steps[1].error or "").lower()


def test_web_step_succeeds_with_token(
    orch: Orchestrator, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    token = issue_confirmation_token("network web-send")
    wf = orch.plan("Search the web for Hayk agent docs")
    orch.execute_step(wf.workflow_id)
    wf = orch.execute_step(wf.workflow_id, confirmation_token=token)
    assert wf.steps[1].status == StepStatus.COMPLETED


def test_orchestration_api_plan_and_get(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    client = TestClient(app)
    r = client.post("/api/orchestration/plan", json={"task": "Explain REST"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "fast"
    assert len(body["steps"]) == 2
    wf_id = body["workflowId"]
    r2 = client.get(f"/api/orchestration/{wf_id}")
    assert r2.status_code == 200
    assert r2.json()["task"] == "Explain REST"


def test_orchestration_api_pause_resume(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    client = TestClient(app)
    wf_id = client.post("/api/orchestration/plan", json={"task": "Plan steps"}).json()["workflowId"]
    r_pause = client.post(f"/api/orchestration/{wf_id}/pause")
    assert r_pause.status_code == 200
    assert r_pause.json()["paused"] is True
    r_exec = client.post(f"/api/orchestration/{wf_id}/execute", json={})
    assert r_exec.status_code == 409
    r_resume = client.post(f"/api/orchestration/{wf_id}/resume")
    assert r_resume.status_code == 200
    assert r_resume.json()["paused"] is False


def test_orchestration_list_workflows(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    client = TestClient(app)
    client.post("/api/orchestration/plan", json={"task": "One"})
    client.post("/api/orchestration/plan", json={"task": "Two"})
    listed = client.get("/api/orchestration").json()["workflows"]
    assert len(listed) == 2
