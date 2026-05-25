"""Artifact index ABC and file-backed JSONL persistence."""

from __future__ import annotations

import json
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_workspace_root
from app.artifacts.models import ArtifactKind, ArtifactRecord
from app.safety import safe_join


def artifacts_dir(root: Path | None = None) -> Path:
    ws = root or get_workspace_root()
    return ws / ".hermes" / "artifacts"


def artifact_index_path(root: Path | None = None) -> Path:
    return artifacts_dir(root) / "index.jsonl"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _kind_for_rel_path(rel: str) -> ArtifactKind:
    norm = rel.replace("\\", "/").lower()
    if norm.startswith("reports/"):
        return ArtifactKind.REPORT
    if norm.startswith("output/"):
        return ArtifactKind.OUTPUT
    if norm.startswith("input/"):
        return ArtifactKind.INPUT
    if norm.startswith("logs/") or norm.endswith(".jsonl"):
        return ArtifactKind.LOG
    if norm.startswith(".hermes/workflows/"):
        return ArtifactKind.WORKFLOW
    return ArtifactKind.OUTPUT


class ArtifactIndex(ABC):
    @abstractmethod
    def register_artifact(
        self,
        *,
        path: str,
        kind: ArtifactKind | None = None,
        run_id: str | None = None,
        workflow_id: str | None = None,
        summary: str = "",
        artifact_id: str | None = None,
    ) -> ArtifactRecord:
        ...

    @abstractmethod
    def get(self, artifact_id: str) -> ArtifactRecord | None:
        ...

    @abstractmethod
    def list_artifacts(
        self,
        *,
        run_id: str | None = None,
        workflow_id: str | None = None,
    ) -> list[ArtifactRecord]:
        ...

    @abstractmethod
    def scan_workspace(self) -> int:
        ...


class InMemoryArtifactIndex(ArtifactIndex):
    def __init__(self) -> None:
        self._records: dict[str, ArtifactRecord] = {}

    def register_artifact(
        self,
        *,
        path: str,
        kind: ArtifactKind | None = None,
        run_id: str | None = None,
        workflow_id: str | None = None,
        summary: str = "",
        artifact_id: str | None = None,
    ) -> ArtifactRecord:
        aid = artifact_id or str(uuid.uuid4())
        rec = ArtifactRecord(
            id=aid,
            run_id=run_id,
            workflow_id=workflow_id,
            path=path,
            kind=kind or _kind_for_rel_path(path),
            summary=summary,
            created_at=_utc_now(),
        )
        self._records[aid] = rec
        return rec

    def get(self, artifact_id: str) -> ArtifactRecord | None:
        return self._records.get(artifact_id)

    def list_artifacts(
        self,
        *,
        run_id: str | None = None,
        workflow_id: str | None = None,
    ) -> list[ArtifactRecord]:
        out = list(self._records.values())
        if run_id:
            out = [r for r in out if r.run_id == run_id]
        if workflow_id:
            out = [r for r in out if r.workflow_id == workflow_id]
        return sorted(out, key=lambda r: r.created_at, reverse=True)

    def scan_workspace(self) -> int:
        return 0


class FileArtifactIndex(ArtifactIndex):
    """Persist artifacts as JSONL under ``.hermes/artifacts/index.jsonl``."""

    def __init__(self, root: Path | None = None) -> None:
        self._root = root
        self._cache: dict[str, ArtifactRecord] | None = None

    def _ws(self) -> Path:
        return self._root or get_workspace_root()

    def _index_path(self) -> Path:
        p = artifact_index_path(self._root)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def _load_all(self) -> dict[str, ArtifactRecord]:
        if self._cache is not None:
            return self._cache
        records: dict[str, ArtifactRecord] = {}
        path = self._index_path()
        if path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    rec = _record_from_dict(data)
                    records[rec.id] = rec
                except (json.JSONDecodeError, KeyError, ValueError):
                    continue
        self._cache = records
        return records

    def _append(self, rec: ArtifactRecord) -> None:
        records = self._load_all()
        records[rec.id] = rec
        self._cache = records
        with self._index_path().open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec.model_dump(mode="json"), ensure_ascii=False) + "\n")

    def register_artifact(
        self,
        *,
        path: str,
        kind: ArtifactKind | None = None,
        run_id: str | None = None,
        workflow_id: str | None = None,
        summary: str = "",
        artifact_id: str | None = None,
    ) -> ArtifactRecord:
        norm = path.replace("\\", "/").lstrip("/")
        records = self._load_all()
        for existing in records.values():
            if existing.path != norm:
                continue
            if workflow_id is None or existing.workflow_id == workflow_id:
                return existing
        rec = ArtifactRecord(
            id=artifact_id or str(uuid.uuid4()),
            run_id=run_id,
            workflow_id=workflow_id,
            path=norm,
            kind=kind or _kind_for_rel_path(norm),
            summary=summary or f"Artifact at {norm}",
            created_at=_utc_now(),
        )
        self._append(rec)
        return rec

    def get(self, artifact_id: str) -> ArtifactRecord | None:
        return self._load_all().get(artifact_id)

    def list_artifacts(
        self,
        *,
        run_id: str | None = None,
        workflow_id: str | None = None,
    ) -> list[ArtifactRecord]:
        out = list(self._load_all().values())
        if run_id:
            out = [r for r in out if r.run_id == run_id]
        if workflow_id:
            out = [r for r in out if r.workflow_id == workflow_id]
        return sorted(out, key=lambda r: r.created_at, reverse=True)

    def scan_workspace(self) -> int:
        ws = self._ws()
        added = 0
        for sub, kind_hint in (
            ("output", ArtifactKind.OUTPUT),
            ("reports", ArtifactKind.REPORT),
            ("input", ArtifactKind.INPUT),
        ):
            base = ws / sub
            if not base.is_dir():
                continue
            for fp in base.rglob("*"):
                if not fp.is_file():
                    continue
                rel = str(fp.relative_to(ws)).replace("\\", "/")
                before = len(self._load_all())
                self.register_artifact(path=rel, kind=kind_hint, summary=f"Scanned {rel}")
                if len(self._load_all()) > before:
                    added += 1

        logs = ws / "logs" / "policy-events.jsonl"
        if logs.is_file():
            before = len(self._load_all())
            self.register_artifact(
                path="logs/policy-events.jsonl",
                kind=ArtifactKind.LOG,
                summary="Policy observability event log",
            )
            if len(self._load_all()) > before:
                added += 1

        wf_dir = ws / ".hermes" / "workflows"
        if wf_dir.is_dir():
            for fp in wf_dir.glob("*.json"):
                rel = str(fp.relative_to(ws)).replace("\\", "/")
                wf_id = fp.stem
                before = len(self._load_all())
                self.register_artifact(
                    path=rel,
                    kind=ArtifactKind.WORKFLOW,
                    workflow_id=wf_id,
                    summary=f"Workflow snapshot {wf_id}",
                )
                if len(self._load_all()) > before:
                    added += 1
        return added

    def read_preview(self, rec: ArtifactRecord, *, max_bytes: int = 8192) -> str | None:
        ws = self._ws()
        try:
            fp = safe_join(ws, rec.path)
        except PermissionError:
            return None
        if not fp.is_file():
            return None
        data = fp.read_bytes()[:max_bytes]
        try:
            return data.decode("utf-8", errors="replace")
        except OSError:
            return None


def _record_from_dict(data: dict[str, Any]) -> ArtifactRecord:
    kind_raw = data.get("kind") or ArtifactKind.OUTPUT.value
    return ArtifactRecord(
        id=data.get("id") or "",
        run_id=data.get("run_id") or data.get("runId"),
        workflow_id=data.get("workflow_id") or data.get("workflowId"),
        path=data.get("path") or "",
        kind=ArtifactKind(kind_raw),
        created_at=data.get("created_at") or data.get("createdAt") or _utc_now(),
        summary=data.get("summary") or "",
    )


def infer_kind_from_path(path: str) -> ArtifactKind:
    return _kind_for_rel_path(path)
