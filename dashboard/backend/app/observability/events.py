"""Structured policy/observability events as JSON lines."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_workspace_root

logger = logging.getLogger(__name__)

_EVENT_ENV = "POLICY_EVENTS_PATH"


def events_log_path() -> Path:
    override = os.environ.get(_EVENT_ENV, "").strip()
    if override:
        return Path(override).expanduser()
    ws = get_workspace_root()
    return ws / "logs" / "policy-events.jsonl"


def _redact_mapping(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, str) and len(value) > 500:
            out[key] = value[:500] + "…[truncated]"
        elif isinstance(value, dict):
            out[key] = _redact_mapping(value)
        else:
            out[key] = value
    return out


def _maybe_register_artifact_from_event(
    *,
    run_id: str,
    inputs_redacted: dict[str, Any],
    outcome: str,
) -> None:
    """Register workspace artifact when event payload includes a path reference."""
    path_val = (
        inputs_redacted.get("artifactPath")
        or inputs_redacted.get("path")
        or inputs_redacted.get("filePath")
    )
    if not path_val or not isinstance(path_val, str):
        return
    if outcome in ("denied", "deny", "failed", "confirm_failed"):
        return
    try:
        from app.artifacts.index import FileArtifactIndex, infer_kind_from_path

        idx = FileArtifactIndex()
        idx.register_artifact(
            path=path_val.strip().replace("\\", "/").lstrip("/"),
            kind=infer_kind_from_path(path_val),
            run_id=run_id if run_id and run_id != "unknown" else None,
            workflow_id=str(inputs_redacted.get("workflowId") or "") or None,
            summary=f"Registered from {outcome} event",
        )
    except OSError as exc:
        logger.warning("Artifact registration skipped: %s", exc)


def emit_event(
    *,
    run_id: str,
    layer: str,
    decision: str,
    reason: str,
    inputs_redacted: dict[str, Any] | None = None,
    outcome: str,
) -> None:
    """Append one JSON event line to ``logs/policy-events.jsonl`` under workspace."""
    redacted = _redact_mapping(inputs_redacted or {})
    event = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "runId": run_id,
        "layer": layer,
        "decision": decision,
        "reason": reason,
        "inputsRedacted": redacted,
        "outcome": outcome,
    }
    line = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    path = events_log_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError as exc:
        logger.warning("Failed to write policy event to %s: %s", path, exc)
    logger.info("policy_event %s", line)
    _maybe_register_artifact_from_event(
        run_id=run_id,
        inputs_redacted=redacted,
        outcome=outcome,
    )
