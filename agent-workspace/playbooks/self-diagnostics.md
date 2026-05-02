# Playbook: self-diagnostics

## When to use

Agent or tool misbehaves; verify Hermes and workspace health.

## Safe checks (examples—adjust to your Hermes CLI)

1. `hermes status` — process / connection overview if available.
2. `hermes doctor` — vendor health checks if available.
3. Confirm workspace: `AGENTS.md` present, `playbooks/` readable, disk space adequate.
4. Tail recent logs **only** from documented Hermes log commands—no raw `/var/log` scraping unless instructed.

## Report format

- Timestamp, host name, workspace path
- Pass/fail per check
- Last error line or exit code (no secrets)

## Escalation

If checks fail twice the same way, stop automation and surface the summary to a human.
