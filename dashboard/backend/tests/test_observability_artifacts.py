"""Tests for artifact registration from observability events."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.artifacts.index import FileArtifactIndex
from app.observability.events import emit_event


def test_emit_event_registers_artifact_path(
    workspace: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))
    events = tmp_path / "events.jsonl"
    monkeypatch.setenv("POLICY_EVENTS_PATH", str(events))
    (workspace / "output" / "from-event.txt").write_text("x", encoding="utf-8")

    emit_event(
        run_id="run-art",
        layer="tool",
        decision="write",
        reason="test",
        inputs_redacted={"path": "output/from-event.txt", "workflowId": "wf-1"},
        outcome="completed",
    )

    idx = FileArtifactIndex(root=workspace)
    matches = [r for r in idx.list_artifacts(run_id="run-art") if r.path == "output/from-event.txt"]
    assert len(matches) >= 1
