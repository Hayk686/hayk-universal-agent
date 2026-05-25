import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatLoadingIndicator({
  headline,
  elapsedSec,
  chatTimeoutSec,
  progressLines,
  activeStep,
}: {
  headline: string;
  elapsedSec: number;
  chatTimeoutSec: number;
  progressLines: readonly string[];
  activeStep: number;
}) {
  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-6">
      <div className="flex items-start gap-3 rounded-2xl border border-[var(--chat-composer-border)] bg-[var(--chat-composer-bg)] px-4 py-3.5">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--chat-assistant-avatar-fg)]" />
        <div className="min-w-0 space-y-2">
          <p className="text-[14px] font-medium text-[var(--chat-text)]">{headline}</p>
          <p className="font-mono text-[11px] text-[var(--chat-meta-fg)]">
            Elapsed {elapsedSec}s
            {elapsedSec >= chatTimeoutSec ? " — past server limit, finishing up…" : ""}
          </p>
          <ul className="space-y-1.5">
            {progressLines.map((line, i) => (
              <li
                key={line}
                className={cn(
                  "flex items-start gap-2 text-[12px] leading-snug transition-colors",
                  i === activeStep
                    ? "font-medium text-[var(--chat-text)]"
                    : i < activeStep
                      ? "text-[var(--chat-meta-fg)]"
                      : "text-[var(--chat-meta-fg)]/60",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    i === activeStep
                      ? "bg-[var(--chat-assistant-avatar-fg)]"
                      : i < activeStep
                        ? "bg-[var(--chat-meta-fg)]"
                        : "bg-[var(--chat-meta-fg)]/35",
                  )}
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
