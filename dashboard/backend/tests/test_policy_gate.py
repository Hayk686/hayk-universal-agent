"""Unit tests for PolicyGate classification matrix."""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from app.policy.confirmation import issue_confirmation_token, verify_confirmation_token
from app.policy.gate import ActionRisk, classify_action


def test_read_file_list_allowed() -> None:
    decision = classify_action("read files list", context={"kind": "read"})
    assert decision.allowed is True
    assert decision.risk == ActionRisk.READ
    assert decision.requires_confirmation is False


def test_write_agents_md_requires_confirm() -> None:
    decision = classify_action(
        "write AGENTS.md",
        context={"kind": "write", "path": "AGENTS.md"},
    )
    assert decision.allowed is False
    assert decision.requires_confirmation is True
    assert decision.risk == ActionRisk.WRITE
    assert decision.confirmation_token


def test_exec_whitelisted_hermes_status_allowed() -> None:
    decision = classify_action(
        "exec hermes status",
        context={"kind": "exec", "command": "hermes status"},
    )
    assert decision.allowed is True
    assert decision.risk == ActionRisk.EXEC


def test_exec_rm_rf_root_denied() -> None:
    decision = classify_action(
        "exec rm -rf /",
        context={"kind": "exec", "command": "rm -rf /"},
    )
    assert decision.allowed is False
    assert decision.requires_confirmation is False
    assert "hardline" in decision.reason


def test_network_web_send_requires_confirm() -> None:
    decision = classify_action(
        "network web-send",
        context={"kind": "network", "endpoint": "/api/chat/web-send"},
    )
    assert decision.requires_confirmation is True
    assert decision.risk == ActionRisk.NETWORK


def test_browser_analyze_requires_confirm() -> None:
    decision = classify_action(
        "browser analyze",
        context={"kind": "browser", "endpoint": "/api/browser/analyze"},
    )
    assert decision.requires_confirmation is True
    assert decision.risk == ActionRisk.BROWSER


def test_payment_keyword_denied() -> None:
    decision = classify_action("payment stripe checkout", context={"kind": "payment"})
    assert decision.allowed is False
    assert decision.risk == ActionRisk.PAYMENT


def test_command_injection_denied() -> None:
    decision = classify_action(
        "exec hermes status ; rm -rf /",
        context={"kind": "exec", "command": "hermes status ; rm -rf /"},
    )
    assert decision.allowed is False
    assert "injection" in decision.reason


def test_confirmation_token_valid() -> None:
    action = "network web-send"
    token = issue_confirmation_token(action, ttl_seconds=120)
    ok, reason = verify_confirmation_token(token, action)
    assert ok is True
    assert reason == "ok"


def test_confirmation_token_expired() -> None:
    action = "browser analyze"
    with patch("app.policy.confirmation.time.time", return_value=1000):
        token = issue_confirmation_token(action, ttl_seconds=10)
    ok, reason = verify_confirmation_token(token, action)
    assert ok is False
    assert "expired" in reason


def test_confirmation_token_wrong_action() -> None:
    action = "network web-send"
    token = issue_confirmation_token(action)
    ok, reason = verify_confirmation_token(token, "browser analyze")
    assert ok is False
    assert "signature" in reason


def test_non_whitelisted_exec_denied() -> None:
    decision = classify_action(
        "exec echo hacked",
        context={"kind": "exec", "command": "echo hacked"},
    )
    assert decision.allowed is False
    assert "whitelist" in decision.reason
