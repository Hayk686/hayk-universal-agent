# Dashboard API contract

**Backend:** `dashboard/backend/app/` (FastAPI).  
**Workspace (Pi default):** `/home/ubuntu/ai-office-agent-workspace` — overridable with ` WORKSPACE_ROOT`.  
**OpenAPI:** `GET /openapi.json` on the API host (e.g. port 8080).

This document matches the **Hayk Universal Agent** integration surface (Lovable-compatible). Do not read `~/.hermes/.env` from the backend; do not expose API keys in responses.

---

## Models

### `FileEntry`

| Field | Type |
|-------|------|
| `name` | string |
| `path` | string (relative to workspace, `/`) |
| `size` | number (bytes) |
| `modified` | string (ISO 8601 UTC) |
| `extension` | string |
| `isDir` | boolean (`false` for file listings)

### `StatusResponse`

| Field | Type |
|-------|------|
| `agentName` | string |
| `workspacePath` | string |
| `serverTime` | string |
| `agentsMdExists` | boolean |
| `playbooksDirExists` | boolean |
| `fileCounts` | `{ input, output, reports }` |
| `diskUsage` | `{ totalBytes, usedBytes, freeBytes, workspaceBytes }` |
| `venv` | `{ pythonPath, existsAndExecutable }` |

### `CommandRunResponse`

| Field | Type |
|-------|------|
| `exitCode` | number |
| `output` | string (last 300 lines server-side)

### `SaveMarkdownResponse`

`{ "saved": "true", "backup": string }` — `backup` may be empty if no prior file.

---

## Endpoints

### `GET /health`

`{ "status": "ok" }` — no `/api` prefix.

### `GET /api/status`

`StatusResponse`

### `GET /api/files?folder=input|output|reports`

Returns **`FileEntry[]`** for that folder only. Invalid `folder` → 400.

Download (not listed in minimal marketing docs but used by UI): **`GET /api/files/download?path=…`** — path must be a file under `input/`, `output/`, or `reports/`.

### `POST /api/files/upload`

`multipart/form-data` field `file`. Flat filename only → written under `input/`.  
Response: `FileEntry`

### `DELETE /api/files?path=…`

Deletes **one file** under `input/`, `output/`, or `reports/` only.  
**Forbidden:** directories, `AGENTS.md`, any `playbooks/…`, `.venv`, paths outside workspace.  
Response: `{ "ok": "true" }`

### `GET /api/agents-md`

Raw markdown (`text/markdown`).

### `PUT /api/agents-md`

Body: `{ "content": string }`. Backup `AGENTS.md.bak.YYYYMMDD_HHMMSS` if file existed.  
Response: `SaveMarkdownResponse`

### `GET /api/playbooks`

`FileEntry[]` — `*.md` in `playbooks/`.

### `GET /api/playbooks/{name}`

Markdown (`name` e.g. `plan-first.md`, no slashes). 404 if missing.

### `PUT /api/playbooks/{name}`

Body: `{ "content": string }`. Backup in `playbooks/` with `.bak.YYYYMMDD_HHMMSS` before overwrite.

### `POST /api/playbooks` / `DELETE /api/playbooks/{name}`

Optional helpers for create/delete single playbook files (not part of minimal marketing list; same path rules as `_playbook_path`).

### `POST /api/commands/run`

Body: `{ "command": string }` — must **exactly** match a server whitelist entry (after trim).  
No `sudo`, no `rm` from user input, no arbitrary shell beyond these strings:

- `pwd`
- `ls -la /home/ubuntu/ai-office-agent-workspace`
- `ls -la /home/ubuntu/ai-office-agent-workspace/input`
- `ls -la /home/ubuntu/ai-office-agent-workspace/output`
- `ls -la /home/ubuntu/ai-office-agent-workspace/reports`
- `hermes status`
- `hermes doctor`
- `hermes logs --since 1h`
- `hermes logs errors`
- `hermes -z "Say exactly: OK"`
- `/home/ubuntu/ai-office-agent-workspace/.venv/bin/python -c "import sys; print(sys.executable)"`

Response: `CommandRunResponse`

### `GET /api/commands/whitelist`

`{ "commands": string[] }` — convenience for Settings UI.

### `GET /api/logs/hermes`

Plain text — `hermes logs --since 1h`, last **300** lines.

### `GET /api/logs/errors`

Plain text — `hermes logs errors`, last **300** lines.

---

## Change policy

Bump **`docs/api-contract.md`**, **`dashboard/frontend/src/types/api-contract.ts`**, and **`dashboard/frontend/src/lib/api/`** (and **`api-client.ts`** re-exports) together when changing JSON or routes.
