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
    <div className="shrink-0 rounded-lg border border-border/50 bg-card/40 p-2">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Active Components
      </h3>
      <ul className="space-y-1">
        {COMPONENTS.map(({ key, label, description, icon: Icon }) => {
          const on = state[key];
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
                onCheckedChange={() => toggle(key)}
                aria-label={label}
                className="scale-90"
              />
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
