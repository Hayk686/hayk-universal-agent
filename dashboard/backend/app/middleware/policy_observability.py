"""FastAPI middleware: run_id assignment and policy observability hooks."""

from __future__ import annotations

import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.observability.events import emit_event

def _is_policy_monitored(path: str) -> bool:
    if path == "/api/commands/run" or path.startswith("/api/browser/"):
        return True
    if path.startswith("/api/orchestration"):
        return True
    return path.startswith("/api/chat/")


class PolicyObservabilityMiddleware(BaseHTTPMiddleware):
    """Assign ``run_id`` and emit structured events for policy-monitored routes."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        run_id = request.headers.get("X-Run-Id") or str(uuid.uuid4())
        request.state.run_id = run_id

        monitored = _is_policy_monitored(request.url.path)
        if monitored:
            emit_event(
                run_id=run_id,
                layer="middleware",
                decision="request_received",
                reason=f"{request.method} {request.url.path}",
                inputs_redacted={"method": request.method, "path": request.url.path},
                outcome="started",
            )

        try:
            response = await call_next(request)
        except Exception as exc:
            if monitored:
                emit_event(
                    run_id=run_id,
                    layer="middleware",
                    decision="error",
                    reason=str(exc),
                    inputs_redacted={"method": request.method, "path": request.url.path},
                    outcome="failed",
                )
            raise

        response.headers["X-Run-Id"] = run_id
        if monitored:
            emit_event(
                run_id=run_id,
                layer="middleware",
                decision="request_completed",
                reason=f"status={response.status_code}",
                inputs_redacted={"method": request.method, "path": request.url.path},
                outcome="completed" if response.status_code < 400 else "rejected",
            )
        return response
