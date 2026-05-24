import type { ComponentType } from "react";
import { BarChart3, Clock, MessageSquare, Users, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { RequestActivityChart, type ActivityPoint } from "./RequestActivityChart";

export type SystemMetrics = {
  totalMessages: number;
  activeSessions: number;
  errorRate: number;
  avgResponseSec: number;
  messagesDelta?: number;
  sessionsDelta?: number;
  errorRateDelta?: number;
  responseDelta?: number;
};

type MetricCardProps = {
  label: string;
  value: string;
  sublabel: string;
  delta?: number;
  deltaSuffix?: string;
  icon: ComponentType<{ className?: string }>;
};

function MetricCard({ label, value, sublabel, delta, deltaSuffix = "", icon: Icon }: MetricCardProps) {
  const hasDelta = delta !== undefined && delta !== 0;
  const positive = (delta ?? 0) > 0;

  return (
    <div className="hermes-metric-card rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/40 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{sublabel}</span>
        {hasDelta && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[10px] font-medium",
              label === "Error Rate" ? (positive ? "text-destructive" : "text-success") : positive ? "text-success" : "text-muted-foreground",
            )}
          >
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta!).toFixed(label === "Error Rate" ? 1 : 0)}
            {deltaSuffix}
          </span>
        )}
      </div>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function SystemOverviewPanel({
  metrics,
  chartData,
}: {
  metrics: SystemMetrics;
  chartData: ActivityPoint[];
}) {
  return (
    <aside className="hermes-panel hermes-panel-left flex min-h-0 flex-col gap-3 overflow-hidden">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          System Overview
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Total Messages"
          value={formatCount(metrics.totalMessages)}
          sublabel="last 24h"
          delta={metrics.messagesDelta}
          deltaSuffix="%"
          icon={MessageSquare}
        />
        <MetricCard
          label="Active Sessions"
          value={String(metrics.activeSessions)}
          sublabel="currently open"
          delta={metrics.sessionsDelta}
          icon={Users}
        />
        <MetricCard
          label="Error Rate"
          value={`${metrics.errorRate.toFixed(1)}%`}
          sublabel="last 24h"
          delta={metrics.errorRateDelta}
          deltaSuffix="pp"
          icon={BarChart3}
        />
        <MetricCard
          label="Avg Response"
          value={`${metrics.avgResponseSec.toFixed(1)}s`}
          sublabel="rolling average"
          delta={metrics.responseDelta}
          deltaSuffix="s"
          icon={Clock}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/50 bg-card/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Request Activity
          </h3>
          <span className="text-[10px] text-muted-foreground">Last 24h</span>
        </div>
        <RequestActivityChart data={chartData} />
      </div>
    </aside>
  );
}
