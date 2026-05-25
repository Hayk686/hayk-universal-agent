import { useCallback, useEffect, useState } from "react";
import { Globe, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { BrowserActionResultResponse } from "@/types/api-contract";
import { PanelShell } from "./PanelShell";

type BrowserLogEntry = {
  actionId: string;
  workflowId: string | null;
  workflowTask: string;
  result: BrowserActionResultResponse | null;
  loadError: string | null;
};

function extractDomain(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/([^/\s]+)/i);
  return match?.[1] ?? null;
}

export function BrowserLogPanel() {
  const [entries, setEntries] = useState<BrowserLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { workflows } = await api.listOrchestrationWorkflows();
      const withBrowser = workflows.filter((w) => w.browserActionId);
      const results = await Promise.all(
        withBrowser.map(async (wf) => {
          const actionId = wf.browserActionId!;
          try {
            const result = await api.getBrowserAction(actionId);
            return {
              actionId,
              workflowId: wf.workflowId,
              workflowTask: wf.task,
              result,
              loadError: null,
            };
          } catch (e) {
            return {
              actionId,
              workflowId: wf.workflowId,
              workflowTask: wf.task,
              result: null,
              loadError: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );
      setEntries(
        results.sort((a, b) => {
          const da = a.result?.durationMs ?? 0;
          const db = b.result?.durationMs ?? 0;
          return db - da;
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PanelShell
      title="Browser Actions"
      description="Recent browser actions linked from orchestration workflows"
      icon={Globe}
      loading={loading}
      error={error}
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      {!loading && !error ? (
        entries.length === 0 ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              No browser actions found in orchestration workflows yet.
            </p>
            <p className="text-[10px] text-muted-foreground">
              Actions appear here when workflows include a{" "}
              <code className="rounded bg-muted px-1">browserActionId</code> after gated browser
              execution.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => {
              const domain =
                extractDomain(entry.result?.snapshotText) ??
                extractDomain(entry.workflowTask);
              return (
                <li
                  key={entry.actionId}
                  className="rounded-lg border border-border/40 bg-background/25 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={entry.result?.success ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {entry.result?.success ? "success" : entry.loadError ? "error" : "failed"}
                    </Badge>
                    {domain ? (
                      <span className="text-xs font-medium text-foreground">{domain}</span>
                    ) : null}
                    {entry.result ? (
                      <span className="text-[10px] text-muted-foreground">
                        {entry.result.durationMs}ms
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {entry.workflowTask || "Untitled workflow"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                    <span>action {entry.actionId.slice(0, 12)}</span>
                    {entry.workflowId ? <span>wf {entry.workflowId.slice(0, 12)}</span> : null}
                  </div>
                  {entry.loadError ? (
                    <p className="mt-1 text-[10px] text-destructive">{entry.loadError}</p>
                  ) : entry.result?.error ? (
                    <p className="mt-1 text-[10px] text-destructive">{entry.result.error}</p>
                  ) : entry.result?.snapshotText ? (
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                      {entry.result.snapshotText.slice(0, 160)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </PanelShell>
  );
}
