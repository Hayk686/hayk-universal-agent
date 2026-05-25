"""Tests for artifact index."""

from __future__ import annotations

from pathlib import Path

from app.artifacts.index import FileArtifactIndex, InMemoryArtifactIndex
from app.artifacts.models import ArtifactKind


def test_in_memory_register_and_get() -> None:
    idx = InMemoryArtifactIndex()
    rec = idx.register_artifact(path="output/report.txt", run_id="run-1", summary="report")
    assert rec.kind == ArtifactKind.OUTPUT
    got = idx.get(rec.id)
    assert got is not None
    assert got.run_id == "run-1"


def test_in_memory_filter_by_run_id() -> None:
    idx = InMemoryArtifactIndex()
    idx.register_artifact(path="output/a.txt", run_id="r1")
    idx.register_artifact(path="output/b.txt", run_id="r2")
    assert len(idx.list_artifacts(run_id="r1")) == 1


def test_in_memory_filter_by_workflow_id() -> None:
    idx = InMemoryArtifactIndex()
    idx.register_artifact(path=".hermes/workflows/wf.json", workflow_id="wf-abc")
    idx.register_artifact(path="output/x.txt", workflow_id=None)
    assert len(idx.list_artifacts(workflow_id="wf-abc")) == 1


def test_file_index_persists_jsonl(workspace: Path) -> None:
    idx = FileArtifactIndex(root=workspace)
    rec = idx.register_artifact(path="reports/summary.md", kind=ArtifactKind.REPORT)
    idx2 = FileArtifactIndex(root=workspace)
    loaded = idx2.get(rec.id)
    assert loaded is not None
    assert loaded.path == "reports/summary.md"


def test_file_index_dedupes_same_path(workspace: Path) -> None:
    idx = FileArtifactIndex(root=workspace)
    r1 = idx.register_artifact(path="output/dup.txt")
    r2 = idx.register_artifact(path="output/dup.txt")
    assert r1.id == r2.id


def test_scan_workspace_indexes_dirs(workspace: Path) -> None:
    (workspace / "output" / "result.txt").write_text("ok", encoding="utf-8")
    (workspace / "reports" / "r.md").write_text("# R", encoding="utf-8")
    (workspace / "logs").mkdir(parents=True, exist_ok=True)
    (workspace / "logs" / "policy-events.jsonl").write_text("{}\n", encoding="utf-8")

    idx = FileArtifactIndex(root=workspace)
    added = idx.scan_workspace()
    assert added >= 3
    paths = {r.path for r in idx.list_artifacts()}
    assert "output/result.txt" in paths
    assert "reports/r.md" in paths


def test_read_preview_size_limit(workspace: Path) -> None:
    big = workspace / "output" / "big.txt"
    big.write_text("x" * 20000, encoding="utf-8")
    idx = FileArtifactIndex(root=workspace)
    rec = idx.register_artifact(path="output/big.txt")
    preview = idx.read_preview(rec, max_bytes=100)
    assert preview is not None
    assert len(preview) <= 100
