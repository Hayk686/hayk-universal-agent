import { Bot } from "lucide-react";

const SUGGESTIONS = [
  "Summarize my latest agent logs",
  "Help me draft a playbook step",
  "Explain what Session mode does",
  "Check system health and disk usage",
];

export function ChatEmptyState({ onSuggestionClick }: { onSuggestionClick?: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--chat-assistant-avatar-bg)] text-[var(--chat-assistant-avatar-fg)]">
        <Bot className="h-6 w-6" />
      </div>
      <h1 className="max-w-md text-[1.75rem] font-medium tracking-[-0.02em] text-[var(--chat-text)] sm:text-[2rem]">
        How can I help you today?
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--chat-meta-fg)]">
        Ask Hayk anything — local Hermes agent, web search, or multi-turn sessions.
      </p>

      {onSuggestionClick && (
        <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              className="rounded-xl border border-[var(--chat-composer-border)] bg-[var(--chat-composer-bg)] px-4 py-3 text-left text-[13px] leading-snug text-[var(--chat-text)] transition hover:border-[var(--chat-mode-active-bg)]/40 hover:bg-[var(--chat-hover)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
