import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/25 bg-secondary/50 text-primary shadow-sm">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold leading-tight tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
