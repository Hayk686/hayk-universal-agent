# Vercel deploy

This frontend is a static Vite app. The FastAPI/Hermes backend should run outside
Vercel and be exposed with HTTPS, Tailscale Funnel, Cloudflare Tunnel, or another
host.

## Option A: deploy from repo root (recommended)

Use the root `vercel.json`. Vercel will install and build `dashboard/frontend`,
serve `dashboard/frontend/dist`, and expose serverless functions under `api/`.

## Option B: deploy from frontend root

Set Vercel `Root Directory` to:

```text
dashboard/frontend
```

The local `dashboard/frontend/vercel.json` handles SPA routing only — **no**
serverless chat/policy functions unless you also configure the root `api/` routes.

## Deployment modes

| Mode | `VITE_API_BASE_URL` | Backend |
|------|---------------------|---------|
| **Vercel UI + PC backend** | `https://your-tunnel.example` | Full Hermes + PolicyGate on your PC (FastAPI :8080) |
| **Pi / remote FastAPI** | `https://your-pi-or-tunnel.example` | Same as PC mode — any remote FastAPI host |
| **Vercel cloud API** | unset (same-origin `/api/*`) | Serverless OpenRouter proxy + JS PolicyGate |
| **Frontend-only preview** | unset + `VITE_USE_MOCKS=true` | Mock data only |

`VITE_API_BASE_URL` must be the backend root, **without** `/api` at the end.

## Vercel UI + PC backend (full Hermes)

Use this when the dashboard is on Vercel but Hermes runs on your Windows/Linux PC.

### 1. PC — backend `.env` (`dashboard/backend/.env`)

```text
WORKSPACE_ROOT=D:\path\to\hayk-universal-agent\agent-workspace
HERMES_BIN=hermes
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

`CORS_ORIGINS` must include the **exact** Vercel production URL (and Preview URLs if you use them).

### 2. PC — start FastAPI (port 8080)

**Windows (PowerShell):**

```powershell
cd dashboard\backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8080
```

**Linux / macOS:**

```bash
cd dashboard/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Verify locally: `GET http://127.0.0.1:8080/health` → `{"status":"ok"}` and
`GET http://127.0.0.1:8080/api/capabilities` → all flags `true`.

### 3. PC — HTTPS tunnel (required for Vercel → PC)

Browsers block mixed content (HTTPS Vercel UI → HTTP PC). Expose FastAPI with **HTTPS**, e.g.:

- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared tunnel --url http://127.0.0.1:8080`)
- [ngrok](https://ngrok.com/) (`ngrok http 8080`)
- Tailscale Funnel / similar

Note the public **HTTPS origin** (no trailing slash, no `/api`), e.g. `https://abc123.ngrok-free.app`.

### 4. Vercel — build-time env (Project → Settings → Environment Variables)

```text
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://abc123.ngrok-free.app
```

`VITE_API_BASE_URL` is baked in at **build** time — redeploy after changing it.

### 5. Smoke test

1. Open your Vercel app → **Server Capabilities** panel should show all toggles on and **PC backend · …**.
2. DevTools → Network → `GET …/api/capabilities` should hit your tunnel URL, not `vercel.app/api/…`.
3. If CORS fails: add the exact Vercel origin to `CORS_ORIGINS` on the PC and restart uvicorn.

## Environment variables — Pi / remote FastAPI mode

Same as **Vercel UI + PC backend** above — any machine running FastAPI + Hermes.

```text
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://your-backend-host.example
```

On the backend host, set `CORS_ORIGINS` to include your Vercel frontend URL.

## Environment variables — Vercel cloud API mode

Leave `VITE_API_BASE_URL` unset. Add:

```text
VITE_USE_MOCKS=false
AGENT_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
POLICY_HMAC_SECRET=<random-32+-char-secret>
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=owner/repo
GITHUB_BRANCH=main
AGENT_WORKHORSE_MODEL=minimax/minimax-m2.5:free
AGENT_WEB_MODEL=minimax/minimax-m2.5:free
AGENT_ALLOW_PAID_MODELS=false
```

### Policy tokens (`POLICY_HMAC_SECRET`)

Required for production cloud mode. Signs confirmation tokens for gated actions
(web-send, AGENTS.md save, etc.). Without it, Vercel falls back to a SHA-256
derivative of `OPENROUTER_API_KEY` (dev-only; set an explicit secret in prod).

Use the same value as `POLICY_CONFIRM_SECRET` on the Pi backend if you want
tokens to work across both runtimes (normally each runtime is standalone).

### NVIDIA NIM instead of OpenRouter

```text
AGENT_LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
AGENT_WORKHORSE_MODEL=z-ai/glm-5.1
AGENT_WEB_MODEL=z-ai/glm-5.1
POLICY_HMAC_SECRET=<random-32+-char-secret>
```

NVIDIA NIM uses `https://integrate.api.nvidia.com/v1/chat/completions`.

### GitHub token

Contents read/write on the target repo so the browser editor can save
`AGENTS.md` and playbooks through Vercel functions.

## What works on Vercel vs Pi

| Feature | Vercel cloud | Pi FastAPI |
|---------|--------------|------------|
| Dashboard UI | Yes | Yes |
| Chat (OpenRouter/NIM) | Yes, PolicyGate | Yes, Hermes subprocess |
| Web-send | Yes, confirm required | Yes, confirm + research pipeline |
| Hermes subprocess | **No** | Yes |
| Browser driver | **No** | Yes |
| Tasks / Memory / Research panels | **No** (API stubs missing) | Yes |
| AGENTS.md / playbooks via GitHub | Yes, gated writes | Yes, local filesystem |
| Whitelisted commands | 3 cloud stubs | Full Pi whitelist |

## Manual setup checklist

1. Create/import project on [vercel.com](https://vercel.com) from GitHub repo.
2. Set **Root Directory** to repo root (Option A) or `dashboard/frontend` (Option B).
3. Add environment variables above (Production + Preview as needed).
4. Deploy — Vercel builds frontend and registers `api/**/*.js` functions.
5. Optional: add custom domain under Project → Settings → Domains.
6. For **Vercel UI + PC backend**: expose FastAPI (port 8080) via HTTPS tunnel and set
   `VITE_API_BASE_URL` to that origin (see section above).

## Policy-gated routes (Slice #9)

Serverless paths with JS PolicyGate (mirrors Python `gate.py`):

- `POST /api/chat/web-send` — network confirm
- `POST /api/chat/send`, `POST /api/chat/session-send` — hardline/payment deny
- `POST /api/commands/run` — exec whitelist + policy
- `PUT /api/agents-md` — write confirm
- `POST /api/policy/check`, `POST /api/policy/confirm` — token flow for UI modal

Structured policy events are logged as JSON to Vercel function logs.

## Serverless layout

Policy helpers live under `api/_lib/` (leading `_` so Vercel does not deploy them as
extra functions). The Hobby plan allows **12** Serverless Functions per deployment;
putting shared modules in `api/lib/` previously exceeded that limit and failed the build.

## Tests

```bash
node --test tests/api/policy-gate.test.js
```
