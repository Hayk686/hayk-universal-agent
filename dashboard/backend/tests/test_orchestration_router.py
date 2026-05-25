"""Tests for orchestration task router."""

from __future__ import annotations

import pytest

from app.orchestration.models import OrchestratorMode
from app.orchestration.router import (
    PLAYBOOK_BROWSER,
    PLAYBOOK_CHAT,
    PLAYBOOK_DIAGNOSTICS,
    PLAYBOOK_FILE,
    PLAYBOOK_MEMORY,
    PLAYBOOK_PLANNER,
    PLAYBOOK_RESEARCH,
    route_task,
)


@pytest.mark.parametrize(
    ("task", "expected_mode", "expected_playbook"),
    [
        ("What is Python?", OrchestratorMode.FAST, PLAYBOOK_CHAT),
        ("Explain recursion briefly", OrchestratorMode.FAST, PLAYBOOK_CHAT),
        ("Search the web for latest AI news", OrchestratorMode.WEB, PLAYBOOK_RESEARCH),
        ("Research competitors online and compare pricing", OrchestratorMode.WEB, PLAYBOOK_RESEARCH),
        ("Find online sources about climate change", OrchestratorMode.WEB, PLAYBOOK_RESEARCH),
        (
            "Plan a multi-step migration of our CSV reports to output/",
            OrchestratorMode.SESSION,
            PLAYBOOK_PLANNER,
        ),
        ("The agent is broken — check logs and diagnose health", OrchestratorMode.SESSION, PLAYBOOK_DIAGNOSTICS),
        ("Transform the spreadsheet in input/ and write a report", OrchestratorMode.SESSION, PLAYBOOK_FILE),
        ("Remember my preference for Russian summaries", OrchestratorMode.SESSION, PLAYBOOK_MEMORY),
        ("Fill the visible browser form on this page", OrchestratorMode.SESSION, PLAYBOOK_BROWSER),
    ],
)
def test_route_task_modes(task: str, expected_mode: OrchestratorMode, expected_playbook: str) -> None:
    decision = route_task(task)
    assert decision.mode == expected_mode
    assert decision.playbook_mode == expected_playbook
    assert decision.reason
    assert decision.confidence in ("high", "medium", "low")


def test_route_empty_task_defaults_fast() -> None:
    decision = route_task("")
    assert decision.mode == OrchestratorMode.FAST
    assert decision.playbook_mode == PLAYBOOK_CHAT


def test_route_long_task_prefers_session() -> None:
    task = " ".join(["detail"] * 80)
    decision = route_task(task)
    assert decision.mode == OrchestratorMode.SESSION
    assert decision.playbook_mode == PLAYBOOK_PLANNER


def test_research_beats_session_when_both_match() -> None:
    task = "Research and plan a file migration from input/ to output/"
    decision = route_task(task)
    assert decision.mode == OrchestratorMode.WEB
