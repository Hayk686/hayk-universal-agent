import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-secondary/20 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
