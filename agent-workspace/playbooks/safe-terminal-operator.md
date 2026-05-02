# Playbook: safe terminal operator

## When to use

Any shell command beyond trivial reads.

## Rules

1. **Prefer explicit paths** under the workspace root; avoid `cd` into unknown directories.
2. **No** broad deletes: never `rm -rf` on `.`, `~`, `/`, or the whole workspace.
3. **No** `sudo` unless the task explicitly requires it and the scope is minimal.
4. **Quote** variables and paths with spaces; avoid eval and opaque pipes from untrusted input.
5. **Inspect** before overwrite: use `cp` backups or write to `output/` first.

## If unsure

Stop and ask for a narrower command or use `playbooks/plan-first.md`.
