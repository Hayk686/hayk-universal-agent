"""Tests for CHAT_TIMEOUT_SECONDS / get_chat_timeout_seconds."""

from __future__ import annotations

import pytest

from app.config import get_chat_timeout_seconds


@pytest.fixture(autouse=True)
def _clear_chat_timeout_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CHAT_TIMEOUT_SECONDS", raising=False)
    yield


def test_chat_timeout_defaults_to_300(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CHAT_TIMEOUT_SECONDS", raising=False)
    assert get_chat_timeout_seconds() == 300


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("300", 300),
        ("30", 30),
        ("600", 600),
        ("45", 45),
        ("299", 299),
        ("  120  ", 120),
    ],
)
def test_chat_timeout_valid(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: int
) -> None:
    monkeypatch.setenv("CHAT_TIMEOUT_SECONDS", raw)
    assert get_chat_timeout_seconds() == expected


@pytest.mark.parametrize(
    "raw",
    ["29", "601", "0", "-1", "abc", "30.5", ""],
)
def test_chat_timeout_invalid_falls_back_to_300(
    monkeypatch: pytest.MonkeyPatch, raw: str
) -> None:
    monkeypatch.setenv("CHAT_TIMEOUT_SECONDS", raw)
    assert get_chat_timeout_seconds() == 300
