"""Tests for memory store adapters."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.memory.models import ActiveContext, MemoryEntry
from app.memory.store import (
    FileMemoryStore,
    InMemoryMemoryStore,
    active_context_path,
    resolve_hermes_memory_path,
)


def test_in_memory_active_context_roundtrip() -> None:
    store = InMemoryMemoryStore()
    ctx = ActiveContext(title="Focus", summary="Working on memory slice", key_points=["a", "b"])
    store.set_active_context(ctx)
    loaded = store.get_active_context()
    assert loaded.title == "Focus"
    assert loaded.key_points == ["a", "b"]


def test_in_memory_seed_entries() -> None:
    store = InMemoryMemoryStore()
    store.seed_entries([MemoryEntry(id="e1", source="test", title="T", content="body")])
    assert len(store.list_entries()) == 1


def test_file_active_context_crud(workspace: Path) -> None:
    store = FileMemoryStore(root=workspace)
    assert store.get_active_context().title == ""
    ctx = ActiveContext(title="Hayk", summary="Slice 3", key_points=["memory"])
    store.set_active_context(ctx)
    path = active_context_path(workspace)
    assert path.is_file()
    loaded = store.get_active_context()
    assert loaded.title == "Hayk"
    assert loaded.key_points == ["memory"]


def test_file_store_persists_across_instances(workspace: Path) -> None:
    store1 = FileMemoryStore(root=workspace)
    store1.set_active_context(ActiveContext(title="persist"))
    store2 = FileMemoryStore(root=workspace)
    assert store2.get_active_context().title == "persist"


def test_parse_hermes_memory_md(
    workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    mem = tmp_path / "MEMORY.md"
    mem.write_text("# Goals\n\nShip memory.\n\n# Notes\n\nTests pass.\n", encoding="utf-8")
    entries = FileMemoryStore(root=workspace).index_hermes_memory()
    assert entries == []

    monkeypatch.setenv("HERMES_MEMORY_PATH", str(mem))
    entries = FileMemoryStore(root=workspace).index_hermes_memory()
    assert len(entries) >= 2
    titles = {e.title for e in entries}
    assert "Goals" in titles


def test_resolve_hermes_memory_path_env(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = workspace / "fake-memory.md"
    fake.write_text("x", encoding="utf-8")
    monkeypatch.setenv("HERMES_MEMORY_PATH", str(fake))
    assert resolve_hermes_memory_path(workspace) == fake.resolve()


def test_active_context_to_dict() -> None:
    ctx = ActiveContext(title="t", key_points=["k"])
    d = ctx.to_dict()
    assert d["keyPoints"] == ["k"]
    assert "updatedAt" in d
