import { Bot, User } from "lucide-react";
import { formatTurnModeBadge } from "@/lib/chat-thread";
import { cn } from "@/lib/utils";
import { LinkifiedText } from "./LinkifiedText";

export type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  mode?: string;
  exitCode?: number;
  durationMs?: number;
  compact?: boolean;
};

export function ChatMessage({ role, text, mode, exitCode, durationMs, compact }: ChatMessageProps) {
  const isUser = role === "user";
  const modeBadge = formatTurnModeBadge(mode);

  return (
    <article
      className={cn(
        "chat-message group w-full",
        isUser ? "chat-message-user" : "chat-message-assistant",
      )}
    >
      <div className="mx-auto flex w-full max-w-[48rem] gap-3 px-4 sm:gap-4 sm:px-6">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            isUser
              ? "bg-[var(--chat-user-avatar-bg)] text-[var(--chat-user-avatar-fg)]"
              : "bg-[var(--chat-assistant-avatar-bg)] text-[var(--chat-assistant-avatar-fg)]",
            compact && "h-6 w-6",
          )}
          aria-hidden
        >
          {isUser ? (
            <User className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
          ) : (
            <Bot className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
          )}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--chat-label)]">
              {isUser ? "You" : "Hayk"}
            </span>
            {modeBadge && (
              <span className="rounded-md bg-[var(--chat-meta-bg)] px-1.5 py-0.5 text-[10px] text-[var(--chat-meta-fg)]">
                {modeBadge}
              </span>
            )}
          </div>

          <div
            className={cn(
              "chat-message-body text-[15px] leading-[1.7] tracking-[-0.01em] text-[var(--chat-text)]",
              isUser && "rounded-2xl bg-[var(--chat-user-bg)] px-4 py-3",
            )}
          >
            <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.7]">
              <LinkifiedText text={text} />
            </pre>
          </div>

          {!isUser && exitCode !== undefined && durationMs !== undefined && (
            <p className="mt-2 font-mono text-[11px] text-[var(--chat-meta-fg)]">
              exit {exitCode} · {(durationMs / 1000).toFixed(1)}s
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
