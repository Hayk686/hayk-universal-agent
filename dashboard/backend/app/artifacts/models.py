"""Pydantic models for artifact indexing."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ArtifactKind(str, Enum):
    REPORT = "report"
    OUTPUT = "output"
    INPUT = "input"
    LOG = "log"
    WORKFLOW = "workflow"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ArtifactRecord(BaseModel):
    id: str
    run_id: str | None = None
    workflow_id: str | None = None
    path: str
    kind: ArtifactKind
    created_at: str = Field(default_factory=_utc_now)
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "runId": self.run_id,
            "workflowId": self.workflow_id,
            "path": self.path,
            "kind": self.kind.value,
            "createdAt": self.created_at,
            "summary": self.summary,
        }
