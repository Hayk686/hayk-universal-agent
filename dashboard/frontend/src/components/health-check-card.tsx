import type { LucideIcon } from "lucide-react";

import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";

export type HealthState = "ok" | "warn" | "down" | "unknown";

const STATE_LABEL: Record<HealthState, string> = {
  ok: "Operational",
  warn: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

const STATE_TONE: Record<HealthState, "success" | "warning" | "destructive" | "muted"> = {
  ok: "success",
  warn: "warning",
  down: "destructive",
  unknown: "muted",
};

export function HealthCheckCard({
  icon: Icon,
  label,
  detail,
  state,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  state: HealthState;
}) {
  const tone = STATE_TONE[state];
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border/80 bg-secondary/20 p-3 transition-colors",
        "hover:border-border hover:bg-secondary/40",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="break-words text-sm font-medium">{label}</span>
          <StatusDot tone={tone} pulse={state === "ok"} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-wider">{STATE_LABEL[state]}</span>
          {detail && <span className="break-words font-mono">· {detail}</span>}
        </div>
      </div>
    </div>
  );
}
