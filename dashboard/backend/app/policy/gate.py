"""Unified PolicyGate for Hayk dashboard actions.

Deny/confirm patterns align with ``hermes/hermes-agent/tools/approval.py`` where
practical (hardline blocklist, dangerous exec patterns, injection guards).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum
from typing import Any

from app.policy.confirmation import issue_confirmation_token
from app.safety import is_whitelisted_command

# Hardline patterns — subset of approval.py HARDLINE_PATTERNS
_CMDPOS = (
    r"(?:^|[;&|\n`]|\$\()"
    r"\s*"
    r"(?:sudo\s+(?:-[^\s]+\s+)*)?"
    r"(?:env\s+(?:\w+=\S*\s+)*)?"
    r"(?:(?:exec|nohup|setsid|time)\s+)*"
    r"\s*"
)

_HARDLINE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\brm\s+(-[^\s]*\s+)*(/|/\*|/ \*)(\s|$)", "recursive delete of root filesystem"),
    (
        r"\brm\s+(-[^\s]*\s+)*(/home|/home/\*|/root|/root/\*|/etc|/etc/\*|/usr|/usr/\*|/var|/var/\*|/bin|/bin/\*|/sbin|/sbin/\*|/boot|/boot/\*|/lib|/lib/\*)(\s|$)",
        "recursive delete of system directory",
    ),
    (r"\brm\s+(-[^\s]*\s+)*(~|\$HOME)(/?|/\*)?(\s|$)", "recursive delete of home directory"),
    (r"\bmkfs(\.[a-z0-9]+)?\b", "format filesystem (mkfs)"),
    (r"\bdd\b[^\n]*\bof=/dev/(sd|nvme|hd|mmcblk|vd|xvd)[a-z0-9]*", "dd to raw block device"),
    (r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", "fork bomb"),
    (_CMDPOS + r"(shutdown|reboot|halt|poweroff)\b", "system shutdown/reboot"),
)

_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"[;&|]\s*(?:rm|curl|wget|bash|sh|python|perl|ruby|node)\b",
        r"`[^`]+`",
        r"\$\([^)]+\)",
        r"\|\|\s*",
        r"&&\s*rm\b",
        r"\n\s*rm\b",
    )
)

_PAYMENT_KEYWORDS: frozenset[str] = frozenset(
    {
        "payment",
        "checkout",
        "stripe",
        "paypal",
        "wire transfer",
        "credit card",
        "debit card",
        "buy now",
        "purchase order",
        "send money",
        "bank account",
    }
)

_SENSITIVE_WRITE_NAMES: frozenset[str] = frozenset({"agents.md"})

_RE_FLAGS = re.IGNORECASE | re.DOTALL
_HARDLINE_COMPILED = [(re.compile(p, _RE_FLAGS), d) for p, d in _HARDLINE_PATTERNS]


class ActionRisk(str, Enum):
    READ = "read"
    WRITE = "write"
    EXEC = "exec"
    NETWORK = "network"
    BROWSER = "browser"
    PAYMENT = "payment"


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    risk: ActionRisk
    requires_confirmation: bool
    reason: str
    confirmation_token: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "risk": self.risk.value,
            "requiresConfirmation": self.requires_confirmation,
            "reason": self.reason,
            "confirmationToken": self.confirmation_token,
        }


class PolicyGate:
    """Stateful wrapper around classification helpers."""

    def classify(self, action: str, *, context: dict[str, Any] | None = None) -> PolicyDecision:
        return classify_action(action, context=context)

    def verify_token(self, token: str, action: str) -> tuple[bool, str]:
        from app.policy.confirmation import verify_confirmation_token

        return verify_confirmation_token(token, action)


def _normalize(text: str) -> str:
    cleaned = text.replace("\x00", "")
    return unicodedata.normalize("NFKC", cleaned)


def _infer_risk(action: str, context: dict[str, Any]) -> ActionRisk | None:
    explicit = context.get("risk") or context.get("kind")
    if isinstance(explicit, ActionRisk):
        return explicit
    if isinstance(explicit, str):
        try:
            return ActionRisk(explicit.strip().lower())
        except ValueError:
            pass
    endpoint = str(context.get("endpoint") or "")
    if "/browser/" in endpoint or endpoint.endswith("/browser/analyze"):
        return ActionRisk.BROWSER
    browser_action = context.get("browser_action")
    if isinstance(browser_action, str) and browser_action.strip():
        return ActionRisk.BROWSER
    if endpoint.endswith("/chat/web-send") or "/chat/web-send" in endpoint:
        return ActionRisk.NETWORK
    if endpoint.endswith("/research/query") or "/research/query" in endpoint:
        return ActionRisk.NETWORK
    if endpoint.endswith("/commands/run") or "/commands/run" in endpoint:
        return ActionRisk.EXEC
    if endpoint.endswith("/agents-md") and context.get("method") == "PUT":
        return ActionRisk.WRITE
    lowered = action.strip().lower()
    for prefix, risk in (
        ("read ", ActionRisk.READ),
        ("write ", ActionRisk.WRITE),
        ("exec ", ActionRisk.EXEC),
        ("network ", ActionRisk.NETWORK),
        ("browser ", ActionRisk.BROWSER),
        ("payment ", ActionRisk.PAYMENT),
    ):
        if lowered.startswith(prefix):
            return risk
    if "web-send" in lowered or lowered.startswith("network"):
        return ActionRisk.NETWORK
    if "browser" in lowered and "analyze" in lowered:
        return ActionRisk.BROWSER
    if lowered.startswith("payment") or any(k in lowered for k in _PAYMENT_KEYWORDS):
        return ActionRisk.PAYMENT
    return None


def _extract_command(action: str, context: dict[str, Any]) -> str:
    if cmd := context.get("command"):
        return str(cmd).strip()
    lowered = action.strip()
    if lowered.lower().startswith("exec "):
        return lowered[5:].strip()
    return lowered


def _matches_hardline(command: str) -> tuple[bool, str]:
    normalized = _normalize(command).lower()
    for pattern, description in _HARDLINE_COMPILED:
        if pattern.search(normalized):
            return True, description
    return False, ""


def _has_command_injection(text: str) -> bool:
    normalized = _normalize(text)
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(normalized):
            return True
    return False


def _is_payment_action(action: str, risk: ActionRisk | None) -> bool:
    if risk == ActionRisk.PAYMENT:
        return True
    lowered = action.lower()
    return any(k in lowered for k in _PAYMENT_KEYWORDS)


def _allow(risk: ActionRisk, reason: str) -> PolicyDecision:
    return PolicyDecision(
        allowed=True,
        risk=risk,
        requires_confirmation=False,
        reason=reason,
        confirmation_token=None,
    )


def _deny(risk: ActionRisk, reason: str) -> PolicyDecision:
    return PolicyDecision(
        allowed=False,
        risk=risk,
        requires_confirmation=False,
        reason=reason,
        confirmation_token=None,
    )


def _confirm(risk: ActionRisk, reason: str, action: str) -> PolicyDecision:
    return PolicyDecision(
        allowed=False,
        risk=risk,
        requires_confirmation=True,
        reason=reason,
        confirmation_token=issue_confirmation_token(action),
    )


def classify_action(action: str, *, context: dict[str, Any] | None = None) -> PolicyDecision:
    ctx = dict(context or {})
    action = action.strip()
    if not action:
        return _deny(ActionRisk.EXEC, "empty action")

    risk = _infer_risk(action, ctx) or ActionRisk.EXEC

    if _is_payment_action(action, risk):
        return _deny(ActionRisk.PAYMENT, "payment-related actions are blocked on the dashboard")

    if not ctx.get("chat_message"):
        if _has_command_injection(action) or _has_command_injection(str(ctx.get("command", ""))):
            return _deny(ActionRisk.EXEC, "command injection pattern detected")

    if risk == ActionRisk.READ:
        endpoint = str(ctx.get("endpoint") or "")
        if "/tasks" in endpoint:
            return _allow(ActionRisk.READ, "task read permitted")
        return _allow(ActionRisk.READ, "read-only action permitted")

    if risk == ActionRisk.WRITE:
        endpoint = str(ctx.get("endpoint") or "")
        method = str(ctx.get("method") or "").upper()
        if "/tasks" in endpoint and method in ("POST", "PATCH"):
            if ctx.get("bulk"):
                return _confirm(ActionRisk.WRITE, "bulk task write requires confirmation", action)
            if method == "POST" and endpoint.rstrip("/").endswith("/tasks"):
                return _allow(ActionRisk.WRITE, "single task create permitted")
            if "/done" in endpoint or "/snooze" in endpoint:
                return _allow(ActionRisk.WRITE, "task status transition permitted")
            return _allow(ActionRisk.WRITE, "single task update permitted")
        if "/tasks/" in endpoint and method == "DELETE":
            return _confirm(ActionRisk.WRITE, "task delete requires confirmation", action)
        target = str(ctx.get("path") or action).lower()
        base = target.split("/")[-1]
        if base in _SENSITIVE_WRITE_NAMES or "agents.md" in target:
            return _confirm(ActionRisk.WRITE, "writing AGENTS.md requires confirmation", action)
        return _confirm(ActionRisk.WRITE, "write action requires confirmation", action)

    if risk == ActionRisk.NETWORK:
        return _confirm(ActionRisk.NETWORK, "network action requires confirmation", action)

    if risk == ActionRisk.BROWSER:
        lowered_action = action.lower()
        if "snapshot" in lowered_action or "screenshot" in lowered_action:
            return _confirm(
                ActionRisk.BROWSER,
                "browser read action requires confirmation",
                action,
            )
        if "analyze" in lowered_action:
            return _confirm(ActionRisk.BROWSER, "browser analysis requires confirmation", action)
        return _confirm(ActionRisk.BROWSER, "browser action requires confirmation", action)

    if ctx.get("chat_message"):
        msg = str(ctx.get("command") or action)
        hardline, desc = _matches_hardline(msg)
        if hardline:
            return _deny(ActionRisk.EXEC, f"hardline block: {desc}")
        return _allow(ActionRisk.EXEC, "chat message permitted")

    # EXEC (default)
    command = _extract_command(action, ctx)
    hardline, desc = _matches_hardline(command)
    if hardline:
        return _deny(ActionRisk.EXEC, f"hardline block: {desc}")
    if is_whitelisted_command(command):
        return _allow(ActionRisk.EXEC, "whitelisted command permitted")
    if _has_command_injection(command):
        return _deny(ActionRisk.EXEC, "command injection pattern detected")
    return _deny(ActionRisk.EXEC, "command not on dashboard whitelist")
