import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/status-dot";
import type { StatusOrigin } from "@/lib/api";
import { useMocks } from "@/lib/api";

type SourceModeBadgeProps = {
  /** When set (e.g. from `fetchStatus`), reflects live vs configured mock vs API fallback. */
  statusOrigin?: StatusOrigin | null;
};

/**
 * Shows whether the UI reads from the FastAPI backend (Live), configured mocks (Mock),
 * or mock data because the API was unreachable (Offline preview).
 */
export function SourceModeBadge({ statusOrigin }: SourceModeBadgeProps = {}) {
  const envMock = useMocks();

  if (statusOrigin === "mock-offline") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-warning/40 bg-warning/10 font-mono text-[10px] uppercase tracking-wide text-foreground"
        data-source-mode="offline-preview"
        title="Live API unreachable — dashboard uses offline preview data"
      >
        <StatusDot tone="warning" pulse={false} />
        Offline preview
      </Badge>
    );
  }

  const isMock = envMock || statusOrigin === "mock-env";

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-border bg-card font-mono text-[10px] uppercase tracking-wide"
      data-source-mode={isMock ? "mock" : "live"}
    >
      <StatusDot tone={isMock ? "muted" : "success"} pulse={!isMock} />
      {isMock ? "Mock" : "Live"}
    </Badge>
  );
}
