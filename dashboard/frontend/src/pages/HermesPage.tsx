import { useState } from "react";
import { PageShell } from "../shell/PageShell";
import { apiClient } from "../lib/api-client";
import type { CommandRunResponse, HermesRunVariant } from "../types/api-contract";

const buttons: { label: string; variant: HermesRunVariant }[] = [
  { label: "hermes status", variant: "status" },
  { label: "hermes doctor", variant: "doctor" },
  { label: 'hermes -z "Say exactly: OK"', variant: "ping" },
];

export function HermesPage() {
  const [out, setOut] = useState<Record<string, CommandRunResponse | string>>({});

  async function run(variant: HermesRunVariant) {
    setOut((o) => ({ ...o, [variant]: "Running…" }));
    try {
      const j = await apiClient.runHermes({ variant });
      setOut((o) => ({ ...o, [variant]: j }));
    } catch (e) {
      setOut((o) => ({
        ...o,
        [variant]: {
          exitCode: -1,
          output: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  return (
    <PageShell
      title="Hermes"
      description="Fixed variants only (POST /api/hermes/run). No arbitrary shell — see docs/api-contract.md."
    >
      <div className="flex flex-wrap gap-2 max-w-5xl">
        {buttons.map((b) => (
          <button
            key={b.variant}
            type="button"
            onClick={() => void run(b.variant)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Run: {b.label}
          </button>
        ))}
      </div>
      <div className="space-y-6 max-w-5xl">
        {buttons.map((b) => {
          const r = out[b.variant];
          return (
            <div
              key={b.variant}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
            >
              <div className="text-xs font-medium text-slate-500 mb-2">{b.label}</div>
              {!r && <div className="text-sm text-slate-400">No output yet</div>}
              {typeof r === "string" && <div className="text-sm">{r}</div>}
              {r && typeof r !== "string" && (
                <>
                  <div className="text-xs mb-2">
                    Exit code: <span className="font-mono">{r.exitCode}</span>
                  </div>
                  <pre className="log-box text-xs font-mono bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-96 overflow-auto">
                    {r.output}
                  </pre>
                </>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
