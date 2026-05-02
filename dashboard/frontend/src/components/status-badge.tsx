import type { ReactNode } from "react";

import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "destructive" | "info" | "muted";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
  muted: "border-border bg-secondary/40 text-muted-foreground",
};

export function StatusBadge({
  tone = "muted",
  pulse = false,
  children,
  className,
}: {
  tone?: StatusTone;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const dotTone = tone === "info" ? "success" : tone === "muted" ? "muted" : tone;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <StatusDot tone={dotTone} pulse={pulse} />
      {children}
    </span>
  );
}
