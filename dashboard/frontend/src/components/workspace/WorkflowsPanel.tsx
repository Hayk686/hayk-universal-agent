import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Layers, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { WorkflowStateResponse } from "@/types/api-contract";
import { PanelShell } from "./PanelShell";

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  running: "default",
  paused: "secondary",
  completed: "secondary",
  failed: "destructive",
};

function WorkflowRow({ workflow }: { workflow: WorkflowStateResponse }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<WorkflowStateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return;
    setLoading(true);
    try {
      const data = await api.getOrchestrationWorkflow(workflow.workflowId);
      setDetail(data);
    } catch {
      setDetail(workflow);
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="rounded-lg border border-border/40 bg-background/25">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
        onClick={() => void toggle()}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {workflow.task || "Untitled workflow"}
            </p>
            <Badge variant={STATUS_TONE[workflow.status] ?? "outline"} className="text-[10px] capitalize">
              {workflow.status}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {workflow.mode}
            </Badge>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {workflow.workflowId.slice(0, 16)} · {formatRelative(workflow.updatedAt)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {workflow.taskId ? (
              <Badge variant="outline" className="text-[9px]">
                task {workflow.taskId.slice(0, 8)}
              </Badge>
            ) : null}
            {workflow.researchQueryId ? (
              <Badge variant="outline" className="text-[9px]">
                research {workflow.researchQueryId.slice(0, 8)}
              </Badge>
            ) : null}
            {workflow.browserActionId ? (
              <Badge variant="outline" className="text-[9px]">
                browser {workflow.browserActionId.slice(0, 8)}
              </Badge>
            ) : null}
          </div>
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-border/30 px-3 py-2.5">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading detail…</p>
          ) : detail ? (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">{detail.routingReason || "No routing reason."}</p>
              {detail.steps.length > 0 ? (
                <ul className="space-y-1">
                  {detail.steps.map((step) => (
                    <li
                      key={step.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2 py-1"
                    >
                      <span className="truncate text-foreground">{step.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                        {step.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No steps recorded.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function WorkflowsPanel() {
  const [workflows, setWorkflows] = useState<WorkflowStateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listOrchestrationWorkflows();
      setWorkflows(
        data.workflows.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
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
      title="Workflows"
      description="Orchestration plans and linked resource IDs"
      icon={Layers}
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
        workflows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No workflows yet.</p>
        ) : (
          <ul className="space-y-2">
            {workflows.map((wf) => (
              <WorkflowRow key={wf.workflowId} workflow={wf} />
            ))}
          </ul>
        )
      ) : null}
    </PanelShell>
  );
}
