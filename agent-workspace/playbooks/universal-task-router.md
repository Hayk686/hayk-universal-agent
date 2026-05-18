# Playbook: universal task router

## When to use

Use this before broad, ambiguous, multi-step, or tool-heavy work. The goal is to
turn a user request into the right operating mode and a safe next action.

## Triage

Classify the request into one primary mode:

| Mode | Use for | First move |
|------|---------|------------|
| Chat | Explanation, advice, quick answer | Answer directly |
| Planner | Ambiguous goal, many steps, risk | Restate goal and make a short plan |
| File | Inputs, outputs, reports, transformations | Inspect file names and sizes |
| Research | External facts, comparison, summary | Identify sources and write a report |
| Diagnostics | Agent broken, logs, health, services | Run self-diagnostics checks |
| Executor | Safe local command or script | Confirm scope, run, verify |
| Memory | Preferences, recurring context | Ask where to store durable notes |
| Browser Work | Visible web page, form, category, survey/task prompt | Read visible context and propose the next answer/action |

## Routing rules

1. If the task touches files, stay inside the workspace unless explicitly told
   otherwise.
2. If the task may delete, overwrite, expose secrets, spend money, or affect
   services, pause and confirm the exact action.
3. If the task needs Python, prefer `.venv/bin/python` from the workspace.
4. If the task produces artifacts, put machine outputs in `output/` and a short
   human-readable summary in `reports/`.
5. If the task is too large, do the smallest useful slice first and report what
   remains.
6. In Vercel cloud mode, use only the cloud tools exposed by the dashboard:
   chat, AGENTS.md, playbooks, file listing, logs, and whitelisted diagnostics.
7. For Clickworker-style categorization, answer only from visible page text. If
   the object to classify is missing, say exactly what information is missing.

## Response shape

For non-trivial tasks, respond with:

1. What mode you chose.
2. What you checked or changed.
3. The result.
4. The next useful action.

Keep the response concise, but include enough evidence that the user can trust
the result.
