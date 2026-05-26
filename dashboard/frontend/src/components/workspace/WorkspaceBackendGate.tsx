import { useState } from "react";
import { ExternalLink, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setApiBaseOverride, setPcProxy } from "@/lib/api/client";
import { buildEnvApiBase, getApiBaseOverride, isVercelHosted } from "@/lib/api-base";
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
  const [tunnelUrl, setTunnelUrl] = useState(
    () => getApiBaseOverride() || buildEnvApiBase() || "",
  );

  function connectTunnel() {
    const trimmed = tunnelUrl.trim();
    if (!trimmed) return;
    if (isVercelHosted()) {
      setApiBaseOverride("");
      setPcProxy(true);
    } else {
      setApiBaseOverride(trimmed);
      setPcProxy(false);
    }
    onRetry();
  }

  function useVercelProxy() {
    setApiBaseOverride("");
    setPcProxy(true);
    onRetry();
  }

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

      <div className="mt-5 w-full max-w-md rounded-xl border border-border/50 bg-background/30 p-3 text-left">
        <p className="mb-2 text-xs font-medium text-foreground">Подключить FastAPI сейчас</p>
        <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
          Вставьте HTTPS URL туннеля (ngrok и т.п.) без <code className="text-foreground">/api</code> в конце.
          Сохраняется в браузере — redeploy Vercel не нужен.
        </p>
        <input
          type="url"
          className="mb-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="https://xxxx.ngrok-free.dev"
          value={tunnelUrl}
          onChange={(e) => setTunnelUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") connectTunnel();
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={connectTunnel} disabled={!tunnelUrl.trim() || loading}>
            Connect
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={useVercelProxy} disabled={loading}>
            Use Vercel proxy
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          «Vercel proxy» — если в Vercel задан <code className="text-foreground">BACKEND_URL</code> (без
          пересборки при смене ngrok).
        </p>
      </div>

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
