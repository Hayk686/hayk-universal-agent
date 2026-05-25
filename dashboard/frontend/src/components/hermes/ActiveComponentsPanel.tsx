import { useCallback, useEffect, useState } from "react";
import { Brain, GitBranch, Shield, Wrench, Layers, Eye, Search, Globe, ListTodo, Archive, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, apiBase, fetchCapabilities, useMocks } from "@/lib/api";
import type { CapabilitiesResponse } from "@/types/api-contract";

type CapabilityKey = keyof CapabilitiesResponse;

type ComponentDef = {
  key: CapabilityKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CAPABILITIES: ComponentDef[] = [
  {
    key: "policyGate",
    label: "Policy Gate",
    description: "Server-side action classification and confirmation",
    icon: Shield,
  },
  {
    key: "observability",
    label: "Observability",
    description: "Structured run_id events across API and Hermes",
    icon: Eye,
  },
  {
    key: "orchestrator",
    label: "Orchestrator",
    description: "Workflow planning and mode routing (fast/web/session)",
    icon: Layers,
  },
  {
    key: "contextRouter",
    label: "Context Router",
    description: "Playbook-based task triage on the server",
    icon: GitBranch,
  },
  {
    key: "memoryIndex",
    label: "Memory Index",
    description: "Active context and Hermes MEMORY.md indexing",
    icon: Brain,
  },
  {
    key: "artifactsIndex",
    label: "Artifacts Index",
    description: "Run-scoped workspace artifact catalog",
    icon: Archive,
  },
  {
    key: "toolExecutor",
    label: "Tool Executor",
    description: "Whitelisted local tools during agent turns",
    icon: Wrench,
  },
  {
    key: "researchPipeline",
    label: "Research Pipeline",
    description: "Gated web research with citations",
    icon: Search,
  },
  {
    key: "browserDriver",
    label: "Browser Driver",
    description: "Gated browser automation adapter",
    icon: Globe,
  },
  {
    key: "dailyTasks",
    label: "Daily Tasks",
    description: "Hermes todo/kanban exposure in Hayk",
    icon: ListTodo,
  },
];

function backendSourceLabel(caps: CapabilitiesResponse | null): string | null {
  if (useMocks()) return "Preview mode (mock data)";
  const base = apiBase();
  if (base) {
    try {
      return `PC backend · ${new URL(base).host}`;
    } catch {
      return "PC backend";
    }
  }
  const allOn = caps !== null && Object.values(caps).every(Boolean);
  if (allOn) return "Full FastAPI backend";
  return "Vercel cloud API (partial capabilities)";
}

export function ActiveComponentsPanel() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [artifactCount, setArtifactCount] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (cancelled: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const [capsResult, tasks, artifacts] = await Promise.all([
        fetchCapabilities(),
        api.listTasks().catch(() => ({ tasks: [] })),
        api.listArtifacts().catch(() => ({ artifacts: [] })),
      ]);
      if (cancelled()) return;
      if (capsResult.error || !capsResult.data) {
        setCapabilities(null);
        setError(capsResult.error ?? "Could not load capabilities");
      } else {
        setCapabilities(capsResult.data);
        setError(null);
      }
      setTaskCount(tasks.tasks.length);
      setArtifactCount(artifacts.artifacts.length);
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, reloadKey]);

  return (
    <div className="shrink-0 rounded-lg border border-border/50 bg-card/40 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Server Capabilities
        </h3>
        {error ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted-foreground"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
            Retry
          </Button>
        ) : null}
      </div>
      {!error && !loading ? (
        <p className="mb-1.5 text-[10px] text-muted-foreground/90">
          {backendSourceLabel(capabilities)}
        </p>
      ) : null}
      {(taskCount !== null || artifactCount !== null) && !error ? (
        <p className="mb-1.5 text-[10px] text-muted-foreground">
          {taskCount !== null ? `${taskCount} task${taskCount === 1 ? "" : "s"}` : null}
          {taskCount !== null && artifactCount !== null ? " · " : null}
          {artifactCount !== null
            ? `${artifactCount} artifact${artifactCount === 1 ? "" : "s"}`
            : null}
        </p>
      ) : null}
      {error ? (
        <p className="mb-1.5 text-[10px] leading-snug text-destructive">{error}</p>
      ) : loading && !capabilities ? (
        <p className="mb-1.5 text-[10px] text-muted-foreground">Loading capabilities…</p>
      ) : null}
      <ul className="space-y-1">
        {CAPABILITIES.map(({ key, label, description, icon: Icon }) => {
          const on = capabilities?.[key] ?? false;
          return (
            <li
              key={key}
              className="flex items-center gap-2 rounded-md border border-border/40 bg-background/25 px-2 py-1.5"
              title={description}
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                  on ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
              </div>
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{label}</p>
              <Switch
                checked={on}
                disabled
                aria-label={`${label} (server)`}
                className="scale-90 opacity-80"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
