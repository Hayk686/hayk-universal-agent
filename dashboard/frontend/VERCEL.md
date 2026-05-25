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
| **Pi / remote FastAPI** | `https://your-pi-or-tunnel.example` | Full Hermes + PolicyGate on FastAPI |
| **Vercel cloud API** | unset (same-origin `/api/*`) | Serverless OpenRouter proxy + JS PolicyGate |
| **Frontend-only preview** | unset + `VITE_USE_MOCKS=true` | Mock data only |

`VITE_API_BASE_URL` must be the backend root, **without** `/api` at the end.

## Environment variables — Pi / remote FastAPI mode

```text
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://your-backend-host.example
```

On the Pi backend, set `CORS_ORIGINS` to include your Vercel frontend URL.

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
6. For Pi mode: expose FastAPI (port 8080) via Tailscale Funnel / tunnel and set
   `VITE_API_BASE_URL` to that HTTPS origin.

## Policy-gated routes (Slice #9)

Serverless paths with JS PolicyGate (mirrors Python `gate.py`):

- `POST /api/chat/web-send` — network confirm
- `POST /api/chat/send`, `POST /api/chat/session-send` — hardline/payment deny
- `POST /api/commands/run` — exec whitelist + policy
- `PUT /api/agents-md` — write confirm
- `POST /api/policy/check`, `POST /api/policy/confirm` — token flow for UI modal

Structured policy events are logged as JSON to Vercel function logs.

## Tests

```bash
node --test api/lib/policy-gate.test.js
```
