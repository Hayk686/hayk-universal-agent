import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Cpu,
  FileEdit,
  FolderOpen,
  HardDrive,
  History,
  KeyRound,
  Layers,
  Lock,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Terminal as TerminalIcon,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { ActivityTimeline } from "@/components/activity-timeline";
import { EmptyState } from "@/components/empty-state";
import { FileTypeIcon } from "@/components/file-type-icon";
import { HealthCheckCard, type HealthState } from "@/components/health-check-card";
import { QuickActionButton } from "@/components/quick-action-button";
import { SafetyBadge } from "@/components/safety-badge";
import { SectionHeader } from "@/components/section-header";
import { SourceModeBadge } from "@/components/source-mode-badge";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { WarningCard, type WarningSeverity } from "@/components/warning-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, fetchStatus, useMocks, type StatusOrigin } from "@/lib/api";
import { formatBytes, formatLocalTime, formatRelative } from "@/lib/format";
import type { StatusResponse } from "@/types/api-contract";

function inferSeverity(text: string): WarningSeverity {
  const t = text.toLowerCase();
  if (t.includes("critical") || t.includes("error") || t.includes("fail")) return "critical";
  if (t.includes("warn") || t.includes("%") || t.includes("slow")) return "warning";
  return "info";
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string | undefined;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-secondary/20 p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
      <div className="flex items-center gap-2">
        <Icon
          className={
            tone === "warning"
              ? "h-3.5 w-3.5 text-warning"
              : "h-3.5 w-3.5 text-muted-foreground"
          }
        />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value ?? "—"}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DashboardHero({
  data,
  statusOrigin,
  label,
  tone,
  pulse,
}: {
  data: StatusResponse;
  statusOrigin: StatusOrigin;
  label: string;
  tone: StatusTone;
  pulse: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-border/60 p-5 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-7"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.09]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/25 to-primary/5 text-primary shadow-[var(--shadow-glow-primary)]">
            <Bot className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-3xl">
                Hayk Agent
              </h1>
              <StatusBadge tone={tone} pulse={pulse}>
                {label}
              </StatusBadge>
              <SourceModeBadge statusOrigin={statusOrigin} />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Local AI runtime, workspace, files, and guardrails in one clean view.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 sm:gap-x-6">
              <HeroMeta label="Agent" value={data.agentName} mono />
              <HeroMeta label="Time" value={formatLocalTime(data.serverTime)} />
              <HeroMeta
                label="Disk used"
                value={
                  data.diskUsage.totalBytes > 0
                    ? `${Math.round((data.diskUsage.usedBytes / data.diskUsage.totalBytes) * 100)}%`
                    : "—"
                }
              />
              <HeroMeta label="Updated" value={formatRelative(data.serverTime)} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <HardDrive className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{data.workspacePath}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={mono ? "truncate font-mono text-xs" : "truncate text-xs"}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const [bundle, setBundle] = useState<{
    data: StatusResponse;
    origin: StatusOrigin;
    liveError?: string;
  } | null>(null);

  const [recentFiles, setRecentFiles] = useState<{ name: string; ext: string; ts: string }[]>([]);

  useEffect(() => {
    let on = true;
    async function tick() {
      const r = await fetchStatus();
      if (on) setBundle(r);
    }
    void tick();
    const t = setInterval(() => void tick(), 30_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [i, o, r] = await Promise.all([
          api.listFilesInFolder("input"),
          api.listFilesInFolder("output"),
          api.listFilesInFolder("reports"),
        ]);
        if (!on) return;
        const merged = [...i, ...o, ...r]
          .filter((f) => !f.isDir)
          .map((f) => ({ name: f.name, ext: f.extension, ts: f.modified }))
          .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
          .slice(0, 5);
        setRecentFiles(merged);
      } catch {
        if (on) setRecentFiles([]);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  if (!bundle) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading control center…
      </div>
    );
  }

  const data = bundle.data;
  const statusOrigin = bundle.origin;
  const liveError = bundle.liveError;
  const mockMode = useMocks();

  const usedPct =
    data.diskUsage.totalBytes > 0
      ? Math.round((data.diskUsage.usedBytes / data.diskUsage.totalBytes) * 100)
      : 0;

  const warnings: string[] = [];
  if (!data.agentsMdExists) warnings.push("AGENTS.md is missing in the workspace.");
  if (!data.playbooksDirExists) warnings.push("playbooks/ directory is missing.");
  if (!data.venv.existsAndExecutable) warnings.push("Python venv is missing or not executable.");

  let heroLabel: string;
  let heroTone: StatusTone;
  let heroPulse: boolean;
  if (statusOrigin === "mock-env") {
    heroLabel = "PREVIEW";
    heroTone = "muted";
    heroPulse = false;
  } else if (statusOrigin === "mock-offline") {
    heroLabel = "OFFLINE";
    heroTone = "destructive";
    heroPulse = false;
  } else if (warnings.length > 0) {
    heroLabel = "ATTENTION";
    heroTone = "warning";
    heroPulse = false;
  } else {
    heroLabel = "OPERATIONAL";
    heroTone = "success";
    heroPulse = true;
  }

  const activityItems = [
    {
      id: "snap",
      icon: Activity,
      title: "Workspace status refreshed",
      detail: `${data.fileCounts.input + data.fileCounts.output + data.fileCounts.reports} files across managed folders`,
      ts: data.serverTime,
      tone: warnings.length ? ("warning" as const) : ("success" as const),
    },
  ];

  const hermesHealth: HealthState =
    statusOrigin === "live" ? "ok" : statusOrigin === "mock-env" ? "ok" : "warn";

  return (
    <div className="space-y-4 sm:space-y-5">
      <DashboardHero
        data={data}
        statusOrigin={statusOrigin}
        label={heroLabel}
        tone={heroTone}
        pulse={heroPulse}
      />

      {statusOrigin === "mock-offline" && liveError && (
        <div
          className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground shadow-[var(--shadow-soft)]"
          role="status"
        >
          <span className="font-medium">Live API unavailable.</span>{" "}
          <span className="text-muted-foreground">Offline preview data. </span>
          <span className="font-mono text-xs break-all text-muted-foreground">{liveError}</span>
        </div>
      )}
      {mockMode && (
        <div
          className="rounded-2xl border border-border/60 bg-secondary/25 px-4 py-3 text-sm text-muted-foreground shadow-[var(--shadow-soft)]"
          role="status"
        >
          <span className="font-medium text-foreground">Mock mode</span> — configured via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_USE_MOCKS=true</code>.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3 xl:col-span-2">
          <SectionHeader
            icon={Activity}
            title="Agent status"
            description="Core checks for the local agent, runtime, workspace, and tools."
          />
          <Card className="rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl [background-image:var(--gradient-card)]">
            <CardContent className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
              <HealthCheckCard
                icon={Bot}
                label="Agent identity"
                detail={data.agentName}
                state={!data.agentsMdExists ? "warn" : "ok"}
              />
              <HealthCheckCard
                icon={Cpu}
                label="Hermes runtime"
                detail={statusOrigin === "live" ? "API reachable" : "Use Hermes page for CLI"}
                state={hermesHealth}
              />
              <HealthCheckCard
                icon={Server}
                label="Python environment"
                detail={data.venv.existsAndExecutable ? data.venv.pythonPath : "not executable"}
                state={data.venv.existsAndExecutable ? "ok" : "warn"}
              />
              <HealthCheckCard
                icon={HardDrive}
                label="Workspace access"
                detail={data.workspacePath}
                state="ok"
              />
              <HealthCheckCard
                icon={BookOpen}
                label="Playbooks"
                detail={data.playbooksDirExists ? "directory present" : "missing"}
                state={data.playbooksDirExists ? "ok" : "down"}
              />
              <HealthCheckCard
                icon={ScrollText}
                label="Logs available"
                detail="hermes · errors"
                state="ok"
              />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={Zap}
            title="Tools"
            description="Open workspace tools and advanced pages."
          />
          <Card className="rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl [background-image:var(--gradient-card)]">
            <CardContent className="grid grid-cols-2 gap-2.5 p-4">
              <QuickActionButton
                icon={FolderOpen}
                label="Files"
                hint="browse I/O"
                to="/files"
              />
              <QuickActionButton icon={FileEdit} label="Agent rules" hint="behavior" to="/agents" />
              <QuickActionButton icon={BookOpen} label="Playbooks" hint="library" to="/playbooks" />
              <QuickActionButton icon={Cpu} label="Diagnostics" hint="runtime" to="/hermes" />
              <QuickActionButton icon={ScrollText} label="Logs" hint="events" to="/logs" />
              <QuickActionButton icon={Settings} label="Settings" hint="preferences" to="/settings" />
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <SectionHeader
            icon={FolderOpen}
            title="Workspace"
            description="Files, reports, and local storage."
            action={
              <Button variant="ghost" size="sm" className="text-xs" asChild>
                <Link to="/files">Open files →</Link>
              </Button>
            }
          />
          <Card className="rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl [background-image:var(--gradient-card)]">
            <CardContent className="space-y-4 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={Upload} label="input" value={data.fileCounts.input} hint="files" />
                <Stat icon={Layers} label="output" value={data.fileCounts.output} hint="files" />
                <Stat
                  icon={ScrollText}
                  label="reports"
                  value={data.fileCounts.reports}
                  hint="files"
                />
                <Stat
                  icon={HardDrive}
                  label="disk used"
                  value={`${usedPct}%`}
                  hint={`${formatBytes(data.diskUsage.workspaceBytes)} workspace`}
                  tone={usedPct >= 85 ? "warning" : undefined}
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>Recent modified</span>
                  <span className="font-mono">last 5</span>
                </div>
                {recentFiles.length === 0 ? (
                  <EmptyState
                    icon={FolderOpen}
                    title="No files yet"
                    description="Upload to input/ or add files in the workspace."
                  />
                ) : (
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
                    {recentFiles.map((f) => (
                      <li
                        key={`${f.name}-${f.ts}`}
                        className="flex items-center justify-between gap-3 bg-secondary/15 px-3 py-2.5 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileTypeIcon ext={f.ext} />
                          <span className="truncate font-mono text-xs">{f.name}</span>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(f.ts)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={ShieldCheck}
            title="Guardrails"
            description="Safety checks used by the dashboard backend."
          />
          <Card className="rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl [background-image:var(--gradient-card)]">
            <CardContent className="space-y-2.5 p-4">
              <SafetyBadge icon={TerminalIcon} label="Command whitelist" enabled />
              <SafetyBadge icon={KeyRound} label="Secrets protected" enabled />
              <SafetyBadge icon={Lock} label="Path sandbox" enabled />
              <SafetyBadge icon={ShieldCheck} label="Destructive ops limited" enabled />
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <SectionHeader
            icon={History}
            title="Activity"
            description="Recent dashboard and workspace events."
          />
          <Card className="rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl [background-image:var(--gradient-card)]">
            <CardContent className="p-4">
              <ActivityTimeline items={activityItems} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={AlertTriangle}
            title="Warnings"
            description={warnings.length > 0 ? `${warnings.length} active` : "All clear"}
          />
          <Card className="rounded-3xl border-border/60 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-xl [background-image:var(--gradient-card)]">
            <CardContent className="space-y-2.5 p-4">
              {warnings.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No warnings"
                  description="The workspace checks are within healthy thresholds."
                />
              ) : (
                warnings.map((w, i) => (
                  <WarningCard key={i} severity={inferSeverity(w)} title={w} />
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

/** @deprecated use StatusResponse from types/api-contract */
export type StatusPayload = StatusResponse;
