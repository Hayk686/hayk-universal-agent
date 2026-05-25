import { useEffect, useState } from "react";
import { Brain, GitBranch, Shield, Wrench, Layers, Eye, Search, Globe, ListTodo, Archive } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
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

export function ActiveComponentsPanel() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [artifactCount, setArtifactCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [caps, tasks, artifacts] = await Promise.all([
          api.getCapabilities(),
          api.listTasks().catch(() => ({ tasks: [] })),
          api.listArtifacts().catch(() => ({ artifacts: [] })),
        ]);
        if (!cancelled) {
          setCapabilities(caps);
          setTaskCount(tasks.tasks.length);
          setArtifactCount(artifacts.artifacts.length);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="shrink-0 rounded-lg border border-border/50 bg-card/40 p-2">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Server Capabilities
      </h3>
      {(taskCount !== null || artifactCount !== null) && (
        <p className="mb-1.5 text-[10px] text-muted-foreground">
          {taskCount !== null ? `${taskCount} task${taskCount === 1 ? "" : "s"}` : null}
          {taskCount !== null && artifactCount !== null ? " · " : null}
          {artifactCount !== null
            ? `${artifactCount} artifact${artifactCount === 1 ? "" : "s"}`
            : null}
        </p>
      )}
      {error ? (
        <p className="mb-1 text-[10px] text-destructive" title={error}>
          Could not load capabilities
        </p>
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
