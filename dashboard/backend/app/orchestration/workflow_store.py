"""Workflow persistence — ABC and file-backed implementation."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path

from app.config import get_workspace_root
from app.orchestration.models import (
    OrchestratorMode,
    StepStatus,
    WorkflowState,
    WorkflowStep,
)


class WorkflowStore(ABC):
    @abstractmethod
    def save(self, workflow: WorkflowState) -> None:
        ...

    @abstractmethod
    def load(self, workflow_id: str) -> WorkflowState | None:
        ...

    @abstractmethod
    def list_ids(self) -> list[str]:
        ...

    @abstractmethod
    def delete(self, workflow_id: str) -> bool:
        ...


def workflows_dir(root: Path | None = None) -> Path:
    ws = root or get_workspace_root()
    return ws / ".hermes" / "workflows"


class FileWorkflowStore(WorkflowStore):
    """Persist workflows as JSON under ``agent-workspace/.hermes/workflows/``."""

    def __init__(self, root: Path | None = None) -> None:
        self._root = root

    def _dir(self) -> Path:
        d = workflows_dir(self._root)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _path(self, workflow_id: str) -> Path:
        safe_id = workflow_id.replace("/", "_").replace("\\", "_")
        return self._dir() / f"{safe_id}.json"

    def save(self, workflow: WorkflowState) -> None:
        path = self._path(workflow.workflow_id)
        path.write_text(
            json.dumps(workflow.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def load(self, workflow_id: str) -> WorkflowState | None:
        path = self._path(workflow_id)
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return _workflow_from_dict(data)

    def list_ids(self) -> list[str]:
        d = self._dir()
        if not d.is_dir():
            return []
        return sorted(p.stem for p in d.glob("*.json"))

    def delete(self, workflow_id: str) -> bool:
        path = self._path(workflow_id)
        if not path.is_file():
            return False
        path.unlink()
        return True


def _workflow_from_dict(data: dict) -> WorkflowState:
    steps = [
        WorkflowStep(
            id=s["id"],
            title=s["title"],
            action=s["action"],
            status=StepStatus(s["status"]),
            mode=OrchestratorMode(s["mode"]),
            result=s.get("result"),
            error=s.get("error"),
            policy_reason=s.get("policy_reason") or s.get("policyReason"),
        )
        for s in data.get("steps") or []
    ]
    return WorkflowState(
        workflow_id=data.get("workflow_id") or data.get("workflowId") or "",
        task=data.get("task") or "",
        mode=OrchestratorMode(data.get("mode") or OrchestratorMode.FAST.value),
        playbook_mode=data.get("playbook_mode") or data.get("playbookMode") or "",
        routing_reason=data.get("routing_reason") or data.get("routingReason") or "",
        status=StepStatus(data.get("status") or StepStatus.PENDING.value),
        steps=steps,
        run_id=data.get("run_id") or data.get("runId"),
        task_id=data.get("task_id") or data.get("taskId"),
        research_query_id=data.get("research_query_id") or data.get("researchQueryId"),
        browser_preflight_required=bool(
            data.get("browser_preflight_required") or data.get("browserPreflightRequired")
        ),
        browser_action_id=data.get("browser_action_id") or data.get("browserActionId"),
        paused=bool(data.get("paused")),
        created_at=data.get("created_at") or data.get("createdAt") or "",
        updated_at=data.get("updated_at") or data.get("updatedAt") or "",
    )
