from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field, field_validator

from app.artifacts.index import FileArtifactIndex
from app.config import AGENT_NAME, get_chat_timeout_seconds, get_workspace_root
from app.memory.models import ActiveContext
from app.memory.store import FileMemoryStore
from app.memory.summarizer import build_memory_summary
from app.observability.events import emit_event
from app.memory.lifecycle import on_workflow_completed
from app.tasks.lifecycle import create_task_for_workflow, mark_linked_task_done
from app.tasks.models import TaskCreate, TaskPriority, TaskStatus, TaskUpdate
from app.tasks.store import FileTasksStore, snooze_until_from_minutes
from app.orchestration.models import OrchestratorMode, StepStatus
from app.orchestration.orchestrator import Orchestrator, WorkflowNotFoundError, WorkflowPausedError
from app.orchestration.router import route_task
from app.orchestration.workflow_store import FileWorkflowStore
from app.policy.confirmation import verify_confirmation_token
from app.policy.gate import PolicyDecision, classify_action
from app.research.models import ResearchQuery
from app.research.pipeline import get_cached_result, get_research_pipeline
from app.browser.driver import (
    browser_policy_action,
    get_cached_action,
    list_session_profiles,
    run_browser_action,
)
from app.browser.models import BrowserActionRequest, BrowserActionType
from app.safety import is_whitelisted_command, list_whitelisted_commands, safe_join

router = APIRouter()

_VENV_PY_PARTS = (".venv", "bin", "python")


def _venv_python_path(ws: Path) -> Path:
    """Workspace .venv interpreter path without safe_join/resolve-to-target.

    Standard virtualenvs symlink ``python`` to a system interpreter outside the
    workspace; ``safe_join`` rejects those. We only require the symlink path (as
    joined under the workspace root) to lie under that root — no target resolution.
    """
    workspace_root = ws.resolve()
    candidate = workspace_root.joinpath(*_VENV_PY_PARTS)
    try:
        candidate.relative_to(workspace_root)
    except ValueError as exc:
        raise PermissionError("Venv python path escapes workspace") from exc
    return candidate


def workspace_dep() -> Path:
    return get_workspace_root()


def _get_orchestrator(ws: Path) -> Orchestrator:
    return Orchestrator(FileWorkflowStore(root=ws))


def _get_memory_store(ws: Path) -> FileMemoryStore:
    return FileMemoryStore(root=ws)


def _get_artifact_index(ws: Path) -> FileArtifactIndex:
    return FileArtifactIndex(root=ws)


def _get_tasks_store(ws: Path) -> FileTasksStore:
    return FileTasksStore(root=ws)


def _emit_task_event(
    *,
    run_id: str,
    decision: str,
    task_id: str,
    outcome: str,
    extra: dict[str, Any] | None = None,
) -> None:
    emit_event(
        run_id=run_id,
        layer="tasks",
        decision=decision,
        reason=f"task {task_id}",
        inputs_redacted={"taskId": task_id, "path": ".hermes/tasks/tasks.json", **(extra or {})},
        outcome=outcome,
    )


def _hermes_subprocess_env(run_id: str) -> dict[str, str]:
    env = {**os.environ, "LC_ALL": "C.UTF-8"}
    if run_id and run_id != "unknown":
        env["HERMES_RUN_ID"] = run_id
    return env


def _emit_hermes_spawn(*, run_id: str, argv: list[str], endpoint: str) -> None:
    emit_event(
        run_id=run_id,
        layer="orchestrator",
        decision="hermes_spawn",
        reason=f"{endpoint} argv0={argv[0] if argv else 'unknown'}",
        inputs_redacted={"endpoint": endpoint, "argc": len(argv)},
        outcome="spawned",
    )


def _emit_route_decision(*, run_id: str, message: str, endpoint: str) -> OrchestratorMode:
    route = route_task(message)
    emit_event(
        run_id=run_id,
        layer="orchestrator",
        decision=route.mode.value,
        reason=route.reason,
        inputs_redacted={
            "endpoint": endpoint,
            "playbookMode": route.playbook_mode,
            "confidence": route.confidence,
        },
        outcome="routed",
    )
    return route.mode


class SaveBody(BaseModel):
    content: str = Field(..., description="UTF-8 markdown content")


def _run_id_from_request(request: Request) -> str:
    return str(getattr(request.state, "run_id", "") or "unknown")


def _emit_policy_event(
    *,
    run_id: str,
    decision: PolicyDecision,
    action: str,
    outcome: str,
    extra: dict[str, Any] | None = None,
) -> None:
    emit_event(
        run_id=run_id,
        layer="policy",
        decision="allow" if decision.allowed else ("confirm" if decision.requires_confirmation else "deny"),
        reason=decision.reason,
        inputs_redacted={"action": action, **(extra or {})},
        outcome=outcome,
    )


def _policy_http_detail(decision: PolicyDecision, action: str) -> dict[str, Any]:
    return {
        "detail": decision.reason,
        "policy": decision.to_dict(),
        "action": action,
    }


def _enforce_policy(
    *,
    request: Request,
    action: str,
    context: dict[str, Any],
    confirmation_token: str | None = None,
) -> PolicyDecision:
    """Raise HTTP 403 when action is denied or confirmation is missing/invalid."""
    run_id = _run_id_from_request(request)
    decision = classify_action(action, context=context)
    _emit_policy_event(run_id=run_id, decision=decision, action=action, outcome="classified")

    if decision.allowed:
        _emit_policy_event(run_id=run_id, decision=decision, action=action, outcome="allowed")
        return decision

    if decision.requires_confirmation:
        if confirmation_token:
            ok, reason = verify_confirmation_token(confirmation_token, action)
            if ok:
                confirmed = PolicyDecision(
                    allowed=True,
                    risk=decision.risk,
                    requires_confirmation=False,
                    reason="confirmation token accepted",
                    confirmation_token=None,
                )
                _emit_policy_event(
                    run_id=run_id,
                    decision=confirmed,
                    action=action,
                    outcome="confirmed",
                )
                return confirmed
            _emit_policy_event(
                run_id=run_id,
                decision=decision,
                action=action,
                outcome=f"confirm_failed:{reason}",
            )
            raise HTTPException(
                status_code=403,
                detail={**_policy_http_detail(decision, action), "confirmError": reason},
            )
        _emit_policy_event(run_id=run_id, decision=decision, action=action, outcome="confirm_required")
        raise HTTPException(status_code=403, detail=_policy_http_detail(decision, action))

    _emit_policy_event(run_id=run_id, decision=decision, action=action, outcome="denied")
    raise HTTPException(status_code=403, detail=_policy_http_detail(decision, action))


class PolicyCheckBody(BaseModel):
    action: str = Field(..., description="Action label, e.g. exec hermes status")
    context: dict[str, Any] = Field(default_factory=dict)


class PolicyConfirmBody(BaseModel):
    action: str
    token: str


@router.post("/policy/check")
def policy_check(body: PolicyCheckBody, request: Request) -> dict[str, Any]:
    run_id = _run_id_from_request(request)
    decision = classify_action(body.action, context=body.context)
    _emit_policy_event(
        run_id=run_id,
        decision=decision,
        action=body.action,
        outcome="check",
        extra={"context": body.context},
    )
    return decision.to_dict()


@router.post("/policy/confirm")
def policy_confirm(body: PolicyConfirmBody, request: Request) -> dict[str, str]:
    run_id = _run_id_from_request(request)
    ok, reason = verify_confirmation_token(body.token, body.action)
    emit_event(
        run_id=run_id,
        layer="policy",
        decision="confirm" if ok else "deny",
        reason=reason,
        inputs_redacted={"action": body.action},
        outcome="confirmed" if ok else "confirm_rejected",
    )
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    return {"ok": "true", "action": body.action}


def _enforce_chat_message_policy(
    *,
    request: Request,
    message: str,
    endpoint: str,
) -> None:
    """Allow chat turns unless payment/hardline content is detected."""
    action = "exec chat message"
    decision = classify_action(
        action,
        context={"endpoint": endpoint, "kind": "exec", "command": message, "chat_message": True},
    )
    run_id = _run_id_from_request(request)
    _emit_policy_event(run_id=run_id, decision=decision, action=action, outcome="chat_check")
    if not decision.allowed:
        raise HTTPException(status_code=403, detail=_policy_http_detail(decision, action))


@router.get("/capabilities")
def get_capabilities() -> dict[str, Any]:
    """Server-side capability flags (not localStorage toggles)."""
    return {
        "policyGate": True,
        "observability": True,
        "memoryIndex": True,
        "artifactsIndex": True,
        "contextRouter": True,
        "toolExecutor": True,
        "researchPipeline": True,
        "browserDriver": True,
        "dailyTasks": True,
        "orchestrator": True,
    }


class ActiveContextUpdateBody(BaseModel):
    title: str = ""
    summary: str = ""
    keyPoints: list[str] = Field(default_factory=list)
    recentWorkflowIds: list[str] = Field(default_factory=list)
    recentRunIds: list[str] = Field(default_factory=list)
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required when policy check returns requiresConfirmation",
    )


@router.get("/memory/active-context")
def get_memory_active_context(ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    store = _get_memory_store(ws)
    return store.get_active_context().to_dict()


@router.put("/memory/active-context")
def put_memory_active_context(
    body: ActiveContextUpdateBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    action = "write memory active-context"
    _enforce_policy(
        request=request,
        action=action,
        context={
            "kind": "write",
            "path": ".hermes/memory/active-context.json",
            "endpoint": "/api/memory/active-context",
        },
        confirmation_token=body.policyConfirmationToken,
    )
    ctx = ActiveContext(
        title=body.title.strip(),
        summary=body.summary.strip(),
        key_points=[p.strip() for p in body.keyPoints if p.strip()],
        recent_workflow_ids=[w.strip() for w in body.recentWorkflowIds if w.strip()],
        recent_run_ids=[r.strip() for r in body.recentRunIds if r.strip()],
    )
    saved = _get_memory_store(ws).set_active_context(ctx)
    run_id = _run_id_from_request(request)
    emit_event(
        run_id=run_id,
        layer="memory",
        decision="active_context_updated",
        reason="active context saved",
        inputs_redacted={"path": ".hermes/memory/active-context.json"},
        outcome="saved",
    )
    return saved.to_dict()


@router.get("/memory/summary")
def get_memory_summary(ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    store = _get_memory_store(ws)
    active = store.get_active_context()
    entries = store.list_entries()
    orch = _get_orchestrator(ws)
    workflows = orch.list_workflows()
    recent = sorted(workflows, key=lambda w: w.updated_at, reverse=True)[:10]
    summary = build_memory_summary(
        active=active,
        entries=entries,
        recent_workflows=recent,
    )
    return summary.to_dict()


@router.get("/artifacts")
def list_artifacts(
    run_id: str | None = None,
    workflow_id: str | None = None,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    idx = _get_artifact_index(ws)
    if not idx.list_artifacts():
        idx.scan_workspace()
    records = idx.list_artifacts(run_id=run_id, workflow_id=workflow_id)
    return {"artifacts": [r.to_dict() for r in records]}


@router.get("/artifacts/{artifact_id}")
def get_artifact(
    artifact_id: str,
    preview: bool = False,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    idx = _get_artifact_index(ws)
    rec = idx.get(artifact_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    out: dict[str, Any] = rec.to_dict()
    if preview:
        content = idx.read_preview(rec)
        if content is not None:
            out["contentPreview"] = content
    return out


class TaskCreateBody(BaseModel):
    title: str = Field(..., description="Task title")
    description: str = ""
    priority: TaskPriority | None = None
    dueAt: str | None = None
    workflowId: str | None = None
    runId: str | None = None


class TaskUpdateBody(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    dueAt: str | None = None


class TaskSnoozeBody(BaseModel):
    until: str | None = None
    minutes: int | None = None


@router.get("/tasks")
def list_tasks(
    status: TaskStatus | None = None,
    due_before: str | None = None,
    include_snoozed: bool = False,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    store = _get_tasks_store(ws)
    tasks = store.list_tasks(
        status=status,
        due_before=due_before,
        include_snoozed=include_snoozed,
    )
    return {"tasks": [t.to_dict() for t in tasks]}


@router.post("/tasks")
def create_task(
    body: TaskCreateBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title must not be empty")
    _enforce_policy(
        request=request,
        action="write task create",
        context={
            "kind": "write",
            "method": "POST",
            "endpoint": "/api/tasks",
            "path": ".hermes/tasks/tasks.json",
        },
    )
    run_id = _run_id_from_request(request)
    store = _get_tasks_store(ws)
    task = store.create(
        TaskCreate(
            title=title,
            description=body.description.strip(),
            priority=body.priority,
            due_at=body.dueAt,
            workflow_id=body.workflowId,
            run_id=body.runId or (run_id if run_id != "unknown" else None),
        )
    )
    _emit_task_event(run_id=run_id, decision="create", task_id=task.id, outcome="created")
    return task.to_dict()


@router.get("/tasks/{task_id}")
def get_task(task_id: str, ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    store = _get_tasks_store(ws)
    task = store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.to_dict()


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: str,
    body: TaskUpdateBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    _enforce_policy(
        request=request,
        action="write task update",
        context={
            "kind": "write",
            "method": "PATCH",
            "endpoint": f"/api/tasks/{task_id}",
            "path": ".hermes/tasks/tasks.json",
        },
    )
    store = _get_tasks_store(ws)
    try:
        task = store.update(
            task_id,
            TaskUpdate(
                title=body.title,
                description=body.description,
                status=body.status,
                priority=body.priority,
                due_at=body.dueAt,
            ),
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Task not found") from None
    run_id = _run_id_from_request(request)
    _emit_task_event(run_id=run_id, decision="update", task_id=task_id, outcome="updated")
    return task.to_dict()


@router.post("/tasks/{task_id}/done")
def done_task(
    task_id: str,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    _enforce_policy(
        request=request,
        action="write task done",
        context={
            "kind": "write",
            "method": "PATCH",
            "endpoint": f"/api/tasks/{task_id}/done",
            "path": ".hermes/tasks/tasks.json",
        },
    )
    store = _get_tasks_store(ws)
    try:
        task = store.mark_done(task_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Task not found") from None
    run_id = _run_id_from_request(request)
    _emit_task_event(run_id=run_id, decision="done", task_id=task_id, outcome="done")
    return task.to_dict()


@router.post("/tasks/{task_id}/snooze")
def snooze_task(
    task_id: str,
    body: TaskSnoozeBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    _enforce_policy(
        request=request,
        action="write task snooze",
        context={
            "kind": "write",
            "method": "PATCH",
            "endpoint": f"/api/tasks/{task_id}/snooze",
            "path": ".hermes/tasks/tasks.json",
        },
    )
    until = body.until
    if body.minutes is not None:
        if body.minutes < 1:
            raise HTTPException(status_code=422, detail="minutes must be >= 1")
        until = snooze_until_from_minutes(body.minutes)
    if not until:
        raise HTTPException(status_code=422, detail="until or minutes required")
    store = _get_tasks_store(ws)
    try:
        task = store.snooze(task_id, until)
    except LookupError:
        raise HTTPException(status_code=404, detail="Task not found") from None
    run_id = _run_id_from_request(request)
    _emit_task_event(
        run_id=run_id,
        decision="snooze",
        task_id=task_id,
        outcome="snoozed",
        extra={"until": until},
    )
    return task.to_dict()


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    request: Request,
    policy_confirmation_token: str | None = None,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    _enforce_policy(
        request=request,
        action="write task delete",
        context={
            "kind": "write",
            "method": "DELETE",
            "endpoint": f"/api/tasks/{task_id}",
            "path": ".hermes/tasks/tasks.json",
        },
        confirmation_token=policy_confirmation_token,
    )
    store = _get_tasks_store(ws)
    if not store.delete(task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    run_id = _run_id_from_request(request)
    _emit_task_event(run_id=run_id, decision="delete", task_id=task_id, outcome="deleted")
    return {"deleted": True, "taskId": task_id}


class ResearchQueryBody(BaseModel):
    query: str = Field(..., description="Research search query")
    maxResults: int = Field(default=5, ge=1, le=20)
    timeoutSeconds: float = Field(default=15.0, ge=1.0, le=120.0)
    requireVerification: bool = True
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required when policy check returns requiresConfirmation",
    )

    @field_validator("query")
    @classmethod
    def _validate_query(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("query must not be empty")
        if len(s) > 2000:
            raise ValueError("query exceeds maximum length of 2000 characters")
        return s


@router.post("/research/query")
async def research_query(body: ResearchQueryBody, request: Request) -> dict[str, Any]:
    """Run gated research pipeline with structured citations."""
    action = "network research query"
    _enforce_policy(
        request=request,
        action=action,
        context={"kind": "network", "endpoint": "/api/research/query"},
        confirmation_token=body.policyConfirmationToken,
    )
    run_id = _run_id_from_request(request)
    pipeline = get_research_pipeline()
    query = ResearchQuery(
        query=body.query,
        max_results=body.maxResults,
        timeout_seconds=body.timeoutSeconds,
        require_verification=body.requireVerification,
    )
    try:
        result = await pipeline.run(
            query,
            run_id=run_id,
            skip_policy=True,
        )
    except Exception as exc:
        emit_event(
            run_id=run_id,
            layer="research",
            decision="query",
            reason=str(exc)[:200],
            inputs_redacted={"query": body.query[:200]},
            outcome="failed",
        )
        raise HTTPException(status_code=502, detail=f"Research pipeline failed: {exc}") from exc
    return result.to_dict()


@router.get("/research/query/{query_id}")
def research_query_get(query_id: str) -> dict[str, Any]:
    """Return cached research result when available."""
    result = get_cached_result(query_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Research query not found")
    return result.to_dict()


class BrowserActionBody(BaseModel):
    action: BrowserActionType
    url: str | None = None
    selector: str | None = None
    value: str | None = None
    sessionProfile: str | None = None
    timeoutSeconds: float = Field(default=15.0, ge=1.0, le=120.0)
    workflowId: str | None = None
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required when policy check returns requiresConfirmation",
    )

    @field_validator("url", "selector", "value", "sessionProfile", mode="before")
    @classmethod
    def _coerce_optional_text(cls, v: Any) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            raise TypeError("field must be a string")
        s = v.strip()
        return s or None


@router.post("/browser/action")
async def browser_action(
    body: BrowserActionBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Execute a gated browser driver action."""
    action = browser_policy_action(body.action)
    _enforce_policy(
        request=request,
        action=action,
        context={
            "kind": "browser",
            "endpoint": "/api/browser/action",
            "browser_action": body.action.value,
        },
        confirmation_token=body.policyConfirmationToken,
    )
    run_id = _run_id_from_request(request)
    driver_request = BrowserActionRequest(
        action=body.action,
        url=body.url,
        selector=body.selector,
        value=body.value,
        session_profile=body.sessionProfile,
        timeout_seconds=body.timeoutSeconds,
        workflow_id=body.workflowId,
    )
    result = await run_browser_action(
        driver_request,
        run_id=run_id,
        skip_policy=True,
        workspace_root=ws,
    )
    if body.workflowId and result.success:
        try:
            orch = _get_orchestrator(ws)
            orch.link_browser_action(body.workflowId, result.action_id)
            emit_event(
                run_id=run_id,
                layer="orchestrator",
                decision="browser_action_linked",
                reason=f"action_id={result.action_id}",
                inputs_redacted={
                    "workflowId": body.workflowId,
                    "browserActionId": result.action_id,
                },
                outcome="linked",
            )
        except WorkflowNotFoundError:
            pass
    return result.to_dict()


@router.get("/browser/action/{action_id}")
def browser_action_get(action_id: str) -> dict[str, Any]:
    """Return cached browser action result when available."""
    result = get_cached_action(action_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Browser action not found")
    return result.to_dict()


@router.get("/browser/sessions")
def browser_sessions(request: Request) -> dict[str, Any]:
    """List stub browser session profiles (MVP metadata)."""
    run_id = _run_id_from_request(request)
    profiles = list_session_profiles()
    emit_event(
        run_id=run_id,
        layer="browser",
        decision="list_sessions",
        reason="stub session profiles listed",
        inputs_redacted={"count": len(profiles)},
        outcome="success",
    )
    return {"sessions": [p.to_dict() for p in profiles]}


class OrchestrationPlanBody(BaseModel):
    task: str = Field(..., description="User message or task to plan")
    message: str | None = Field(default=None, description="Alias for task")
    createTask: bool = Field(
        default=False,
        description="Create a linked daily task when planning",
    )

    @field_validator("task")
    @classmethod
    def _validate_task(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("task must not be empty")
        if len(s) > 8000:
            raise ValueError("task exceeds maximum length of 8000 characters")
        return s


class OrchestrationExecuteBody(BaseModel):
    stepId: str | None = Field(default=None, description="Specific step id, or next pending")
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required when a step needs network/browser confirmation",
    )


@router.post("/orchestration/plan")
def orchestration_plan(
    body: OrchestrationPlanBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    run_id = _run_id_from_request(request)
    task = body.task.strip()
    orch = _get_orchestrator(ws)
    workflow = orch.plan(task, run_id=run_id)
    should_create_task = body.createTask or workflow.mode == OrchestratorMode.SESSION
    if should_create_task:
        task_id = create_task_for_workflow(ws, workflow, run_id=run_id)
        if task_id:
            workflow.task_id = task_id
            orch._store.save(workflow)
            _emit_task_event(
                run_id=run_id,
                decision="task_linked",
                task_id=task_id,
                outcome="created",
                extra={"workflowId": workflow.workflow_id},
            )
    return workflow.to_dict()


@router.get("/orchestration")
def orchestration_list(ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    orch = _get_orchestrator(ws)
    workflows = orch.list_workflows()
    return {"workflows": [w.to_dict() for w in workflows]}


@router.get("/orchestration/{workflow_id}")
def orchestration_get(workflow_id: str, ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    orch = _get_orchestrator(ws)
    try:
        return orch.get(workflow_id).to_dict()
    except WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found") from None


@router.post("/orchestration/{workflow_id}/execute")
def orchestration_execute(
    workflow_id: str,
    body: OrchestrationExecuteBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    run_id = _run_id_from_request(request)
    orch = _get_orchestrator(ws)
    try:
        workflow = orch.execute_step(
            workflow_id,
            step_id=body.stepId,
            run_id=run_id,
            confirmation_token=body.policyConfirmationToken,
        )
    except WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found") from None
    except WorkflowPausedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if workflow.status == StepStatus.COMPLETED:
        on_workflow_completed(ws, workflow, run_id=run_id)
        mark_linked_task_done(ws, workflow, task_id=workflow.task_id)
    return workflow.to_dict()


@router.post("/orchestration/{workflow_id}/pause")
def orchestration_pause(
    workflow_id: str,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    run_id = _run_id_from_request(request)
    orch = _get_orchestrator(ws)
    try:
        return orch.pause(workflow_id, run_id=run_id).to_dict()
    except WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found") from None


@router.post("/orchestration/{workflow_id}/resume")
def orchestration_resume(
    workflow_id: str,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    run_id = _run_id_from_request(request)
    orch = _get_orchestrator(ws)
    try:
        return orch.resume(workflow_id, run_id=run_id).to_dict()
    except WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found") from None


def _file_entry(p: Path, workspace: Path) -> dict[str, Any]:
    st = p.stat()
    ext = p.suffix.lower().lstrip(".") or "file"
    return {
        "name": p.name,
        "path": str(p.relative_to(workspace)).replace("\\", "/"),
        "size": st.st_size,
        "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        "extension": ext,
        "isDir": p.is_dir(),
    }


def _count_files_in_dir(d: Path) -> int:
    if not d.is_dir():
        return 0
    n = 0
    for root, _, files in os.walk(d):
        n += len(files)
    return n


def _dir_size(d: Path) -> int:
    total = 0
    if not d.exists():
        return 0
    for root, _, files in os.walk(d):
        for fn in files:
            fp = Path(root) / fn
            try:
                total += fp.stat().st_size
            except OSError:
                pass
    return total


@router.get("/status")
def get_status(ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    agents = safe_join(ws, "AGENTS.md")
    playbooks = safe_join(ws, "playbooks")
    input_d = safe_join(ws, "input")
    output_d = safe_join(ws, "output")
    reports_d = safe_join(ws, "reports")
    venv_python = _venv_python_path(ws)

    venv_ok = venv_python.is_file() and os.access(venv_python, os.X_OK)

    du = shutil.disk_usage(ws)

    return {
        "agentName": AGENT_NAME,
        "workspacePath": str(ws),
        "serverTime": datetime.now(timezone.utc).isoformat(),
        "agentsMdExists": agents.is_file(),
        "playbooksDirExists": playbooks.is_dir(),
        "fileCounts": {
            "input": _count_files_in_dir(input_d),
            "output": _count_files_in_dir(output_d),
            "reports": _count_files_in_dir(reports_d),
        },
        "diskUsage": {
            "totalBytes": du.total,
            "usedBytes": du.used,
            "freeBytes": du.free,
            "workspaceBytes": _dir_size(ws),
        },
        "venv": {
            "pythonPath": str(venv_python),
            "existsAndExecutable": venv_ok,
        },
        "chatTimeoutSeconds": get_chat_timeout_seconds(),
    }


def _list_section_files(ws: Path, sub: str) -> list[dict[str, Any]]:
    base = safe_join(ws, sub)
    if not base.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(base.rglob("*"), key=lambda x: str(x).lower()):
        if p.is_file():
            out.append(_file_entry(p, ws))
    return out


@router.get("/files")
def list_files_by_folder(
    folder: str,
    ws: Path = Depends(workspace_dep),
) -> list[dict[str, Any]]:
    if folder not in ("input", "output", "reports"):
        raise HTTPException(
            status_code=400,
            detail="folder must be input, output, or reports",
        )
    return _list_section_files(ws, folder)


def _managed_file_roots(ws: Path) -> tuple[Path, Path, Path]:
    return (
        safe_join(ws, "input"),
        safe_join(ws, "output"),
        safe_join(ws, "reports"),
    )


def _is_under_managed_dirs(p: Path, ws: Path) -> bool:
    pr = p.resolve()
    for r in _managed_file_roots(ws):
        try:
            pr.relative_to(r.resolve())
            return True
        except ValueError:
            continue
    return False


def _validate_file_for_download_or_delete(ws: Path, rel_path: str) -> Path:
    p = safe_join(ws, rel_path)
    if not p.is_file():
        raise HTTPException(status_code=400, detail="Not a file or does not exist")
    rel_norm = str(p.resolve().relative_to(ws.resolve())).replace("\\", "/")
    if rel_norm == "AGENTS.md":
        raise HTTPException(status_code=403, detail="AGENTS.md cannot be deleted via this API")
    if rel_norm == "playbooks" or rel_norm.startswith("playbooks/"):
        raise HTTPException(
            status_code=403,
            detail="Playbooks paths cannot be deleted via this API",
        )
    if ".venv/" in rel_norm or rel_norm.startswith(".venv"):
        raise HTTPException(status_code=403, detail="Access to .venv is not allowed")
    if not _is_under_managed_dirs(p, ws):
        raise HTTPException(status_code=403, detail="File must be under input, output, or reports")
    return p



@router.get("/files/download")
def download_file(path: str, ws: Path = Depends(workspace_dep)):
    p = _validate_file_for_download_or_delete(ws, path)
    return FileResponse(path=p, filename=p.name, media_type="application/octet-stream")


@router.delete("/files")
def delete_file(path: str, ws: Path = Depends(workspace_dep)) -> dict[str, str]:
    p = _validate_file_for_download_or_delete(ws, path)
    p.unlink()
    return {"ok": "true"}


@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    if (
        not file.filename
        or file.filename in (".", "..")
        or "/" in file.filename
        or "\\" in file.filename
    ):
        raise HTTPException(status_code=400, detail="Invalid filename")
    dest_dir = safe_join(ws, "input")
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = safe_join(ws, "input", file.filename)
    if dest.is_dir():
        raise HTTPException(status_code=400, detail="Destination is a directory")
    content = await file.read()
    dest.write_bytes(content)
    return _file_entry(dest, ws)


@router.get("/agents-md")
def get_agents_md(ws: Path = Depends(workspace_dep)) -> PlainTextResponse:
    p = safe_join(ws, "AGENTS.md")
    if not p.is_file():
        return PlainTextResponse("", media_type="text/markdown")
    return PlainTextResponse(
        p.read_text(encoding="utf-8", errors="replace"), media_type="text/markdown"
    )


@router.put("/agents-md")
def put_agents_md(body: SaveBody, ws: Path = Depends(workspace_dep)) -> dict[str, str]:
    p = safe_join(ws, "AGENTS.md")
    p.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = ""
    if p.is_file():
        bak = safe_join(ws, f"AGENTS.md.bak.{stamp}")
        shutil.copy2(p, bak)
        backup_name = f"AGENTS.md.bak.{stamp}"
    p.write_text(body.content, encoding="utf-8")
    return {"saved": "true", "backup": backup_name}


def _playbook_path(ws: Path, name: str) -> Path:
    if not name.endswith(".md"):
        raise HTTPException(status_code=400, detail="Playbook must be .md")
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid playbook name")
    return safe_join(ws, "playbooks", name)


@router.get("/playbooks")
def list_playbooks(ws: Path = Depends(workspace_dep)) -> list[dict[str, Any]]:
    d = safe_join(ws, "playbooks")
    if not d.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(d.glob("*.md"), key=lambda x: x.name.lower()):
        if p.is_file():
            out.append(_file_entry(p, ws))
    return out


@router.get("/playbooks/{name}")
def get_playbook(name: str, ws: Path = Depends(workspace_dep)) -> PlainTextResponse:
    p = _playbook_path(ws, name)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return PlainTextResponse(
        p.read_text(encoding="utf-8", errors="replace"), media_type="text/markdown"
    )


class PlaybookSaveBody(BaseModel):
    content: str


@router.put("/playbooks/{name}")
def save_playbook(
    name: str, body: PlaybookSaveBody, ws: Path = Depends(workspace_dep)
) -> dict[str, str]:
    p = _playbook_path(ws, name)
    p.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = ""
    if p.is_file():
        bak = safe_join(ws, "playbooks", f"{p.stem}.bak.{stamp}{p.suffix}")
        shutil.copy2(p, bak)
        backup_name = f"{p.stem}.bak.{stamp}{p.suffix}"
    p.write_text(body.content, encoding="utf-8")
    return {"saved": "true", "backup": backup_name}


class NewPlaybookBody(BaseModel):
    name: str = Field(..., pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*\.md$")


@router.post("/playbooks")
def create_playbook(
    body: NewPlaybookBody, ws: Path = Depends(workspace_dep)
) -> dict[str, Any]:
    p = _playbook_path(ws, body.name)
    if p.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("# New playbook\n\n", encoding="utf-8")
    return _file_entry(p, ws)


@router.delete("/playbooks/{name}")
def delete_playbook(name: str, ws: Path = Depends(workspace_dep)) -> dict[str, str]:
    p = _playbook_path(ws, name)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    p.unlink()
    return {"ok": "true"}


def _hermes_bin() -> str:
    """Hermes executable for subprocess argv[0]; systemd may set ``HERMES_BIN`` to a full path."""
    return os.environ.get("HERMES_BIN", "hermes")


def _hermes_unavailable_error(exc: OSError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=(
            f"Hermes is not available on this machine ({_hermes_bin()}). "
            "Install Hermes or set HERMES_BIN to the executable path. "
            f"Original error: {exc}"
        ),
    )


def _hermes_logs_since_argv() -> list[str]:
    return [_hermes_bin(), "logs", "--since", "1h"]


def _hermes_logs_errors_argv() -> list[str]:
    return [_hermes_bin(), "logs", "errors"]


async def _run_cmd(args: list[str], timeout: float = 120.0) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(get_workspace_root()),
            env={**os.environ, "LC_ALL": "C.UTF-8"},
        )
    except FileNotFoundError:
        return 127, f"Command not found: {args[0]}\n"
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "Command timed out\n"
    text = out.decode("utf-8", errors="replace")
    code = proc.returncode
    if code is None:
        code = -1
    return code, text


def _tail_lines(s: str, max_lines: int = 300) -> str:
    lines = s.splitlines()
    if len(lines) <= max_lines:
        return s
    return "\n".join(lines[-max_lines:]) + "\n"


@router.get("/logs/hermes")
async def get_logs_hermes() -> PlainTextResponse:
    _, text = await _run_cmd(_hermes_logs_since_argv(), timeout=180.0)
    return PlainTextResponse(_tail_lines(text, 300), media_type="text/plain; charset=utf-8")


@router.get("/logs/errors")
async def get_logs_errors() -> PlainTextResponse:
    _, text = await _run_cmd(_hermes_logs_errors_argv(), timeout=180.0)
    return PlainTextResponse(_tail_lines(text, 300), media_type="text/plain; charset=utf-8")


class CommandBody(BaseModel):
    command: str
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required when policy check returns requiresConfirmation",
    )


class ChatSendBody(BaseModel):
    """One-shot Hermes message via ``hermes -z`` (no shell, argv list only)."""

    message: str = Field(..., description="UTF-8 message passed to Hermes -z")
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required for network actions (web-send)",
    )

    @field_validator("message")
    @classmethod
    def _validate_message(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("message must be a string")
        s = v.strip()
        if not s:
            raise ValueError("message must not be empty")
        if len(s) > 8000:
            raise ValueError("message exceeds maximum length of 8000 characters")
        return s


_BROWSER_MODELS: dict[str, tuple[str, str]] = {
    "auto": ("AGENT_PRIMARY_MODEL", "openrouter/free"),
    "fast": ("AGENT_FAST_MODEL", "nvidia/nemotron-3-nano-30b-a3b:free"),
    "workhorse": ("AGENT_WORKHORSE_MODEL", "minimax/minimax-m2.5:free"),
    "smart": ("AGENT_SMART_MODEL", "z-ai/glm-4.5-air:free"),
    "backup": ("AGENT_BACKUP_MODEL", "openai/gpt-oss-20b:free"),
}


def _paid_models_allowed() -> bool:
    raw = os.environ.get("AGENT_ALLOW_PAID_MODELS", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _browser_model_for(mode: str) -> str:
    env_name, default = _BROWSER_MODELS.get(mode, _BROWSER_MODELS["workhorse"])
    model = os.environ.get(env_name, default).strip() or default
    if not _paid_models_allowed() and model != "openrouter/free" and not model.endswith(":free"):
        raise HTTPException(
            status_code=500,
            detail=f"{env_name} must be a free model while AGENT_ALLOW_PAID_MODELS=false",
        )
    return model


def _browser_text_limit() -> int:
    raw = os.environ.get("BROWSER_AGENT_MAX_CHARS", "6000").strip()
    try:
        value = int(raw, 10)
    except ValueError:
        return 6000
    return min(max(value, 1000), 12000)


def _compact_browser_text(text: str, max_chars: int) -> str:
    lines: list[str] = []
    for raw in text.replace("\r", "\n").splitlines():
        line = re.sub(r"[ \t\f\v]+", " ", raw).strip()
        if line:
            lines.append(line)
    compact = "\n".join(lines)
    if len(compact) <= max_chars:
        return compact
    return compact[:max_chars].rstrip() + "\n[truncated]"


class BrowserAnalyzeBody(BaseModel):
    """Compact visible page context from the browser extension."""

    url: str = Field(default="", description="Current tab URL")
    title: str = Field(default="", description="Current tab title")
    selection: str = Field(default="", description="Selected text, if any")
    visibleText: str = Field(..., description="Visible page text extracted by the extension")
    mode: str = Field(default="workhorse", description="auto, fast, workhorse, smart, or backup")
    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required before browser analysis runs",
    )

    @field_validator("url", "title", "selection", mode="before")
    @classmethod
    def _coerce_optional_text(cls, v: Any) -> str:
        if v is None:
            return ""
        if not isinstance(v, str):
            raise TypeError("field must be a string")
        return v.strip()

    @field_validator("visibleText")
    @classmethod
    def _validate_visible_text(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("visibleText must be a string")
        s = v.strip()
        if not s:
            raise ValueError("visibleText must not be empty")
        if len(s) > 20000:
            raise ValueError("visibleText exceeds maximum length of 20000 characters")
        return s

    @field_validator("mode")
    @classmethod
    def _validate_mode(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("mode must be a string")
        s = v.strip().lower() or "workhorse"
        if s not in _BROWSER_MODELS:
            raise ValueError("mode must be auto, fast, workhorse, smart, or backup")
        return s


def _browser_analysis_prompt(body: BrowserAnalyzeBody) -> str:
    page_text = _compact_browser_text(body.visibleText, _browser_text_limit())
    selected = _compact_browser_text(body.selection, 1200) if body.selection else "(none)"
    title = body.title[:300] if body.title else "(none)"
    url = body.url[:500] if body.url else "(none)"
    return (
        "You are a concise browser work assistant.\n"
        "Analyze the current page context and suggest the next useful answer or action.\n"
        "Use only the provided context. If the context is insufficient, say exactly what is missing.\n"
        "Answer in Russian. Do not include a safety lecture.\n"
        "Format:\n"
        "Коротко: <one sentence>\n"
        "Ответ/действие: <what to answer or do>\n"
        "Почему: <brief reason>\n"
        "Уверенность: high|medium|low\n\n"
        f"URL: {url}\n"
        f"Title: {title}\n"
        f"Selected text: {selected}\n\n"
        "Visible page text:\n"
        f"{page_text}\n"
    )


_SESSION_ID_LINE_RE = re.compile(r"^\s*session_id:\s*(\S+)\s*$", re.IGNORECASE)
_RESUMED_SESSION_LINE_RE = re.compile(
    r"^\s*(?:\u21bb\s+)?Resumed session\b.*$",
    re.IGNORECASE,
)
_SESSION_ID_SAFE_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")


def _parse_hermes_session_chat_stdout(raw: str) -> tuple[str, str | None, str | None]:
    """Remove ``session_id:`` and resume banner lines; return response, id, optional warning."""
    extracted: str | None = None
    out_lines: list[str] = []
    for line in raw.splitlines():
        m = _SESSION_ID_LINE_RE.match(line)
        if m:
            extracted = m.group(1)
            continue
        if _RESUMED_SESSION_LINE_RE.match(line):
            continue
        out_lines.append(line)
    text = "\n".join(out_lines).strip()
    warning = None
    if extracted is None:
        warning = (
            "Hermes did not emit a session_id line; the next message may start a new session."
        )
    return text, extracted, warning


_HERMES_SESSION_TOOLS = "terminal,file,memory"
_HERMES_SESSION_WEB_TOOLS = (
    os.environ.get("HERMES_SESSION_WEB_TOOLS", f"{_HERMES_SESSION_TOOLS},web").strip()
    or f"{_HERMES_SESSION_TOOLS},web"
)


def _hermes_session_chat_argv(
    message: str,
    resume_id: str | None,
    *,
    tools: str = _HERMES_SESSION_TOOLS,
) -> list[str]:
    """Fixed argv for ``hermes chat -q … -Q [--resume ID] --source tool -t …`` (no user flags)."""
    exe = _hermes_bin()
    if resume_id:
        return [
            exe,
            "chat",
            "-q",
            message,
            "-Q",
            "--resume",
            resume_id,
            "--source",
            "tool",
            "-t",
            tools,
        ]
    return [
        exe,
        "chat",
        "-q",
        message,
        "-Q",
        "--source",
        "tool",
        "-t",
        tools,
    ]


def _hermes_web_session_chat_argv(message: str, resume_id: str | None) -> list[str]:
    """Session chat with network/web tools enabled (same ``session_id`` as Fast/Session)."""
    return _hermes_session_chat_argv(message, resume_id, tools=_HERMES_SESSION_WEB_TOOLS)


class ChatSessionSendBody(BaseModel):
    """Hermes persistent session turn via ``hermes chat -q -Q`` (optional ``--resume``)."""

    message: str = Field(..., description="User message passed to Hermes -q")
    sessionId: str | None = Field(
        default=None,
        description="Hermes session id from prior turn, or null to start",
    )

    @field_validator("message")
    @classmethod
    def _validate_session_message(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("message must be a string")
        s = v.strip()
        if not s:
            raise ValueError("message must not be empty")
        if len(s) > 8000:
            raise ValueError("message exceeds maximum length of 8000 characters")
        return s

    @field_validator("sessionId", mode="before")
    @classmethod
    def _coerce_session_id(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        if not isinstance(v, str):
            raise TypeError("sessionId must be a string or null")
        return v.strip()

    @field_validator("sessionId")
    @classmethod
    def _validate_session_id(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if len(v) > 128:
            raise ValueError("sessionId exceeds maximum length of 128 characters")
        if not _SESSION_ID_SAFE_RE.fullmatch(v):
            raise ValueError(
                "sessionId must contain only letters, numbers, underscore, and hyphen",
            )
        return v


class ChatWebSendBody(ChatSessionSendBody):
    """Web turn in the shared Hermes session (``hermes chat`` with web tools)."""

    policyConfirmationToken: str | None = Field(
        default=None,
        description="Required for network web-send when policy gate demands confirmation",
    )


@router.get("/chat/sessions")
async def chat_sessions() -> dict[str, Any]:
    """List recent Hermes sessions for the dashboard."""
    code, text = await _run_cmd([_hermes_bin(), "sessions", "list"], timeout=30.0)
    if code == 127:
        return {"sessions": []}
    if code != 0:
        raise HTTPException(
            status_code=502,
            detail=f"Hermes sessions list failed with code {code}: {text[-1000:]}",
        )

    sessions: list[dict[str, str]] = []
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line or line.startswith("Title ") or line.startswith("─"):
            continue

        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) < 4:
            continue

        session_id = parts[-1].strip()
        if session_id == "ID":
            continue
        if not _SESSION_ID_SAFE_RE.fullmatch(session_id):
            continue

        title = parts[0].strip()
        preview = parts[1].strip()
        last_active = " ".join(parts[2:-1]).strip()

        sessions.append(
            {
                "sessionId": session_id,
                "title": "" if title == "—" else title,
                "preview": "" if preview == "—" else preview,
                "lastActive": last_active,
            }
        )

    return {"sessions": sessions}


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str) -> dict[str, str]:
    """Delete a Hermes session from the local session store."""
    if not _SESSION_ID_SAFE_RE.fullmatch(session_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid session id",
        )

    code, text = await _run_cmd(
        [_hermes_bin(), "sessions", "delete", "--yes", session_id],
        timeout=30.0,
    )
    if code != 0:
        raise HTTPException(
            status_code=502,
            detail=f"Hermes session delete failed with code {code}: {text[-1000:]}",
        )

    return {"ok": "true", "sessionId": session_id}


@router.get("/chat/sessions/{session_id}/transcript")
async def chat_session_transcript(session_id: str) -> dict[str, Any]:
    """Load user/assistant transcript from a Hermes session export."""
    if not _SESSION_ID_SAFE_RE.fullmatch(session_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid session id",
        )

    code, text = await _run_cmd(
        [_hermes_bin(), "sessions", "export", "--session-id", session_id, "-"],
        timeout=60.0,
    )
    if code != 0:
        raise HTTPException(
            status_code=502,
            detail=f"Hermes session export failed with code {code}: {text[-1000:]}",
        )

    session_obj: dict[str, Any] | None = None
    for line in text.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("id") == session_id:
            session_obj = obj
            break

    if session_obj is None:
        raise HTTPException(status_code=404, detail="Session not found")

    out: list[dict[str, Any]] = []
    for m in session_obj.get("messages") or []:
        role = m.get("role")
        content = m.get("content")
        if role not in ("user", "assistant"):
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        out.append(
            {
                "id": str(m.get("id") or ""),
                "role": role,
                "content": content,
                "timestamp": m.get("timestamp"),
            }
        )

    return {
        "sessionId": session_id,
        "title": session_obj.get("title"),
        "messageCount": len(out),
        "messages": out,
    }


@router.post("/chat/session-send")
async def chat_session_send(
    body: ChatSessionSendBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Run ``hermes chat -q`` with optional ``--resume``; parse ``session_id`` from stdout."""
    _enforce_chat_message_policy(
        request=request,
        message=body.message,
        endpoint="/api/chat/session-send",
    )
    run_id = _run_id_from_request(request)
    orchestrator_mode = _emit_route_decision(
        run_id=run_id,
        message=body.message,
        endpoint="/api/chat/session-send",
    )
    timeout_sec = get_chat_timeout_seconds()
    argv = _hermes_session_chat_argv(body.message, body.sessionId)
    _emit_hermes_spawn(run_id=run_id, argv=argv, endpoint="/api/chat/session-send")
    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env=_hermes_subprocess_env(run_id),
        )
    except OSError as exc:
        raise _hermes_unavailable_error(exc) from exc

    try:
        out, _ = await asyncio.wait_for(
            proc.communicate(),
            timeout=float(timeout_sec),
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "response": f"Hermes timed out after {timeout_sec} seconds.\n",
            "sessionId": body.sessionId,
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "hermes-session",
            "orchestratorMode": orchestrator_mode.value,
            "parseWarning": None,
        }

    raw = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((time.monotonic() - started) * 1000)
    response_text, parsed_sid, parse_warn = _parse_hermes_session_chat_stdout(raw)
    if code != 0:
        response_text_inner = response_text
        response_text = (
            f"Hermes exited with code {code}.\n\n{response_text_inner}".strip() + "\n"
        ).strip()
    return {
        "response": response_text,
        "sessionId": parsed_sid,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "hermes-session",
        "orchestratorMode": orchestrator_mode.value,
        "parseWarning": parse_warn,
    }


@router.post("/chat/send")
async def chat_send(
    body: ChatSendBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Run ``hermes -z <message>`` from the workspace root; no user-controlled flags."""
    _enforce_chat_message_policy(
        request=request,
        message=body.message,
        endpoint="/api/chat/send",
    )
    run_id = _run_id_from_request(request)
    orchestrator_mode = _emit_route_decision(
        run_id=run_id,
        message=body.message,
        endpoint="/api/chat/send",
    )
    timeout_sec = get_chat_timeout_seconds()
    argv = [_hermes_bin(), "-z", body.message]
    _emit_hermes_spawn(run_id=run_id, argv=argv, endpoint="/api/chat/send")
    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env=_hermes_subprocess_env(run_id),
        )
    except OSError as exc:
        raise _hermes_unavailable_error(exc) from exc

    try:
        out, _ = await asyncio.wait_for(
            proc.communicate(),
            timeout=float(timeout_sec),
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "response": f"Hermes timed out after {timeout_sec} seconds.\n",
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "oneshot",
            "orchestratorMode": orchestrator_mode.value,
        }

    text = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((time.monotonic() - started) * 1000)
    response_text = text
    if code != 0:
        response_text = (
            f"Hermes exited with code {code}.\n\n{response_text}".strip() + "\n"
        ).strip()
    return {
        "response": response_text,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "oneshot",
        "orchestratorMode": orchestrator_mode.value,
    }


@router.post("/chat/web-send")
async def chat_web_send(
    body: ChatWebSendBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Run ``hermes chat`` with web tools in the same session as Fast/Session (``--resume``)."""
    action = "network web-send"
    _enforce_policy(
        request=request,
        action=action,
        context={"endpoint": "/api/chat/web-send", "kind": "network"},
        confirmation_token=body.policyConfirmationToken,
    )
    run_id = _run_id_from_request(request)
    orchestrator_mode = _emit_route_decision(
        run_id=run_id,
        message=body.message,
        endpoint="/api/chat/web-send",
    )
    research_query_id: str | None = None
    if orchestrator_mode == OrchestratorMode.WEB:
        try:
            research_result = await get_research_pipeline().run(
                ResearchQuery(
                    query=body.message,
                    max_results=5,
                    timeout_seconds=min(15.0, float(get_chat_timeout_seconds())),
                ),
                run_id=run_id,
                skip_policy=True,
            )
            research_query_id = research_result.query_id
            emit_event(
                run_id=run_id,
                layer="orchestrator",
                decision="research_linked",
                reason=f"web-send research query_id={research_query_id}",
                inputs_redacted={
                    "endpoint": "/api/chat/web-send",
                    "queryId": research_query_id,
                    "query": body.message[:200],
                },
                outcome="linked",
            )
        except Exception as exc:
            emit_event(
                run_id=run_id,
                layer="research",
                decision="web_send_preflight",
                reason=str(exc)[:200],
                inputs_redacted={"query": body.message[:200]},
                outcome="failed",
            )
    timeout_sec = get_chat_timeout_seconds()
    argv = _hermes_web_session_chat_argv(body.message, body.sessionId)
    _emit_hermes_spawn(run_id=run_id, argv=argv, endpoint="/api/chat/web-send")
    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env=_hermes_subprocess_env(run_id),
        )
    except OSError as exc:
        raise _hermes_unavailable_error(exc) from exc

    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=float(timeout_sec))
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "response": f"Hermes web mode timed out after {timeout_sec} seconds.\n",
            "sessionId": body.sessionId,
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "web-session",
            "orchestratorMode": orchestrator_mode.value,
            "researchQueryId": research_query_id,
            "parseWarning": None,
        }

    raw = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((time.monotonic() - started) * 1000)
    response_text, parsed_sid, parse_warn = _parse_hermes_session_chat_stdout(raw)
    if code != 0:
        response_text = (
            f"Hermes exited with code {code}.\n\n{response_text}".strip() + "\n"
        ).strip()

    return {
        "response": response_text,
        "sessionId": parsed_sid,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "web-session",
        "orchestratorMode": orchestrator_mode.value,
        "researchQueryId": research_query_id,
        "parseWarning": parse_warn,
    }


@router.post("/browser/analyze")
async def browser_analyze(
    body: BrowserAnalyzeBody,
    request: Request,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Analyze compact browser page context with a free-model Hermes one-shot."""
    action = "browser analyze"
    _enforce_policy(
        request=request,
        action=action,
        context={"endpoint": "/api/browser/analyze", "kind": "browser"},
        confirmation_token=body.policyConfirmationToken,
    )
    timeout_sec = get_chat_timeout_seconds()
    model = _browser_model_for(body.mode)
    prompt = _browser_analysis_prompt(body)
    argv = [
        _hermes_bin(),
        "-z",
        prompt,
        "--provider",
        "openrouter",
        "--model",
        model,
    ]
    run_id = _run_id_from_request(request)
    _emit_hermes_spawn(run_id=run_id, argv=argv, endpoint="/api/browser/analyze")
    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env=_hermes_subprocess_env(run_id),
        )
    except OSError as exc:
        raise _hermes_unavailable_error(exc) from exc

    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=float(timeout_sec))
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "response": f"Hermes browser helper timed out after {timeout_sec} seconds.\n",
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "browser-analyze",
            "model": model,
            "requestMode": body.mode,
        }

    text = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((time.monotonic() - started) * 1000)
    if code != 0:
        text = (f"Hermes exited with code {code}.\n\n{text}".strip() + "\n").strip()

    return {
        "response": text,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "browser-analyze",
        "model": model,
        "requestMode": body.mode,
    }


@router.get("/commands/whitelist")
def commands_whitelist() -> dict[str, list[str]]:
    return {"commands": list_whitelisted_commands()}


@router.post("/commands/run")
async def run_whitelisted(body: CommandBody, request: Request) -> dict[str, Any]:
    cmd = body.command.strip()
    action = f"exec {cmd}"
    _enforce_policy(
        request=request,
        action=action,
        context={"endpoint": "/api/commands/run", "kind": "exec", "command": cmd},
        confirmation_token=body.policyConfirmationToken,
    )
    if not is_whitelisted_command(cmd):
        raise HTTPException(status_code=400, detail="Command not allowed")
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(get_workspace_root()),
        env={**os.environ, "LC_ALL": "C.UTF-8"},
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=180.0)
    except asyncio.TimeoutError:
        proc.kill()
        return {"exitCode": 124, "output": "Command timed out\n"}
    text = out.decode("utf-8", errors="replace")
    code = proc.returncode
    if code is None:
        code = -1
    return {"exitCode": code, "output": _tail_lines(text, 300)}
