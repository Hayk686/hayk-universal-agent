import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { SectionHeader } from "@/components/section-header";
import { TerminalOutput } from "@/components/terminal-output";
import { WarningCard } from "@/components/warning-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { ChatSendResponse } from "@/types/api-contract";

export function ChatPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ChatSendResponse | null>(null);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message) return;
    setHttpError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await api.sendChatMessage(message);
      setResult(data);
    } catch (e) {
      setHttpError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

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
              <Button
                type="button"
                size="sm"
                disabled={loading || !input.trim()}
                onClick={() => void send()}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {loading ? "Sending…" : "Send"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {httpError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Request failed</CardTitle>
              <CardDescription className="text-destructive/80">
                The server rejected the request or the network failed.
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
              <CardDescription>
                Exit{" "}
                <span className="font-mono text-foreground/90">{result.exitCode}</span>
                {" · "}
                <span className="font-mono text-foreground/90">{result.durationMs} ms</span>
                {" · "}
                <span className="font-mono text-foreground/90">{result.mode}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
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
