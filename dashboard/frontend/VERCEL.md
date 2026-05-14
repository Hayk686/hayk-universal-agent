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
