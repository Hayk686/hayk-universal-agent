const LS_POLICY_TOKENS = "hayk-policy-tokens-v1";

type CachedToken = { token: string; expiresAt: number };

function readAll(): Record<string, CachedToken> {
  try {
    const raw = localStorage.getItem(LS_POLICY_TOKENS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedToken>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, CachedToken>) {
  try {
    localStorage.setItem(LS_POLICY_TOKENS, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function getCachedPolicyToken(action: string): string | null {
  const key = action.trim();
  if (!key) return null;
  const entry = readAll()[key];
  if (!entry?.token) return null;
  if (Date.now() > entry.expiresAt) {
    clearCachedPolicyToken(key);
    return null;
  }
  return entry.token;
}

/** Cache ~4.5 min so it expires before typical 5 min server TTL. */
export function setCachedPolicyToken(action: string, token: string, ttlMs = 270_000) {
  const key = action.trim();
  if (!key || !token.trim()) return;
  const all = readAll();
  all[key] = { token: token.trim(), expiresAt: Date.now() + ttlMs };
  writeAll(all);
}

export function clearCachedPolicyToken(action: string) {
  const key = action.trim();
  if (!key) return;
  const all = readAll();
  delete all[key];
  writeAll(all);
}
