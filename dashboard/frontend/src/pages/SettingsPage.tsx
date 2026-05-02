import { useEffect, useState } from "react";
import { Server, Shield, Terminal } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, fetchStatus, type StatusOrigin } from "@/lib/api";
import type { CommandRunResponse, StatusResponse } from "@/types/api-contract";

export function SettingsPage() {
  const [statusOrigin, setStatusOrigin] = useState<StatusOrigin | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusLoadNote, setStatusLoadNote] = useState<string | null>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [cmdOut, setCmdOut] = useState<Record<number, CommandRunResponse>>({});

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchStatus();
        setStatus(r.data);
        setStatusOrigin(r.origin);
        setStatusLoadNote(r.liveError ?? null);
      } catch {
        setStatus(null);
        setStatusOrigin(null);
      }
      try {
        const w = await api.getCommandWhitelist();
        setCommands(w.commands);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function run(idx: number, command: string) {
    try {
      const j = await api.runWhitelistedCommand(command);
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
      description="GET /api/status · GET /api/commands/whitelist · POST /api/commands/run for exact whitelist matches only."
    >
      <div className="space-y-6 max-w-5xl">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusOrigin === "mock-offline" && statusLoadNote && (
              <p className="text-xs text-warning border border-warning/30 rounded-md p-2 bg-warning/5">
                Live <code className="text-[10px]">GET /api/status</code> failed — showing offline
                preview. {statusLoadNote}
              </p>
            )}
            {status ? (
              <p className="break-all font-mono text-xs text-muted-foreground">
                {status.workspacePath}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load status.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Authentication</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Optional <code className="text-xs rounded bg-muted px-1 py-0.5">DASHBOARD_API_KEY</code>{" "}
              and header{" "}
              <code className="text-xs rounded bg-muted px-1 py-0.5">X-Dashboard-Key</code> — not
              enforced in MVP. Do not expose API keys in the UI or in client bundles.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Safe command runner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Each command must match the server whitelist exactly. Output trimmed to last 300 lines.
            </p>
            <ul className="space-y-3">
              {commands.map((c, i) => (
                <li
                  key={c}
                  className="border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <code className="text-xs break-all text-muted-foreground">{c}</code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void run(i, c)}
                    >
                      Run
                    </Button>
                  </div>
                  {cmdOut[i] && (
                    <pre className="log-box text-xs font-mono bg-muted/50 p-2 rounded-md max-h-48 overflow-auto border border-border">
                      exit {cmdOut[i].exitCode}
                      {"\n"}
                      {cmdOut[i].output}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
