import { useEffect, useState } from "react";
import { Brain, GitBranch, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const LS_COMPONENTS = "hermes-active-components-v1";

type ComponentKey = "memoryIndex" | "contextRouter" | "toolExecutor";

type ComponentDef = {
  key: ComponentKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOn: boolean;
};

const COMPONENTS: ComponentDef[] = [
  {
    key: "memoryIndex",
    label: "Memory Index",
    description: "Indexes conversation memory for long-context recall",
    icon: Brain,
    defaultOn: true,
  },
  {
    key: "contextRouter",
    label: "Context Router",
    description: "Routes prompts to the best context window strategy",
    icon: GitBranch,
    defaultOn: false,
  },
  {
    key: "toolExecutor",
    label: "Tool Executor",
    description: "Runs whitelisted local tools during agent turns",
    icon: Wrench,
    defaultOn: false,
  },
];

function readStored(): Record<ComponentKey, boolean> {
  try {
    const raw = localStorage.getItem(LS_COMPONENTS);
    if (!raw) {
      return {
        memoryIndex: true,
        contextRouter: false,
        toolExecutor: false,
      };
    }
    const p = JSON.parse(raw) as Partial<Record<ComponentKey, boolean>>;
    return {
      memoryIndex: p.memoryIndex ?? true,
      contextRouter: p.contextRouter ?? false,
      toolExecutor: p.toolExecutor ?? false,
    };
  } catch {
    return {
      memoryIndex: true,
      contextRouter: false,
      toolExecutor: false,
    };
  }
}

export function ActiveComponentsPanel() {
  const [state, setState] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COMPONENTS, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  function toggle(key: ComponentKey) {
    setState((s) => ({ ...s, [key]: !s[key] }));
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Active Components
      </h3>
      <ul className="space-y-2">
        {COMPONENTS.map(({ key, label, description, icon: Icon }) => {
          const on = state[key];
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/25 px-3 py-2.5"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                  on ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-[10px] leading-snug text-muted-foreground">{description}</p>
              </div>
              <Switch checked={on} onCheckedChange={() => toggle(key)} aria-label={label} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function getActiveComponents(): Record<ComponentKey, boolean> {
  return readStored();
}
