const LS_API_BASE = "hayk-api-base-override-v1";
const LS_PC_PROXY = "hayk-use-pc-proxy-v1";

function normalizeBase(raw: string): string {
  let base = raw.trim().replace(/\/$/, "");
  if (base.endsWith("/api")) {
    base = base.slice(0, -4).replace(/\/$/, "");
  }
  return base;
}

export function getApiBaseOverride(): string {
  try {
    const raw = localStorage.getItem(LS_API_BASE);
    return raw ? normalizeBase(raw) : "";
  } catch {
    return "";
  }
}

export function setApiBaseOverride(url: string): void {
  const normalized = normalizeBase(url);
  if (!normalized) {
    localStorage.removeItem(LS_API_BASE);
    return;
  }
  localStorage.setItem(LS_API_BASE, normalized);
}

export function clearApiBaseOverride(): void {
  try {
    localStorage.removeItem(LS_API_BASE);
  } catch {
    /* ignore */
  }
}

export function usePcProxy(): boolean {
  try {
    return localStorage.getItem(LS_PC_PROXY) === "1";
  } catch {
    return false;
  }
}

export function setPcProxy(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(LS_PC_PROXY, "1");
    else localStorage.removeItem(LS_PC_PROXY);
  } catch {
    /* ignore */
  }
}

export function buildEnvApiBase(): string {
  return normalizeBase(
    String(import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_BASE ?? ""),
  );
}

/** Resolved API origin: browser override → Vite env → "" (same-origin). */
export function resolveApiBase(): string {
  const override = getApiBaseOverride();
  if (override) return override;
  return buildEnvApiBase();
}

/** Rewrite /api/... to /api/pc/... for Vercel → PC proxy (BACKEND_URL). */
export function toFetchPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!usePcProxy() || !p.startsWith("/api/")) return p;
  return `/api/pc${p.slice(4)}`;
}
