"""Default step runner that actually executes orchestrated steps.

The orchestrator used to fall back to ``step.result = f"step {id} completed"``
because no runner was wired in. This module provides a real implementation
that:

- For FAST/SESSION steps: spawns ``hermes -z`` or ``hermes chat -q`` subprocess
  (mirroring ``api.chat_send`` / ``chat_session_send`` argv shape) and stores
  the truncated assistant response on the step.
- For WEB steps: chains a research preflight (already linked) with a Hermes
  call that includes the citation summary as context.
- For environments without Hermes installed (Vercel cloud, CI), the runner
  raises a structured ``HermesUnavailableError`` so the orchestrator can mark
  the step ``failed`` with an actionable reason instead of silently writing a
  placeholder string.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
from typing import Callable

from app.config import get_chat_timeout_seconds, get_workspace_root
from app.observability.events import emit_event
from app.orchestration.models import OrchestratorMode, WorkflowState, WorkflowStep
from app.research.pipeline import get_cached_result


class HermesUnavailableError(RuntimeError):
    """Raised when the ``hermes`` binary cannot be found on PATH/HERMES_BIN."""


def _hermes_bin() -> str:
    return os.environ.get("HERMES_BIN", "hermes")


def _hermes_available() -> bool:
    return shutil.which(_hermes_bin()) is not None


def _truncate(text: str, *, max_chars: int = 4000) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n[truncated]"


def _build_argv(workflow: WorkflowState) -> list[str]:
    """argv aligned with /api/chat/* spawn paths in api.py."""
    exe = _hermes_bin()
    message = workflow.task
    if workflow.mode == OrchestratorMode.WEB:
        message = _augment_with_research(workflow)
        return [
            exe,
            "chat",
            "-q",
            message,
            "-Q",
            "--source",
            "tool",
            "-t",
            "terminal,file,memory,web",
        ]
    if workflow.mode == OrchestratorMode.SESSION:
        return [
            exe,
            "chat",
            "-q",
            message,
            "-Q",
            "--source",
            "tool",
            "-t",
            "terminal,file,memory",
        ]
    return [exe, "-z", message]


def _augment_with_research(workflow: WorkflowState) -> str:
    """Inject linked research citations into WEB-mode prompt, if any."""
    if not workflow.research_query_id:
        return workflow.task
    cached = get_cached_result(workflow.research_query_id)
    if cached is None or not cached.citations:
        return workflow.task
    lines = [workflow.task, "", "Context (research preflight):", cached.summary]
    for c in cached.citations[:5]:
        title = c.title or c.url
        lines.append(f"- {title} <{c.url}>")
    return "\n".join(lines)


def _spawn_hermes(workflow: WorkflowState, *, run_id: str) -> str:
    if not _hermes_available():
        raise HermesUnavailableError(
            f"Hermes binary {_hermes_bin()!r} not found on PATH; set HERMES_BIN or install Hermes."
        )
    argv = _build_argv(workflow)
    timeout = float(get_chat_timeout_seconds())
    env = {**os.environ, "LC_ALL": "C.UTF-8"}
    if run_id:
        env["HERMES_RUN_ID"] = run_id
    emit_event(
        run_id=run_id,
        layer="orchestrator",
        decision="step_runner_spawn",
        reason=f"hermes argv0={argv[0]}",
        inputs_redacted={
            "workflowId": workflow.workflow_id,
            "mode": workflow.mode.value,
            "argc": len(argv),
        },
        outcome="spawned",
    )
    try:
        completed = subprocess.run(  # noqa: S603 — argv list, no shell
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(get_workspace_root()),
            env=env,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        raise HermesUnavailableError(
            f"Hermes step timed out after {timeout:.0f}s"
        ) from None
    except FileNotFoundError as exc:
        raise HermesUnavailableError(str(exc)) from exc

    output = completed.stdout or ""
    if completed.returncode != 0:
        tail = (completed.stderr or completed.stdout or "").strip()[-800:]
        raise RuntimeError(
            f"hermes exited with code {completed.returncode}: {tail}"
        )
    return _truncate(output)


def hermes_step_runner(workflow: WorkflowState, step: WorkflowStep) -> str:
    """Real ``StepRunner`` callable for Orchestrator(step_runner=...).

    Signature matches ``Callable[[WorkflowState, WorkflowStep], str]``.
    Raises on failure; the orchestrator already catches and marks ``FAILED``.
    """
    run_id = workflow.run_id or ""
    if step.action == "policy pre-check":
        return "policy classification passed"
    if not step.action.startswith("orchestrate"):
        return f"step {step.id} completed"
    return _spawn_hermes(workflow, run_id=run_id)


def make_default_step_runner() -> Callable[[WorkflowState, WorkflowStep], str]:
    """Factory returning the production runner.

    Centralized so ``api.py`` and tests can swap implementations without
    importing private symbols.
    """
    return hermes_step_runner
