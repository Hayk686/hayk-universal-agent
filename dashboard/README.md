# Dashboard

FastAPI backend + React / Vite / Tailwind frontend for **Hayk Universal Agent**.  
Canonical repo: **`hayk-universal-agent`**. Runtime workspace on the Pi: **`/home/ubuntu/ai-office-agent-workspace`**.

**Root README** (clone, agent template, safety): [**`../README.md`**](../README.md)  
**API contract:** [**`../docs/api-contract.md`**](../docs/api-contract.md)  
**Deploy (systemd / nginx):** [**`../docs/dashboard-deploy.md`**](../docs/dashboard-deploy.md)

---

## Run on Raspberry Pi

On the Pi, after cloning the repo (example path `/home/ubuntu/hayk-universal-agent`):

1. **Backend env** — copy **`dashboard/backend/.env.example`** to `dashboard/backend/.env` (or set the same variables in systemd).  
   Set **`WORKSPACE_ROOT`** to your agent workspace (default: `/home/ubuntu/ai-office-agent-workspace`).  
   **`HERMES_BIN`** and **`PYTHON_BIN`** document the expected layout on the Pi. The API does **not** read `~/.hermes/.env`. The command runner remains **whitelist-only** per **`docs/api-contract.md`**.  
   **`CHAT_TIMEOUT_SECONDS`** (default **300**, range 30–600) caps how long Agent Chat waits on each Hermes run (`/api/chat/send`, `/api/chat/session-send`).

2. **Frontend env** — copy **`dashboard/frontend/.env.example`** to `dashboard/frontend/.env` when the UI should call the API on another host (e.g. Tailscale IP **`http://100.120.203.58:8080`**).  
   Resolution order: **`VITE_API_BASE_URL`** → **`VITE_API_BASE`** → empty string (Vite dev **proxy** to `localhost:8080`).  
   Use **`VITE_USE_MOCKS=false`** for live data. If the browser origin is not the same host as the API, add that origin to **`CORS_ORIGINS`** on the backend (comma-separated).

```bash
export WORKSPACE_ROOT=/home/ubuntu/ai-office-agent-workspace
```

### Backend (port 8080)

```bash
cd /home/ubuntu/hayk-universal-agent/dashboard/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### Frontend dev (port 5173; proxies `/api` when `VITE_API_BASE*` is unset)

```bash
cd /home/ubuntu/hayk-universal-agent/dashboard/frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open `http://<pi-ip>:5173` on your LAN. Ensure nothing else steals ports **8080** / **5173**. With a remote API URL in `.env`, the UI calls that origin directly (set **CORS** accordingly).

**UI:** Every screen uses the Lovable-style shell (`PageHeader`, shadcn `Card` / `Button`, semantic tokens). A **Live** / **Mock** badge (from `VITE_USE_MOCKS`) appears in the page header next to optional actions. The dashboard home also shows **OK** / **ATTENTION** for workspace checks when not in mock mode.

### Production sketch

- Build UI: `npm run build` → serve `frontend/dist/` with nginx.  
- Proxy `/api` to `http://127.0.0.1:8080`.  
- Bind uvicorn to `127.0.0.1` behind nginx.  
- Set `WORKSPACE_ROOT` in systemd `Environment=`.

See **`docs/dashboard-deploy.md`** for a sample unit file.

---

## Environment

- **`dashboard/frontend/.env.example`** — `VITE_API_BASE_URL`, `VITE_USE_MOCKS`, optional `VITE_API_BASE`.
- **`dashboard/backend/.env.example`** — `WORKSPACE_ROOT`, optional `CORS_ORIGINS`, `DASH_AGENT_NAME`, `HERMES_BIN`, `PYTHON_BIN` (documentation / Pi layout), **`CHAT_TIMEOUT_SECONDS`** (Agent Chat Hermes timeout, default 300). Optional **`DASHBOARD_API_KEY`** only if you enable API key auth; never commit real keys.
- Repo root **`../.env.example`** may define shared variables used elsewhere in the monorepo.

---

## Tests

```bash
cd backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest tests -v
```

---

## Frontend shell (Lovable handoff)

- **`frontend/src/shell/nav.ts`** — stable routes  
- **`frontend/src/shell/PageShell.tsx`** — `PageHeader`, header **Live/Mock** badge (`SourceModeBadge`), `data-page-*` hooks, `max-w-7xl` content width for responsive layout  
- **`frontend/src/components/source-mode-badge.tsx`** — reflects `VITE_USE_MOCKS` (`import.meta.env` at build time)  
- **`frontend/src/lib/api/`** — typed client + mocks; **`frontend/src/lib/api-client.ts`** re-exports the same surface for **`docs/api-contract.md`**

OpenAPI: `http://127.0.0.1:8080/openapi.json`
