import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, XCircle } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { SectionHeader } from "@/components/section-header";
import { TerminalOutput } from "@/components/terminal-output";
import { WarningCard } from "@/components/warning-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ChatSendResponse } from "@/types/api-contract";

const CHAT_CLIENT_ABORT_AFTER_MS = 125_000;

const PROGRESS_LINES = [
  "Starting Hermes...",
  "Sending message to model...",
  "Waiting for response...",
  "This can take 20–30 seconds in one-shot mode.",
] as const;

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
  const [result, setResult] = useState<ChatSendResponse | null>(null);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"user" | "timeout" | null>(null);
  const loadStartedAt = useRef<number>(0);

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
    setResult(null);
    setLoading(true);
    try {
      const data = await api.sendChatMessage(message, { signal: ac.signal });
      setResult(data);
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

  const headline = loading ? progressHeadline(elapsedSec) : "";
  const activeStep = loading ? progressStepIndex(elapsedSec) : -1;

  const outStatus =
    result == null ? "idle" : result.exitCode === 0 ? "success" : "error";

  return (
    <PageShell
      title="Agent Chat"
      description="POST /api/chat/send — one-shot Hermes message from the workspace (no streaming yet)."
    >
      <div className="max-w-5xl space-y-6">
        <SectionHeader
          icon={MessageSquare}
          title="Message Hermes"
          description="Each send runs hermes -z with your text from the configured workspace root"
          action={
            <Badge variant="secondary" className="shrink-0">
              One-shot mode
            </Badge>
          }
        />

        <WarningCard
          severity="info"
          title="MVP"
          description="This MVP sends one message at a time. Persistent sessions will be added later."
        />

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm font-medium">Your message</CardTitle>
            <CardDescription>Plain text only — no command flags or shell.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <textarea
              className="min-h-[10rem] w-full resize-y rounded-lg border border-border bg-background/50 px-3 py-2.5 font-sans text-sm leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        {result && (
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-sm font-medium">Hermes response</CardTitle>
              <CardDescription className="text-pretty">
                Exit code{" "}
                <span className="font-mono text-foreground/90">{result.exitCode}</span>
                {" · "}
                <span className="font-mono text-foreground/90" title={`${result.durationMs} ms`}>
                  {(result.durationMs / 1000).toFixed(1)}s
                </span>{" "}
                wall ·{" "}
                <span className="font-mono text-foreground/90">{result.durationMs} ms</span>
                {" · "}
                <span className="font-mono text-foreground/90">{result.mode}</span>
              </CardDescription>
            </CardHeader>
            {result.exitCode === 124 && (
              <CardContent className="pb-0 pt-4">
                <WarningCard
                  severity="warning"
                  title="Hermes timed out"
                  description="The server stopped this run after 120 seconds (one-shot limit). Try a shorter question or simpler task."
                />
              </CardContent>
            )}
            <CardContent className={cn("pt-4", result.exitCode === 124 && "pt-3")}>
              <TerminalOutput
                title="hermes-z"
                content={result.response}
                status={outStatus}
                loading={false}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
