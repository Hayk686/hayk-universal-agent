import { lazy, Suspense, type ComponentType } from "react";
import { BarChart3, Clock, MessageSquare, Users, TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActivityPoint } from "./chart-types";

const RequestActivityChart = lazy(() => import("./RequestActivityChart"));

function ChartSkeleton() {
  return (
    <div className="hermes-chart-area flex w-full flex-col justify-end gap-1">
      <Skeleton className="min-h-0 flex-1 w-full rounded-md" />
      <div className="flex justify-between gap-2 px-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-8 rounded" />
        ))}
      </div>
    </div>
  );
}

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
    <div className="hermes-metric-card rounded-lg border border-border/50 bg-card/50 p-2 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-foreground">{value}</p>
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background/40 text-primary">
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="text-[9px] text-muted-foreground">{sublabel}</span>
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
    <aside className="hermes-panel hermes-panel-left flex min-h-0 flex-col gap-2 overflow-hidden">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        System Overview
      </h2>

      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard
          label="Total Messages"
          value={formatCount(metrics.totalMessages)}
          sublabel="last 24h vs prior 24h"
          delta={metrics.messagesDelta}
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

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/50 bg-card/40 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Request Activity
          </h3>
          <span className="text-[9px] text-muted-foreground">24h</span>
        </div>
        <Suspense fallback={<ChartSkeleton />}>
          <RequestActivityChart data={chartData} />
        </Suspense>
      </div>
    </aside>
  );
}
