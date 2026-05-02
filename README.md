# Hayk Universal Agent

**Repository:** `hayk-universal-agent` — **source of truth** for agent templates, scripts, docs, and the dashboard (backend + canonical frontend shell). Optional **Lovable** prototypes are **not** required to build or deploy this repo; see **`docs/lovable-integration.md`**.

```bash
git clone https://github.com/<your-org>/hayk-universal-agent.git
cd hayk-universal-agent
```

Hayk Universal Agent is a **Hermes-driven** automation setup centered on a **workspace directory** on a Raspberry Pi. The agent reads **`AGENTS.md`** and **`playbooks/*.md`** from that workspace, uses structured folders for work (`input/`, `output/`, `reports/`), and runs under **Linux** with tight safety conventions: no secrets in Git, no ad-hoc destructive shell, and no polluting global Python installs.

## What lives in this repo

| Path | Purpose |
|------|---------|
| `agent-workspace/` | Template **`AGENTS.md`**, **`playbooks/`**, and **`examples/`** — copy (or sync) to the Pi live workspace |
| `dashboard/` | FastAPI + React dashboard (optional; see `dashboard/README.md`) |
| `docs/` | Architecture, roadmap, prompts, **[API contract](docs/api-contract.md)**, **[Lovable handoff](docs/lovable-integration.md)** |
| `scripts/` | **`setup-pi.sh`**, **`backup-workspace.sh`** |

## Hermes on Raspberry Pi

1. Install **Hermes** and dependencies on the Pi per Hermes upstream docs (Ubuntu Server is typical).
2. Use a **single workspace root**, e.g. **`/home/ubuntu/ai-office-agent-workspace`**, with:
   - `AGENTS.md`, `playbooks/`, `input/`, `output/`, `reports/`, and optionally `.venv/` for Python tools.
3. Run Hermes with that directory as its working context so it can read agent definitions and playbooks from disk.

This repo does **not** pin Hermes install steps (they change upstream); use official Hermes documentation for installation and service layout.

## Copy `AGENTS.md` and playbooks to the Pi

From your dev machine (after cloning this repo), sync the **template** into the live workspace, for example:

```bash
# On the Pi, ensure the workspace exists
sudo mkdir -p /home/ubuntu/ai-office-agent-workspace/{input,output,reports,playbooks,examples}
sudo chown -R ubuntu:ubuntu /home/ubuntu/ai-office-agent-workspace

# From the repo clone (replace with your path):
rsync -av --delete agent-workspace/AGENTS.md \
  ubuntu@<pi-host>:/home/ubuntu/ai-office-agent-workspace/
rsync -av agent-workspace/playbooks/ \
  ubuntu@<pi-host>:/home/ubuntu/ai-office-agent-workspace/playbooks/
```

Or use **`scripts/setup-pi.sh`** on the Pi after cloning (from the repo root: `chmod +x scripts/*.sh && ./scripts/setup-pi.sh`).

**Do not** commit live secrets, customer files, Excel uploads, or enormous artifacts. The GitHub repo stays **source-only**.

## Dashboard (later / optional)

The **dashboard** is a separate dev surface: FastAPI backend + Vite/React UI under **`dashboard/`**. It expects the **same workspace root** on the machine where it runs (`WORKSPACE_ROOT`, default `/home/ubuntu/ai-office-agent-workspace`).

Quick start (on the Pi or your laptop pointed at a copy of the workspace):

```bash
cd dashboard/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd dashboard/frontend && npm install && npm run dev -- --host 0.0.0.0 --port 5173
# In another terminal, from dashboard/backend:
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

See **`dashboard/README.md`** for CORS, production notes, and tests.

## Safety rules (non-negotiable)

1. **No secrets in Git** — API keys, tokens, and `~/.hermes/.env` stay out of the repository. Use `.env.example` only for **placeholder names**, never real values.
2. **No destructive ad-hoc commands** — prefer playbooks and confined tooling; avoid `rm -rf`, blind `sudo`, and unreviewed pipes.
3. **No global `pip install`** for project Python — use a **venv** under the workspace (e.g. `.venv`) and `pip install -r requirements.txt` inside it.
4. **No business payloads in the repo** — no customer spreadsheets, private PDFs, or production dumps; keep those on the Pi or regulated storage.

## Documentation

- **`docs/architecture.md`** — layout and how pieces fit
- **`docs/roadmap.md`** — near-term plans
- **`docs/prompts.md`** — conventions for prompts / agent text
- **`docs/dashboard-deploy.md`** — optional dashboard systemd / nginx notes

## License

Add a `LICENSE` when you decide distribution terms.
