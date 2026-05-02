# Lovable UI integration

## Source of truth

| What | Where |
|------|--------|
| Agent instructions & playbooks (template) | `agent-workspace/` in **`hayk-universal-agent`** |
| Dashboard backend (API + safety) | `dashboard/backend/` |
| Canonical frontend shell & API types | `dashboard/frontend/` in this repo |

**Do not** treat a Lovable-only repository as the system of record. Lovable may host a **prototype** UI repo for speed; when designs stabilize, **copy or reimplement** the UI into `dashboard/frontend` here and keep contracts aligned with **`docs/api-contract.md`**.

## Suggested merge workflow

1. Freeze API usage in Lovable against **`docs/api-contract.md`** (or live `/openapi.json`).
2. Port React routes to match **`dashboard/frontend/src/shell/nav.ts`** (`path` + `label` + stable `id`).
3. Align fetch calls with **`src/lib/api-client.ts`**: `GET /api/files?folder=`, `GET /api/logs/hermes`, `GET /api/logs/errors`, Hermes actions only via **`POST /api/commands/run`** with whitelist strings.
4. Replace or enhance **`PageShell`** children per page; keep `data-page-shell` / `data-app` hooks for E2E if useful.
5. Map Lovable styles to **`src/styles/tokens.css`** CSS variables where possible so Tailwind classes can be refactored incrementally.
6. Run `dashboard/backend` tests and manual smoke against a real `WORKSPACE_ROOT`.

## Contract changes

Any API or JSON shape change must update:

1. FastAPI handlers in `dashboard/backend/app/api.py`
2. **`docs/api-contract.md`**
3. **`dashboard/frontend/src/types/api-contract.ts`**
4. **`dashboard/frontend/src/lib/api-client.ts`**

## Dependency rule

`hayk-universal-agent` must never **require** a Lovable repo to build or deploy. Lovable is optional design input only.
