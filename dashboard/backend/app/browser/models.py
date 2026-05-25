"""Pydantic models for gated browser driver actions."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class BrowserActionType(str, Enum):
    NAVIGATE = "navigate"
    CLICK = "click"
    FILL = "fill"
    SNAPSHOT = "snapshot"
    SCREENSHOT = "screenshot"


class BrowserActionRequest(BaseModel):
    action: BrowserActionType
    url: str | None = None
    selector: str | None = None
    value: str | None = None
    session_profile: str | None = None
    timeout_seconds: float = Field(default=15.0, ge=1.0, le=120.0)
    workflow_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "url": self.url,
            "selector": self.selector,
            "value": self.value,
            "sessionProfile": self.session_profile,
            "timeoutSeconds": self.timeout_seconds,
            "workflowId": self.workflow_id,
        }


class BrowserActionResult(BaseModel):
    action_id: str
    success: bool
    snapshot_text: str | None = None
    screenshot_path: str | None = None
    error: str | None = None
    duration_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "actionId": self.action_id,
            "success": self.success,
            "snapshotText": self.snapshot_text,
            "screenshotPath": self.screenshot_path,
            "error": self.error,
            "durationMs": self.duration_ms,
        }


class BrowserSessionProfile(BaseModel):
    id: str
    name: str
    user_agent: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "userAgent": self.user_agent,
        }
