import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  HeartPulse,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchStatus, type StatusOrigin } from "@/lib/api";
import { formatBytes, formatLocalTime } from "@/lib/format";
import type { StatusResponse } from "@/types/api-contract";

type StatusCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  value?: string;
  tone?: "healthy" | "warning";
  to: string;
};

function healthScore(data: StatusResponse): number {
  const checks = [
    data.agentsMdExists,
    data.playbooksDirExists,
    data.venv.existsAndExecutable,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function StatusHero({
  data,
  origin,
}: {
  data: StatusResponse;
  origin: StatusOrigin;
}) {
  const score = healthScore(data);
  const ready = score === 100 && origin === "live";

  return (
    <section className="rounded-[1.35rem] border border-border/60 bg-card/70 px-5 py-5 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:px-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-xl",
              ready
                ? "border-success/35 bg-success/10 text-success"
                : "border-warning/35 bg-warning/10 text-warning",
            )}
          >
            <Check className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {ready ? "Hayk Agent is ready" : "Hayk Agent needs attention"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {ready
                ? "All systems are healthy and your workspace is up to date."
                : "The dashboard is reachable, but one or more local workspace checks need review."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm sm:min-w-[28rem]">
          <HeroMetric label="Uptime" value="4h 12m" />
          <HeroMetric label="Last activity" value={formatLocalTime(data.serverTime)} />
          <HeroMetric
            label="Health score"
            value={`${score}%`}
            tone={score === 100 ? "success" : "warning"}
          />
        </div>
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold text-foreground",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusTile({ icon: Icon, title, description, value, tone = "healthy", to }: StatusCard) {
  return (
    <Card className="rounded-[1rem] border-border/60 bg-card/60 shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:border-primary/30 hover:bg-accent/10">
      <Link to={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <CardContent className="flex min-h-[7.5rem] items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/45 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          {value && (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                tone === "healthy" ? "text-success" : "text-warning",
              )}
            >
              {value}
            </p>
          )}
        </div>
      </CardContent>
      </Link>
    </Card>
  );
}

export function DashboardPage() {
  const [bundle, setBundle] = useState<{
    data: StatusResponse;
    origin: StatusOrigin;
    liveError?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const status = await fetchStatus();
      if (active) setBundle(status);
    }

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const cards = useMemo<StatusCard[]>(() => {
    if (!bundle) return [];
    const data = bundle.data;
    const totalFiles =
      data.fileCounts.input + data.fileCounts.output + data.fileCounts.reports;
    const diskPct =
      data.diskUsage.totalBytes > 0
        ? Math.round((data.diskUsage.usedBytes / data.diskUsage.totalBytes) * 100)
        : 0;

    return [
      {
        icon: HeartPulse,
        title: "Health overview",
        description: "Agent, services and environment",
        to: "/hermes",
        value:
          data.agentsMdExists && data.playbooksDirExists && data.venv.existsAndExecutable
            ? "Healthy"
            : "Check required",
        tone:
          data.agentsMdExists && data.playbooksDirExists && data.venv.existsAndExecutable
            ? "healthy"
            : "warning",
      },
      {
        icon: FileText,
        title: "Files",
        description: `${totalFiles} managed files`,
        to: "/files",
        value: `${formatBytes(data.diskUsage.workspaceBytes)} workspace`,
      },
      {
        icon: BookOpen,
        title: "Playbooks",
        description: data.playbooksDirExists ? "Playbooks available" : "Directory missing",
        to: "/playbooks",
        value: data.playbooksDirExists ? "Ready" : "Needs setup",
        tone: data.playbooksDirExists ? "healthy" : "warning",
      },
      {
        icon: ScrollText,
        title: "Logs",
        description: "Hermes and dashboard diagnostics",
        to: "/logs",
        value: bundle.origin === "live" ? "API reachable" : "Offline preview",
        tone: bundle.origin === "live" ? "healthy" : "warning",
      },
      {
        icon: ShieldCheck,
        title: "Agent rules",
        description: "Command whitelist and local safety",
        to: "/agents",
        value: data.agentsMdExists ? "Protected" : "AGENTS.md missing",
        tone: data.agentsMdExists ? "healthy" : "warning",
      },
      {
        icon: FolderOpen,
        title: "Workspace",
        description: data.workspacePath,
        to: "/files",
        value: `${diskPct}% disk used`,
        tone: diskPct >= 85 ? "warning" : "healthy",
      },
      {
        icon: Stethoscope,
        title: "Diagnostics",
        description: "Runtime checks and local dependencies",
        to: "/hermes",
        value: data.venv.existsAndExecutable ? "All checks passed" : "Python venv check",
        tone: data.venv.existsAndExecutable ? "healthy" : "warning",
      },
    ];
  }, [bundle]);

  if (!bundle) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading status...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5" data-page-shell>
      <div className="flex items-center justify-between gap-4 px-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Status</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>{bundle.origin === "live" ? "Live backend" : "Preview data"}</span>
        </div>
      </div>

      <StatusHero data={bundle.data} origin={bundle.origin} />

      {bundle.origin === "mock-offline" && bundle.liveError && (
        <div className="rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-warning">
          Live backend unavailable. {bundle.liveError}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.slice(0, 4).map((card) => (
          <StatusTile key={card.title} {...card} />
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.slice(4).map((card) => (
          <StatusTile key={card.title} {...card} />
        ))}
      </section>

      <section className="rounded-[1rem] border border-border/60 bg-card/55 px-4 py-3 text-xs text-muted-foreground shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-foreground">Workspace</span>
          <span className="break-all font-mono">{bundle.data.workspacePath}</span>
        </div>
      </section>
    </div>
  );
}

/** @deprecated use StatusResponse from types/api-contract */
export type StatusPayload = StatusResponse;
