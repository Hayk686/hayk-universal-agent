import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Search, Send, Trash2, XCircle, Zap } from "lucide-react";
import { WarningCard } from "@/components/warning-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ChatSendResponse, ChatSessionSendResponse, ChatWebSendResponse, StatusResponse } from "@/types/api-contract";

const LS_SESSION = "hayk-agent-chat-session-id";
const LS_HISTORY = "hayk-agent-chat-history-v1";
const LS_MODE = "hayk-agent-chat-mode";
const CHAT_CLIENT_ABORT_BUFFER_MS = 15_000;

const TIMEOUT_HELP =
  "Hermes timed out. Try a shorter prompt, switch model/provider, or increase CHAT_TIMEOUT_SECONDS.";

type ChatMode = "fast" | "web" | "session";

const PROGRESS_LINES_BASE = [
  "Starting Hermes…",
  "Sending message to model…",
  "Waiting for response…",
] as const;

type TurnMode = "hermes-session" | "oneshot" | "web-oneshot";

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

function readChatMode(): ChatMode {
  try {
    const v = localStorage.getItem(LS_MODE);
    if (v === "session") return "session";
    if (v === "web") return "web";
    return "fast";
  } catch {
    return "fast";
  }
}

function progressHeadline(elapsedSec: number, lines: readonly string[]): string {
  if (elapsedSec < 6) return lines[0];
  if (elapsedSec < 14) return lines[1];
  if (elapsedSec < 22) return lines[2];
  return lines[3];
}

function progressStepIndex(elapsedSec: number): number {
  if (elapsedSec < 6) return 0;
  if (elapsedSec < 14) return 1;
  if (elapsedSec < 22) return 2;
  return 3;
}

export function ChatPage() {
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>(readChatMode);
  const [sessionId, setSessionId] = useState<string | null>(readStoredSession);
  const [history, setHistory] = useState<HistoryMsg[]>(readStoredHistory);
  const [resumeSessionInput, setResumeSessionInput] = useState(readStoredSession() ?? "");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<
    { sessionId: string; title: string; preview: string; lastActive: string }[]
  >([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [sessionTimeoutHint, setSessionTimeoutHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [chatTimeoutSec, setChatTimeoutSec] = useState(300);
  const [agentStatus, setAgentStatus] = useState<StatusResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"user" | "timeout" | null>(null);
  const loadStartedAt = useRef<number>(0);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  const progressLines = useMemo(
    () => [...PROGRESS_LINES_BASE, "Complex requests can take a few minutes."],
    [],
  );

  useEffect(() => {
    void api.getStatus().then((s) => {
      setAgentStatus(s);
      const sec = s.chatTimeoutSeconds;
      if (typeof sec === "number" && Number.isFinite(sec)) {
        setChatTimeoutSec(Math.max(30, Math.min(600, Math.floor(sec))));
      }
    });
  }, []);

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
      localStorage.setItem(LS_MODE, chatMode);
    } catch {
      /* ignore */
    }
  }, [chatMode]);

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

  useEffect(() => {
    void loadRecentSessions();
  }, []);

  function applySessionResult(data: ChatSessionSendResponse) {
    setParseWarning(typeof data.parseWarning === "string" ? data.parseWarning : null);
    setSessionId((prev) => data.sessionId ?? prev);
  }

  function appendExchange(userText: string, data: ChatSessionSendResponse | ChatSendResponse | ChatWebSendResponse) {
    const mode: TurnMode =
      data.mode === "oneshot"
        ? "oneshot"
        : data.mode === "web-oneshot"
          ? "web-oneshot"
          : "hermes-session";
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

    const serverTimeoutMs = Math.max(30_000, chatTimeoutSec * 1000 + CHAT_CLIENT_ABORT_BUFFER_MS);
    const tid = window.setTimeout(() => {
      abortReasonRef.current = "timeout";
      ac.abort();
    }, serverTimeoutMs);

    const modeNow = chatMode;
    setHttpError(null);
    setCancelNote(null);
    setParseWarning(null);
    setSessionTimeoutHint(null);
    setLoading(true);
    const sid = sessionId;
    try {
      let data: ChatSendResponse | ChatSessionSendResponse | ChatWebSendResponse;
      if (modeNow === "fast") {
        data = await api.sendChatMessage(message, { signal: ac.signal });
        appendExchange(message, data);
        setInput("");
      } else if (modeNow === "web") {
        data = await api.sendWebChatMessage(message, { signal: ac.signal });
        appendExchange(message, data);
        setInput("");
      } else {
        data = await api.sendSessionChatMessage(message, sid, { signal: ac.signal });
        applySessionResult(data);
        appendExchange(message, data);
        setInput("");
      }
      if (data.exitCode === 124) {
        const extra =
          modeNow === "session"
            ? " Session on a Pi is often slower — you can also try Fast in the toggle above."
            : "";
        setSessionTimeoutHint(`${TIMEOUT_HELP}${extra}`);
      }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        const reason = abortReasonRef.current;
        abortReasonRef.current = null;
        if (reason === "timeout") {
          const extra =
            modeNow === "session"
              ? " Session on a Pi is often slower — you can also try Fast in the toggle above."
              : "";
          setHttpError(`${TIMEOUT_HELP}${extra}`);
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
    setSessionTimeoutHint(null);
    try {
      localStorage.removeItem(LS_SESSION);
      localStorage.removeItem(LS_HISTORY);
    } catch {
      /* ignore */
    }
  }

  function clearLocalHistory() {
    setHistory([]);
    setSessionTimeoutHint(null);
  }

  async function loadRecentSessions() {
    setRecentSessionsLoading(true);
    setResumeError(null);
    try {
      const data = await api.getChatSessions();
      setRecentSessions(data.sessions.slice(0, 12));
      setResumeStatus(`Found ${data.sessions.length} recent sessions`);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecentSessionsLoading(false);
    }
  }

  async function deleteRecentSession(sessionIdToDelete: string) {
    if (loading) return;

    const ok = window.confirm(
      `Delete Hermes session ${sessionIdToDelete}? This cannot be undone.`,
    );
    if (!ok) return;

    setResumeError(null);
    setResumeStatus(null);

    try {
      const res = await api.deleteChatSession(sessionIdToDelete);
      if (!res.ok) throw new Error(await res.text());

      setRecentSessions((items) =>
        items.filter((item) => item.sessionId !== sessionIdToDelete),
      );

      if (sessionId === sessionIdToDelete) {
        setSessionId(null);
        setHistory([]);
        setResumeSessionInput("");
      }

      setResumeStatus(`Deleted session ${sessionIdToDelete}`);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadSessionTranscript(sessionIdOverride?: string) {
    const sid = (sessionIdOverride ?? resumeSessionInput).trim();
    if (!sid || loading) return;

    setResumeError(null);
    setResumeStatus(null);
    setHttpError(null);
    setCancelNote(null);
    setParseWarning(null);

    try {
      setResumeSessionInput(sid);
      const data = await api.getChatSessionTranscript(sid);
      const loaded: HistoryMsg[] = data.messages.map((m) => ({
        id: `session_${data.sessionId}_${m.id || uid()}`,
        role: m.role,
        content: m.content,
        mode: m.role === "assistant" ? "hermes-session" : undefined,
      }));

      setChatMode("session");
      setSessionId(data.sessionId);
      setHistory(loaded);
      setResumeStatus(`Loaded ${loaded.length} messages from ${data.sessionId}`);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : String(e));
    }
  }

  const headline = loading ? progressHeadline(elapsedSec, progressLines) : "";
  const activeStep = loading ? progressStepIndex(elapsedSec) : -1;
  const totalFiles = agentStatus
    ? agentStatus.fileCounts.input + agentStatus.fileCounts.output + agentStatus.fileCounts.reports
    : history.length;
  const diskUsedPct =
    agentStatus && agentStatus.diskUsage.totalBytes > 0
      ? Math.round((agentStatus.diskUsage.usedBytes / agentStatus.diskUsage.totalBytes) * 100)
      : null;
  const agentHealthy =
    !!agentStatus &&
    agentStatus.agentsMdExists &&
    agentStatus.playbooksDirExists &&
    agentStatus.venv.existsAndExecutable;

  return (
    <div className="mx-auto w-full max-w-[1500px]" data-page-shell>
      <div className="grid max-w-none items-start gap-5 overflow-x-hidden xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 max-w-full overflow-hidden rounded-[2rem] border border-border/50 bg-card/35 shadow-[var(--shadow-soft)] backdrop-blur-xl">
          <div className="flex h-[calc(100dvh-5.75rem)] min-h-[39rem] max-w-full flex-col overflow-hidden">
            <div className="hayk-scrollbar flex-1 space-y-5 overflow-y-auto px-4 py-6 pb-56 sm:px-8 md:pb-6 lg:px-12">
              {history.length === 0 ? (
                <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center pb-10 text-center">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">What can I help with?</h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                    Ask Hayk anything, continue a local Hermes session, or use web mode.
                  </p>
                </div>
              ) : (
                history.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex gap-3",
                      m.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {m.role === "assistant" && (
                      <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary/15 text-primary sm:flex">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[92%] px-4 py-3 text-sm shadow-sm sm:max-w-[62%]",
                        m.role === "user"
                          ? "rounded-2xl border border-primary/25 bg-primary/15 text-foreground"
                          : "rounded-2xl border border-border/60 bg-background/50 text-foreground",
                      )}
                    >
                      {m.role === "assistant" && (
                        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span>Hayk</span>
                          {m.mode && <span className="font-mono normal-case">· {m.mode}</span>}
                        </div>
                      )}
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                        {m.content}
                      </pre>
                      {m.role === "assistant" &&
                        m.exitCode !== undefined &&
                        m.durationMs !== undefined && (
                          <p className="mt-2 border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground">
                            Exit {m.exitCode} · {(m.durationMs / 1000).toFixed(1)}s · {m.durationMs} ms
                          </p>
                        )}
                    </div>
                  </div>
                ))
              )}
              <div ref={historyEndRef} />
            </div>

            <div className="chat-mobile-composer w-full max-w-full overflow-hidden bg-transparent p-3 sm:px-8 sm:pb-5 lg:px-12">
              <div className="w-full max-w-full overflow-hidden rounded-[1.5rem] border border-border/55 bg-[#E0E1DD] p-2 shadow-[var(--shadow-soft)] dark:bg-[#1B263B]">
                <textarea
                  className="min-h-[3rem] w-full resize-none border-0 bg-transparent px-3 py-2.5 font-sans text-sm leading-relaxed text-[#0D1B2A] placeholder:text-[#778DA9] focus-visible:outline-none dark:text-[#E0E1DD] dark:placeholder:text-[#778DA9]"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Hayk anything..."
                  spellCheck
                  disabled={loading}
                  maxLength={8000}
                />

                <div className="flex w-full max-w-full flex-wrap items-center justify-between gap-2 overflow-hidden border-t border-[#778DA9]/25 px-1 pt-2">
                  <div className="chat-mobile-mode-row grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant={chatMode === "fast" ? "default" : "outline"}
                      className="h-8 min-w-0 rounded-full px-2 text-[11px] sm:px-3 sm:text-sm"
                      onClick={() => setChatMode("fast")}
                      disabled={loading}
                      aria-pressed={chatMode === "fast"}
                    >
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                      Fast
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={chatMode === "web" ? "default" : "outline"}
                      className="h-8 min-w-0 rounded-full px-2 text-[11px] sm:px-3 sm:text-sm"
                      onClick={() => setChatMode("web")}
                      disabled={loading}
                      aria-pressed={chatMode === "web"}
                    >
                      <Search className="mr-1.5 h-3.5 w-3.5" />
                      Web
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={chatMode === "session" ? "default" : "outline"}
                      className="h-8 min-w-0 rounded-full px-2 text-[11px] sm:px-3 sm:text-sm"
                      onClick={() => setChatMode("session")}
                      disabled={loading}
                      aria-pressed={chatMode === "session"}
                    >
                      Session
                    </Button>
                    <span className="ml-1 hidden text-[11px] text-muted-foreground sm:inline">
                      {input.length.toLocaleString()} / 8,000
                    </span>
                  </div>

                  <div className="chat-mobile-send-row flex w-full items-center justify-end gap-2 sm:w-auto">
                    {loading && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-border/80 text-muted-foreground hover:text-foreground"
                        onClick={cancelInFlight}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="hidden h-8 rounded-full sm:inline-flex"
                      onClick={clearLocalHistory}
                      disabled={loading || history.length === 0}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Clear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 rounded-full px-3"
                      disabled={loading || !input.trim()}
                      onClick={() => void send()}
                    >
                      <Send className="h-4 w-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Send</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-3 xl:self-start">
          <Card className="rounded-[1.5rem] border-border/55 bg-card/55 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Recent chats</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    Current: {chatMode === "session" ? sessionId ?? "new session" : chatMode === "web" ? "Web one-shot" : "Fast one-shot"}
                  </p>
                  {resumeStatus && <p className="text-[11px] text-emerald-500">{resumeStatus}</p>}
                  {resumeError && <p className="text-[11px] text-destructive">{resumeError}</p>}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 rounded-full px-3"
                  onClick={newSession}
                  disabled={loading}
                >
                  New chat
                </Button>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-border/60">
                {recentSessions.length > 0 ? (
                  <div className="hayk-scrollbar max-h-72 divide-y divide-border/50 overflow-y-auto">
                    {recentSessions.map((item) => (
                      <div
                        key={item.sessionId}
                        className="group flex items-center gap-2 bg-background/25 px-3 py-2.5 transition hover:bg-accent/25"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => void loadSessionTranscript(item.sessionId)}
                          disabled={loading}
                        >
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.title || item.preview || "Untitled session"}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.lastActive} · {item.preview || "No preview"}
                          </p>
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 rounded-full px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void deleteRecentSession(item.sessionId)}
                          disabled={loading}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-background/25 px-3 py-3 text-xs text-muted-foreground">
                    Refresh to show previous chats.
                  </div>
                )}
              </div>

              <button
                type="button"
                className="mt-3 flex w-full items-center justify-between rounded-xl px-1 text-xs text-primary hover:text-primary/80"
                onClick={() => void loadRecentSessions()}
                disabled={loading || recentSessionsLoading}
              >
                <span>{recentSessionsLoading ? "Loading..." : "Refresh sessions"}</span>
                <span aria-hidden>→</span>
              </button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/60 bg-card/70 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Today at a glance</p>
                <span className={cn("flex items-center gap-1.5 text-[11px] font-medium", agentHealthy ? "text-success" : "text-warning")}>
                  {agentStatus ? (agentHealthy ? "Healthy" : "Check") : "Loading"}
                  <span className={cn("h-2 w-2 rounded-full", agentHealthy ? "bg-success" : "bg-warning")} aria-hidden />
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Agent status</span>
                  <span className={cn("font-medium", agentHealthy ? "text-success" : "text-warning")}>
                    {agentStatus ? (agentHealthy ? "Healthy" : "Check") : "Loading"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Files</span>
                  <span className="font-mono text-xs">{totalFiles}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Disk used</span>
                  <span className="font-mono text-xs">{diskUsedPct === null ? "—" : `${diskUsedPct}%`}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-mono text-xs">{chatMode}</span>
                </div>
              </div>

              <svg className="mt-4 h-8 w-full text-primary/70" viewBox="0 0 180 32" fill="none" aria-hidden>
                <path
                  d="M2 23 L16 18 L28 21 L40 13 L52 17 L64 10 L76 15 L88 8 L100 13 L112 7 L124 11 L136 6 L148 10 L160 5 L178 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </CardContent>
          </Card>

          {chatMode === "session" && (
            <WarningCard severity="warning" title="Session" description="Session keeps context, but it is slower. Switch back to Fast if replies take too long." />
          )}
          {sessionTimeoutHint && (
            <WarningCard severity="warning" title="Hermes timed out" description={sessionTimeoutHint} />
          )}
          {parseWarning && (
            <WarningCard severity="warning" title="Session id" description={parseWarning} />
          )}
        </aside>

        <div className="xl:col-span-2">
          {loading && (
            <Card className="overflow-hidden rounded-3xl border-primary/25 bg-gradient-to-b from-primary/[0.07] via-card to-card shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium tracking-tight text-foreground">{headline}</p>
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      Elapsed {elapsedSec}s
                      {elapsedSec >= chatTimeoutSec ? " — past configured server limit, finishing up..." : ""}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 border-t border-border/60 pt-4">
                  {progressLines.map((line, i) => (
                    <li
                      key={`${line}-${i}`}
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
        </div>

        <div className="xl:col-span-2">
          {httpError && (
            <Card className="rounded-3xl border-destructive/40 bg-destructive/5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
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
      </div>
    </div>
  );

}
