# Playbook: plan-first

## When to use

Before any multi-step or risky task (filesystem changes, many commands, refactors).

## Steps

1. Restate the goal in one sentence.
2. List assumptions (paths, permissions, tools available).
3. Outline numbered steps; note which steps are reversible.
4. Execute steps in order; after each major step, verify state (e.g. file exists, command exit code).
5. If blocked, stop and report what succeeded and what failed—do not silently continue.

## Done when

The goal is met or you have a clear, minimal report explaining why not.
