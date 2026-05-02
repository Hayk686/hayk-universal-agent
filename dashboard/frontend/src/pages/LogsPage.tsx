import { useEffect, useState } from "react";
import { PageShell } from "../shell/PageShell";
import { apiClient } from "../lib/api-client";
import type { LogKind } from "../types/api-contract";

export function LogsPage() {
  const [since, setSince] = useState<string | null>(null);
  const [errors, setErrors] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<LogKind | null>(null);

  async function load(kind: LogKind) {
    setLoading(kind);
    setErr(null);
    try {
      const text = await apiClient.getLogs(kind);
      if (kind === "since1h") setSince(text);
      else setErrors(text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    void load("since1h");
    void load("errors");
  }, []);

  return (
    <PageShell
      title="Logs"
      description="GET /api/logs/since1h and /api/logs/errors (last 300 lines). See docs/api-contract.md."
    >
      <div className="flex flex-wrap gap-2 max-w-6xl">
        <button
          type="button"
          className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          disabled={loading === "since1h"}
          onClick={() => void load("since1h")}
        >
          Refresh: last hour
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          disabled={loading === "errors"}
          onClick={() => void load("errors")}
        >
          Refresh: errors
        </button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm max-w-6xl">
        <h2 className="text-sm font-medium text-slate-500 mb-2">
          hermes logs --since 1h
        </h2>
        <pre className="log-box text-xs font-mono bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[28rem] overflow-auto">
          {since ?? "Loading…"}
        </pre>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm max-w-6xl">
        <h2 className="text-sm font-medium text-slate-500 mb-2">hermes logs errors</h2>
        <pre className="log-box text-xs font-mono bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[28rem] overflow-auto">
          {errors ?? "Loading…"}
        </pre>
      </section>
    </PageShell>
  );
}
