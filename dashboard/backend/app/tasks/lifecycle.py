"""Workflow hooks for linked daily tasks."""

from __future__ import annotations

from pathlib import Path

from app.orchestration.models import OrchestratorMode, StepStatus, WorkflowState
from app.tasks.models import TaskCreate, TaskStatus
from app.tasks.store import FileTasksStore


def create_task_for_workflow(
    workspace: Path,
    workflow: WorkflowState,
    *,
    run_id: str = "",
) -> str | None:
    """Create a pending task linked to a planned workflow; returns task id."""
    store = FileTasksStore(root=workspace)
    task = store.create(
        TaskCreate(
            title=workflow.task[:200],
            description=f"Orchestrated workflow {workflow.workflow_id}",
            workflow_id=workflow.workflow_id,
            run_id=run_id or workflow.run_id,
        )
    )
    return task.id


def mark_linked_task_done(
    workspace: Path,
    workflow: WorkflowState,
    *,
    task_id: str | None = None,
) -> None:
    """Mark workflow-linked task done when workflow completes."""
    if workflow.status != StepStatus.COMPLETED:
        return
    store = FileTasksStore(root=workspace)
    target_id = task_id or getattr(workflow, "task_id", None)
    if target_id:
        try:
            store.mark_done(target_id)
            return
        except LookupError:
            pass
    if not workflow.workflow_id:
        return
    for task in store.list_tasks(include_snoozed=True):
        if task.workflow_id == workflow.workflow_id and task.status != TaskStatus.DONE:
            store.mark_done(task.id)
            return
