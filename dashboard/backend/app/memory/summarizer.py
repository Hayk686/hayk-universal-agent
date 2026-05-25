"""Deterministic memory summary builder (no LLM)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.memory.models import ActiveContext, MemoryEntry, MemorySummary
from app.orchestration.models import StepStatus, WorkflowState


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_key_points_from_task(task: str, *, max_points: int = 5) -> list[str]:
    text = task.strip()
    if not text:
        return []
    sentences = re.split(r"[.!?]\s+", text)
    points: list[str] = []
    for s in sentences:
        s = s.strip()
        if len(s) < 8:
            continue
        if len(s) > 120:
            s = s[:117] + "…"
        points.append(s)
        if len(points) >= max_points:
            break
    if not points and text:
        points.append(text[:120] + ("…" if len(text) > 120 else ""))
    return points


def _workflow_summary_row(wf: WorkflowState) -> dict[str, Any]:
    return {
        "workflowId": wf.workflow_id,
        "task": wf.task[:200] + ("…" if len(wf.task) > 200 else ""),
        "mode": wf.mode.value,
        "status": wf.status.value,
        "runId": wf.run_id,
        "updatedAt": wf.updated_at,
    }


def build_memory_summary(
    *,
    active: ActiveContext,
    entries: list[MemoryEntry],
    recent_workflows: list[WorkflowState],
) -> MemorySummary:
    title = active.title or "Workspace memory"
    key_points = list(active.key_points)
    for wf in recent_workflows[:3]:
        if wf.status == StepStatus.COMPLETED:
            key_points.append(f"Completed {wf.mode.value} workflow: {wf.task[:80]}")
    for entry in entries[:5]:
        if entry.title and entry.title not in key_points:
            key_points.append(entry.title)
    key_points = key_points[:12]

    return MemorySummary(
        title=title,
        key_points=key_points,
        entry_count=len(entries),
        recent_workflows=[_workflow_summary_row(w) for w in recent_workflows[:10]],
        active_context=active,
        generated_at=_utc_now(),
    )


def update_active_context_from_workflow(
    active: ActiveContext,
    workflow: WorkflowState,
    *,
    run_id: str = "",
) -> ActiveContext:
    """Merge workflow completion into active context (deterministic)."""
    points = _extract_key_points_from_task(workflow.task)
    merged_points = list(active.key_points)
    for p in points:
        if p not in merged_points:
            merged_points.append(p)
    merged_points = merged_points[-15:]

    wf_ids = [workflow.workflow_id, *active.recent_workflow_ids]
    wf_ids = list(dict.fromkeys(wf_ids))[:20]

    run_ids = list(active.recent_run_ids)
    rid = run_id or workflow.run_id
    if rid and rid not in run_ids:
        run_ids = [rid, *run_ids][:20]

    title = active.title or workflow.task[:80]
    summary = active.summary
    if workflow.status == StepStatus.COMPLETED:
        summary = f"Last completed: {workflow.task[:160]}"
    elif workflow.status == StepStatus.FAILED:
        summary = f"Last failed: {workflow.task[:120]}"

    return ActiveContext(
        title=title,
        summary=summary,
        key_points=merged_points,
        recent_workflow_ids=wf_ids,
        recent_run_ids=run_ids,
        updated_at=_utc_now(),
    )
