import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageSquare, Send, Trash2, XCircle } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { SectionHeader } from "@/components/section-header";
import { WarningCard } from "@/components/warning-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ChatSendResponse, ChatSessionSendResponse } from "@/types/api-contract";

const LS_SESSION = "hayk-agent-chat-session-id";
const LS_HISTORY = "hayk-agent-chat-history-v1";
const CHAT_CLIENT_ABORT_AFTER_MS = 125_000;

const PROGRESS_LINES = [
  "Starting Hermes…",
  "Sending message to model…",
  "Waiting for response…",
  "Persistent sessions can still take 20–30 seconds per turn.",
] as const;

type TurnMode = "hermes-session" | "oneshot";

type HistoryMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  exitCode?: number;
  durationMs?: number;
  mode?: TurnMode;
};

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function readStoredSession(): string | null {
  try {
    const s = localStorage.getItem(LS_SESSION);
    if (!s?.trim()) return null;
    return s.trim();
  } catch {
    return null;
  }
}

function readStoredHistory(): HistoryMsg[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter(
      (m): m is HistoryMsg =>
        !!m &&
        typeof m === "object" &&
        (m as HistoryMsg).role !== undefined &&
        typeof (m as HistoryMsg).content === "string",
    );
  } catch {
    return [];
  }
}

function progressHeadline(elapsedSec: number): string {
  if (elapsedSec < 6) return PROGRESS_LINES[0];
  if (elapsedSec < 14) return PROGRESS_LINES[1];
  if (elapsedSec < 22) return PROGRESS_LINES[2];
  return PROGRESS_LINES[3];
}

function progressStepIndex(elapsedSec: number): number {
  if (elapsedSec < 6) return 0;
  if (elapsedSec < 14) return 1;
  if (elapsedSec < 22) return 2;
  return 3;
}

export function ChatPage() {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(readStoredSession);
  const [history, setHistory] = useState<HistoryMsg[]>(readStoredHistory);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"user" | "timeout" | null>(null);
  const loadStartedAt = useRef<number>(0);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      if (sessionId) localStorage.setItem(LS_SESSION, sessionId);
      else localStorage.removeItem(LS_SESSION);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [history]);

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    loadStartedAt.current = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - loadStartedAt.current) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  function applySessionResult(data: ChatSessionSendResponse) {
    setParseWarning(typeof data.parseWarning === "string" ? data.parseWarning : null);
    setSessionId((prev) => data.sessionId ?? prev);
  }

  function appendExchange(userText: string, data: ChatSessionSendResponse | ChatSendResponse) {
    const mode: TurnMode = data.mode === "oneshot" ? "oneshot" : "hermes-session";
    setHistory((h) => [
      ...h,
      { id: uid(), role: "user", content: userText },
      {
        id: uid(),
        role: "assistant",
        content: data.response,
        exitCode: data.exitCode,
        durationMs: data.durationMs,
        mode,
      },
    ]);
  }

  async function send() {
    const message = input.trim();
    if (!message || loading) return;
    const ac = new AbortController();
    abortRef.current = ac;
    abortReasonRef.current = null;

    const tid = window.setTimeout(() => {
      abortReasonRef.current = "timeout";
      ac.abort();
    }, CHAT_CLIENT_ABORT_AFTER_MS);

    setHttpError(null);
    setCancelNote(null);
    setFallbackNote(null);
    setParseWarning(null);
    setLoading(true);
    const sid = sessionId;
    try {
      try {
        const data = await api.sendSessionChatMessage(message, sid, { signal: ac.signal });
        applySessionResult(data);
        appendExchange(message, data);
        setInput("");
      } catch (firstErr) {
        const aborted =
          (firstErr instanceof DOMException && firstErr.name === "AbortError") ||
          (firstErr instanceof Error && firstErr.name === "AbortError");
        if (aborted) throw firstErr;
        const data = await api.sendChatMessage(message, { signal: ac.signal });
        setFallbackNote(
          "Session chat failed — used one-shot fallback (new Hermes process). Your transcript is still shown below.",
        );
        appendExchange(message, data);
        setInput("");
      }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        const reason = abortReasonRef.current;
        abortReasonRef.current = null;
        if (reason === "timeout") {
          setHttpError(
            "This request ran longer than 120 seconds. The server stops Hermes after that limit — try a shorter message or try again.",
          );
        } else {
          setCancelNote(
            "Request cancelled in the browser. Hermes may still be running on the server until it finishes or times out.",
          );
        }
      } else {
        setHttpError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      window.clearTimeout(tid);
      setLoading(false);
      abortRef.current = null;
    }
  }

  function cancelInFlight() {
    if (!loading || !abortRef.current) return;
    abortReasonRef.current = "user";
    abortRef.current.abort();
  }

  function newSession() {
    setSessionId(null);
    setHistory([]);
    setParseWarning(null);
    setFallbackNote(null);
    try {
      localStorage.removeItem(LS_SESSION);
      localStorage.removeItem(LS_HISTORY);
    } catch {
      /* ignore */
    }
  }

  function clearLocalHistory() {
    setHistory([]);
    setFallbackNote(null);
  }

  const headline = loading ? progressHeadline(elapsedSec) : "";
  const activeStep = loading ? progressStepIndex(elapsedSec) : -1;

  return (
    <PageShell
      title="Agent Chat"
      description="POST /api/chat/session-send — Hermes chat -q -Q with optional --resume (browser history is local only for now)."
    >
      <div className="max-w-5xl space-y-6">
        <SectionHeader
          icon={MessageSquare}
          title="Message Hermes"
          description="Conversation uses a persistent Hermes session id when available; history below is stored in this browser only."
          action={
            <Badge variant="secondary" className="shrink-0">
              Persistent Hermes Session
            </Badge>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={newSession}>
            New Session
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearLocalHistory}
            disabled={history.length === 0}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear Local History
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground sm:ml-auto">
            Hermes session: {sessionId ?? "— (next send starts new)"}
          </span>
        </div>

        <WarningCard
          severity="info"
          title="Local history only"
          description="This page remembers messages in your browser. Server-side chat history and SQLite are not enabled yet."
        />

        {fallbackNote && (
          <WarningCard severity="warning" title="Fallback mode" description={fallbackNote} />
        )}
        {parseWarning && (
          <WarningCard severity="warning" title="Session id" description={parseWarning} />
        )}

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm font-medium">Conversation</CardTitle>
            <CardDescription>
              Scroll for earlier turns. Assistant replies use the same workspace as the backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[min(55vh,28rem)] space-y-3 overflow-y-auto pt-4">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet — send one below.</p>
            ) : (
              history.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-2",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-xl border px-3 py-2.5 text-sm shadow-sm",
                      m.role === "user"
                        ? "border-primary/25 bg-primary/10 text-foreground"
                        : "border-border bg-card text-foreground",
                    )}
                  >
                    {m.role === "assistant" && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Bot className="h-3 w-3" />
                        <span>Hermes</span>
                        {m.mode && (
                          <span className="font-mono normal-case">· {m.mode}</span>
                        )}
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                      {m.content}
                    </pre>
                    {m.role === "assistant" &&
                      m.exitCode !== undefined &&
                      m.durationMs !== undefined && (
                        <p className="mt-2 border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground">
                          Exit {m.exitCode} · {(m.durationMs / 1000).toFixed(1)}s · {m.durationMs}{" "}
                          ms
                        </p>
                      )}
                  </div>
                </div>
              ))
            )}
            <div ref={historyEndRef} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm font-medium">Your message</CardTitle>
            <CardDescription>Plain text only — no command flags or shell.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <textarea
              className="min-h-[10rem] w-full resize-y rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground px-3 py-2.5 font-sans text-sm leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Hermes something…"
              spellCheck
              disabled={loading}
              maxLength={8000}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {input.length.toLocaleString()} / 8,000
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {loading && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-border/80 text-muted-foreground hover:text-foreground"
                    onClick={cancelInFlight}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={loading || !input.trim()}
                  onClick={() => void send()}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card className="overflow-hidden border-primary/25 bg-gradient-to-b from-primary/[0.07] via-card to-card shadow-[var(--shadow-soft)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium tracking-tight text-foreground">{headline}</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    Elapsed {elapsedSec}s
                    {elapsedSec >= 120 ? " — past server limit, finishing up…" : ""}
                  </p>
                </div>
              </div>
              <ul className="space-y-2 border-t border-border/60 pt-4">
                {PROGRESS_LINES.map((line, i) => (
                  <li
                    key={line}
                    className={cn(
                      "flex gap-2 text-xs leading-snug transition-colors duration-300",
                      i === activeStep
                        ? "font-medium text-foreground"
                        : i < activeStep
                          ? "text-muted-foreground/70"
                          : "text-muted-foreground/45",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        i === activeStep
                          ? "bg-primary shadow-[0_0_10px_oklch(0.72_0.14_250_/_0.45)]"
                          : i < activeStep
                            ? "bg-muted-foreground/50"
                            : "bg-muted-foreground/25",
                      )}
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {cancelNote && (
          <WarningCard severity="warning" title="Cancelled" description={cancelNote} />
        )}

        {httpError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Request failed</CardTitle>
              <CardDescription className="text-destructive/80">
                The server rejected the request, the network failed, or the run exceeded the time limit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-background/80 p-3 font-mono text-xs text-foreground">
                {httpError}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
