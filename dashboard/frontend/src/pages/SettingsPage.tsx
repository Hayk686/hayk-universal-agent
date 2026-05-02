import { useEffect, useState } from "react";
import { getJson, postJson } from "../lib/api";
import type { StatusPayload } from "./DashboardPage";

export function SettingsPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [cmdOut, setCmdOut] = useState<Record<number, { exitCode: number; output: string }>>(
    {},
  );

  useEffect(() => {
    (async () => {
      try {
        const s = await getJson<StatusPayload>("/api/status");
        setStatus(s);
      } catch {
        /* ignore */
      }
      try {
        const w = await getJson<{ commands: string[] }>("/api/commands/whitelist");
        setCommands(w.commands);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function run(idx: number, command: string) {
    try {
      const res = await postJson("/api/commands/run", { command });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { exitCode: number; output: string };
      setCmdOut((o) => ({ ...o, [idx]: j }));
    } catch (e) {
      setCmdOut((o) => ({
        ...o,
        [idx]: { exitCode: -1, output: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Local dashboard options and the safe command runner (whitelist only).
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-medium text-slate-500">Workspace</h2>
        {status ? (
          <p className="text-sm break-all font-mono text-xs">{status.workspacePath}</p>
        ) : (
          <p className="text-sm text-slate-500">Unable to load status.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-medium text-slate-500">Future authentication</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The backend includes an optional hook: set{" "}
          <code className="text-xs">DASHBOARD_API_KEY</code> and plan to send header{" "}
          <code className="text-xs">X-Dashboard-Key</code> from the browser. Not enforced in
          MVP.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-medium text-slate-500">Safe command runner</h2>
        <p className="text-xs text-slate-500">
          Each command must match the server whitelist exactly. Output is trimmed to the last 300
          lines.
        </p>
        <ul className="space-y-4">
          {commands.map((c, i) => (
            <li key={c} className="border border-slate-100 dark:border-slate-800 rounded-lg p-3">
              <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
                <code className="text-xs break-all">{c}</code>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs"
                  onClick={() => void run(i, c)}
                >
                  Run
                </button>
              </div>
              {cmdOut[i] && (
                <pre className="log-box mt-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 p-2 rounded max-h-48 overflow-auto">
                  exit {cmdOut[i].exitCode}
                  {"\n"}
                  {cmdOut[i].output}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
