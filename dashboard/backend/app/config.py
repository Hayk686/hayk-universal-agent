import os
from pathlib import Path

# Resolved workspace root — never read ~/.hermes/.env or secrets files.
_DEFAULT_WORKSPACE = "/home/ubuntu/ai-office-agent-workspace"


def get_workspace_root() -> Path:
    root = os.environ.get("WORKSPACE_ROOT", _DEFAULT_WORKSPACE).strip()
    return Path(root).expanduser().resolve()


AGENT_NAME = os.environ.get("DASH_AGENT_NAME", "Hayk Universal Agent")
