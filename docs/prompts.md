# Prompts and agent text

This file defines **conventions** for writing prompts and instructions for Hayk Universal Agent (Hermes).

## Principles

1. **Plan first** — For multi-step tasks, say what you will do, then execute (see playbook `plan-first.md`).
2. **Explicit constraints** — State allowed paths (workspace only), allowed tools, and forbidden actions (mass delete, `sudo` without cause).
3. **No secret material** — Never paste API keys, tokens, or private URLs into playbooks committed to Git. Reference environment variables or secret managers abstractly.
4. **Recoverable changes** — Prefer copy-then-edit, backups for critical files, and append-only logs where possible.

## Where prompts live

- **`agent-workspace/AGENTS.md`** — Root agent charter, capabilities, and global rules.
- **`agent-workspace/playbooks/*.md`** reusable task patterns (terminal, Python, files, diagnostics).

## Suggested structure for a new playbook

1. **Title and when to use**
2. ** Preconditions** (venv active, paths exist)
3. ** Steps** (numbered, deterministic)
4. **Failure handling** (what to log, when to stop)

Edit prompts via pull request like any other code.
