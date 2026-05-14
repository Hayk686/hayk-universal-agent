import os
from pathlib import Path

# Resolved workspace root — never read ~/.hermes/.env or secrets files.
_DEFAULT_WORKSPACE = "/home/ubuntu/ai-office-agent-workspace"


def get_workspace_root() -> Path:
    root = os.environ.get("WORKSPACE_ROOT", _DEFAULT_WORKSPACE).strip()
    return Path(root).expanduser().resolve()


AGENT_NAME = os.environ.get("DASH_AGENT_NAME", "Hayk Universal Agent")


def get_chat_timeout_seconds() -> int:
    """Wall-clock timeout (seconds) for Agent Chat Hermes subprocesses.

    Env: ``CHAT_TIMEOUT_SECONDS``. Valid range 30–600; invalid or missing values
    fall back to **300**.
    """
    raw = os.environ.get("CHAT_TIMEOUT_SECONDS", "300").strip()
    try:
        v = int(raw, 10)
    except ValueError:
        return 300
    if v < 30 or v > 600:
        return 300
    return v
