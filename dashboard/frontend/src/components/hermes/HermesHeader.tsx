import { Link } from "react-router-dom";
import { Activity, LayoutGrid, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HermesLogo } from "./HermesLogo";

type SystemStatus = "active" | "degraded" | "offline";
type BackendStatus = "online" | "offline";
type CliStatus = "idle" | "busy" | "offline";

export type HermesHeaderProps = {
  systemStatus?: SystemStatus;
  backendStatus?: BackendStatus;
  cliStatus?: CliStatus;
  onNewSession?: () => void;
  newSessionDisabled?: boolean;
};

function StatusBadge({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
  pulse?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/40 text-success"
      : tone === "warning"
        ? "border-warning/40 text-warning"
        : "border-border/60 text-muted-foreground";

  const dotClass =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
        toneClass,
      )}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotClass)} />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotClass)} />
        </span>
      )}
      {!pulse && <span className={cn("h-2 w-2 rounded-full", dotClass)} />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function HermesHeader({
  systemStatus = "active",
  backendStatus = "online",
  cliStatus = "idle",
  onNewSession,
  newSessionDisabled,
}: HermesHeaderProps) {
  return (
    <header
      className="hermes-header flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-card/40 px-3 backdrop-blur-xl sm:px-4"
      data-hermes-header
    >
      <div className="flex min-w-0 items-center gap-2">
        <HermesLogo className="h-7 w-7" />
        <div className="min-w-0">
          <span className="block text-sm font-semibold tracking-tight text-foreground">
            Hermes
          </span>
          <span className="hidden text-[9px] uppercase tracking-[0.18em] text-muted-foreground md:block">
            Command Center
          </span>
        </div>
      </div>

      <div className="hidden items-center gap-1.5 lg:flex">
        <StatusBadge
          label="System"
          value={systemStatus === "active" ? "Active" : systemStatus === "degraded" ? "Degraded" : "Offline"}
          tone={systemStatus === "active" ? "success" : systemStatus === "degraded" ? "warning" : "muted"}
          pulse={systemStatus === "active"}
        />
        <StatusBadge
          label="Backend"
          value={backendStatus === "online" ? "Online" : "Offline"}
          tone={backendStatus === "online" ? "success" : "muted"}
        />
        <StatusBadge
          label="Hermes CLI"
          value={cliStatus === "idle" ? "Idle" : cliStatus === "busy" ? "Busy" : "Offline"}
          tone={cliStatus === "idle" ? "warning" : cliStatus === "busy" ? "success" : "muted"}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1.5 lg:hidden">
          <Activity
            className={cn(
              "h-4 w-4",
              systemStatus === "active" ? "text-success" : "text-muted-foreground",
            )}
          />
        </div>
        <Link
          to="/workspace"
          className="hidden h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:inline-flex"
          title="Workspace panels"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Workspace
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-md border-primary/40 px-2 text-xs text-primary hover:bg-primary/10"
          onClick={onNewSession}
          disabled={newSessionDisabled}
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">New Session</span>
        </Button>
        <Link
          to="/settings"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          aria-label="Settings & profile"
          title="Settings"
        >
          <User className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
