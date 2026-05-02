import { useState } from "react";
import { postJson } from "../lib/api";

type RunResp = { exitCode: number; output: string };

const buttons: { label: string; variant: string }[] = [
  { label: "hermes status", variant: "status" },
  { label: "hermes doctor", variant: "doctor" },
  { label: 'hermes -z "Say exactly: OK"', variant: "ping" },
];

export function HermesPage() {
  const [out, setOut] = useState<Record<string, RunResp | string>>({});

  async function run(variant: string) {
    setOut((o) => ({ ...o, [variant]: "Running…" }));
    try {
      const res = await postJson("/api/hermes/run", { variant });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as RunResp;
      setOut((o) => ({ ...o, [variant]: j }));
    } catch (e) {
      setOut((o) => ({
        ...o,
        [variant]: { exitCode: -1, output: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Hermes</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Fixed commands only — no free-form shell input on this page.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
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
      <div className="space-y-6">
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
    </div>
  );
}
