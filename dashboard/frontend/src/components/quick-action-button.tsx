import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type CommonProps = {
  icon: LucideIcon;
  label: string;
  hint?: string;
  loading?: boolean;
  className?: string;
};

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    to?: undefined;
  };

type LinkActionProps = CommonProps & {
  to: string;
};

type Props = ButtonProps | LinkActionProps;

const SHARED =
  "group relative flex w-full flex-col items-start gap-2 overflow-hidden rounded-lg border border-border bg-secondary/30 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary/60 hover:shadow-[var(--shadow-glow-primary)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none";

function Inner({
  icon: Icon,
  label,
  hint,
  loading,
}: Pick<CommonProps, "icon" | "label" | "hint" | "loading">) {
  return (
    <>
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-primary transition-colors group-hover:border-primary/40">
        <Icon className={cn("h-4 w-4", loading && "animate-spin")} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{label}</div>
        {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </>
  );
}

export function QuickActionButton(props: Props) {
  if ("to" in props && props.to !== undefined) {
    const { icon, label, hint, loading, className, to } = props;
    return (
      <Link to={to} className={cn(SHARED, className)}>
        <Inner icon={icon} label={label} hint={hint} loading={loading} />
      </Link>
    );
  }
  const buttonProps = props as ButtonProps;
  const { icon, label, hint, loading, className, disabled, ...rest } = buttonProps;
  return (
    <button
      disabled={disabled || loading}
      className={cn(SHARED, className)}
      type="button"
      {...rest}
    >
      <Inner icon={icon} label={label} hint={hint} loading={loading} />
    </button>
  );
}
