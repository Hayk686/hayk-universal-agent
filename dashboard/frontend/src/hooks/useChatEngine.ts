import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  PolicyConfirmationCancelledError,
  usePolicyConfirmation,
} from "@/hooks/usePolicyConfirmation";
import { buildMessageWithThreadContext, POLICY_ACTION_WEB_SEND } from "@/lib/chat-thread";
import type { ChatSessionSendResponse, ChatWebSendResponse, StatusResponse } from "@/types/api-contract";

const LS_SESSION = "hayk-agent-chat-session-id";
const LS_HISTORY = "hayk-agent-chat-history-v1";
const LS_MODE = "hayk-agent-chat-mode";
const LS_ACTIVITY = "hermes-activity-v1";
const CHAT_CLIENT_ABORT_BUFFER_MS = 15_000;

export const TIMEOUT_HELP =
  "Hermes timed out. Try a shorter prompt, switch model/provider, or increase CHAT_TIMEOUT_SECONDS.";

export type { ChatMode, HistoryMsg, TurnMode } from "@/lib/chat-types";
import type { ChatMode, HistoryMsg, TurnMode } from "@/lib/chat-types";

const PROGRESS_LINES_BASE = [
  "Starting Hermes…",
  "Sending message to model…",
  "Waiting for response…",
] as const;

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

export type ActivityBucket = { hour: number; requests: number; errors: number };

function readActivity(): ActivityBucket[] {
  try {
    const raw = localStorage.getItem(LS_ACTIVITY);
    if (!raw) return [];
    const p = JSON.parse(raw) as ActivityBucket[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function writeActivity(buckets: ActivityBucket[]) {
  try {
    localStorage.setItem(LS_ACTIVITY, JSON.stringify(buckets.slice(-48)));
  } catch {
    /* ignore */
  }
}

function bumpActivity(isError: boolean) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const buckets = readActivity();
  const idx = buckets.findIndex((b) => b.hour === hour);
  if (idx >= 0) {
    buckets[idx].requests += 1;
    if (isError) buckets[idx].errors += 1;
  } else {
    buckets.push({ hour, requests: 1, errors: isError ? 1 : 0 });
  }
  writeActivity(buckets);
}

/**
 * Build the 24-hour activity chart purely from real local-storage buckets.
 *
 * The previous implementation filled missing buckets with ``Math.sin(i/3)*4+6``
 * + a periodic fake error, which made an empty dashboard look like a busy
 * production system. We now return zeros for hours that have no recorded
 * activity; the chart legitimately reads "no traffic" until the user sends
 * a real message.
 */
export function buildChartData(buckets: ActivityBucket[]) {
  const now = Date.now();
  const points: { time: string; requests: number; errors: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now - i * 3_600_000);
    const hour = Math.floor(t.getTime() / 3_600_000);
    const bucket = buckets.find((b) => b.hour === hour);
    const label =
      i === 0
        ? "Now"
        : i % 6 === 0
          ? t.toLocaleDateString(undefined, { weekday: "short" })
          : t.toLocaleTimeString(undefined, { hour: "numeric" }).replace(" ", "");
    points.push({
      time: label,
      requests: bucket?.requests ?? 0,
      errors: bucket?.errors ?? 0,
    });
  }
  return points;
}

export function useChatEngine() {
  const { requestWithConfirmation, policyConfirmModal } = usePolicyConfirmation();
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
  const [activityBuckets, setActivityBuckets] = useState<ActivityBucket[]>(readActivity);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"user" | "timeout" | null>(null);
  const loadStartedAt = useRef<number>(0);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  const progressLines = useMemo(
    () => [...PROGRESS_LINES_BASE, "Complex requests can take a few minutes."],
    [],
  );

  const chartData = useMemo(() => buildChartData(activityBuckets), [activityBuckets]);

  /**
   * Real metrics derived from local chat history + recent sessions.
   *
   * Previously fell back to ``totalMessages: 1247``, ``activeSessions: 7``,
   * ``errorRate: 0.3`` with hardcoded ``+12 / -0.1%`` deltas so the dashboard
   * never looked empty. That was misleading. Now an empty dashboard reads as
   * zero across the board; deltas are the difference between today (24h) and
   * yesterday (24-48h ago).
   */
  const metrics = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 86_400_000;
    const twoDaysAgo = now - 2 * 86_400_000;
    const today = history.filter((m) => (m.timestamp ?? 0) >= dayAgo);
    const yesterday = history.filter(
      (m) => (m.timestamp ?? 0) >= twoDaysAgo && (m.timestamp ?? 0) < dayAgo,
    );

    const assistantToday = today.filter((m) => m.role === "assistant" && m.durationMs);
    const assistantYesterday = yesterday.filter(
      (m) => m.role === "assistant" && m.durationMs,
    );
    const avgMsToday =
      assistantToday.length > 0
        ? assistantToday.reduce((s, m) => s + (m.durationMs ?? 0), 0) / assistantToday.length
        : 0;
    const avgMsYesterday =
      assistantYesterday.length > 0
        ? assistantYesterday.reduce((s, m) => s + (m.durationMs ?? 0), 0) /
          assistantYesterday.length
        : 0;

    function errorRateOf(slice: typeof history): number {
      const replies = slice.filter((m) => m.role === "assistant" && m.exitCode !== undefined);
      if (replies.length === 0) return 0;
      const failed = replies.filter((m) => m.exitCode !== 0).length;
      return (failed / replies.length) * 100;
    }

    const errorRateToday = errorRateOf(today);
    const errorRateYesterday = errorRateOf(yesterday);
    const sessionsActive = Math.max(recentSessions.length, sessionId ? 1 : 0);

    return {
      totalMessages: today.length,
      activeSessions: sessionsActive,
      errorRate: errorRateToday,
      avgResponseSec: avgMsToday / 1000,
      messagesDelta: today.length - yesterday.length,
      // Sessions are a live count, not a 24h window — use the count itself as
      // the delta hint when there is no historical baseline.
      sessionsDelta: sessionsActive,
      errorRateDelta: errorRateToday - errorRateYesterday,
      responseDelta: (avgMsToday - avgMsYesterday) / 1000,
    };
  }, [history, recentSessions.length, sessionId]);

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

  function applySessionResult(data: {
    sessionId?: string | null;
    parseWarning?: string | null;
  }) {
    setParseWarning(typeof data.parseWarning === "string" ? data.parseWarning : null);
    setSessionId((prev) => data.sessionId ?? prev);
  }

  function assistantTurnMode(
    data: ChatSessionSendResponse | ChatWebSendResponse,
    sendMode: ChatMode,
  ): TurnMode {
    if (data.mode === "web-session") return "web-session";
    if (sendMode === "fast") return "fast";
    if (sendMode === "session") return "session";
    return "hermes-session";
  }

  function appendExchange(
    userText: string,
    data: ChatSessionSendResponse | ChatWebSendResponse,
    sendMode: ChatMode,
  ) {
    const assistantMode = assistantTurnMode(data, sendMode);
    const ts = Date.now();
    const isError = data.exitCode !== 0;
    bumpActivity(isError);
    setActivityBuckets(readActivity());
    setHistory((h) => [
      ...h,
      { id: uid(), role: "user", content: userText, timestamp: ts, mode: sendMode },
      {
        id: uid(),
        role: "assistant",
        content: data.response,
        exitCode: data.exitCode,
        durationMs: data.durationMs,
        mode: assistantMode,
        timestamp: ts,
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
    const historyBeforeSend = history;
    try {
      let data: ChatSessionSendResponse | ChatWebSendResponse;
      const requestInit = { signal: ac.signal };
      if (modeNow === "web") {
        const payload =
          sid || historyBeforeSend.length === 0
            ? message
            : buildMessageWithThreadContext(message, historyBeforeSend);
        data = await requestWithConfirmation(
          (token) =>
            api.sendWebChatMessage(payload, sid, {
              ...requestInit,
              policyConfirmationToken: token,
            }),
          { policyAction: POLICY_ACTION_WEB_SEND },
        );
        applySessionResult(data);
        appendExchange(message, data, "web");
        setInput("");
      } else {
        data = await requestWithConfirmation((token) =>
          api.sendSessionChatMessage(message, sid, {
            ...requestInit,
            policyConfirmationToken: token,
          }),
        );
        applySessionResult(data);
        appendExchange(message, data, modeNow);
        setInput("");
      }
      if (data.exitCode === 124) {
        const extra =
          modeNow === "session"
            ? " Session on a Pi is often slower — you can also try Fast mode."
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
            modeNow === "session" ? " Session on a Pi is often slower — you can also try Fast mode." : "";
          setHttpError(`${TIMEOUT_HELP}${extra}`);
        } else {
          setCancelNote(
            "Request cancelled in the browser. Hermes may still be running on the server until it finishes or times out.",
          );
        }
      } else if (e instanceof PolicyConfirmationCancelledError) {
        setCancelNote("Action cancelled — policy confirmation was not granted.");
      } else {
        setHttpError(e instanceof Error ? e.message : String(e));
        bumpActivity(true);
        setActivityBuckets(readActivity());
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
    setHttpError(null);
    setCancelNote(null);
    try {
      localStorage.removeItem(LS_SESSION);
      localStorage.removeItem(LS_HISTORY);
    } catch {
      /* ignore */
    }
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
        try {
          localStorage.removeItem(LS_SESSION);
          localStorage.removeItem(LS_HISTORY);
        } catch {
          /* ignore */
        }
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
        timestamp: m.timestamp ?? Date.now(),
      }));

      setChatMode("session");
      setSessionId(data.sessionId);
      setHistory(loaded);
      setResumeStatus(`Loaded ${loaded.length} messages`);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : String(e));
    }
  }

  const headline = loading ? progressHeadline(elapsedSec, progressLines) : "";
  const activeStep = loading ? progressStepIndex(elapsedSec) : -1;

  const agentHealthy =
    !!agentStatus &&
    agentStatus.agentsMdExists &&
    agentStatus.playbooksDirExists &&
    agentStatus.venv.existsAndExecutable;

  return {
    input,
    setInput,
    chatMode,
    setChatMode,
    sessionId,
    history,
    resumeError,
    resumeStatus,
    recentSessions,
    recentSessionsLoading,
    httpError,
    cancelNote,
    parseWarning,
    sessionTimeoutHint,
    loading,
    elapsedSec,
    chatTimeoutSec,
    agentStatus,
    agentHealthy,
    chartData,
    metrics,
    progressLines,
    headline,
    activeStep,
    historyEndRef,
    send,
    cancelInFlight,
    newSession,
    loadRecentSessions,
    loadSessionTranscript,
    deleteRecentSession,
    policyConfirmModal,
  };
}

export type ChatEngine = ReturnType<typeof useChatEngine>;
