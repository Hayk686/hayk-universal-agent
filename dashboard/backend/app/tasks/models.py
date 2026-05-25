"""Pydantic models for Hayk daily tasks capability."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    SNOOZED = "snoozed"
    CANCELLED = "cancelled"


class TaskPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


class Task(BaseModel):
    id: str
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority | None = None
    due_at: str | None = None
    snoozed_until: str | None = None
    created_at: str = Field(default_factory=_utc_now)
    updated_at: str = Field(default_factory=_utc_now)
    workflow_id: str | None = None
    run_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status.value,
            "priority": self.priority.value if self.priority else None,
            "dueAt": self.due_at,
            "snoozedUntil": self.snoozed_until,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "workflowId": self.workflow_id,
            "runId": self.run_id,
        }


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: TaskPriority | None = None
    due_at: str | None = None
    workflow_id: str | None = None
    run_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: str | None = None


class TaskSnoozeRequest(BaseModel):
    until: str | None = None
    minutes: int | None = None
