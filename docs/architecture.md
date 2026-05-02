# Architecture

## Overview

Hayk Universal Agent is organized around a **single filesystem workspace** on the Raspberry Pi. **Hermes** is the execution/agent layer; the workspace holds durable instructions and artifacts.

```
┌─────────────────────────────────────────────────────────┐
│  Raspberry Pi (Ubuntu Server)                           │
│  ┌─────────────┐    reads/writes    ┌─────────────────┐ │
│  │   Hermes    │ ◄────────────────► │  workspace/    │ │
│  └─────────────┘                    │  AGENTS.md     │ │
│                                      │  playbooks/   │ │
│  Optional: ┌─────────────┐          │  input/       │ │
│            │  dashboard  │ ────────►│  output/      │ │
│            │  (FastAPI + │  same    │  reports/     │ │
│            │   React)    │  root    │  .venv/       │ │
│            └─────────────┘          └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Repository vs live workspace

| Location | Role |
|----------|------|
| **`agent-workspace/`** in Git | Versioned **template** for `AGENTS.md`, playbooks, examples |
| **`/home/ubuntu/ai-office-agent-workspace`** on Pi | **Live** workspace Hermes and the dashboard use |

Deploy by copying or rsync from the repo template to the live path (see root `README.md` and `scripts/setup-pi.sh`).

## Dashboard (optional)

- **Backend:** Python FastAPI, restricted file access under `WORKSPACE_ROOT`, whitelisted shell commands only.
- **Frontend:** React + Vite + TypeScript, talks to API via `/api` (dev proxy or reverse proxy in production).

The dashboard does **not** replace Hermes; it assists with files, logs, and editing `AGENTS.md` / playbooks when running on the same host or trusted network.

## Trust boundaries

- Treat the live workspace as **sensitive** if it contains operational data.
- The **Git repo** must remain free of secrets and customer payloads.
