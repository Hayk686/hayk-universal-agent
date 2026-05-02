from __future__ import annotations

import asyncio
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

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
