import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Globe, Layers, ListTodo, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HermesLogo } from "@/components/hermes/HermesLogo";
import { MemoryArtifactsPanel } from "@/components/workspace/MemoryArtifactsPanel";
import { TasksPanel } from "@/components/workspace/TasksPanel";
import { ResearchPanel } from "@/components/workspace/ResearchPanel";
import { BrowserLogPanel } from "@/components/workspace/BrowserLogPanel";
import { WorkflowsPanel } from "@/components/workspace/WorkflowsPanel";
import { WorkspaceBackendGate } from "@/components/workspace/WorkspaceBackendGate";
import { useKernelBackend } from "@/hooks/useKernelBackend";

const TABS = [
  { id: "memory", label: "Memory", icon: Brain },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "research", label: "Research", icon: Search },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "workflows", label: "Workflows", icon: Layers },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function WorkspacePage() {
  const [tab, setTab] = useState<TabId>("memory");
  const kernel = useKernelBackend();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-workspace-page>
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-card/40 px-3 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <HermesLogo className="h-7 w-7" />
          <div className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-foreground">
              Workspace
            </span>
            <span className="hidden text-[9px] uppercase tracking-[0.18em] text-muted-foreground md:block">
              Server-backed panels
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-md px-2 text-xs" asChild>
          <Link to="/">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
        <nav
          className="mb-2 flex shrink-0 gap-1 overflow-x-auto rounded-xl border border-border/40 bg-card/30 p-1"
          aria-label="Workspace panels"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === id
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
              onClick={() => setTab(id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-hidden">
          {kernel.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Checking backend…
            </div>
          ) : !kernel.available ? (
            <WorkspaceBackendGate
              mode={kernel.mode}
              capabilitiesError={kernel.error}
              onRetry={() => void kernel.reload()}
              loading={kernel.loading}
            />
          ) : (
            <>
              {tab === "memory" ? <MemoryArtifactsPanel /> : null}
              {tab === "tasks" ? <TasksPanel /> : null}
              {tab === "research" ? <ResearchPanel /> : null}
              {tab === "browser" ? <BrowserLogPanel /> : null}
              {tab === "workflows" ? <WorkflowsPanel /> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
