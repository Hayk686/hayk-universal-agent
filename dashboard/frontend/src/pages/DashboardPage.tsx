import { useEffect, useState } from "react";
import { getJson } from "../lib/api";
import { formatBytes, formatLocalTime } from "../lib/format";

function Badge({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 px-2 py-0.5 text-xs font-medium"
          : "inline-flex items-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 px-2 py-0.5 text-xs font-medium"
      }
    >
      {label}
    </span>
  );
}

export type StatusPayload = {
  agentName: string;
  workspacePath: string;
  serverTime: string;
  agentsMdExists: boolean;
  playbooksDirExists: boolean;
  fileCounts: { input: number; output: number; reports: number };
  diskUsage: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    workspaceBytes: number;
  };
  venv: { pythonPath: string; existsAndExecutable: boolean };
};

export function DashboardPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const s = await getJson<StatusPayload>("/api/status");
        if (on) {
          setData(s);
          setErr(null);
        }
      } catch (e) {
        if (on) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    const t = setInterval(async () => {
      try {
        const s = await getJson<StatusPayload>("/api/status");
        if (on) {
          setData(s);
          setErr(null);
        }
      } catch (e) {
        if (on) setErr(e instanceof Error ? e.message : String(e));
      }
    }, 30_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  if (err && !data)
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-red-800 dark:text-red-200">
        {err}
      </div>
    );

  if (!data) return <div className="text-slate-500">Loading…</div>;

  const usedPct =
    data.diskUsage.totalBytes > 0
      ? Math.round((data.diskUsage.usedBytes / data.diskUsage.totalBytes) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{data.agentName}</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Workspace:{" "}
          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
            {data.workspacePath}
          </code>
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Server time (UTC): {formatLocalTime(data.serverTime)}
        </p>
      </div>

      {err && (
        <div className="text-sm text-amber-700 dark:text-amber-300">
          Refresh warning: {err}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Workspace checks
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span>AGENTS.md</span>
              <Badge ok={data.agentsMdExists} label={data.agentsMdExists ? "Present" : "Missing"} />
            </li>
            <li className="flex justify-between gap-2">
              <span>playbooks/</span>
              <Badge ok={data.playbooksDirExists} label={data.playbooksDirExists ? "Present" : "Missing"} />
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            File counts
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between">
              <span>input/</span>
              <span className="font-mono">{data.fileCounts.input}</span>
            </li>
            <li className="flex justify-between">
              <span>output/</span>
              <span className="font-mono">{data.fileCounts.output}</span>
            </li>
            <li className="flex justify-between">
              <span>reports/</span>
              <span className="font-mono">{data.fileCounts.reports}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm md:col-span-2 xl:col-span-1">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Disk usage (volume)
          </h2>
          <p className="mt-3 text-sm">
            Used {formatBytes(data.diskUsage.usedBytes)} /{" "}
            {formatBytes(data.diskUsage.totalBytes)}{" "}
            <span className="text-slate-500">({usedPct}%)</span>
          </p>
          <p className="text-sm mt-1 text-slate-600 dark:text-slate-300">
            Free: {formatBytes(data.diskUsage.freeBytes)}
          </p>
          <p className="text-xs mt-3 text-slate-500">
            Workspace folder size (estimate):{" "}
            {formatBytes(data.diskUsage.workspaceBytes)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm md:col-span-2 xl:col-span-3">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Python venv
          </h2>
          <p className="mt-2 text-sm break-all font-mono text-xs">{data.venv.pythonPath}</p>
          <div className="mt-2">
            <Badge
              ok={data.venv.existsAndExecutable}
              label={data.venv.existsAndExecutable ? "Executable" : "Not ready"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
