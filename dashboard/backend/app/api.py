from __future__ import annotations

import asyncio
import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field, field_validator

from app.config import AGENT_NAME, get_chat_timeout_seconds, get_workspace_root
from app.safety import is_whitelisted_command, list_whitelisted_commands, safe_join

router = APIRouter()

_VENV_PY_PARTS = (".venv", "bin", "python")


def _venv_python_path(ws: Path) -> Path:
    """Workspace .venv interpreter path without safe_join/resolve-to-target.

    Standard virtualenvs symlink ``python`` to a system interpreter outside the
    workspace; ``safe_join`` rejects those. We only require the symlink path (as
    joined under the workspace root) to lie under that root — no target resolution.
    """
    workspace_root = ws.resolve()
    candidate = workspace_root.joinpath(*_VENV_PY_PARTS)
    try:
        candidate.relative_to(workspace_root)
    except ValueError as exc:
        raise PermissionError("Venv python path escapes workspace") from exc
    return candidate


def workspace_dep() -> Path:
    return get_workspace_root()


class SaveBody(BaseModel):
    content: str = Field(..., description="UTF-8 markdown content")


def _file_entry(p: Path, workspace: Path) -> dict[str, Any]:
    st = p.stat()
    ext = p.suffix.lower().lstrip(".") or "file"
    return {
        "name": p.name,
        "path": str(p.relative_to(workspace)).replace("\\", "/"),
        "size": st.st_size,
        "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        "extension": ext,
        "isDir": p.is_dir(),
    }


def _count_files_in_dir(d: Path) -> int:
    if not d.is_dir():
        return 0
    n = 0
    for root, _, files in os.walk(d):
        n += len(files)
    return n


def _dir_size(d: Path) -> int:
    total = 0
    if not d.exists():
        return 0
    for root, _, files in os.walk(d):
        for fn in files:
            fp = Path(root) / fn
            try:
                total += fp.stat().st_size
            except OSError:
                pass
    return total


@router.get("/status")
def get_status(ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    agents = safe_join(ws, "AGENTS.md")
    playbooks = safe_join(ws, "playbooks")
    input_d = safe_join(ws, "input")
    output_d = safe_join(ws, "output")
    reports_d = safe_join(ws, "reports")
    venv_python = _venv_python_path(ws)

    venv_ok = venv_python.is_file() and os.access(venv_python, os.X_OK)

    du = shutil.disk_usage(ws)

    return {
        "agentName": AGENT_NAME,
        "workspacePath": str(ws),
        "serverTime": datetime.now(timezone.utc).isoformat(),
        "agentsMdExists": agents.is_file(),
        "playbooksDirExists": playbooks.is_dir(),
        "fileCounts": {
            "input": _count_files_in_dir(input_d),
            "output": _count_files_in_dir(output_d),
            "reports": _count_files_in_dir(reports_d),
        },
        "diskUsage": {
            "totalBytes": du.total,
            "usedBytes": du.used,
            "freeBytes": du.free,
            "workspaceBytes": _dir_size(ws),
        },
        "venv": {
            "pythonPath": str(venv_python),
            "existsAndExecutable": venv_ok,
        },
        "chatTimeoutSeconds": get_chat_timeout_seconds(),
    }


def _list_section_files(ws: Path, sub: str) -> list[dict[str, Any]]:
    base = safe_join(ws, sub)
    if not base.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(base.rglob("*"), key=lambda x: str(x).lower()):
        if p.is_file():
            out.append(_file_entry(p, ws))
    return out


@router.get("/files")
def list_files_by_folder(
    folder: str,
    ws: Path = Depends(workspace_dep),
) -> list[dict[str, Any]]:
    if folder not in ("input", "output", "reports"):
        raise HTTPException(
            status_code=400,
            detail="folder must be input, output, or reports",
        )
    return _list_section_files(ws, folder)


def _managed_file_roots(ws: Path) -> tuple[Path, Path, Path]:
    return (
        safe_join(ws, "input"),
        safe_join(ws, "output"),
        safe_join(ws, "reports"),
    )


def _is_under_managed_dirs(p: Path, ws: Path) -> bool:
    pr = p.resolve()
    for r in _managed_file_roots(ws):
        try:
            pr.relative_to(r.resolve())
            return True
        except ValueError:
            continue
    return False


def _validate_file_for_download_or_delete(ws: Path, rel_path: str) -> Path:
    p = safe_join(ws, rel_path)
    if not p.is_file():
        raise HTTPException(status_code=400, detail="Not a file or does not exist")
    rel_norm = str(p.resolve().relative_to(ws.resolve())).replace("\\", "/")
    if rel_norm == "AGENTS.md":
        raise HTTPException(status_code=403, detail="AGENTS.md cannot be deleted via this API")
    if rel_norm == "playbooks" or rel_norm.startswith("playbooks/"):
        raise HTTPException(
            status_code=403,
            detail="Playbooks paths cannot be deleted via this API",
        )
    if ".venv/" in rel_norm or rel_norm.startswith(".venv"):
        raise HTTPException(status_code=403, detail="Access to .venv is not allowed")
    if not _is_under_managed_dirs(p, ws):
        raise HTTPException(status_code=403, detail="File must be under input, output, or reports")
    return p



@router.get("/files/download")
def download_file(path: str, ws: Path = Depends(workspace_dep)):
    p = _validate_file_for_download_or_delete(ws, path)
    return FileResponse(path=p, filename=p.name, media_type="application/octet-stream")


@router.delete("/files")
def delete_file(path: str, ws: Path = Depends(workspace_dep)) -> dict[str, str]:
    p = _validate_file_for_download_or_delete(ws, path)
    p.unlink()
    return {"ok": "true"}


@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    if (
        not file.filename
        or file.filename in (".", "..")
        or "/" in file.filename
        or "\\" in file.filename
    ):
        raise HTTPException(status_code=400, detail="Invalid filename")
    dest_dir = safe_join(ws, "input")
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = safe_join(ws, "input", file.filename)
    if dest.is_dir():
        raise HTTPException(status_code=400, detail="Destination is a directory")
    content = await file.read()
    dest.write_bytes(content)
    return _file_entry(dest, ws)


@router.get("/agents-md")
def get_agents_md(ws: Path = Depends(workspace_dep)) -> PlainTextResponse:
    p = safe_join(ws, "AGENTS.md")
    if not p.is_file():
        return PlainTextResponse("", media_type="text/markdown")
    return PlainTextResponse(
        p.read_text(encoding="utf-8", errors="replace"), media_type="text/markdown"
    )


@router.put("/agents-md")
def put_agents_md(body: SaveBody, ws: Path = Depends(workspace_dep)) -> dict[str, str]:
    p = safe_join(ws, "AGENTS.md")
    p.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = ""
    if p.is_file():
        bak = safe_join(ws, f"AGENTS.md.bak.{stamp}")
        shutil.copy2(p, bak)
        backup_name = f"AGENTS.md.bak.{stamp}"
    p.write_text(body.content, encoding="utf-8")
    return {"saved": "true", "backup": backup_name}


def _playbook_path(ws: Path, name: str) -> Path:
    if not name.endswith(".md"):
        raise HTTPException(status_code=400, detail="Playbook must be .md")
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid playbook name")
    return safe_join(ws, "playbooks", name)


@router.get("/playbooks")
def list_playbooks(ws: Path = Depends(workspace_dep)) -> list[dict[str, Any]]:
    d = safe_join(ws, "playbooks")
    if not d.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(d.glob("*.md"), key=lambda x: x.name.lower()):
        if p.is_file():
            out.append(_file_entry(p, ws))
    return out


@router.get("/playbooks/{name}")
def get_playbook(name: str, ws: Path = Depends(workspace_dep)) -> PlainTextResponse:
    p = _playbook_path(ws, name)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return PlainTextResponse(
        p.read_text(encoding="utf-8", errors="replace"), media_type="text/markdown"
    )


class PlaybookSaveBody(BaseModel):
    content: str


@router.put("/playbooks/{name}")
def save_playbook(
    name: str, body: PlaybookSaveBody, ws: Path = Depends(workspace_dep)
) -> dict[str, str]:
    p = _playbook_path(ws, name)
    p.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = ""
    if p.is_file():
        bak = safe_join(ws, "playbooks", f"{p.stem}.bak.{stamp}{p.suffix}")
        shutil.copy2(p, bak)
        backup_name = f"{p.stem}.bak.{stamp}{p.suffix}"
    p.write_text(body.content, encoding="utf-8")
    return {"saved": "true", "backup": backup_name}


class NewPlaybookBody(BaseModel):
    name: str = Field(..., pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*\.md$")


@router.post("/playbooks")
def create_playbook(
    body: NewPlaybookBody, ws: Path = Depends(workspace_dep)
) -> dict[str, Any]:
    p = _playbook_path(ws, body.name)
    if p.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("# New playbook\n\n", encoding="utf-8")
    return _file_entry(p, ws)


@router.delete("/playbooks/{name}")
def delete_playbook(name: str, ws: Path = Depends(workspace_dep)) -> dict[str, str]:
    p = _playbook_path(ws, name)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    p.unlink()
    return {"ok": "true"}


def _hermes_bin() -> str:
    """Hermes executable for subprocess argv[0]; systemd may set ``HERMES_BIN`` to a full path."""
    return os.environ.get("HERMES_BIN", "hermes")


def _hermes_logs_since_argv() -> list[str]:
    return [_hermes_bin(), "logs", "--since", "1h"]


def _hermes_logs_errors_argv() -> list[str]:
    return [_hermes_bin(), "logs", "errors"]


async def _run_cmd(args: list[str], timeout: float = 120.0) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(get_workspace_root()),
        env={**os.environ, "LC_ALL": "C.UTF-8"},
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "Command timed out\n"
    text = out.decode("utf-8", errors="replace")
    code = proc.returncode
    if code is None:
        code = -1
    return code, text


def _tail_lines(s: str, max_lines: int = 300) -> str:
    lines = s.splitlines()
    if len(lines) <= max_lines:
        return s
    return "\n".join(lines[-max_lines:]) + "\n"


@router.get("/logs/hermes")
async def get_logs_hermes() -> PlainTextResponse:
    _, text = await _run_cmd(_hermes_logs_since_argv(), timeout=180.0)
    return PlainTextResponse(_tail_lines(text, 300), media_type="text/plain; charset=utf-8")


@router.get("/logs/errors")
async def get_logs_errors() -> PlainTextResponse:
    _, text = await _run_cmd(_hermes_logs_errors_argv(), timeout=180.0)
    return PlainTextResponse(_tail_lines(text, 300), media_type="text/plain; charset=utf-8")


class CommandBody(BaseModel):
    command: str


class ChatSendBody(BaseModel):
    """One-shot Hermes message via ``hermes -z`` (no shell, argv list only)."""

    message: str = Field(..., description="UTF-8 message passed to Hermes -z")

    @field_validator("message")
    @classmethod
    def _validate_message(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("message must be a string")
        s = v.strip()
        if not s:
            raise ValueError("message must not be empty")
        if len(s) > 8000:
            raise ValueError("message exceeds maximum length of 8000 characters")
        return s


_SESSION_ID_LINE_RE = re.compile(r"^\s*session_id:\s*(\S+)\s*$", re.IGNORECASE)
_RESUMED_SESSION_LINE_RE = re.compile(
    r"^\s*(?:\u21bb\s+)?Resumed session\b.*$",
    re.IGNORECASE,
)
_SESSION_ID_SAFE_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")


def _parse_hermes_session_chat_stdout(raw: str) -> tuple[str, str | None, str | None]:
    """Remove ``session_id:`` and resume banner lines; return response, id, optional warning."""
    extracted: str | None = None
    out_lines: list[str] = []
    for line in raw.splitlines():
        m = _SESSION_ID_LINE_RE.match(line)
        if m:
            extracted = m.group(1)
            continue
        if _RESUMED_SESSION_LINE_RE.match(line):
            continue
        out_lines.append(line)
    text = "\n".join(out_lines).strip()
    warning = None
    if extracted is None:
        warning = (
            "Hermes did not emit a session_id line; the next message may start a new session."
        )
    return text, extracted, warning


def _hermes_session_chat_argv(message: str, resume_id: str | None) -> list[str]:
    """Fixed argv for ``hermes chat -q … -Q [--resume ID] --source tool -t …`` (no user flags)."""
    exe = _hermes_bin()
    if resume_id:
        return [
            exe,
            "chat",
            "-q",
            message,
            "-Q",
            "--resume",
            resume_id,
            "--source",
            "tool",
            "-t",
            "terminal,file,memory",
        ]
    return [
        exe,
        "chat",
        "-q",
        message,
        "-Q",
        "--source",
        "tool",
        "-t",
        "terminal,file,memory",
    ]


class ChatSessionSendBody(BaseModel):
    """Hermes persistent session turn via ``hermes chat -q -Q`` (optional ``--resume``)."""

    message: str = Field(..., description="User message passed to Hermes -q")
    sessionId: str | None = Field(
        default=None,
        description="Hermes session id from prior turn, or null to start",
    )

    @field_validator("message")
    @classmethod
    def _validate_session_message(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("message must be a string")
        s = v.strip()
        if not s:
            raise ValueError("message must not be empty")
        if len(s) > 8000:
            raise ValueError("message exceeds maximum length of 8000 characters")
        return s

    @field_validator("sessionId", mode="before")
    @classmethod
    def _coerce_session_id(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        if not isinstance(v, str):
            raise TypeError("sessionId must be a string or null")
        return v.strip()

    @field_validator("sessionId")
    @classmethod
    def _validate_session_id(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if len(v) > 128:
            raise ValueError("sessionId exceeds maximum length of 128 characters")
        if not _SESSION_ID_SAFE_RE.fullmatch(v):
            raise ValueError(
                "sessionId must contain only letters, numbers, underscore, and hyphen",
            )
        return v


@router.post("/chat/session-send")
async def chat_session_send(
    body: ChatSessionSendBody,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Run ``hermes chat -q`` with optional ``--resume``; parse ``session_id`` from stdout."""
    timeout_sec = get_chat_timeout_seconds()
    argv = _hermes_session_chat_argv(body.message, body.sessionId)
    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env={**os.environ, "LC_ALL": "C.UTF-8"},
        )
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start Hermes: {exc}",
        ) from exc

    try:
        out, _ = await asyncio.wait_for(
            proc.communicate(),
            timeout=float(timeout_sec),
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "response": f"Hermes timed out after {timeout_sec} seconds.\n",
            "sessionId": body.sessionId,
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "hermes-session",
            "parseWarning": None,
        }

    raw = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((time.monotonic() - started) * 1000)
    response_text, parsed_sid, parse_warn = _parse_hermes_session_chat_stdout(raw)
    if code != 0:
        response_text_inner = response_text
        response_text = (
            f"Hermes exited with code {code}.\n\n{response_text_inner}".strip() + "\n"
        ).strip()
    return {
        "response": response_text,
        "sessionId": parsed_sid,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "hermes-session",
        "parseWarning": parse_warn,
    }


@router.post("/chat/send")
async def chat_send(body: ChatSendBody, ws: Path = Depends(workspace_dep)) -> dict[str, Any]:
    """Run ``hermes -z <message>`` from the workspace root; no user-controlled flags."""
    timeout_sec = get_chat_timeout_seconds()
    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            _hermes_bin(),
            "-z",
            body.message,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env={**os.environ, "LC_ALL": "C.UTF-8"},
        )
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start Hermes: {exc}",
        ) from exc

    try:
        out, _ = await asyncio.wait_for(
            proc.communicate(),
            timeout=float(timeout_sec),
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "response": f"Hermes timed out after {timeout_sec} seconds.\n",
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "oneshot",
        }

    text = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((time.monotonic() - started) * 1000)
    response_text = text
    if code != 0:
        response_text = (
            f"Hermes exited with code {code}.\n\n{response_text}".strip() + "\n"
        ).strip()
    return {
        "response": response_text,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "oneshot",
    }


@router.get("/commands/whitelist")
def commands_whitelist() -> dict[str, list[str]]:
    return {"commands": list_whitelisted_commands()}


@router.post("/commands/run")
async def run_whitelisted(body: CommandBody) -> dict[str, Any]:
    cmd = body.command.strip()
    if not is_whitelisted_command(cmd):
        raise HTTPException(status_code=400, detail="Command not allowed")
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(get_workspace_root()),
        env={**os.environ, "LC_ALL": "C.UTF-8"},
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=180.0)
    except asyncio.TimeoutError:
        proc.kill()
        return {"exitCode": 124, "output": "Command timed out\n"}
    text = out.decode("utf-8", errors="replace")
    code = proc.returncode
    if code is None:
        code = -1
    return {"exitCode": code, "output": _tail_lines(text, 300)}
