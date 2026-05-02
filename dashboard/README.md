# Dashboard

Local web UI for the Hayk workspace (FastAPI + React + Vite + TypeScript + Tailwind).

**Repository overview, safety rules, and Pi deploy:** see the [**root `README.md`**](../README.md).

## API contract and frontend shell

- Human-readable REST contract: **[`../docs/api-contract.md`](../docs/api-contract.md)**
- Lovable handoff: **[`../docs/lovable-integration.md`](../docs/lovable-integration.md)**
- Typed client: `frontend/src/lib/api-client.ts`
- Stable nav + layout hooks: `frontend/src/shell/`

OpenAPI JSON (with backend running): `http://<host>:8080/openapi.json`

## Quick commands

Backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Optional env vars: see **`.env.example`** in the **repository root** (`WORKSPACE_ROOT`, `CORS_ORIGINS`, etc.).

## Tests

```bash
cd backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest tests -v
```

## Production

Systemd, nginx, and env details: **[`docs/dashboard-deploy.md`](../docs/dashboard-deploy.md)**.
