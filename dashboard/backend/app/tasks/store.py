"""Tasks store ABC and file/in-memory implementations."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import get_workspace_root
from app.tasks.models import Task, TaskCreate, TaskStatus, TaskUpdate
from app.tasks.serde import load_tasks_file, save_tasks_file


def tasks_dir(root: Path | None = None) -> Path:
    ws = root or get_workspace_root()
    return ws / ".hermes" / "tasks"


def tasks_path(root: Path | None = None) -> Path:
    return tasks_dir(root) / "tasks.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _wake_snoozed(task: Task, now: datetime) -> Task:
    if task.status != TaskStatus.SNOOZED:
        return task
    until = _parse_iso(task.snoozed_until)
    if until is not None and until <= now:
        return task.model_copy(
            update={
                "status": TaskStatus.PENDING,
                "snoozed_until": None,
                "updated_at": _utc_now(),
            }
        )
    return task


class TasksStore(ABC):
    @abstractmethod
    def create(self, data: TaskCreate) -> Task:
        ...

    @abstractmethod
    def get(self, task_id: str) -> Task | None:
        ...

    @abstractmethod
    def list_tasks(
        self,
        *,
        status: TaskStatus | None = None,
        due_before: str | None = None,
        include_snoozed: bool = False,
    ) -> list[Task]:
        ...

    @abstractmethod
    def update(self, task_id: str, data: TaskUpdate) -> Task:
        ...

    @abstractmethod
    def mark_done(self, task_id: str) -> Task:
        ...

    @abstractmethod
    def snooze(self, task_id: str, until: str) -> Task:
        ...

    @abstractmethod
    def delete(self, task_id: str) -> bool:
        ...


class InMemoryTasksStore(TasksStore):
    def __init__(self) -> None:
        self._tasks: dict[str, Task] = {}

    def create(self, data: TaskCreate) -> Task:
        now = _utc_now()
        task = Task(
            id=str(uuid.uuid4()),
            title=data.title.strip(),
            description=data.description.strip(),
            priority=data.priority,
            due_at=data.due_at,
            workflow_id=data.workflow_id,
            run_id=data.run_id,
            created_at=now,
            updated_at=now,
        )
        self._tasks[task.id] = task
        return task.model_copy(deep=True)

    def get(self, task_id: str) -> Task | None:
        task = self._tasks.get(task_id)
        if task is None:
            return None
        now = datetime.now(timezone.utc)
        return _wake_snoozed(task.model_copy(deep=True), now)

    def list_tasks(
        self,
        *,
        status: TaskStatus | None = None,
        due_before: str | None = None,
        include_snoozed: bool = False,
    ) -> list[Task]:
        now = datetime.now(timezone.utc)
        due_cutoff = _parse_iso(due_before)
        out: list[Task] = []
        for raw in self._tasks.values():
            task = _wake_snoozed(raw.model_copy(deep=True), now)
            if task.status != raw.status or task.snoozed_until != raw.snoozed_until:
                self._tasks[task.id] = task
            if not include_snoozed and task.status == TaskStatus.SNOOZED:
                continue
            if status is not None and task.status != status:
                continue
            if due_cutoff is not None:
                due = _parse_iso(task.due_at)
                if due is None or due > due_cutoff:
                    continue
            out.append(task)
        return sorted(out, key=lambda t: t.created_at)

    def update(self, task_id: str, data: TaskUpdate) -> Task:
        task = self._tasks.get(task_id)
        if task is None:
            raise LookupError(task_id)
        updates: dict[str, object] = {"updated_at": _utc_now()}
        if data.title is not None:
            updates["title"] = data.title.strip()
        if data.description is not None:
            updates["description"] = data.description.strip()
        if data.status is not None:
            updates["status"] = data.status
            if data.status != TaskStatus.SNOOZED:
                updates["snoozed_until"] = None
        if data.priority is not None:
            updates["priority"] = data.priority
        if data.due_at is not None:
            updates["due_at"] = data.due_at
        updated = task.model_copy(update=updates)
        self._tasks[task_id] = updated
        return updated.model_copy(deep=True)

    def mark_done(self, task_id: str) -> Task:
        return self.update(task_id, TaskUpdate(status=TaskStatus.DONE))

    def snooze(self, task_id: str, until: str) -> Task:
        task = self._tasks.get(task_id)
        if task is None:
            raise LookupError(task_id)
        updated = task.model_copy(
            update={
                "status": TaskStatus.SNOOZED,
                "snoozed_until": until,
                "updated_at": _utc_now(),
            }
        )
        self._tasks[task_id] = updated
        return updated.model_copy(deep=True)

    def delete(self, task_id: str) -> bool:
        return self._tasks.pop(task_id, None) is not None


class FileTasksStore(TasksStore):
    """Persist tasks to ``agent-workspace/.hermes/tasks/tasks.json``."""

    def __init__(self, root: Path | None = None) -> None:
        self._root = root

    def _path(self) -> Path:
        return tasks_path(self._root)

    def _load(self) -> list[Task]:
        return load_tasks_file(self._path())

    def _save(self, tasks: list[Task]) -> None:
        save_tasks_file(self._path(), tasks)

    def create(self, data: TaskCreate) -> Task:
        tasks = self._load()
        now = _utc_now()
        task = Task(
            id=str(uuid.uuid4()),
            title=data.title.strip(),
            description=data.description.strip(),
            priority=data.priority,
            due_at=data.due_at,
            workflow_id=data.workflow_id,
            run_id=data.run_id,
            created_at=now,
            updated_at=now,
        )
        tasks.append(task)
        self._save(tasks)
        return task.model_copy(deep=True)

    def get(self, task_id: str) -> Task | None:
        tasks = self._load()
        now = datetime.now(timezone.utc)
        changed = False
        for i, task in enumerate(tasks):
            if task.id != task_id:
                continue
            woken = _wake_snoozed(task, now)
            if woken.model_dump() != task.model_dump():
                tasks[i] = woken
                changed = True
            if changed:
                self._save(tasks)
            return woken.model_copy(deep=True)
        return None

    def list_tasks(
        self,
        *,
        status: TaskStatus | None = None,
        due_before: str | None = None,
        include_snoozed: bool = False,
    ) -> list[Task]:
        tasks = self._load()
        now = datetime.now(timezone.utc)
        due_cutoff = _parse_iso(due_before)
        woken_tasks: list[Task] = []
        changed = False
        for task in tasks:
            woken = _wake_snoozed(task, now)
            if woken.model_dump() != task.model_dump():
                changed = True
            woken_tasks.append(woken)
        if changed:
            self._save(woken_tasks)
        out: list[Task] = []
        for task in woken_tasks:
            if not include_snoozed and task.status == TaskStatus.SNOOZED:
                continue
            if status is not None and task.status != status:
                continue
            if due_cutoff is not None:
                due = _parse_iso(task.due_at)
                if due is None or due > due_cutoff:
                    continue
            out.append(task.model_copy(deep=True))
        return sorted(out, key=lambda t: t.created_at)

    def _replace(self, task_id: str, replacer) -> Task:
        tasks = self._load()
        for i, task in enumerate(tasks):
            if task.id == task_id:
                updated = replacer(task)
                tasks[i] = updated
                self._save(tasks)
                return updated.model_copy(deep=True)
        raise LookupError(task_id)

    def update(self, task_id: str, data: TaskUpdate) -> Task:
        def _apply(task: Task) -> Task:
            updates: dict[str, object] = {"updated_at": _utc_now()}
            if data.title is not None:
                updates["title"] = data.title.strip()
            if data.description is not None:
                updates["description"] = data.description.strip()
            if data.status is not None:
                updates["status"] = data.status
                if data.status != TaskStatus.SNOOZED:
                    updates["snoozed_until"] = None
            if data.priority is not None:
                updates["priority"] = data.priority
            if data.due_at is not None:
                updates["due_at"] = data.due_at
            return task.model_copy(update=updates)

        return self._replace(task_id, _apply)

    def mark_done(self, task_id: str) -> Task:
        return self.update(task_id, TaskUpdate(status=TaskStatus.DONE))

    def snooze(self, task_id: str, until: str) -> Task:
        return self._replace(
            task_id,
            lambda t: t.model_copy(
                update={
                    "status": TaskStatus.SNOOZED,
                    "snoozed_until": until,
                    "updated_at": _utc_now(),
                }
            ),
        )

    def delete(self, task_id: str) -> bool:
        tasks = self._load()
        new_tasks = [t for t in tasks if t.id != task_id]
        if len(new_tasks) == len(tasks):
            return False
        self._save(new_tasks)
        return True


def snooze_until_from_minutes(minutes: int) -> str:
    until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return until.isoformat()
