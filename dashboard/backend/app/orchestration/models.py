"""Pydantic models for workflow orchestration."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class OrchestratorMode(str, Enum):
    FAST = "fast"
    WEB = "web"
    SESSION = "session"


class WorkflowStep(BaseModel):
    id: str
    title: str
    action: str
    status: StepStatus = StepStatus.PENDING
    mode: OrchestratorMode
    result: str | None = None
    error: str | None = None
    policy_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "action": self.action,
            "status": self.status.value,
            "mode": self.mode.value,
            "result": self.result,
            "error": self.error,
            "policyReason": self.policy_reason,
        }


class WorkflowState(BaseModel):
    workflow_id: str
    task: str
    mode: OrchestratorMode
    playbook_mode: str
    routing_reason: str = ""
    status: StepStatus = StepStatus.PENDING
    steps: list[WorkflowStep] = Field(default_factory=list)
    run_id: str | None = None
    task_id: str | None = None
    research_query_id: str | None = None
    browser_preflight_required: bool = False
    browser_action_id: str | None = None
    paused: bool = False
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    def to_dict(self) -> dict[str, Any]:
        return {
            "workflowId": self.workflow_id,
            "task": self.task,
            "mode": self.mode.value,
            "playbookMode": self.playbook_mode,
            "routingReason": self.routing_reason,
            "status": self.status.value,
            "steps": [s.to_dict() for s in self.steps],
            "runId": self.run_id,
            "taskId": self.task_id,
            "researchQueryId": self.research_query_id,
            "browserPreflightRequired": self.browser_preflight_required,
            "browserActionId": self.browser_action_id,
            "paused": self.paused,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
