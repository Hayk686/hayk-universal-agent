import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PanelShellProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  loading?: boolean;
  error?: string | null;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PanelShell({
  title,
  description,
  icon: Icon,
  loading,
  error,
  action,
  children,
  className,
}: PanelShellProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-border/50 bg-card/40 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/5 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </header>

      <div className="hayk-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
