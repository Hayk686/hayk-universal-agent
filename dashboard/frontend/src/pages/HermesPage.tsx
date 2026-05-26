import { useEffect, useMemo, useState } from "react";
import { Cpu, FileText, FolderTree, Play, RefreshCw, Server, Terminal } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { SectionHeader } from "@/components/section-header";
import { TerminalOutput } from "@/components/terminal-output";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import {
  categorizeWhitelistCommand,
  type CommandRunResponse,
  type WhitelistCommandCategory,
} from "@/types/api-contract";

type CommandResult = CommandRunResponse | { exitCode: number; output: string };

const CATEGORY_LABEL: Record<WhitelistCommandCategory, string> = {
  hermes: "Hermes runtime",
  logs: "Hermes logs",
  filesystem: "Workspace filesystem",
  python: "Workspace venv",
  shell: "Shell",
};

const CATEGORY_ICON: Record<WhitelistCommandCategory, React.ComponentType<{ className?: string }>> = {
  hermes: Server,
  logs: FileText,
  filesystem: FolderTree,
  python: Terminal,
  shell: Terminal,
};

const CATEGORY_ORDER: WhitelistCommandCategory[] = [
  "hermes",
  "logs",
  "filesystem",
  "python",
  "shell",
];

function shortLabel(command: string): string {
  if (command.length <= 64) return command;
  return command.slice(0, 60) + "…";
}

export function HermesPage() {
  const [whitelist, setWhitelist] = useState<string[] | null>(null);
  const [whitelistError, setWhitelistError] = useState<string | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(true);
  const [results, setResults] = useState<Record<string, CommandResult | "running">>({});

  async function loadWhitelist() {
    setWhitelistLoading(true);
    setWhitelistError(null);
    try {
      const r = await api.getCommandWhitelist();
      setWhitelist(r.commands);
    } catch (e) {
      setWhitelistError(e instanceof Error ? e.message : String(e));
    } finally {
      setWhitelistLoading(false);
    }
  }

  useEffect(() => {
    void loadWhitelist();
  }, []);

  const grouped = useMemo(() => {
    const buckets: Record<WhitelistCommandCategory, string[]> = {
      hermes: [],
      logs: [],
      filesystem: [],
      python: [],
      shell: [],
    };
    for (const c of whitelist ?? []) {
      buckets[categorizeWhitelistCommand(c)].push(c);
    }
    return buckets;
  }, [whitelist]);

  async function run(command: string) {
    setResults((o) => ({ ...o, [command]: "running" }));
    try {
      const result = await api.runWhitelistedCommand(command);
      setResults((o) => ({ ...o, [command]: result }));
    } catch (e) {
      setResults((o) => ({
        ...o,
        [command]: {
          exitCode: -1,
          output: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  async function runAllInGroup(category: WhitelistCommandCategory) {
    for (const command of grouped[category]) {
      await run(command);
    }
  }

  return (
    <PageShell
      title="Hermes"
      description="POST /api/commands/run — commands must match the server whitelist exactly. No arbitrary shell. The whitelist is pulled live from the backend so workspace-relative paths render correctly on any host."
    >
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <SectionHeader
            icon={Cpu}
            title="Whitelist runner"
            description={
              whitelist
                ? `${whitelist.length} command${whitelist.length === 1 ? "" : "s"} approved by /api/commands/whitelist`
                : "Loading whitelist…"
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void loadWhitelist()}
            disabled={whitelistLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${whitelistLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {whitelistError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {whitelistError}
          </p>
        ) : null}

        {whitelistLoading && !whitelist ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-64 rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : null}

        {CATEGORY_ORDER.map((category) => {
          const commands = grouped[category];
          if (commands.length === 0) return null;
          const Icon = CATEGORY_ICON[category];
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-card/50 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABEL[category]}
                  </h3>
                  <span className="text-[10px] text-muted-foreground/70">
                    {commands.length} command{commands.length === 1 ? "" : "s"}
                  </span>
                </div>
                {commands.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-[11px]"
                    onClick={() => void runAllInGroup(category)}
                  >
                    <Play className="h-3 w-3" />
                    Run all in group
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3">
                {commands.map((command) => {
                  const r = results[command];
                  const running = r === "running";
                  const body = typeof r === "object" ? r.output : "";
                  const status =
                    !r || running ? "idle" : (r as CommandRunResponse).exitCode === 0 ? "success" : "error";

                  return (
                    <Card key={command}>
                      <CardHeader className="py-3 border-b border-border">
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle
                            className="truncate font-mono text-xs text-muted-foreground"
                            title={command}
                          >
                            {shortLabel(command)}
                          </CardTitle>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void run(command)}
                            disabled={running}
                          >
                            {running ? "Running…" : "Run"}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-2">
                        {typeof r === "object" ? (
                          <p className="text-xs text-muted-foreground">
                            Exit code: <span className="font-mono">{(r as CommandRunResponse).exitCode}</span>
                          </p>
                        ) : null}
                        <TerminalOutput
                          title={command.replace(/\s+/g, "-")}
                          content={body}
                          status={status}
                          loading={running}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
