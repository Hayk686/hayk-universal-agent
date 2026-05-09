import { useState } from "react";
import { Cpu } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { SectionHeader } from "@/components/section-header";
import { TerminalOutput } from "@/components/terminal-output";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { CommandRunResponse } from "@/types/api-contract";
import { WHITELIST_SHELL_COMMANDS } from "@/types/api-contract";

const buttons: { label: string; command: string }[] = [
  { label: "hermes status", command: WHITELIST_SHELL_COMMANDS.hermesStatus },
  { label: "hermes doctor", command: WHITELIST_SHELL_COMMANDS.hermesDoctor },
  { label: 'hermes -z "Say exactly: OK"', command: WHITELIST_SHELL_COMMANDS.hermesPing },
];

export function HermesPage() {
  const [out, setOut] = useState<Record<string, CommandRunResponse | string>>({});

  async function run(command: string) {
    setOut((o) => ({ ...o, [command]: "Running…" }));
    try {
      const j = await api.runWhitelistedCommand(command);
      setOut((o) => ({ ...o, [command]: j }));
    } catch (e) {
      setOut((o) => ({
        ...o,
        [command]: {
          exitCode: -1,
          output: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  return (
    <PageShell
      title="Hermes"
      description="POST /api/commands/run — commands must match the server whitelist exactly. No arbitrary shell."
    >
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <SectionHeader
            icon={Cpu}
            title="Whitelist runner"
            description="Each action maps to an exact server-approved string"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {buttons.map((b) => (
            <Button
              key={b.command}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void run(b.command)}
            >
              Run: {b.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-6">
          {buttons.map((b) => {
            const r = out[b.command];
            const loading = typeof r === "string";
            const body =
              r && typeof r !== "string"
                ? r.output
                : loading
                  ? ""
                  : "";
            const status =
              !r || loading ? "idle" : r.exitCode === 0 ? "success" : "error";

            return (
              <Card key={b.command}>
                <CardHeader className="py-3 border-b border-border">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{b.label}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-2">
                  {r && typeof r !== "string" && (
                    <p className="text-xs text-muted-foreground">
                      Exit code: <span className="font-mono">{r.exitCode}</span>
                    </p>
                  )}
                  <TerminalOutput
                    title={b.label.replace(/\s+/g, "-")}
                    content={body}
                    status={status}
                    loading={loading}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
