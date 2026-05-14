import type { LucideIcon } from "lucide-react";

import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail?: string;
  ts: string;
  tone?: "default" | "success" | "warning" | "destructive";
};

const TONE_RING: Record<NonNullable<ActivityItem["tone"]>, string> = {
  default: "border-border bg-secondary/50 text-muted-foreground",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No recent activity.</p>;
  }
  return (
    <ol className="relative space-y-4 pl-6">
      <span className="absolute bottom-1 left-2.5 top-1 w-px bg-border" aria-hidden />
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <li key={it.id} className="relative">
            <span
              className={cn(
                "absolute -left-[18px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border",
                TONE_RING[it.tone ?? "default"],
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium leading-snug">{it.title}</div>
                {it.detail && (
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {it.detail}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {formatRelative(it.ts)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
