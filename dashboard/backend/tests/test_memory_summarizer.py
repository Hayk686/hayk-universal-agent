"""Tests for deterministic memory summarizer."""

from __future__ import annotations

from app.memory.models import ActiveContext, MemoryEntry
from app.memory.summarizer import build_memory_summary, update_active_context_from_workflow
from app.orchestration.models import OrchestratorMode, StepStatus, WorkflowState, WorkflowStep


def test_update_active_context_from_workflow() -> None:
    active = ActiveContext(title="Prior", key_points=["old"])
    wf = WorkflowState(
        workflow_id="wf-1",
        task="Build memory index for Hayk dashboard.",
        mode=OrchestratorMode.FAST,
        playbook_mode="Chat",
        status=StepStatus.COMPLETED,
        steps=[],
        run_id="run-9",
    )
    updated = update_active_context_from_workflow(active, wf, run_id="run-9")
    assert "wf-1" in updated.recent_workflow_ids
    assert "run-9" in updated.recent_run_ids
    assert len(updated.key_points) >= 1


def test_build_memory_summary() -> None:
    active = ActiveContext(title="Workspace", key_points=["a"])
    entries = [MemoryEntry(id="1", source="hermes-memory", title="Goals", content="x")]
    wf = WorkflowState(
        workflow_id="w",
        task="t",
        mode=OrchestratorMode.FAST,
        playbook_mode="Chat",
        status=StepStatus.COMPLETED,
        steps=[],
    )
    summary = build_memory_summary(active=active, entries=entries, recent_workflows=[wf])
    assert summary.title == "Workspace"
    assert summary.entry_count == 1
    assert len(summary.recent_workflows) == 1
