import { ExternalLink, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WORKSPACE_SETUP_STEPS,
  workspaceUnavailableMessage,
  workspaceUnavailableTitle,
  type KernelBackendMode,
} from "@/lib/kernel-backend";

type Props = {
  mode: KernelBackendMode;
  capabilitiesError?: string | null;
  onRetry: () => void;
  loading?: boolean;
};

export function WorkspaceBackendGate({ mode, capabilitiesError, onRetry, loading }: Props) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-border/50 bg-card/40 p-6 text-center shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Server className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{workspaceUnavailableTitle(mode)}</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        {workspaceUnavailableMessage(mode)}
      </p>
      {capabilitiesError ? (
        <p className="mt-3 max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {capabilitiesError}
        </p>
      ) : null}
      <ol className="mt-5 max-w-md space-y-2 text-left text-xs text-muted-foreground">
        {WORKSPACE_SETUP_STEPS.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="shrink-0 font-medium text-foreground">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRetry} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Retry
        </Button>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" asChild>
          <a
            href="https://github.com/Hayk686/hayk-universal-agent/blob/main/dashboard/frontend/VERCEL.md"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            VERCEL.md
          </a>
        </Button>
      </div>
    </div>
  );
}
