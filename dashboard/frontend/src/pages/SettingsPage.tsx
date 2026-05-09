import { useEffect, useState } from "react";
import {
  Bot,
  Database,
  Globe,
  Monitor,
  Shield,
  Terminal,
} from "lucide-react";

import { PageShell } from "@/shell/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, fetchStatus, type StatusOrigin } from "@/lib/api";
import type { CommandRunResponse, StatusResponse } from "@/types/api-contract";

function SettingRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border/60 bg-background/45 px-3 py-2.5 transition hover:bg-accent/20 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="break-words text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <p className="max-w-full whitespace-normal break-all font-mono text-xs leading-relaxed text-muted-foreground sm:max-w-[55%] sm:break-words sm:truncate">
        {value}
      </p>
    </div>
  );
}

export function SettingsPage() {
  const [statusOrigin, setStatusOrigin] = useState<StatusOrigin | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusLoadNote, setStatusLoadNote] = useState<string | null>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [cmdOut, setCmdOut] = useState<Record<number, CommandRunResponse>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        setCommands([]);
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
      description="Configure your local AI workspace and keep advanced controls tucked away."
    >
      <div className="grid max-w-none gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-background/25 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Assistant profile</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SettingRow
                label="Agent name"
                value={status?.agentName ?? "Hayk Agent"}
                hint="Shown across Chat and Status."
              />
              <SettingRow
                label="Default workflow"
                value="Chat first"
                hint="Use Chat for daily work; Status for tools and diagnostics."
              />
              <SettingRow
                label="Available modes"
                value="Fast / Web / Session"
                hint="Fast is one-shot, Web searches online, Session keeps context."
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-background/25 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Local workspace</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-5">
              {statusOrigin === "mock-offline" && statusLoadNote && (
                <p className="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                  Live status unavailable. {statusLoadNote}
                </p>
              )}
              <SettingRow
                label="Workspace path"
                value={status?.workspacePath ?? "Unable to load"}
                hint="Files, playbooks, reports, and AGENTS.md live here."
              />
              <SettingRow
                label="Python environment"
                value={status?.venv.pythonPath ?? "Unable to load"}
                hint={
                  status?.venv.existsAndExecutable
                    ? "Workspace Python is executable."
                    : "Python environment needs attention."
                }
              />
              <SettingRow
                label="Chat timeout"
                value={`${status?.chatTimeoutSeconds ?? 300}s`}
                hint="Server-side limit for Hermes subprocesses."
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-background/25 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Sessions & web</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SettingRow
                label="Recent chats"
                value="Managed in Chat"
                hint="Load or delete Hermes sessions from the Chat page."
              />
              <SettingRow
                label="Web access"
                value="Web mode"
                hint="Use Web mode for current online information through Hermes web tools."
              />
              <SettingRow
                label="Local history"
                value="Browser + Hermes"
                hint="Dashboard history is local; Hermes sessions are stored on the Pi."
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-background/25 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Appearance</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-sm leading-relaxed text-muted-foreground sm:p-5">
              <p>
                Use the top-right toggle to switch light and dark mode. The palette is shared through design tokens.
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-background/25 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Local safety</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SettingRow label="Command access" value="Whitelisted" />
              <SettingRow label="Path access" value="Workspace sandbox" />
              <SettingRow label="Secrets" value="Hidden from UI" />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-background/25 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Advanced</CardTitle>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced ? "Hide" : "Show"}
                </Button>
              </div>
            </CardHeader>
            {showAdvanced && (
              <CardContent className="space-y-4 p-5">
                <p className="text-xs text-muted-foreground">
                  These commands must match the backend whitelist exactly.
                </p>
                <ul className="space-y-3">
                  {commands.map((c, i) => (
                    <li key={c} className="space-y-2 rounded-2xl border border-border/60 bg-background/35 p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <code className="break-all text-xs text-muted-foreground">{c}</code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 rounded-full"
                          onClick={() => void run(i, c)}
                        >
                          Run
                        </Button>
                      </div>
                      {cmdOut[i] && (
                        <pre className="log-box max-h-48 overflow-auto rounded-2xl border border-border/60 bg-background/70 p-3 font-mono text-xs">
                          exit {cmdOut[i].exitCode}
                          {"\n"}
                          {cmdOut[i].output}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
