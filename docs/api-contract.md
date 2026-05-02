# Dashboard API contract

**Source of truth for behavior:** `hayk-universal-agent` — FastAPI app in `dashboard/backend/app/`.  
This document is the **human-readable contract** for integrators (e.g. a Lovable prototype). Keep it in sync when routes change.

**Machine-readable schema:** with the backend running, OpenAPI JSON is always:

- `GET /openapi.json` (relative to API host, e.g. `http://127.0.0.1:8080/openapi.json`)

All JSON routes below are under prefix **`/api`** unless noted.

**Base URL:** dev default `http://127.0.0.1:8080`. Frontend uses `VITE_API_BASE` when the UI is not same-origin.

**Auth (MVP):** none. Optional future header `X-Dashboard-Key` if `DASHBOARD_API_KEY` is wired.

---

## Common models

### `FileEntry`

Returned for workspace files (camelCase in JSON).

| Field | Type | Notes |
|-------|------|--------|
| `name` | string | Basename |
| `path` | string | Relative to workspace, `/` separators |
| `size` | number | Bytes |
| `modified` | string | ISO 8601 UTC |
| `extension` | string | Lowercase, no dot, or `"file"` |
| `isDir` | boolean | Always `false` for list endpoints that only return files |

### `StatusResponse`

| Field | Type |
|-------|------|
| `agentName` | string |
| `workspacePath` | string |
| `serverTime` | string (ISO UTC) |
| `agentsMdExists` | boolean |
| `playbooksDirExists` | boolean |
| `fileCounts` | `{ input: number, output: number, reports: number }` |
| `diskUsage` | `{ totalBytes, usedBytes, freeBytes, workspaceBytes }` |
| `venv` | `{ pythonPath: string, existsAndExecutable: boolean }` |

### `CommandRunResponse`

| Field | Type |
|-------|------|
| `exitCode` | number |
| `output` | string (trimmed to last 300 lines server-side) |

---

## Endpoints

### `GET /health`

**Response:** `{ "status": "ok" }`  
No `/api` prefix.

---

### `GET /api/status`

**Response:** `StatusResponse`

---

### `GET /api/files/list`

**Response:**

```json
{
  "input": [ … FileEntry … ],
  "output": [ … ],
  "reports": [ … ]
}
```

---

### `GET /api/files/download?path=<relative-path>`

**Query:** `path` — file path relative to workspace, must be under `input/`, `output/`, or `reports/`.

**Response:** binary stream (`application/octet-stream`).

**Errors:** 400 / 403 if path invalid or outside allowed trees.

---

### `DELETE /api/files?path=<relative-path>`

Same path rules as download. Only **files**, not directories.

**Response:** `{ "ok": "true" }`

---

### `POST /api/files/upload`

**Body:** `multipart/form-data`, field `file` (single file).

**Rules:** filename only (no `/` or `\`); file is written under `input/`.

**Response:** `FileEntry`

---

### `GET /api/agents-md`

**Response:** raw markdown (`text/markdown`), may be empty if file missing.

---

### `PUT /api/agents-md`

**Body:** `{ "content": string }` (UTF-8)

**Response:** `{ "saved": "true", "backup": string }` — `backup` is empty if the file did not exist before save; otherwise `AGENTS.md.bak.YYYYMMDD_HHMMSS`.

---

### `GET /api/playbooks`

**Response:** `FileEntry[]` (only `*.md` in `playbooks/`).

---

### `GET /api/playbooks/{name}`

**Path:** `name` — e.g. `plan-first.md` (no slashes).

**Response:** raw markdown (`text/markdown`).

**Errors:** 404 if missing.

---

### `PUT /api/playbooks/{name}`

**Body:** `{ "content": string }`

**Response:** `{ "saved": "true", "backup": string }` — backup filename only (lives under `playbooks/`).

---

### `POST /api/playbooks`

**Body:** `{ "name": string }` — must match `^[a-zA-Z0-9][a-zA-Z0-9_-]*\.md$`

**Response:** `FileEntry`

**Errors:** 409 if exists.

---

### `DELETE /api/playbooks/{name}`

**Response:** `{ "ok": "true" }`

---

### `POST /api/hermes/run`

**Body:** `{ "variant": "status" | "doctor" | "ping" }`

Maps to fixed CLI invocations (no user shell).

**Response:** `CommandRunResponse` (`output` line-capped).

**Errors:** 400 if `variant` unknown.

---

### `GET /api/logs/{kind}`

**Path:** `kind` = `since1h` | `errors` (maps to `hermes logs --since 1h` and `hermes logs errors`).

**Response:** plain text (`text/plain`), last **300** lines.

**Errors:** 400 if `kind` invalid.

---

### `GET /api/commands/whitelist`

**Response:** `{ "commands": string[] }` — exact strings allowed for `POST /api/commands/run`.

---

### `POST /api/commands/run`

**Body:** `{ "command": string }` — must **exactly** match one entry from the whitelist (after trim).

**Response:** `CommandRunResponse`

**Errors:** 400 if not whitelisted.

---

## Stability notes

- Prefer **adding** fields or optional endpoints over renaming JSON keys (breaking change for the shell and any Lovable port).
- File path query/params use workspace-relative POSIX-style paths with `/`.
- Integrators should not assume Hermes is installed; handle non-zero exit codes in `CommandRunResponse`.
