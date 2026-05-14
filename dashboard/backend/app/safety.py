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


_WHITELIST: tuple[str, ...] = (
    "pwd",
    "ls -la /home/ubuntu/ai-office-agent-workspace",
    "ls -la /home/ubuntu/ai-office-agent-workspace/input",
    "ls -la /home/ubuntu/ai-office-agent-workspace/output",
    "ls -la /home/ubuntu/ai-office-agent-workspace/reports",
    "hermes status",
    "hermes doctor",
    'hermes -z "Say exactly: OK"',
    "hermes logs --since 1h",
    "hermes logs errors",
    '/home/ubuntu/ai-office-agent-workspace/.venv/bin/python -c "import sys; print(sys.executable)"',
)


def is_whitelisted_command(cmd: str) -> bool:
    return cmd.strip() in _WHITELIST


def list_whitelisted_commands() -> list[str]:
    return list(_WHITELIST)
