from __future__ import annotations

import asyncio
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field, field_validator

from app.config import AGENT_NAME, get_workspace_root
from app.safety import is_whitelisted_command, list_whitelisted_commands, safe_join

router = APIRouter()


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
    venv_python = safe_join(ws, ".venv", "bin", "python")

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


HERMES_LOG_CMDS: dict[str, list[str]] = {
    "hermes": ["hermes", "logs", "--since", "1h"],
    "errors": ["hermes", "logs", "errors"],
}


def _tail_lines(s: str, max_lines: int = 300) -> str:
    lines = s.splitlines()
    if len(lines) <= max_lines:
        return s
    return "\n".join(lines[-max_lines:]) + "\n"


@router.get("/logs/hermes")
async def get_logs_hermes() -> PlainTextResponse:
    _, text = await _run_cmd(HERMES_LOG_CMDS["hermes"], timeout=180.0)
    return PlainTextResponse(_tail_lines(text, 300), media_type="text/plain; charset=utf-8")


@router.get("/logs/errors")
async def get_logs_errors() -> PlainTextResponse:
    _, text = await _run_cmd(HERMES_LOG_CMDS["errors"], timeout=180.0)
    return PlainTextResponse(_tail_lines(text, 300), media_type="text/plain; charset=utf-8")


class CommandBody(BaseModel):
    command: str


_BROWSER_MODELS: dict[str, tuple[str, str]] = {
    "auto": ("AGENT_PRIMARY_MODEL", "openrouter/free"),
    "fast": ("AGENT_FAST_MODEL", "nvidia/nemotron-3-nano-30b-a3b:free"),
    "workhorse": ("AGENT_WORKHORSE_MODEL", "minimax/minimax-m2.5:free"),
    "smart": ("AGENT_SMART_MODEL", "z-ai/glm-4.5-air:free"),
    "backup": ("AGENT_BACKUP_MODEL", "openai/gpt-oss-20b:free"),
}


def _hermes_bin() -> str:
    return os.environ.get("HERMES_BIN", "hermes")


def _chat_timeout_seconds() -> int:
    raw = os.environ.get("CHAT_TIMEOUT_SECONDS", "300").strip()
    try:
        value = int(raw, 10)
    except ValueError:
        return 300
    return value if 30 <= value <= 600 else 300


def _paid_models_allowed() -> bool:
    raw = os.environ.get("AGENT_ALLOW_PAID_MODELS", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _browser_model_for(mode: str) -> str:
    env_name, default = _BROWSER_MODELS.get(mode, _BROWSER_MODELS["workhorse"])
    model = os.environ.get(env_name, default).strip() or default
    if not _paid_models_allowed() and model != "openrouter/free" and not model.endswith(":free"):
        raise HTTPException(
            status_code=500,
            detail=f"{env_name} must be a free model while AGENT_ALLOW_PAID_MODELS=false",
        )
    return model


def _browser_text_limit() -> int:
    raw = os.environ.get("BROWSER_AGENT_MAX_CHARS", "6000").strip()
    try:
        value = int(raw, 10)
    except ValueError:
        return 6000
    return min(max(value, 1000), 12000)


def _compact_browser_text(text: str, max_chars: int) -> str:
    lines: list[str] = []
    for raw in text.replace("\r", "\n").splitlines():
        line = re.sub(r"[ \t\f\v]+", " ", raw).strip()
        if line:
            lines.append(line)
    compact = "\n".join(lines)
    if len(compact) <= max_chars:
        return compact
    return compact[:max_chars].rstrip() + "\n[truncated]"


class BrowserAnalyzeBody(BaseModel):
    """Compact visible page context from the browser extension."""

    url: str = Field(default="", description="Current tab URL")
    title: str = Field(default="", description="Current tab title")
    selection: str = Field(default="", description="Selected text, if any")
    visibleText: str = Field(..., description="Visible page text extracted by the extension")
    mode: str = Field(default="workhorse", description="auto, fast, workhorse, smart, or backup")

    @field_validator("url", "title", "selection", mode="before")
    @classmethod
    def _coerce_optional_text(cls, v: Any) -> str:
        if v is None:
            return ""
        if not isinstance(v, str):
            raise TypeError("field must be a string")
        return v.strip()

    @field_validator("visibleText")
    @classmethod
    def _validate_visible_text(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("visibleText must be a string")
        s = v.strip()
        if not s:
            raise ValueError("visibleText must not be empty")
        if len(s) > 20000:
            raise ValueError("visibleText exceeds maximum length of 20000 characters")
        return s

    @field_validator("mode")
    @classmethod
    def _validate_mode(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("mode must be a string")
        s = v.strip().lower() or "workhorse"
        if s not in _BROWSER_MODELS:
            raise ValueError("mode must be auto, fast, workhorse, smart, or backup")
        return s


def _browser_analysis_prompt(body: BrowserAnalyzeBody) -> str:
    page_text = _compact_browser_text(body.visibleText, _browser_text_limit())
    selected = _compact_browser_text(body.selection, 1200) if body.selection else "(none)"
    title = body.title[:300] if body.title else "(none)"
    url = body.url[:500] if body.url else "(none)"
    return (
        "You are a concise browser work assistant.\n"
        "Analyze the current page context and suggest the next useful answer or action.\n"
        "Use only the provided context. If the context is insufficient, say exactly what is missing.\n"
        "Answer in Russian. Do not include a safety lecture.\n"
        "Format:\n"
        "Коротко: <one sentence>\n"
        "Ответ/действие: <what to answer or do>\n"
        "Почему: <brief reason>\n"
        "Уверенность: high|medium|low\n\n"
        f"URL: {url}\n"
        f"Title: {title}\n"
        f"Selected text: {selected}\n\n"
        "Visible page text:\n"
        f"{page_text}\n"
    )


@router.get("/commands/whitelist")
def commands_whitelist() -> dict[str, list[str]]:
    return {"commands": list_whitelisted_commands()}


@router.post("/browser/analyze")
async def browser_analyze(
    body: BrowserAnalyzeBody,
    ws: Path = Depends(workspace_dep),
) -> dict[str, Any]:
    """Analyze compact browser page context with a free-model Hermes one-shot."""
    timeout_sec = _chat_timeout_seconds()
    model = _browser_model_for(body.mode)
    prompt = _browser_analysis_prompt(body)
    started = datetime.now(timezone.utc)
    try:
        proc = await asyncio.create_subprocess_exec(
            _hermes_bin(),
            "-z",
            prompt,
            "--provider",
            "openrouter",
            "--model",
            model,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(ws),
            env={**os.environ, "LC_ALL": "C.UTF-8"},
        )
    except OSError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Hermes is not available on this machine ({_hermes_bin()}): {exc}",
        ) from exc

    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=float(timeout_sec))
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        return {
            "response": f"Hermes browser helper timed out after {timeout_sec} seconds.\n",
            "exitCode": 124,
            "durationMs": elapsed_ms,
            "mode": "browser-analyze",
            "model": model,
            "requestMode": body.mode,
        }

    text = out.decode("utf-8", errors="replace")
    code = proc.returncode if proc.returncode is not None else -1
    elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    if code != 0:
        text = (f"Hermes exited with code {code}.\n\n{text}".strip() + "\n").strip()

    return {
        "response": text,
        "exitCode": code,
        "durationMs": elapsed_ms,
        "mode": "browser-analyze",
        "model": model,
        "requestMode": body.mode,
    }


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
