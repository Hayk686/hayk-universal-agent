# Playbook: file workflow

## When to use

Ingesting, transforming, or publishing files in the workspace.

## Conventions

| Directory | Purpose |
|-----------|---------|
| `input/` | New or upstream inputs |
| `output/` | Generated binaries, exports, intermediates |
| `reports/` | Human-readable summaries, metrics, snippets |

## Steps

1. Confirm filename and size; reject unexpected binary types if the task is text-only.
2. **Do not** commit customer spreadsheets or confidential exports to Git—keep them on the Pi only.
3. Move or copy into `input/` for processing; write results to `output/` and narrative to `reports/`.
4. If replacing an important file, create a timestamped backup alongside it first.

## Out of scope

Bulk personal data, PCI/PHI, or regulated archives—handle per org policy outside this playbook.
