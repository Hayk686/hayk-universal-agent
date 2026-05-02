import { useEffect, useState } from "react";
import { PageShell } from "../shell/PageShell";
import { apiClient } from "../lib/api-client";
import type { CommandRunResponse, StatusResponse } from "../types/api-contract";

export function SettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [cmdOut, setCmdOut] = useState<Record<number, CommandRunResponse>>({});

  useEffect(() => {
    (async () => {
      try {
        setStatus(await apiClient.getStatus());
      } catch {
        /* ignore */
      }
      try {
        const w = await apiClient.getCommandWhitelist();
        setCommands(w.commands);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function run(idx: number, command: string) {
    try {
      const j = await apiClient.runWhitelistedCommand(command);
      setCmdOut((o) => ({ ...o, [idx]: j }));
    } catch (e) {
      setCmdOut((o) => ({
        ...o,
        [idx]: { exitCode: -1, output: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  return (
    <PageShell
      title="Settings"
      description="Workspace info and whitelist-only command runner (docs/api-contract.md)."
    >
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2 max-w-5xl">
        <h2 className="text-sm font-medium text-slate-500">Workspace</h2>
        {status ? (
          <p className="break-all font-mono text-xs">{status.workspacePath}</p>
        ) : (
          <p className="text-sm text-slate-500">Unable to load status.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2 max-w-5xl">
        <h2 className="text-sm font-medium text-slate-500">Future authentication</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Optional <code className="text-xs">DASHBOARD_API_KEY</code> and header{" "}
          <code className="text-xs">X-Dashboard-Key</code> — not enforced in MVP.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-4 max-w-5xl">
        <h2 className="text-sm font-medium text-slate-500">Safe command runner</h2>
        <p className="text-xs text-slate-500">
          Each command must match the server whitelist exactly. Output trimmed to last 300 lines.
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
    </PageShell>
  );
}
