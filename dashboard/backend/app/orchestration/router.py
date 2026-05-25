"""Executable task routing based on universal-task-router playbook rules."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.orchestration.models import OrchestratorMode

# Playbook primary modes from universal-task-router.md
PLAYBOOK_CHAT = "Chat"
PLAYBOOK_PLANNER = "Planner"
PLAYBOOK_FILE = "File"
PLAYBOOK_RESEARCH = "Research"
PLAYBOOK_DIAGNOSTICS = "Diagnostics"
PLAYBOOK_EXECUTOR = "Executor"
PLAYBOOK_MEMORY = "Memory"
PLAYBOOK_BROWSER = "Browser Work"

_WEB_PATTERNS: tuple[tuple[re.Pattern[str], str, int], ...] = tuple(
    (
        re.compile(p, re.IGNORECASE),
        PLAYBOOK_RESEARCH,
        score,
    )
    for p, score in (
        (r"\b(search|google|look up online|find online)\b", 3),
        (r"\b(research|investigate|compare .+ (online|sources|competitors))\b", 3),
        (r"\b(latest|current|recent)\s+(news|prices|stats|data)\b", 2),
        (r"\b(external (facts|sources|information)|cite sources)\b", 3),
        (r"\b(summarize|summary of).+\b(from the web|online|internet)\b", 3),
        (r"\bweb search\b", 3),
        (r"\bon the internet\b", 2),
    )
)

_SESSION_PATTERNS: tuple[tuple[re.Pattern[str], str, int], ...] = tuple(
    (
        re.compile(p, re.IGNORECASE),
        mode,
        score,
    )
    for p, mode, score in (
        (r"\b(plan|roadmap|break down|multi[- ]step|many steps|ambiguous goal)\b", PLAYBOOK_PLANNER, 3),
        (r"\b(file|csv|xlsx|spreadsheet|transform|convert|report|output/)\b", PLAYBOOK_FILE, 2),
        (r"\b(diagnos|debug|broken|logs|health check|self-diagnostic|doctor)\b", PLAYBOOK_DIAGNOSTICS, 3),
        (r"\b(run (the )?script|execute (the )?command|whitelisted command)\b", PLAYBOOK_EXECUTOR, 2),
        (r"\b(remember|memory|preference|recurring context|store (this )?note)\b", PLAYBOOK_MEMORY, 2),
        (r"\b(browser|web page|form fill|visible page|clickworker|categoriz)\b", PLAYBOOK_BROWSER, 3),
        (r"\b(step by step|first .+ then .+)\b", PLAYBOOK_PLANNER, 2),
    )
)

_FAST_PATTERNS: tuple[tuple[re.Pattern[str], str, int], ...] = tuple(
    (
        re.compile(p, re.IGNORECASE),
        PLAYBOOK_CHAT,
        score,
    )
    for p, score in (
        (r"^(what is|what are|explain|why|how do|how does|define)\b", 2),
        (r"\b(quick answer|briefly|in short)\b", 2),
        (r"^(hi|hello|thanks|thank you)\b", 1),
    )
)


@dataclass(frozen=True)
class RouteDecision:
    mode: OrchestratorMode
    playbook_mode: str
    reason: str
    confidence: str  # high | medium | low


def _score_patterns(
    text: str,
    patterns: tuple[tuple[re.Pattern[str], str, int], ...],
) -> tuple[int, str, str]:
    best_score = 0
    best_mode = ""
    best_match = ""
    for pattern, playbook_mode, score in patterns:
        m = pattern.search(text)
        if m and score > best_score:
            best_score = score
            best_mode = playbook_mode
            best_match = m.group(0)
    return best_score, best_mode, best_match


def _playbook_to_orchestrator(playbook_mode: str) -> OrchestratorMode:
    if playbook_mode == PLAYBOOK_RESEARCH:
        return OrchestratorMode.WEB
    if playbook_mode in (
        PLAYBOOK_PLANNER,
        PLAYBOOK_FILE,
        PLAYBOOK_DIAGNOSTICS,
        PLAYBOOK_EXECUTOR,
        PLAYBOOK_MEMORY,
        PLAYBOOK_BROWSER,
    ):
        return OrchestratorMode.SESSION
    return OrchestratorMode.FAST


_BROWSER_HEAVY_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bclick\b",
        r"\bfill form\b",
        r"\blogin\b",
        r"\bbrowser\b",
    )
)


def is_browser_heavy_task(task: str) -> bool:
    text = (task or "").strip()
    if not text:
        return False
    return any(p.search(text) for p in _BROWSER_HEAVY_PATTERNS)


def route_task(task: str) -> RouteDecision:
    """Classify a user task into orchestrator mode using playbook heuristics."""
    text = (task or "").strip()
    if not text:
        return RouteDecision(
            mode=OrchestratorMode.FAST,
            playbook_mode=PLAYBOOK_CHAT,
            reason="empty task defaults to fast chat mode",
            confidence="low",
        )

    web_score, web_playbook, web_hit = _score_patterns(text, _WEB_PATTERNS)
    session_score, session_playbook, session_hit = _score_patterns(text, _SESSION_PATTERNS)
    fast_score, fast_playbook, fast_hit = _score_patterns(text, _FAST_PATTERNS)

    # Research / external facts → web mode (playbook rule #6 for cloud also favors bounded tools)
    if web_score > 0 and web_score >= session_score:
        mode = OrchestratorMode.WEB
        playbook = web_playbook or PLAYBOOK_RESEARCH
        reason = f"research/web signals matched '{web_hit}'"
        confidence = "high" if web_score >= 3 else "medium"
        return RouteDecision(mode=mode, playbook_mode=playbook, reason=reason, confidence=confidence)

    if session_score > 0:
        mode = OrchestratorMode.SESSION
        playbook = session_playbook or PLAYBOOK_PLANNER
        reason = f"multi-step/tool-heavy signals matched '{session_hit}'"
        confidence = "high" if session_score >= 3 else "medium"
        return RouteDecision(mode=mode, playbook_mode=playbook, reason=reason, confidence=confidence)

    if fast_score > 0:
        return RouteDecision(
            mode=OrchestratorMode.FAST,
            playbook_mode=fast_playbook or PLAYBOOK_CHAT,
            reason=f"quick chat signals matched '{fast_hit}'",
            confidence="medium" if fast_score >= 2 else "low",
        )

    # Long or complex text without explicit signals → session planner
    if len(text) > 280 or text.count("\n") >= 2:
        return RouteDecision(
            mode=OrchestratorMode.SESSION,
            playbook_mode=PLAYBOOK_PLANNER,
            reason="long or multi-line task treated as planner/session work",
            confidence="medium",
        )

    return RouteDecision(
        mode=OrchestratorMode.FAST,
        playbook_mode=PLAYBOOK_CHAT,
        reason="default fast chat mode for concise requests",
        confidence="low",
    )
