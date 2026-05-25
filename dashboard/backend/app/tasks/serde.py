"""JSON serialization for tasks store — shared schema for backend and CLI."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tasks.models import Task, TaskPriority, TaskStatus


def task_from_dict(data: dict[str, Any]) -> Task:
    priority_raw = data.get("priority")
    priority = TaskPriority(priority_raw) if priority_raw else None
    return Task(
        id=str(data["id"]),
        title=str(data.get("title") or ""),
        description=str(data.get("description") or ""),
        status=TaskStatus(data.get("status") or TaskStatus.PENDING.value),
        priority=priority,
        due_at=data.get("due_at") or data.get("dueAt"),
        snoozed_until=data.get("snoozed_until") or data.get("snoozedUntil"),
        created_at=str(data.get("created_at") or data.get("createdAt") or ""),
        updated_at=str(data.get("updated_at") or data.get("updatedAt") or ""),
        workflow_id=data.get("workflow_id") or data.get("workflowId"),
        run_id=data.get("run_id") or data.get("runId"),
    )


def task_to_dict(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status.value,
        "priority": task.priority.value if task.priority else None,
        "due_at": task.due_at,
        "snoozed_until": task.snoozed_until,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "workflow_id": task.workflow_id,
        "run_id": task.run_id,
    }


def load_tasks_file(path: Path) -> list[Task]:
    if not path.is_file():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        items = raw.get("tasks") or []
    else:
        return []
    return [task_from_dict(item) for item in items if isinstance(item, dict)]


def save_tasks_file(path: Path, tasks: list[Task]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "tasks": [task_to_dict(t) for t in tasks]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
