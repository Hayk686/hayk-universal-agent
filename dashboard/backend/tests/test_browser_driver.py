"""Unit tests for browser driver adapters."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.browser.driver import (
    StubBrowserDriver,
    browser_policy_action,
    clear_action_cache,
    extract_url_domain,
    get_cached_action,
    run_browser_action,
    set_browser_driver,
)
from app.browser.models import BrowserActionRequest, BrowserActionType
from app.policy.confirmation import issue_confirmation_token


@pytest.fixture(autouse=True)
def _reset_driver() -> None:
    clear_action_cache()
    set_browser_driver(None)
    yield
    clear_action_cache()
    set_browser_driver(None)


@pytest.mark.asyncio
async def test_stub_navigate_returns_snapshot() -> None:
    driver = StubBrowserDriver(snapshot_text="Hello stub page")
    set_browser_driver(driver)
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.NAVIGATE))
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.NAVIGATE, url="https://example.com"),
        run_id="run-stub",
        confirmation_token=token,
    )
    assert result.success is True
    assert result.snapshot_text == "Hello stub page"
    assert result.action_id
    assert get_cached_action(result.action_id) is not None


@pytest.mark.asyncio
async def test_stub_screenshot_includes_path() -> None:
    driver = StubBrowserDriver(screenshot_path="output/browser-screenshots/test.png")
    set_browser_driver(driver)
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.SCREENSHOT))
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.SCREENSHOT),
        run_id="run-shot",
        confirmation_token=token,
    )
    assert result.success is True
    assert result.screenshot_path == "output/browser-screenshots/test.png"


@pytest.mark.asyncio
async def test_stub_click_requires_selector() -> None:
    set_browser_driver(StubBrowserDriver())
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.CLICK))
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.CLICK),
        run_id="run-click",
        confirmation_token=token,
    )
    assert result.success is False
    assert "selector" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_stub_click_with_selector_succeeds() -> None:
    set_browser_driver(StubBrowserDriver())
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.CLICK))
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.CLICK, selector="@e1"),
        run_id="run-click-ok",
        confirmation_token=token,
    )
    assert result.success is True
    assert "@e1" in (result.snapshot_text or "")


@pytest.mark.asyncio
async def test_stub_failure_mode() -> None:
    set_browser_driver(StubBrowserDriver(fail_on=BrowserActionType.NAVIGATE))
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.NAVIGATE))
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.NAVIGATE, url="https://example.com"),
        run_id="run-fail",
        confirmation_token=token,
    )
    assert result.success is False
    assert result.error


@pytest.mark.asyncio
async def test_action_timeout() -> None:
    set_browser_driver(StubBrowserDriver(delay_seconds=2.0))
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.SNAPSHOT))
    result = await run_browser_action(
        BrowserActionRequest(
            action=BrowserActionType.SNAPSHOT,
            url="https://example.com",
            timeout_seconds=1.0,
        ),
        run_id="run-timeout",
        confirmation_token=token,
    )
    assert result.success is False
    assert "timed out" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_skip_policy_for_internal_calls() -> None:
    set_browser_driver(StubBrowserDriver())
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.SNAPSHOT, url="https://example.com"),
        run_id="run-skip",
        skip_policy=True,
    )
    assert result.success is True


@pytest.mark.asyncio
async def test_policy_denied_without_token() -> None:
    from app.browser.driver import BrowserPolicyError

    set_browser_driver(StubBrowserDriver())
    with pytest.raises(BrowserPolicyError):
        await run_browser_action(
            BrowserActionRequest(action=BrowserActionType.FILL, selector="@e2", value="x"),
            run_id="run-deny",
        )


def test_extract_url_domain_redacts_credentials() -> None:
    assert extract_url_domain("https://user:secret@example.com/path") == "user:secret@example.com"
    assert extract_url_domain("") == ""
    assert extract_url_domain(None) == ""


@pytest.mark.asyncio
async def test_httpx_driver_navigate_with_mock(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.browser.driver import HttpxBrowserDriver

    class FakeResponse:
        text = "<html><body><p>Hello page</p></body></html>"

        def raise_for_status(self) -> None:
            pass

    class FakeClient:
        async def get(self, url: str) -> FakeResponse:
            assert url == "https://example.com"
            return FakeResponse()

        async def aclose(self) -> None:
            pass

    set_browser_driver(HttpxBrowserDriver(client=FakeClient()))  # type: ignore[arg-type]
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.NAVIGATE))
    result = await run_browser_action(
        BrowserActionRequest(action=BrowserActionType.NAVIGATE, url="https://example.com"),
        run_id="run-httpx",
        confirmation_token=token,
        workspace_root=workspace,
    )
    assert result.success is True
    assert "Hello page" in (result.snapshot_text or "")


@pytest.mark.asyncio
async def test_httpx_driver_click_returns_actionable_error(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Click on httpx driver: structured ``success=false``, no exception."""
    from app.browser.driver import HttpxBrowserDriver

    set_browser_driver(HttpxBrowserDriver())
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.CLICK))
    result = await run_browser_action(
        BrowserActionRequest(
            action=BrowserActionType.CLICK,
            url="https://example.com",
            selector="#login",
        ),
        run_id="run-click-httpx",
        confirmation_token=token,
        workspace_root=workspace,
    )
    assert result.success is False
    assert result.action_id
    error = (result.error or "").lower()
    assert "headless" in error or "playwright" in error


@pytest.mark.asyncio
async def test_httpx_driver_screenshot_writes_real_png(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Screenshot endpoint must produce a real PNG, not a ``.txt`` placeholder."""
    from app.browser.driver import HttpxBrowserDriver

    class FakeResponse:
        text = "<html><body><p>Hello</p></body></html>"

        def raise_for_status(self) -> None:
            pass

    class FakeClient:
        async def get(self, url: str) -> FakeResponse:
            return FakeResponse()

        async def aclose(self) -> None:
            pass

    set_browser_driver(HttpxBrowserDriver(client=FakeClient()))  # type: ignore[arg-type]
    token = issue_confirmation_token(browser_policy_action(BrowserActionType.SCREENSHOT))
    result = await run_browser_action(
        BrowserActionRequest(
            action=BrowserActionType.SCREENSHOT,
            url="https://example.com",
        ),
        run_id="run-shot-httpx",
        confirmation_token=token,
        workspace_root=workspace,
    )
    assert result.success is True
    assert result.screenshot_path and result.screenshot_path.endswith(".png")
    shot_file = workspace / result.screenshot_path
    assert shot_file.is_file()
    assert shot_file.read_bytes().startswith(b"\x89PNG")
    sidecar = shot_file.with_suffix(".json")
    assert sidecar.is_file()
