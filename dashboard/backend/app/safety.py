import os
import sys
from pathlib import Path


def ensure_within_workspace(workspace: Path, candidate: Path) -> Path:
    """Resolve candidate and verify it stays under workspace root."""
    workspace_resolved = workspace.resolve()
    resolved = candidate.expanduser().resolve()
    try:
        resolved.relative_to(workspace_resolved)
    except ValueError as exc:
        raise PermissionError("Path escapes workspace") from exc
    return resolved


def safe_join(workspace: Path, *parts: str) -> Path:
    base = workspace.resolve()
    rel = Path(*parts) if parts else Path(".")
    if rel.is_absolute():
        candidate = rel
    else:
        candidate = base / rel
    return ensure_within_workspace(workspace, candidate)


def _workspace_root_str() -> str:
    """Workspace root as POSIX-style string suitable for the whitelist."""
    raw = os.environ.get("WORKSPACE_ROOT", "/home/ubuntu/ai-office-agent-workspace").strip()
    return raw.replace("\\", "/").rstrip("/")


def _ls_tool() -> str:
    """``ls`` flavor: ``Get-ChildItem`` on Windows, ``ls -la`` elsewhere."""
    return "Get-ChildItem -Force" if sys.platform == "win32" else "ls -la"


def _venv_python_str() -> str:
    """Venv Python path inside workspace, OS-correct."""
    if sys.platform == "win32":
        return f"{_workspace_root_str()}/.venv/Scripts/python.exe"
    return f"{_workspace_root_str()}/.venv/bin/python"


def _build_whitelist() -> tuple[str, ...]:
    """Whitelist computed at call time so ``WORKSPACE_ROOT`` env is respected.

    Previously the whitelist baked ``/home/ubuntu/...`` paths and ``ls -la`` at
    module-import time, which broke any non-Pi deployment (notably Windows dev
    machines). The list is small enough to rebuild per request without overhead.
    """
    root = _workspace_root_str()
    ls = _ls_tool()
    py = _venv_python_str()
    return (
        "pwd",
        f"{ls} {root}",
        f"{ls} {root}/input",
        f"{ls} {root}/output",
        f"{ls} {root}/reports",
        "hermes status",
        "hermes doctor",
        'hermes -z "Say exactly: OK"',
        "hermes logs --since 1h",
        "hermes logs errors",
        f'{py} -c "import sys; print(sys.executable)"',
    )


def is_whitelisted_command(cmd: str) -> bool:
    return cmd.strip() in _build_whitelist()


def list_whitelisted_commands() -> list[str]:
    return list(_build_whitelist())
