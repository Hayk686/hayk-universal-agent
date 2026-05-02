const base = import.meta.env.VITE_API_BASE ?? "";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${base}${path}`;
  return fetch(url, init);
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

export async function postJson(path: string, data: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function del(path: string): Promise<Response> {
  return apiFetch(path, { method: "DELETE" });
}

export function downloadUrl(relPath: string): string {
  const q = `?path=${encodeURIComponent(relPath)}`;
  return `${base}/api/files/download${q}`;
}
