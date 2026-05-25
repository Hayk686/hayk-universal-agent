import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatLoadingIndicator } from "@/components/chat/ChatLoadingIndicator";
import { ChatAlerts } from "@/components/chat/ChatAlerts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatEngine } from "@/hooks/useChatEngine";
import { Trash2 } from "lucide-react";

export function ConversationPanel({ chat }: { chat: ChatEngine }) {
  const {
    input,
    setInput,
    chatMode,
    setChatMode,
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
    deleteRecentSession,
    recentSessions,
    resumeError,
    resumeStatus,
  } = chat;

  const showEmpty = history.length === 0 && !loading;

  return (
    <section className="hermes-panel hermes-panel-center flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--chat-composer-border)]/60 bg-[var(--chat-bg)]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {recentSessions.length > 0 && (
          <nav className="hidden w-[9.5rem] shrink-0 flex-col border-r border-[var(--chat-composer-border)]/60 bg-[var(--chat-sidebar-bg)] py-3 md:flex">
            <div className="min-h-0 flex-1 overflow-hidden px-2">
              <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--chat-sidebar-muted)]">
                Recent
              </p>
              <div className="hayk-scrollbar max-h-full space-y-0.5 overflow-y-auto">
                {recentSessions.slice(0, 8).map((s) => (
                  <div
                    key={s.sessionId}
                    className={cn(
                      "group flex items-center gap-0.5 rounded-lg",
                      sessionId === s.sessionId && "bg-[var(--chat-sidebar-active)]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--chat-sidebar-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-sidebar-fg)]"
                      onClick={() => void loadSessionTranscript(s.sessionId)}
                      disabled={loading}
                      title={s.sessionId}
                    >
                      {s.title || s.preview || s.sessionId.slice(0, 8)}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1 text-[var(--chat-sidebar-muted)] opacity-0 transition hover:bg-[var(--chat-destructive-bg)] hover:text-[var(--chat-destructive-fg)] group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                      onClick={() => void deleteRecentSession(s.sessionId)}
                      disabled={loading}
                      aria-label={`Delete session ${s.sessionId}`}
                      title="Delete chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--chat-composer-border)]/60 px-4 py-2.5">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-[var(--chat-text)]">Conversation</h2>
              <p className="truncate text-[11px] text-[var(--chat-meta-fg)]">
                {sessionId ? `Session ${sessionId.slice(0, 12)}…` : "New conversation"} · {chatMode}
              </p>
            </div>
            {sessionId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 rounded-lg px-2 text-[11px] text-[var(--chat-destructive-fg)] hover:bg-[var(--chat-destructive-bg)]"
                onClick={() => void deleteRecentSession(sessionId)}
                disabled={loading}
                title="Delete this chat session"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>

          <div className="hayk-scrollbar min-h-0 flex-1 overflow-y-auto">
            {showEmpty ? (
              <ChatEmptyState onSuggestionClick={setInput} />
            ) : (
              <div className="space-y-6 py-4">
                {history.map((m) => (
                  <ChatMessage
                    key={m.id}
                    role={m.role}
                    text={m.content}
                    mode={m.mode}
                    exitCode={m.exitCode}
                    durationMs={m.durationMs}
                    compact
                  />
                ))}

                {loading && (
                  <ChatLoadingIndicator
                    headline={headline}
                    elapsedSec={elapsedSec}
                    chatTimeoutSec={chatTimeoutSec}
                    progressLines={progressLines}
                    activeStep={activeStep}
                  />
                )}

                <ChatAlerts
                  httpError={httpError}
                  cancelNote={cancelNote}
                  parseWarning={parseWarning}
                  sessionTimeoutHint={sessionTimeoutHint}
                  resumeError={resumeError}
                  resumeStatus={resumeStatus}
                />

                <div ref={historyEndRef} />
              </div>
            )}
          </div>

          <ChatComposer
            input={input}
            onInputChange={setInput}
            onSend={() => void send()}
            onCancel={cancelInFlight}
            loading={loading}
            chatMode={chatMode}
            onChatModeChange={setChatMode}
          />
        </div>
      </div>
      {chat.policyConfirmModal}
    </section>
  );
}
