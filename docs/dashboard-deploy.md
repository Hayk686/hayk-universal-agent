# Dashboard deployment (optional)

Condensed notes for running the dashboard API on the Raspberry Pi or another Linux host. See **`dashboard/backend`** and **`dashboard/frontend`** for install commands.

Adjust all absolute paths to match where you cloned **`hayk-universal-agent`** (the examples assume repo at `/home/ubuntu/hayk-universal-agent` and the **live** agent workspace at `/home/ubuntu/ai-office-agent-workspace`).

## Environment

| Variable | Purpose |
|----------|---------|
| `WORKSPACE_ROOT` | Live agent path (default `/home/ubuntu/ai-office-agent-workspace`) |
| `CORS_ORIGINS` | Comma-separated browser origins for the API |
| `DASH_AGENT_NAME` | Label on the status page |

Do not commit real secrets. See repository root **`.env.example`**.

## Systemd (API only)

Example unit `/etc/systemd/system/hayk-dashboard-api.service`:

```ini
[Unit]
Description=Hayk Agent Dashboard API
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/hayk-universal-agent/dashboard/backend
Environment=WORKSPACE_ROOT=/home/ubuntu/ai-office-agent-workspace
ExecStart=/home/ubuntu/hayk-universal-agent/dashboard/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hayk-dashboard-api.service
```

## Nginx

- Serve `dashboard/frontend/dist/` as static files after `npm run build` (path is inside your clone).
- Proxy `/api/` to `http://127.0.0.1:8080/api/`.
- Set `client_max_body_size` if large uploads to `input/` are expected.

## Tests

From `dashboard/backend` with venv active:

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest tests -v
```
