# Vercel deploy

This frontend is a static Vite app. The FastAPI/Hermes backend should run outside
Vercel and be exposed with HTTPS, Tailscale Funnel, Cloudflare Tunnel, or another
host.

## Option A: deploy from repo root

Use the root `vercel.json`. Vercel will install and build `dashboard/frontend`
and serve `dashboard/frontend/dist`.

## Option B: deploy from frontend root

Set Vercel `Root Directory` to:

```text
dashboard/frontend
```

The local `dashboard/frontend/vercel.json` handles SPA routing.

## Environment variables

Set these in Vercel:

```text
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://your-backend-host.example
```

`VITE_API_BASE_URL` must be the backend root, without `/api` at the end.

For the Vercel cloud API mode, leave `VITE_API_BASE_URL` unset and add:

```text
AGENT_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=Hayk686/hayk-universal-agent
GITHUB_BRANCH=main
AGENT_WORKHORSE_MODEL=minimax/minimax-m2.5:free
AGENT_WEB_MODEL=minimax/minimax-m2.5:free
AGENT_ALLOW_PAID_MODELS=false
```

To use NVIDIA NIM instead of OpenRouter:

```text
AGENT_LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
AGENT_WORKHORSE_MODEL=z-ai/glm-5.1
AGENT_WEB_MODEL=z-ai/glm-5.1
```

NVIDIA NIM uses the OpenAI-compatible endpoint
`https://integrate.api.nvidia.com/v1/chat/completions`. If NVIDIA changes the
model id, try `z-ai/glm5.1` as the model value.

The GitHub token needs Contents read/write access for this repository so the
browser editor can save `AGENTS.md` and playbooks through Vercel functions.
