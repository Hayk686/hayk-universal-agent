"""Tests for tasks store adapters."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.tasks.models import TaskCreate, TaskPriority, TaskStatus, TaskUpdate
from app.tasks.store import FileTasksStore, InMemoryTasksStore, tasks_path


def test_in_memory_create_and_get() -> None:
    store = InMemoryTasksStore()
    task = store.create(TaskCreate(title="Write tests", description="Slice 4"))
    loaded = store.get(task.id)
    assert loaded is not None
    assert loaded.title == "Write tests"
    assert loaded.status == TaskStatus.PENDING


def test_in_memory_mark_done() -> None:
    store = InMemoryTasksStore()
    task = store.create(TaskCreate(title="Finish"))
    done = store.mark_done(task.id)
    assert done.status == TaskStatus.DONE


def test_in_memory_snooze_hidden_by_default() -> None:
    store = InMemoryTasksStore()
    task = store.create(TaskCreate(title="Later"))
    until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    store.snooze(task.id, until)
    visible = store.list_tasks()
    assert all(t.id != task.id for t in visible)
    with_snoozed = store.list_tasks(include_snoozed=True)
    assert any(t.id == task.id for t in with_snoozed)


def test_in_memory_filter_by_status() -> None:
    store = InMemoryTasksStore()
    t1 = store.create(TaskCreate(title="A"))
    store.create(TaskCreate(title="B"))
    store.mark_done(t1.id)
    pending = store.list_tasks(status=TaskStatus.PENDING)
    done = store.list_tasks(status=TaskStatus.DONE)
    assert len(pending) == 1
    assert len(done) == 1


def test_in_memory_update_and_delete() -> None:
    store = InMemoryTasksStore()
    task = store.create(TaskCreate(title="Old"))
    updated = store.update(task.id, TaskUpdate(title="New", priority=TaskPriority.HIGH))
    assert updated.title == "New"
    assert updated.priority == TaskPriority.HIGH
    assert store.delete(task.id) is True
    assert store.get(task.id) is None


def test_file_store_persistence(workspace: Path) -> None:
    store1 = FileTasksStore(root=workspace)
    task = store1.create(TaskCreate(title="Persist me"))
    path = tasks_path(workspace)
    assert path.is_file()
    store2 = FileTasksStore(root=workspace)
    loaded = store2.get(task.id)
    assert loaded is not None
    assert loaded.title == "Persist me"


def test_snooze_wake_on_list(workspace: Path) -> None:
    store = FileTasksStore(root=workspace)
    task = store.create(TaskCreate(title="Wake"))
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    store.snooze(task.id, past)
    listed = store.list_tasks(include_snoozed=True)
    woken = next(t for t in listed if t.id == task.id)
    assert woken.status == TaskStatus.PENDING
    assert woken.snoozed_until is None


def test_list_due_before_filter() -> None:
    store = InMemoryTasksStore()
    soon = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    late = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    store.create(TaskCreate(title="Soon", due_at=soon))
    store.create(TaskCreate(title="Late", due_at=late))
    cutoff = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    due = store.list_tasks(due_before=cutoff)
    assert len(due) == 1
    assert due[0].title == "Soon"
