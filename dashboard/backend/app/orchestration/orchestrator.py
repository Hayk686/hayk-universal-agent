"""Workflow orchestrator state machine with PolicyGate integration."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from app.observability.events import emit_event
from app.orchestration.models import (
    OrchestratorMode,
    StepStatus,
    WorkflowState,
    WorkflowStep,
)
from app.orchestration.router import RouteDecision, is_browser_heavy_task, route_task
from app.orchestration.workflow_store import WorkflowStore
from app.policy.confirmation import verify_confirmation_token
from app.policy.gate import PolicyDecision, classify_action
from app.research.models import ResearchQuery
from app.research.pipeline import get_research_pipeline


class WorkflowNotFoundError(LookupError):
    pass


class WorkflowPausedError(RuntimeError):
    pass


class WorkflowStepNotFoundError(LookupError):
    pass


StepRunner = Callable[[WorkflowState, WorkflowStep], str]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _policy_action_for_step(step: WorkflowStep, task: str) -> tuple[str, dict[str, Any]]:
    if step.action == "policy pre-check":
        return "exec chat message", {"kind": "exec", "command": task, "chat_message": True}
    if step.mode == OrchestratorMode.WEB:
        return "network web-send", {"kind": "network", "endpoint": "/api/chat/web-send"}
    if step.mode == OrchestratorMode.SESSION:
        return "exec chat message", {"kind": "exec", "command": task, "chat_message": True}
    return "exec chat message", {"kind": "exec", "command": task, "chat_message": True}


def _build_steps(task: str, route: RouteDecision) -> list[WorkflowStep]:
    return [
        WorkflowStep(
            id="1",
            title="Policy pre-check",
            action="policy pre-check",
            status=StepStatus.PENDING,
            mode=route.mode,
        ),
        WorkflowStep(
            id="2",
            title=f"Execute via {route.mode.value} mode",
            action=f"orchestrate {route.mode.value}",
            status=StepStatus.PENDING,
            mode=route.mode,
        ),
    ]


def _recompute_status(workflow: WorkflowState) -> None:
    if workflow.paused:
        workflow.status = StepStatus.PAUSED
        return
    if any(s.status == StepStatus.FAILED for s in workflow.steps):
        workflow.status = StepStatus.FAILED
        return
    if all(s.status == StepStatus.COMPLETED for s in workflow.steps):
        workflow.status = StepStatus.COMPLETED
        return
    if any(s.status == StepStatus.RUNNING for s in workflow.steps):
        workflow.status = StepStatus.RUNNING
        return
    workflow.status = StepStatus.PENDING


class Orchestrator:
    def __init__(
        self,
        store: WorkflowStore,
        *,
        step_runner: StepRunner | None = None,
    ) -> None:
        self._store = store
        self._step_runner = step_runner

    def plan(self, task: str, *, run_id: str = "") -> WorkflowState:
        route = route_task(task)
        workflow_id = str(uuid.uuid4())
        workflow = WorkflowState(
            workflow_id=workflow_id,
            task=task.strip(),
            mode=route.mode,
            playbook_mode=route.playbook_mode,
            routing_reason=route.reason,
            status=StepStatus.PENDING,
            steps=_build_steps(task, route),
            run_id=run_id or None,
            browser_preflight_required=is_browser_heavy_task(task),
        )
        self._store.save(workflow)
        if run_id:
            emit_event(
                run_id=run_id,
                layer="orchestrator",
                decision="plan",
                reason=route.reason,
                inputs_redacted={
                    "workflowId": workflow_id,
                    "mode": route.mode.value,
                    "playbookMode": route.playbook_mode,
                    "browserPreflightRequired": workflow.browser_preflight_required,
                },
                outcome="created",
            )
        return workflow

    def get(self, workflow_id: str) -> WorkflowState:
        wf = self._store.load(workflow_id)
        if wf is None:
            raise WorkflowNotFoundError(workflow_id)
        return wf

    def list_workflows(self) -> list[WorkflowState]:
        return [self.get(wid) for wid in self._store.list_ids()]

    def pause(self, workflow_id: str, *, run_id: str = "") -> WorkflowState:
        wf = self.get(workflow_id)
        wf.paused = True
        for step in wf.steps:
            if step.status == StepStatus.RUNNING:
                step.status = StepStatus.PAUSED
        _recompute_status(wf)
        wf.updated_at = _utc_now()
        self._store.save(wf)
        if run_id:
            emit_event(
                run_id=run_id,
                layer="orchestrator",
                decision="pause",
                reason=f"workflow {workflow_id} paused",
                inputs_redacted={"workflowId": workflow_id},
                outcome="paused",
            )
        return wf

    def resume(self, workflow_id: str, *, run_id: str = "") -> WorkflowState:
        wf = self.get(workflow_id)
        wf.paused = False
        for step in wf.steps:
            if step.status == StepStatus.PAUSED:
                step.status = StepStatus.PENDING
        _recompute_status(wf)
        wf.updated_at = _utc_now()
        self._store.save(wf)
        if run_id:
            emit_event(
                run_id=run_id,
                layer="orchestrator",
                decision="resume",
                reason=f"workflow {workflow_id} resumed",
                inputs_redacted={"workflowId": workflow_id},
                outcome="resumed",
            )
        return wf

    def execute_step(
        self,
        workflow_id: str,
        *,
        step_id: str | None = None,
        run_id: str = "",
        confirmation_token: str | None = None,
    ) -> WorkflowState:
        wf = self.get(workflow_id)
        if wf.paused:
            raise WorkflowPausedError(f"workflow {workflow_id} is paused")

        step = self._select_step(wf, step_id)
        if step.status in (StepStatus.COMPLETED, StepStatus.FAILED):
            return wf

        action, context = _policy_action_for_step(step, wf.task)
        decision = classify_action(action, context=context)
        allowed, policy_reason = self._apply_policy(
            decision,
            action,
            confirmation_token,
            run_id=run_id,
            workflow_id=workflow_id,
            step_id=step.id,
        )
        if not allowed:
            step.status = StepStatus.FAILED
            step.error = policy_reason
            step.policy_reason = policy_reason
            _recompute_status(wf)
            wf.updated_at = _utc_now()
            self._store.save(wf)
            return wf

        step.status = StepStatus.RUNNING
        wf.updated_at = _utc_now()
        self._store.save(wf)

        try:
            if step.action == "policy pre-check":
                step.result = decision.reason
            elif step.action.startswith("orchestrate") and wf.browser_preflight_required:
                # Browser-heavy: surface preflight metadata then let runner (if any)
                # finalize the step. UI must invoke /api/browser/action with a
                # confirmation token; the orchestrator never auto-executes browser
                # interactions because they require user gesture context.
                preflight = self._run_browser_preflight(wf, run_id=run_id)
                runner_result = self._step_runner(wf, step) if self._step_runner else None
                step.result = "\n".join(p for p in (preflight, runner_result) if p)
            elif step.action.startswith("orchestrate") and wf.mode == OrchestratorMode.WEB:
                preflight = self._run_web_research_preflight(wf, run_id=run_id)
                runner_result = self._step_runner(wf, step) if self._step_runner else None
                step.result = "\n".join(p for p in (preflight, runner_result) if p)
            elif step.action.startswith("orchestrate") and self._step_runner:
                step.result = self._step_runner(wf, step)
            elif step.action.startswith("orchestrate"):
                # No runner injected (tests, offline). Mark as pending-runner so UI
                # knows nothing actually ran.
                step.result = (
                    f"step {step.id}: no step runner attached; orchestrator only tracked state"
                )
            else:
                step.result = f"step {step.id} completed"
            step.status = StepStatus.COMPLETED
            step.error = None
        except Exception as exc:
            step.status = StepStatus.FAILED
            step.error = str(exc)
            if run_id:
                emit_event(
                    run_id=run_id,
                    layer="orchestrator",
                    decision="step_failed",
                    reason=str(exc),
                    inputs_redacted={"workflowId": workflow_id, "stepId": step.id},
                    outcome="failed",
                )

        _recompute_status(wf)
        wf.updated_at = _utc_now()
        self._store.save(wf)

        if wf.status == StepStatus.COMPLETED:
            from app.memory.lifecycle import on_workflow_completed

            root = getattr(self._store, "_root", None)
            if root is not None:
                on_workflow_completed(root, wf, run_id=run_id)

        if run_id:
            emit_event(
                run_id=run_id,
                layer="orchestrator",
                decision="execute_step",
                reason=f"step {step.id} → {step.status.value}",
                inputs_redacted={
                    "workflowId": workflow_id,
                    "stepId": step.id,
                    "mode": wf.mode.value,
                    **({"browserActionId": wf.browser_action_id} if wf.browser_action_id else {}),
                },
                outcome=step.status.value,
            )
        return wf

    def link_browser_action(self, workflow_id: str, action_id: str) -> WorkflowState:
        wf = self.get(workflow_id)
        wf.browser_action_id = action_id
        wf.updated_at = _utc_now()
        self._store.save(wf)
        return wf

    def _run_browser_preflight(self, wf: WorkflowState, *, run_id: str) -> str:
        """Metadata-only hook — browser actions require explicit API confirmation."""
        emit_event(
            run_id=run_id,
            layer="orchestrator",
            decision="browser_preflight",
            reason="browser-heavy task detected; use /api/browser/action with confirmation",
            inputs_redacted={
                "workflowId": wf.workflow_id,
                "browserPreflightRequired": True,
            },
            outcome="metadata_only",
        )
        return (
            "browser preflight: actions require confirmation via POST /api/browser/action "
            "(no auto-execution)"
        )

    def _select_step(self, wf: WorkflowState, step_id: str | None) -> WorkflowStep:
        if step_id:
            for s in wf.steps:
                if s.id == step_id:
                    return s
            raise WorkflowStepNotFoundError(step_id)
        for s in wf.steps:
            if s.status == StepStatus.PENDING:
                return s
        raise WorkflowStepNotFoundError("no pending step")

    def _apply_policy(
        self,
        decision: PolicyDecision,
        action: str,
        confirmation_token: str | None,
        *,
        run_id: str,
        workflow_id: str,
        step_id: str,
    ) -> tuple[bool, str]:
        if decision.allowed:
            return True, decision.reason
        if decision.requires_confirmation:
            if confirmation_token:
                ok, reason = verify_confirmation_token(confirmation_token, action)
                if ok:
                    return True, "confirmation token accepted"
                return False, reason
            return False, decision.reason
        return False, decision.reason

    def _run_web_research_preflight(self, wf: WorkflowState, *, run_id: str) -> str:
        """Optional research pipeline hook before Hermes web-send (WEB mode)."""
        import asyncio

        pipeline = get_research_pipeline()
        query = ResearchQuery(query=wf.task, max_results=5, timeout_seconds=15.0)
        try:
            result = asyncio.run(pipeline.run(query, run_id=run_id, skip_policy=True))
        except Exception as exc:
            emit_event(
                run_id=run_id,
                layer="research",
                decision="preflight",
                reason=str(exc)[:200],
                inputs_redacted={"query": wf.task[:200], "workflowId": wf.workflow_id},
                outcome="failed",
            )
            return f"research preflight failed: {exc}"

        wf.research_query_id = result.query_id
        emit_event(
            run_id=run_id,
            layer="orchestrator",
            decision="research_preflight",
            reason=f"query_id={result.query_id}",
            inputs_redacted={
                "workflowId": wf.workflow_id,
                "queryId": result.query_id,
                "citationCount": len(result.citations),
            },
            outcome="linked",
        )
        return (
            f"research preflight complete ({len(result.citations)} citations, "
            f"query_id={result.query_id})"
        )
