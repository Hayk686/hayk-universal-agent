/**
 * Low-level HTTP helpers — API origin resolution:
 * 1) VITE_API_BASE_URL
 * 2) VITE_API_BASE
 * 3) "" (same origin; Vite dev server proxies /api and /health to localhost:8080)
 *
 * The origin must be the FastAPI root (no trailing /api). A trailing /api in env is stripped
 * so requests stay as /api/status, not /api/api/status.
 */

export function apiBase(): string {
  let base = String(
    import.meta.env.VITE_API_BASE_URL ??
      import.meta.env.VITE_API_BASE ??
      "",
  ).replace(/\/$/, "");
  // Paths in this app already include `/api/...` and `/health`. If env mistakenly uses
  // `http://host:8080/api`, calls would become `/api/api/status` (404).
  if (base.endsWith("/api")) {
    base = base.slice(0, -4).replace(/\/$/, "");
  }
  return base;
}

/** When true, the app uses mock payloads instead of calling the FastAPI server. */
export function useMocks(): boolean {
  const v = import.meta.env.VITE_USE_MOCKS;
  return v === "true" || v === "1";
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${apiBase()}${p}`, init);
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
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

export async function del(path: string): Promise<Response> {
  return apiFetch(path, { method: "DELETE" });
}

export function downloadUrl(relPath: string): string {
  const q = `?path=${encodeURIComponent(relPath)}`;
  return `${apiBase()}/api/files/download${q}`;
}
