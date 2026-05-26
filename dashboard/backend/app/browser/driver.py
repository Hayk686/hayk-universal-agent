"""Browser driver adapters with PolicyGate-gated actions."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.browser.models import (
    BrowserActionRequest,
    BrowserActionResult,
    BrowserActionType,
    BrowserSessionProfile,
)
from app.observability.events import emit_event
from app.policy.confirmation import verify_confirmation_token
from app.policy.gate import PolicyDecision, classify_action

logger = logging.getLogger(__name__)

_ACTION_CACHE: dict[str, BrowserActionResult] = {}

_DEFAULT_SESSION_PROFILES: tuple[BrowserSessionProfile, ...] = (
    BrowserSessionProfile(id="default", name="Default", user_agent=None),
    BrowserSessionProfile(
        id="mobile",
        name="Mobile (iOS Safari UA)",
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/17.4 Mobile/15E148 Safari/604.1"
        ),
    ),
    BrowserSessionProfile(
        id="desktop-firefox",
        name="Desktop (Firefox UA)",
        user_agent=(
            "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0"
        ),
    ),
)

# Minimum-valid 1×1 transparent PNG. Used when no real headless browser is
# available so the screenshot endpoint still returns a real image instead of a
# ``.txt`` file pretending to be a screenshot. The companion sidecar JSON
# describes what was captured (URL, timestamp, driver) so the UI can show a
# clear "no headless renderer installed" badge.
_FALLBACK_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4//8/AwAI/AL+XJ/q"
    "wQAAAABJRU5ErkJggg=="
)
_FALLBACK_PNG_BYTES = base64.b64decode(_FALLBACK_PNG_BASE64)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


class BrowserPolicyError(PermissionError):
    """Raised when PolicyGate denies a browser action."""


def browser_policy_action(action_type: BrowserActionType) -> str:
    return f"browser {action_type.value}"


def extract_url_domain(url: str | None) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip())
        return parsed.netloc or parsed.path.split("/")[0] or ""
    except ValueError:
        return ""


def _html_to_text(html: str, *, max_chars: int = 8000) -> str:
    text = _TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n[truncated]"


def _format_screenshot_sidecar(
    *, action_id: str, url: str, domain: str, page_text: str
) -> str:
    """JSON sidecar that documents an httpx-driver screenshot placeholder.

    Stored next to the ``.png`` so consumers can tell at a glance that the
    image is a 1×1 placeholder and what page context was captured instead.
    """
    import json as _json

    payload = {
        "actionId": action_id,
        "url": url,
        "domain": domain,
        "driver": "httpx",
        "kind": "placeholder",
        "imageBytes": len(_FALLBACK_PNG_BYTES),
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pageTextPreview": page_text[:2000],
        "hint": (
            "Install Playwright (pip install playwright && playwright install chromium) "
            "and set BROWSER_DRIVER=playwright in the dashboard backend env to capture "
            "real screenshots."
        ),
    }
    return _json.dumps(payload, ensure_ascii=False, indent=2)


def _emit_browser_event(
    *,
    run_id: str,
    decision: str,
    reason: str,
    action_type: BrowserActionType,
    url: str | None,
    outcome: str,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "action": action_type.value,
        "urlDomain": extract_url_domain(url),
    }
    if extra:
        payload.update(extra)
    emit_event(
        run_id=run_id,
        layer="browser",
        decision=decision,
        reason=reason,
        inputs_redacted=payload,
        outcome=outcome,
    )


def ensure_browser_policy_allowed(
    *,
    action_type: BrowserActionType,
    confirmation_token: str | None,
    run_id: str,
    url: str | None = None,
) -> PolicyDecision:
    action = browser_policy_action(action_type)
    decision = classify_action(
        action,
        context={
            "kind": "browser",
            "endpoint": "/api/browser/action",
            "browser_action": action_type.value,
        },
    )
    _emit_browser_event(
        run_id=run_id,
        decision="allow" if decision.allowed else ("confirm" if decision.requires_confirmation else "deny"),
        reason=decision.reason,
        action_type=action_type,
        url=url,
        outcome="policy_classified",
    )
    if decision.allowed:
        return decision
    if decision.requires_confirmation and confirmation_token:
        ok, reason = verify_confirmation_token(confirmation_token, action)
        if ok:
            _emit_browser_event(
                run_id=run_id,
                decision="allow",
                reason="confirmation token accepted",
                action_type=action_type,
                url=url,
                outcome="policy_confirmed",
            )
            return PolicyDecision(
                allowed=True,
                risk=decision.risk,
                requires_confirmation=False,
                reason="confirmation token accepted",
                confirmation_token=None,
            )
        _emit_browser_event(
            run_id=run_id,
            decision="confirm",
            reason=reason,
            action_type=action_type,
            url=url,
            outcome="confirm_failed",
        )
        raise BrowserPolicyError(reason)
    _emit_browser_event(
        run_id=run_id,
        decision="confirm" if decision.requires_confirmation else "deny",
        reason=decision.reason,
        action_type=action_type,
        url=url,
        outcome="policy_denied",
    )
    raise BrowserPolicyError(decision.reason)


def cache_action_result(result: BrowserActionResult) -> None:
    _ACTION_CACHE[result.action_id] = result


def get_cached_action(action_id: str) -> BrowserActionResult | None:
    return _ACTION_CACHE.get(action_id)


def clear_action_cache() -> None:
    """Test helper."""
    _ACTION_CACHE.clear()


def list_session_profiles() -> list[BrowserSessionProfile]:
    return list(_DEFAULT_SESSION_PROFILES)


class BrowserDriver(ABC):
    @abstractmethod
    async def execute(
        self,
        request: BrowserActionRequest,
        *,
        run_id: str = "",
        workspace_root: Path | None = None,
    ) -> BrowserActionResult: ...


class StubBrowserDriver(BrowserDriver):
    """Canned results for tests and offline development."""

    def __init__(
        self,
        *,
        snapshot_text: str = "Stub page snapshot: Example Domain",
        screenshot_path: str = "output/browser-screenshots/stub.png",
        fail_on: BrowserActionType | None = None,
        delay_seconds: float = 0.0,
    ) -> None:
        self._snapshot_text = snapshot_text
        self._screenshot_path = screenshot_path
        self._fail_on = fail_on
        self._delay_seconds = delay_seconds

    async def execute(
        self,
        request: BrowserActionRequest,
        *,
        run_id: str = "",
        workspace_root: Path | None = None,
    ) -> BrowserActionResult:
        started = time.monotonic()
        if self._delay_seconds:
            await asyncio.sleep(self._delay_seconds)
        action_id = str(uuid.uuid4())
        if self._fail_on == request.action:
            result = BrowserActionResult(
                action_id=action_id,
                success=False,
                error=f"stub failure for {request.action.value}",
                duration_ms=int((time.monotonic() - started) * 1000),
            )
        elif request.action in (BrowserActionType.CLICK, BrowserActionType.FILL):
            if not request.selector:
                result = BrowserActionResult(
                    action_id=action_id,
                    success=False,
                    error="selector is required for click/fill",
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
            else:
                result = BrowserActionResult(
                    action_id=action_id,
                    success=True,
                    snapshot_text=f"stub {request.action.value} on {request.selector}",
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
        elif request.action == BrowserActionType.SCREENSHOT:
            result = BrowserActionResult(
                action_id=action_id,
                success=True,
                snapshot_text=self._snapshot_text,
                screenshot_path=self._screenshot_path,
                duration_ms=int((time.monotonic() - started) * 1000),
            )
        else:
            result = BrowserActionResult(
                action_id=action_id,
                success=True,
                snapshot_text=self._snapshot_text,
                duration_ms=int((time.monotonic() - started) * 1000),
            )
        cache_action_result(result)
        _emit_browser_event(
            run_id=run_id,
            decision=request.action.value,
            reason="stub driver completed",
            action_type=request.action,
            url=request.url,
            outcome="success" if result.success else "failed",
            extra={
                "actionId": result.action_id,
                **({"path": result.screenshot_path} if result.screenshot_path else {}),
            },
        )
        return result


class HttpxBrowserDriver(BrowserDriver):
    """Minimal navigate/snapshot via httpx — MVP without Hermes subprocess."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def execute(
        self,
        request: BrowserActionRequest,
        *,
        run_id: str = "",
        workspace_root: Path | None = None,
    ) -> BrowserActionResult:
        started = time.monotonic()
        action_id = str(uuid.uuid4())
        logger.info(
            "httpx browser driver action=%s url_domain=%s run_id=%s",
            request.action.value,
            extract_url_domain(request.url),
            run_id,
        )

        try:
            if request.action in (BrowserActionType.CLICK, BrowserActionType.FILL):
                # httpx cannot interact with a DOM. Return a structured
                # ``success=false`` result with a 501-style error so the UI
                # can render a "headless renderer required" badge instead of
                # crashing the workflow.
                missing = "selector" if not request.selector else None
                error = (
                    f"selector is required for {request.action.value}"
                    if missing
                    else (
                        f"{request.action.value} requires a headless browser; "
                        "install Playwright and set BROWSER_DRIVER=playwright, "
                        "or use the browser extension popup (/api/browser/analyze)."
                    )
                )
                result = BrowserActionResult(
                    action_id=action_id,
                    success=False,
                    error=error,
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
            elif request.action == BrowserActionType.SCREENSHOT:
                if workspace_root is None:
                    raise ValueError("workspace root required for screenshot")
                shot_dir = workspace_root / "output" / "browser-screenshots"
                shot_dir.mkdir(parents=True, exist_ok=True)
                shot_path = shot_dir / f"{action_id}.png"
                sidecar_path = shot_dir / f"{action_id}.json"
                domain = extract_url_domain(request.url) or "current page"
                page_text = ""
                if request.url:
                    try:
                        page_text = await self._fetch_page_text(
                            request.url, timeout=request.timeout_seconds
                        )
                    except Exception as fetch_exc:  # noqa: BLE001 — best-effort context
                        page_text = f"[fetch failed: {fetch_exc}]"
                shot_path.write_bytes(_FALLBACK_PNG_BYTES)
                sidecar_path.write_text(
                    _format_screenshot_sidecar(
                        action_id=action_id,
                        url=request.url or "",
                        domain=domain,
                        page_text=page_text,
                    ),
                    encoding="utf-8",
                )
                rel_path = str(shot_path.relative_to(workspace_root)).replace("\\", "/")
                result = BrowserActionResult(
                    action_id=action_id,
                    success=True,
                    snapshot_text=(
                        f"1×1 placeholder image for {domain}. "
                        "Install Playwright and set BROWSER_DRIVER=playwright "
                        "for full-page screenshots."
                    ),
                    screenshot_path=rel_path,
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
            elif request.action in (BrowserActionType.NAVIGATE, BrowserActionType.SNAPSHOT):
                if not request.url:
                    raise ValueError("url is required for navigate/snapshot")
                text = await self._fetch_page_text(request.url, timeout=request.timeout_seconds)
                result = BrowserActionResult(
                    action_id=action_id,
                    success=True,
                    snapshot_text=text,
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
            else:
                raise ValueError(f"unsupported action: {request.action.value}")
        except Exception as exc:
            result = BrowserActionResult(
                action_id=action_id,
                success=False,
                error=str(exc)[:500],
                duration_ms=int((time.monotonic() - started) * 1000),
            )

        cache_action_result(result)
        extra: dict[str, Any] = {"actionId": result.action_id}
        if result.screenshot_path:
            extra["path"] = result.screenshot_path
        _emit_browser_event(
            run_id=run_id,
            decision=request.action.value,
            reason=result.error or "httpx driver completed",
            action_type=request.action,
            url=request.url,
            outcome="success" if result.success else "failed",
            extra=extra,
        )
        return result

    async def _fetch_page_text(self, url: str, *, timeout: float) -> str:
        own_client = self._client is None
        client = self._client or httpx.AsyncClient(follow_redirects=True, timeout=timeout)
        try:
            response = await client.get(url)
            response.raise_for_status()
            return _html_to_text(response.text)
        finally:
            if own_client:
                await client.aclose()


async def run_browser_action(
    request: BrowserActionRequest,
    *,
    run_id: str = "",
    confirmation_token: str | None = None,
    skip_policy: bool = False,
    workspace_root: Path | None = None,
    driver: BrowserDriver | None = None,
) -> BrowserActionResult:
    if not skip_policy:
        ensure_browser_policy_allowed(
            action_type=request.action,
            confirmation_token=confirmation_token,
            run_id=run_id,
            url=request.url,
        )
    active_driver = driver or get_browser_driver()
    timeout = request.timeout_seconds
    try:
        return await asyncio.wait_for(
            active_driver.execute(request, run_id=run_id, workspace_root=workspace_root),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        action_id = str(uuid.uuid4())
        result = BrowserActionResult(
            action_id=action_id,
            success=False,
            error=f"browser action timed out after {timeout}s",
            duration_ms=int(timeout * 1000),
        )
        cache_action_result(result)
        _emit_browser_event(
            run_id=run_id,
            decision=request.action.value,
            reason=result.error or "timeout",
            action_type=request.action,
            url=request.url,
            outcome="failed",
            extra={"actionId": action_id},
        )
        return result


class PlaywrightBrowserDriver(BrowserDriver):
    """Headless Chromium driver via Playwright (optional dependency).

    Activated when ``BROWSER_DRIVER=playwright`` and the ``playwright``
    package + chromium browser are installed. Supports navigate/snapshot/
    click/fill/screenshot for real. Falls back to ``HttpxBrowserDriver``
    in ``get_browser_driver`` if the import fails.
    """

    def __init__(self) -> None:
        # Lazy-imported in execute() — Playwright is optional.
        self._available: bool | None = None

    def _check_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import playwright.async_api  # noqa: F401
            self._available = True
        except ImportError:
            self._available = False
        return self._available

    async def execute(
        self,
        request: BrowserActionRequest,
        *,
        run_id: str = "",
        workspace_root: Path | None = None,
    ) -> BrowserActionResult:
        started = time.monotonic()
        action_id = str(uuid.uuid4())
        if not self._check_available():
            result = BrowserActionResult(
                action_id=action_id,
                success=False,
                error=(
                    "playwright is not installed. Run "
                    "`pip install playwright && playwright install chromium`, "
                    "or unset BROWSER_DRIVER to use the httpx fallback."
                ),
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            cache_action_result(result)
            return result

        from playwright.async_api import async_playwright  # type: ignore

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                try:
                    context = await browser.new_context()
                    page = await context.new_page()
                    if request.url:
                        await page.goto(request.url, timeout=request.timeout_seconds * 1000)
                    if request.action == BrowserActionType.CLICK:
                        if not request.selector:
                            raise ValueError("selector required for click")
                        await page.click(request.selector, timeout=request.timeout_seconds * 1000)
                    elif request.action == BrowserActionType.FILL:
                        if not request.selector:
                            raise ValueError("selector required for fill")
                        await page.fill(
                            request.selector,
                            request.value or "",
                            timeout=request.timeout_seconds * 1000,
                        )
                    snapshot_text: str | None = None
                    screenshot_rel: str | None = None
                    if request.action == BrowserActionType.SCREENSHOT:
                        if workspace_root is None:
                            raise ValueError("workspace root required for screenshot")
                        shot_dir = workspace_root / "output" / "browser-screenshots"
                        shot_dir.mkdir(parents=True, exist_ok=True)
                        shot_path = shot_dir / f"{action_id}.png"
                        await page.screenshot(path=str(shot_path), full_page=True)
                        screenshot_rel = str(
                            shot_path.relative_to(workspace_root)
                        ).replace("\\", "/")
                    if request.action in (
                        BrowserActionType.NAVIGATE,
                        BrowserActionType.SNAPSHOT,
                        BrowserActionType.CLICK,
                        BrowserActionType.FILL,
                    ):
                        body = await page.content()
                        snapshot_text = _html_to_text(body)
                    result = BrowserActionResult(
                        action_id=action_id,
                        success=True,
                        snapshot_text=snapshot_text,
                        screenshot_path=screenshot_rel,
                        duration_ms=int((time.monotonic() - started) * 1000),
                    )
                finally:
                    await browser.close()
        except Exception as exc:  # noqa: BLE001
            result = BrowserActionResult(
                action_id=action_id,
                success=False,
                error=str(exc)[:500],
                duration_ms=int((time.monotonic() - started) * 1000),
            )

        cache_action_result(result)
        _emit_browser_event(
            run_id=run_id,
            decision=request.action.value,
            reason=result.error or "playwright driver completed",
            action_type=request.action,
            url=request.url,
            outcome="success" if result.success else "failed",
            extra={
                "actionId": result.action_id,
                **({"path": result.screenshot_path} if result.screenshot_path else {}),
            },
        )
        return result


_default_driver: BrowserDriver | None = None


def get_browser_driver() -> BrowserDriver:
    global _default_driver
    if _default_driver is None:
        choice = os.environ.get("BROWSER_DRIVER", "").strip().lower()
        if choice == "playwright":
            pw = PlaywrightBrowserDriver()
            if pw._check_available():
                _default_driver = pw
                logger.info("browser driver: playwright")
            else:
                logger.warning(
                    "BROWSER_DRIVER=playwright but playwright is not installed; "
                    "falling back to httpx driver"
                )
                _default_driver = HttpxBrowserDriver()
        else:
            _default_driver = HttpxBrowserDriver()
    return _default_driver


def set_browser_driver(driver: BrowserDriver | None) -> None:
    """Override driver (tests)."""
    global _default_driver
    _default_driver = driver
