import { Link } from "react-router-dom";
import { Activity, Plus, User } from "lucide-react";
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
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider",
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
      className="hermes-header flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/50 bg-card/40 px-4 backdrop-blur-xl sm:h-16 sm:px-5"
      data-hermes-header
    >
      <div className="flex min-w-0 items-center gap-3">
        <HermesLogo />
        <div className="min-w-0">
          <span className="block text-base font-semibold tracking-tight text-foreground sm:text-lg">
            Hermes
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
            Command Center
          </span>
        </div>
      </div>

      <div className="hidden items-center gap-2 lg:flex">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg border-primary/40 text-primary hover:bg-primary/10"
          onClick={onNewSession}
          disabled={newSessionDisabled}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Session</span>
        </Button>
        <Link
          to="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          aria-label="Settings & profile"
          title="Settings"
        >
          <User className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
