"""Memory store ABC and file/in-memory implementations."""

from __future__ import annotations

import json
import os
import re
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from app.config import get_workspace_root
from app.memory.models import ActiveContext, MemoryEntry


def memory_dir(root: Path | None = None) -> Path:
    ws = root or get_workspace_root()
    return ws / ".hermes" / "memory"


def active_context_path(root: Path | None = None) -> Path:
    return memory_dir(root) / "active-context.json"


def resolve_hermes_memory_path(workspace_root: Path) -> Path | None:
    """Locate Hermes MEMORY.md relative to workspace or via env override."""
    override = os.environ.get("HERMES_MEMORY_PATH", "").strip()
    if override:
        p = Path(override).expanduser()
        return p if p.is_file() else None
    candidates = [
        workspace_root / "hermes" / "memories" / "MEMORY.md",
        workspace_root.parent / "hermes" / "memories" / "MEMORY.md",
        workspace_root.parent.parent / "hermes" / "memories" / "MEMORY.md",
    ]
    for c in candidates:
        if c.is_file():
            return c.resolve()
    return None


def _parse_memory_md(text: str) -> list[MemoryEntry]:
    """Split MEMORY.md into coarse sections by markdown headings."""
    entries: list[MemoryEntry] = []
    current_title = "Overview"
    current_lines: list[str] = []
    for line in text.splitlines():
        if line.startswith("#"):
            if current_lines:
                content = "\n".join(current_lines).strip()
                if content:
                    entries.append(
                        MemoryEntry(
                            id=str(uuid.uuid4()),
                            source="hermes-memory",
                            title=current_title,
                            content=content[:4000],
                        )
                    )
            current_title = line.lstrip("#").strip() or "Section"
            current_lines = []
        else:
            current_lines.append(line)
    if current_lines:
        content = "\n".join(current_lines).strip()
        if content:
            entries.append(
                MemoryEntry(
                    id=str(uuid.uuid4()),
                    source="hermes-memory",
                    title=current_title,
                    content=content[:4000],
                )
            )
    if not entries and text.strip():
        entries.append(
            MemoryEntry(
                id=str(uuid.uuid4()),
                source="hermes-memory",
                title="MEMORY.md",
                content=text.strip()[:4000],
            )
        )
    return entries


class MemoryStore(ABC):
    @abstractmethod
    def get_active_context(self) -> ActiveContext:
        ...

    @abstractmethod
    def set_active_context(self, ctx: ActiveContext) -> ActiveContext:
        ...

    @abstractmethod
    def list_entries(self) -> list[MemoryEntry]:
        ...

    @abstractmethod
    def index_hermes_memory(self) -> list[MemoryEntry]:
        ...


class InMemoryMemoryStore(MemoryStore):
    def __init__(self) -> None:
        self._active = ActiveContext()
        self._entries: list[MemoryEntry] = []

    def get_active_context(self) -> ActiveContext:
        return self._active.model_copy(deep=True)

    def set_active_context(self, ctx: ActiveContext) -> ActiveContext:
        self._active = ctx.model_copy(deep=True)
        return self._active

    def list_entries(self) -> list[MemoryEntry]:
        return [e.model_copy(deep=True) for e in self._entries]

    def index_hermes_memory(self) -> list[MemoryEntry]:
        return self.list_entries()

    def seed_entries(self, entries: list[MemoryEntry]) -> None:
        self._entries = [e.model_copy(deep=True) for e in entries]


class FileMemoryStore(MemoryStore):
    """Persist active context; index Hermes MEMORY.md when present."""

    def __init__(self, root: Path | None = None) -> None:
        self._root = root

    def _ws(self) -> Path:
        return self._root or get_workspace_root()

    def get_active_context(self) -> ActiveContext:
        path = active_context_path(self._root)
        if not path.is_file():
            return ActiveContext()
        data = json.loads(path.read_text(encoding="utf-8"))
        return _active_from_dict(data)

    def set_active_context(self, ctx: ActiveContext) -> ActiveContext:
        path = active_context_path(self._root)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(ctx.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return ctx

    def list_entries(self) -> list[MemoryEntry]:
        return self.index_hermes_memory()

    def index_hermes_memory(self) -> list[MemoryEntry]:
        mem_path = resolve_hermes_memory_path(self._ws())
        if mem_path is None:
            return []
        text = mem_path.read_text(encoding="utf-8", errors="replace")
        return _parse_memory_md(text)


def _active_from_dict(data: dict[str, Any]) -> ActiveContext:
    return ActiveContext(
        title=data.get("title") or "",
        summary=data.get("summary") or "",
        key_points=list(data.get("key_points") or data.get("keyPoints") or []),
        recent_workflow_ids=list(
            data.get("recent_workflow_ids") or data.get("recentWorkflowIds") or []
        ),
        recent_run_ids=list(data.get("recent_run_ids") or data.get("recentRunIds") or []),
        updated_at=data.get("updated_at") or data.get("updatedAt") or "",
    )
