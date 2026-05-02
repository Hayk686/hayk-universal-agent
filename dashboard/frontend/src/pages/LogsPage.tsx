import { useEffect, useState } from "react";
import { getText } from "../lib/api";

export function LogsPage() {
  const [since, setSince] = useState<string | null>(null);
  const [errors, setErrors] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function load(kind: "since1h" | "errors") {
    setLoading(kind);
    setErr(null);
    try {
      const text = await getText(`/api/logs/${kind}`);
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
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Latest output from <code className="text-xs">hermes logs</code> (last 300 lines).
          </p>
        </div>
        <div className="flex gap-2">
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
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500 mb-2">
          hermes logs --since 1h
        </h2>
        <pre className="log-box text-xs font-mono bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[28rem] overflow-auto">
          {since ?? "Loading…"}
        </pre>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500 mb-2">hermes logs errors</h2>
        <pre className="log-box text-xs font-mono bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[28rem] overflow-auto">
          {errors ?? "Loading…"}
        </pre>
      </section>
    </div>
  );
}
