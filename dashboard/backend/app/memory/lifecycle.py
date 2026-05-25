"""Workflow completion hooks for memory and artifacts."""

from __future__ import annotations

from pathlib import Path

from app.artifacts.index import FileArtifactIndex
from app.artifacts.models import ArtifactKind
from app.memory.store import FileMemoryStore
from app.memory.summarizer import update_active_context_from_workflow
from app.orchestration.models import StepStatus, WorkflowState
from app.orchestration.workflow_store import FileWorkflowStore, workflows_dir


def on_workflow_completed(
    workspace: Path,
    workflow: WorkflowState,
    *,
    run_id: str = "",
) -> None:
    """Update active context and register workflow artifact when a workflow finishes."""
    if workflow.status != StepStatus.COMPLETED:
        return

    memory = FileMemoryStore(root=workspace)
    active = memory.get_active_context()
    memory.set_active_context(
        update_active_context_from_workflow(active, workflow, run_id=run_id)
    )

    artifacts = FileArtifactIndex(root=workspace)
    rel = f".hermes/workflows/{workflow.workflow_id}.json"
    wf_path = workflows_dir(workspace) / f"{workflow.workflow_id}.json"
    if wf_path.is_file():
        artifacts.register_artifact(
            path=rel,
            kind=ArtifactKind.WORKFLOW,
            run_id=run_id or workflow.run_id,
            workflow_id=workflow.workflow_id,
            summary=f"Completed workflow: {workflow.task[:120]}",
        )
