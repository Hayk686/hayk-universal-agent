import { cn } from "@/lib/utils";

export function ChatAlerts({
  httpError,
  cancelNote,
  parseWarning,
  sessionTimeoutHint,
  resumeError,
  resumeStatus,
}: {
  httpError?: string | null;
  cancelNote?: string | null;
  parseWarning?: string | null;
  sessionTimeoutHint?: string | null;
  resumeError?: string | null;
  resumeStatus?: string | null;
}) {
  const items = [
    httpError && { tone: "error" as const, text: httpError },
    resumeError && { tone: "error" as const, text: resumeError },
    cancelNote && { tone: "warning" as const, text: cancelNote },
    parseWarning && { tone: "warning" as const, text: parseWarning },
    sessionTimeoutHint && { tone: "warning" as const, text: sessionTimeoutHint },
    resumeStatus && { tone: "info" as const, text: resumeStatus },
  ].filter(Boolean) as { tone: "error" | "warning" | "info"; text: string }[];

  if (items.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[48rem] space-y-2 px-4 sm:px-6">
      {items.map((item) => (
        <div
          key={item.text}
          className={cn(
            "rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed",
            item.tone === "error" &&
              "border-[var(--chat-destructive-border)] bg-[var(--chat-destructive-bg)] text-[var(--chat-destructive-fg)]",
            item.tone === "warning" &&
              "border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] text-[var(--chat-warning-fg)]",
            item.tone === "info" &&
              "border-[var(--chat-composer-border)] bg-[var(--chat-composer-bg)] text-[var(--chat-text)]",
          )}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
