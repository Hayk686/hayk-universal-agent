# Roadmap

Short-term goals for **hayk-universal-agent** (no complex features committed in this pass):

1. **Stabilize the template** — Keep `agent-workspace/AGENTS.md` and playbooks small, clear, and safe-oriented.
2. **Pi bootstrap** — Polish `scripts/setup-pi.sh` and document Hermes install pointers (upstream docs only).
3. **Dashboard MVP** — Finish hardening path checks, optional auth hook, and production deploy notes.
4. **Backups** — Use `scripts/backup-workspace.sh` or systemd timers for tarballs of the live workspace (exclude `.venv` if large).
5. **Monitoring** — Optional: integrate Hermes logs / health into dashboard or external log tail.

Items are intentionally high-level; track detailed issues in GitHub.
