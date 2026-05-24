import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bot,
  ChevronDown,
  Loader2,
  Megaphone,
  MessageSquare,
  Paperclip,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatEngine, ChatMode, ConversationCategory } from "@/hooks/useChatEngine";

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/;

function HermesSelect<T extends string>({
  value,
  onChange,
  options,
  disabled,
  mono,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:text-foreground disabled:opacity-50",
          mono ? "font-mono text-[10px] text-foreground" : "text-[10px] text-foreground",
        )}
      >
        <span className="truncate">{current}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-50 mb-1 min-w-[10rem] overflow-hidden rounded-lg border border-border/60 bg-popover py-1 shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs transition",
                mono && "font-mono text-[10px]",
                opt.value === value
                  ? "bg-primary/15 font-medium text-primary"
                  : "text-popover-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkifiedText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    const trailing = raw.match(TRAILING_URL_PUNCTUATION_RE)?.[0] ?? "";
    const label = trailing ? raw.slice(0, -trailing.length) : raw;
    const href = label.startsWith("www.") ? `https://${label}` : label;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <a
        key={`${start}-${label}`}
        className="break-all font-medium text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {label}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    lastIndex = end;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes.length ? nodes : text}</>;
}

const CATEGORIES: { id: ConversationCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general", label: "General Chat", icon: MessageSquare },
  { id: "marketing", label: "Marketing Copy", icon: Megaphone },
  { id: "analysis", label: "Data Analysis", icon: BarChart3 },
];

const CHAT_MODE_OPTIONS: { value: ChatMode; label: string }[] = [
  { value: "fast", label: "HERMES / HAYK-8B-Q4" },
  { value: "session", label: "HERMES / SESSION" },
  { value: "web", label: "HERMES / WEB" },
];

const DEMO_MESSAGES: Record<ConversationCategory, { user: string; assistant: string }> = {
  general: {
    user: "Summarize my open tasks for today.",
    assistant:
      "You have 3 open items: finish the Q1 report draft, review the marketing brief, and sync with the local Hermes session cache.",
  },
  marketing: {
    user: "Write a short hero line for a local AI assistant.",
    assistant:
      "Hermes keeps your work close — fast answers, full context, and zero cloud dependency. Built for thoughtful work that stays on your machine.",
  },
  analysis: {
    user: "Analyze Q1 sales data for anomalies.",
    assistant:
      "Found 3 anomalies in March: a 42% spike in region B (likely promo), a dip in week 2 (-18%), and one outlier order (+6σ). Want a breakdown by SKU?",
  },
};

export function ConversationPanel({ chat }: { chat: ChatEngine }) {
  const {
    input,
    setInput,
    chatMode,
    setChatMode,
    category,
    setCategory,
    sessionId,
    history,
    loading,
    headline,
    activeStep,
    progressLines,
    elapsedSec,
    chatTimeoutSec,
    httpError,
    cancelNote,
    parseWarning,
    sessionTimeoutHint,
    historyEndRef,
    send,
    cancelInFlight,
    loadSessionTranscript,
    recentSessions,
  } = chat;

  const filteredHistory = history.filter((m) => !m.category || m.category === category);
  const showDemo = filteredHistory.length === 0 && !loading;

  return (
    <section className="hermes-panel hermes-panel-center flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card/30">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Category sidebar */}
        <nav className="hidden w-[148px] shrink-0 flex-col border-r border-border/40 bg-background/20 py-3 md:flex">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={cn(
                "mx-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition",
                category === id
                  ? "bg-primary/15 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="leading-tight">{label}</span>
            </button>
          ))}

          {recentSessions.length > 0 && (
            <div className="mt-4 min-h-0 flex-1 overflow-hidden px-2">
              <p className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </p>
              <div className="hayk-scrollbar max-h-40 space-y-0.5 overflow-y-auto">
                {recentSessions.slice(0, 5).map((s) => (
                  <button
                    key={s.sessionId}
                    type="button"
                    className="w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-accent/25 hover:text-foreground"
                    onClick={() => void loadSessionTranscript(s.sessionId)}
                    disabled={loading}
                  >
                    {s.title || s.preview || s.sessionId.slice(0, 8)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Chat area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Conversation</h2>
              <p className="text-[10px] text-muted-foreground">
                {sessionId ? `Session ${sessionId.slice(0, 12)}…` : "New conversation"} · {chatMode} mode
              </p>
            </div>
            <div className="flex gap-1 md:hidden">
              {CATEGORIES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px]",
                    category === id ? "bg-primary/15 text-primary" : "text-muted-foreground",
                  )}
                >
                  {label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="hayk-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {showDemo ? (
              <>
                <MessageBubble role="user" text={DEMO_MESSAGES[category].user} />
                <MessageBubble role="assistant" text={DEMO_MESSAGES[category].assistant} demo />
              </>
            ) : (
              filteredHistory.map((m) => (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  text={m.content}
                  mode={m.mode}
                  exitCode={m.exitCode}
                  durationMs={m.durationMs}
                />
              ))
            )}

            {loading && (
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium text-foreground">{headline}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Elapsed {elapsedSec}s
                    {elapsedSec >= chatTimeoutSec ? " — past server limit, finishing up…" : ""}
                  </p>
                  <ul className="space-y-1">
                    {progressLines.map((line, i) => (
                      <li
                        key={line}
                        className={cn(
                          "text-[10px]",
                          i === activeStep ? "font-medium text-foreground" : "text-muted-foreground/60",
                        )}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {(httpError || cancelNote || parseWarning || sessionTimeoutHint) && (
              <div className="space-y-2">
                {httpError && <AlertBlock tone="error" text={httpError} />}
                {cancelNote && <AlertBlock tone="warning" text={cancelNote} />}
                {parseWarning && <AlertBlock tone="warning" text={parseWarning} />}
                {sessionTimeoutHint && <AlertBlock tone="warning" text={sessionTimeoutHint} />}
              </div>
            )}

            <div ref={historyEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-border/40 p-3">
            <div className="rounded-xl border border-border/50 bg-background/40 p-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/50 px-2 py-1">
                  <span className="text-[10px] text-muted-foreground">Conversation</span>
                  <HermesSelect
                    value={category}
                    onChange={setCategory}
                    options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
                  />
                </div>

                <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/50 px-2 py-1">
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">Provider / Model</span>
                  <HermesSelect
                    value={chatMode}
                    onChange={setChatMode}
                    options={CHAT_MODE_OPTIONS}
                    disabled={loading}
                    mono
                  />
                </div>
              </div>

              <textarea
                className="min-h-[2.75rem] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Hermes…"
                disabled={loading}
                maxLength={8000}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />

              <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground">{input.length.toLocaleString()} / 8,000</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {loading && (
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={cancelInFlight}>
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg px-3"
                    disabled={!input.trim() || loading}
                    onClick={() => void send()}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({
  role,
  text,
  mode,
  exitCode,
  durationMs,
  demo,
}: {
  role: "user" | "assistant";
  text: string;
  mode?: string;
  exitCode?: number;
  durationMs?: number;
  demo?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "border border-border/50 bg-[#1e293b] text-foreground"
            : "border border-border/40 bg-[#334155]/40 text-foreground/95",
          demo && "opacity-60",
        )}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>Hermes</span>
            {mode && <span className="font-mono normal-case">· {mode}</span>}
            {demo && <span className="text-primary/70">· preview</span>}
          </div>
        )}
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          <LinkifiedText text={text} />
        </pre>
        {!isUser && exitCode !== undefined && durationMs !== undefined && (
          <p className="mt-2 border-t border-border/40 pt-1.5 font-mono text-[9px] text-muted-foreground">
            exit {exitCode} · {(durationMs / 1000).toFixed(1)}s
          </p>
        )}
      </div>
    </div>
  );
}

function AlertBlock({ tone, text }: { tone: "error" | "warning"; text: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning",
      )}
    >
      {text}
    </div>
  );
}
