import { formatKernelApiError } from "../kernel-backend";
import { resolveApiBase, toFetchPath } from "../api-base";

export {
  clearApiBaseOverride,
  getApiBaseOverride,
  setApiBaseOverride,
  setPcProxy,
  usePcProxy,
} from "../api-base";

/**
 * Low-level HTTP helpers — API origin resolution:
 * 1) localStorage override (Workspace / Settings)
 * 2) VITE_API_BASE_URL
 * 3) "" (same origin; Vite proxies /api → :8080, Vercel may use /api/pc/* proxy)
 */

export function apiBase(): string {
  return resolveApiBase();
}

/** When true, the app uses mock payloads instead of calling the FastAPI server. */
export function useMocks(): boolean {
  const v = import.meta.env.VITE_USE_MOCKS;
  return v === "true" || v === "1";
}

function ngrokHeaders(): Record<string, string> {
  const base = apiBase().toLowerCase();
  if (base.includes("ngrok-free.app") || base.includes("ngrok-free.dev") || base.includes(".ngrok.io")) {
    return { "ngrok-skip-browser-warning": "1" };
  }
  return {};
}

function unreachableBackendMessage(): string {
  const base = apiBase();
  if (!base) {
    return (
      "Backend unreachable. Start FastAPI on port 8080 " +
      "(cd dashboard/backend; .venv\\Scripts\\uvicorn or .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080). " +
      "With VITE_API_BASE_URL unset, Vite dev proxies /api to localhost:8080."
    );
  }
  return (
    `Backend unreachable at ${base}. Check VITE_API_BASE_URL, ensure FastAPI is running, ` +
    "and add this UI origin to backend CORS_ORIGINS."
  );
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const extra = ngrokHeaders();
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(extra)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const fetchPath = toFetchPath(p);
  try {
    return await fetch(`${apiBase()}${fetchPath}`, { ...init, headers });
  } catch {
    throw new Error(unreachableBackendMessage());
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(formatKernelApiError(text || `HTTP ${res.status}`, path));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.trim().slice(0, 120);
    if (preview.startsWith("<")) {
      throw new Error(
        formatKernelApiError(
          "API returned HTML instead of JSON. Set VITE_API_BASE_URL to the FastAPI backend, or set VITE_USE_MOCKS=true for a frontend-only Vercel preview.",
          path,
        ),
      );
    }
    throw new Error(formatKernelApiError(`API returned invalid JSON: ${preview || "(empty response)"}`, path));
  }
}

export async function getText(path: string): Promise<string> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

export async function putText(
  path: string,
  body: string,
  contentType: string,
): Promise<Response> {
  return apiFetch(path, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
}

export async function putJson(path: string, data: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function postJson(
  path: string,
  data: unknown,
  init?: Pick<RequestInit, "signal">,
): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    ...init,
  });
}

export async function patchJson(path: string, data: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function del(path: string): Promise<Response> {
  return apiFetch(path, { method: "DELETE" });
}

export function downloadUrl(relPath: string): string {
  const q = `?path=${encodeURIComponent(relPath)}`;
  return `${apiBase()}/api/files/download${q}`;
}
