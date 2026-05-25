import { ArrowUp, Loader2, Search, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMode } from "@/lib/chat-types";
import { modeLabel } from "@/lib/chat-thread";

export type ChatComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  loading?: boolean;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  disabled?: boolean;
};

const MODE_OPTIONS: { value: ChatMode; label: string; icon: typeof Zap }[] = [
  { value: "fast", label: "Fast", icon: Zap },
  { value: "web", label: "Web", icon: Search },
  { value: "session", label: "Session", icon: Zap },
];

export function ChatComposer({
  input,
  onInputChange,
  onSend,
  onCancel,
  loading,
  chatMode,
  onChatModeChange,
  disabled,
}: ChatComposerProps) {
  const canSend = input.trim().length > 0 && !loading && !disabled;

  return (
    <div className="chat-composer shrink-0 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
      <div className="mx-auto w-full max-w-[48rem]">
        <div className="chat-composer-box overflow-hidden rounded-[1.35rem] border border-[var(--chat-composer-border)] bg-[var(--chat-composer-bg)] shadow-[var(--chat-composer-shadow)]">
          <textarea
            className="chat-composer-input min-h-[3.25rem] max-h-[12rem] w-full resize-none border-0 bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-[var(--chat-text)] placeholder:text-[var(--chat-placeholder)] focus-visible:outline-none"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Message Hayk…"
            spellCheck
            disabled={loading || disabled}
            maxLength={8000}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
          />

          <div className="flex items-center justify-between gap-2 border-t border-[var(--chat-composer-border)]/60 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={loading || disabled}
                  aria-pressed={chatMode === value}
                  onClick={() => onChatModeChange(value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition",
                    chatMode === value
                      ? "bg-[var(--chat-mode-active-bg)] text-[var(--chat-mode-active-fg)]"
                      : "text-[var(--chat-meta-fg)] hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
              <span className="ml-1 hidden text-[11px] text-[var(--chat-meta-fg)] sm:inline">
                {input.length.toLocaleString()} / 8,000
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {loading && onCancel && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full text-[var(--chat-meta-fg)] hover:text-[var(--chat-text)]"
                  onClick={onCancel}
                  aria-label="Cancel request"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-full transition",
                  canSend
                    ? "bg-[var(--chat-send-bg)] text-[var(--chat-send-fg)] hover:opacity-90"
                    : "bg-[var(--chat-send-disabled-bg)] text-[var(--chat-send-disabled-fg)]",
                )}
                disabled={!canSend}
                onClick={onSend}
                aria-label={loading ? "Sending…" : "Send message"}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-[var(--chat-meta-fg)]">
          Next message: <span className="text-[var(--chat-text)]">{modeLabel(chatMode)}</span>
          {" · "}
          same thread — switch mode anytime
        </p>
      </div>
    </div>
  );
}
