"""HMAC/time-bound confirmation tokens for dangerous dashboard actions."""

from __future__ import annotations

import hashlib
import hmac
import os
import time

DEFAULT_TTL_SECONDS = 300


def _secret() -> bytes:
    raw = os.environ.get("POLICY_CONFIRM_SECRET", "hayk-policy-dev-secret")
    return raw.encode("utf-8")


def issue_confirmation_token(action: str, *, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
    """Return ``{expires}.{signature}`` bound to the exact action string."""
    expires = int(time.time()) + max(int(ttl_seconds), 1)
    payload = f"{expires}:{action}"
    sig = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{expires}.{sig}"


def verify_confirmation_token(token: str, action: str) -> tuple[bool, str]:
    """Validate token for *action*. Returns (ok, reason)."""
    if not token or not token.strip():
        return False, "missing confirmation token"
    parts = token.strip().split(".", 1)
    if len(parts) != 2:
        return False, "malformed confirmation token"
    expires_raw, sig = parts
    try:
        expires = int(expires_raw)
    except ValueError:
        return False, "malformed confirmation token expiry"
    if time.time() > expires:
        return False, "confirmation token expired"
    payload = f"{expires}:{action}"
    expected = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return False, "invalid confirmation token signature"
    return True, "ok"
