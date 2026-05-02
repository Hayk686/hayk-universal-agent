import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type WarningSeverity = "info" | "warning" | "critical";

const STYLES: Record<
  WarningSeverity,
  { wrap: string; icon: typeof Info; label: string }
> = {
  info: {
    wrap: "border-primary/30 bg-primary/5 text-foreground",
    icon: Info,
    label: "Info",
  },
  warning: {
    wrap: "border-warning/40 bg-warning/5 text-foreground",
    icon: AlertTriangle,
    label: "Warning",
  },
  critical: {
    wrap: "border-destructive/50 bg-destructive/5 text-foreground",
    icon: ShieldAlert,
    label: "Critical",
  },
};

export function WarningCard({
  severity = "warning",
  title,
  description,
}: {
  severity?: WarningSeverity;
  title: string;
  description?: string;
}) {
  const cfg = STYLES[severity];
  const Icon = cfg.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", cfg.wrap)}>
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          severity === "info" && "text-primary",
          severity === "warning" && "text-warning",
          severity === "critical" && "text-destructive",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <span className="rounded-sm border border-border bg-card/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {cfg.label}
          </span>
        </div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
