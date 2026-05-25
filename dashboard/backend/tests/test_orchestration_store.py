"""Tests for file-backed workflow store."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.orchestration.models import OrchestratorMode, StepStatus, WorkflowState, WorkflowStep
from app.orchestration.workflow_store import FileWorkflowStore, workflows_dir


def _sample_workflow(workflow_id: str = "wf-test-1") -> WorkflowState:
    return WorkflowState(
        workflow_id=workflow_id,
        task="Explain Python",
        mode=OrchestratorMode.FAST,
        playbook_mode="Chat",
        routing_reason="test",
        status=StepStatus.PENDING,
        steps=[
            WorkflowStep(
                id="1",
                title="Policy pre-check",
                action="policy pre-check",
                status=StepStatus.PENDING,
                mode=OrchestratorMode.FAST,
            ),
        ],
        run_id="run-abc",
    )


def test_workflows_dir_under_workspace(workspace: Path) -> None:
    assert workflows_dir(workspace) == workspace / ".hermes" / "workflows"


def test_save_and_load_roundtrip(workspace: Path) -> None:
    store = FileWorkflowStore(root=workspace)
    wf = _sample_workflow()
    store.save(wf)
    loaded = store.load(wf.workflow_id)
    assert loaded is not None
    assert loaded.workflow_id == wf.workflow_id
    assert loaded.task == wf.task
    assert loaded.mode == OrchestratorMode.FAST
    assert len(loaded.steps) == 1
    assert loaded.steps[0].status == StepStatus.PENDING
    assert loaded.run_id == "run-abc"


def test_list_ids_returns_saved_workflows(workspace: Path) -> None:
    store = FileWorkflowStore(root=workspace)
    store.save(_sample_workflow("alpha"))
    store.save(_sample_workflow("beta"))
    assert store.list_ids() == ["alpha", "beta"]


def test_load_missing_returns_none(workspace: Path) -> None:
    store = FileWorkflowStore(root=workspace)
    assert store.load("missing") is None


def test_delete_removes_file(workspace: Path) -> None:
    store = FileWorkflowStore(root=workspace)
    wf = _sample_workflow("to-delete")
    store.save(wf)
    assert store.delete("to-delete") is True
    assert store.load("to-delete") is None
    assert store.delete("to-delete") is False


def test_creates_workflows_directory_on_save(workspace: Path) -> None:
    store = FileWorkflowStore(root=workspace)
    d = workflows_dir(workspace)
    if d.exists():
        import shutil

        shutil.rmtree(d)
    store.save(_sample_workflow())
    assert d.is_dir()
