import type { LucideIcon } from "lucide-react";
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function SafetyBadge({
  icon: Icon,
  label,
  enabled,
}: {
  icon: LucideIcon;
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors",
        enabled ? "border-success/30 bg-success/5" : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border",
          enabled
            ? "border-success/40 bg-success/15 text-success"
            : "border-destructive/40 bg-destructive/15 text-destructive",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[11px] uppercase tracking-wider",
            enabled ? "text-success" : "text-destructive",
          )}
        >
          {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {enabled ? "Enabled" : "Disabled"}
        </div>
      </div>
    </div>
  );
}
