"""Policy matrix tests for browser action types."""

from __future__ import annotations

import pytest

from app.policy.confirmation import issue_confirmation_token, verify_confirmation_token
from app.policy.gate import ActionRisk, classify_action


@pytest.mark.parametrize(
    ("action", "browser_action"),
    [
        ("browser navigate", "navigate"),
        ("browser click", "click"),
        ("browser fill", "fill"),
        ("browser snapshot", "snapshot"),
        ("browser screenshot", "screenshot"),
    ],
)
def test_browser_actions_require_confirmation(action: str, browser_action: str) -> None:
    decision = classify_action(
        action,
        context={
            "kind": "browser",
            "endpoint": "/api/browser/action",
            "browser_action": browser_action,
        },
    )
    assert decision.risk == ActionRisk.BROWSER
    assert decision.requires_confirmation is True
    assert decision.allowed is False
    assert decision.confirmation_token


def test_browser_navigate_confirm_reason() -> None:
    decision = classify_action(
        "browser navigate",
        context={"endpoint": "/api/browser/action", "browser_action": "navigate"},
    )
    assert "browser action requires confirmation" in decision.reason


def test_browser_snapshot_confirm_reason() -> None:
    decision = classify_action(
        "browser snapshot",
        context={"endpoint": "/api/browser/action", "browser_action": "snapshot"},
    )
    assert "browser read action requires confirmation" in decision.reason


def test_browser_analyze_still_requires_confirm() -> None:
    decision = classify_action(
        "browser analyze",
        context={"kind": "browser", "endpoint": "/api/browser/analyze"},
    )
    assert decision.requires_confirmation is True
    assert "browser analysis requires confirmation" in decision.reason


def test_browser_action_token_roundtrip() -> None:
    action = "browser click"
    token = issue_confirmation_token(action)
    ok, reason = verify_confirmation_token(token, action)
    assert ok is True
    assert reason == "ok"


def test_browser_action_token_wrong_action() -> None:
    token = issue_confirmation_token("browser navigate")
    ok, reason = verify_confirmation_token(token, "browser click")
    assert ok is False
