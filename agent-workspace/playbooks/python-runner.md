# Playbook: python runner

## When to use

Running Python scripts or one-liners for the office agent.

## Preconditions

- Workspace `.venv` exists and dependencies are installed **inside** that venv.
- Current working directory is the workspace or a known subdirectory.

## Steps

1. Activate or invoke: `.venv/bin/python` (from workspace root) instead of system `python` when possible.
2. Install deps only with `.venv/bin/pip install -r requirements.txt` (or project-specific file), not global pip.
3. Write outputs to `output/` or `reports/` unless the task says otherwise.
4. Log tracebacks to a file under `reports/` for later review if debugging.

## Avoid

- `pip install` without a venv
- Running untrusted scripts from the internet without review
