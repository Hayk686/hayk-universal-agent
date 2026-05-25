"""Pydantic models for Hayk memory capability."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryEntry(BaseModel):
    """Indexed snippet from Hermes MEMORY.md or workflow metadata."""

    id: str
    source: str = Field(description="hermes-memory | workflow | active-context")
    title: str = ""
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    updated_at: str = Field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "title": self.title,
            "content": self.content,
            "tags": self.tags,
            "updatedAt": self.updated_at,
        }


class ActiveContext(BaseModel):
    """Current operator/agent focus persisted under .hermes/memory/."""

    title: str = ""
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    recent_workflow_ids: list[str] = Field(default_factory=list)
    recent_run_ids: list[str] = Field(default_factory=list)
    updated_at: str = Field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "summary": self.summary,
            "keyPoints": self.key_points,
            "recentWorkflowIds": self.recent_workflow_ids,
            "recentRunIds": self.recent_run_ids,
            "updatedAt": self.updated_at,
        }


class MemorySummary(BaseModel):
    """Structured summary from memory index + recent workflows."""

    title: str
    key_points: list[str] = Field(default_factory=list)
    entry_count: int = 0
    recent_workflows: list[dict[str, Any]] = Field(default_factory=list)
    active_context: ActiveContext | None = None
    generated_at: str = Field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "keyPoints": self.key_points,
            "entryCount": self.entry_count,
            "recentWorkflows": self.recent_workflows,
            "activeContext": self.active_context.to_dict() if self.active_context else None,
            "generatedAt": self.generated_at,
        }
