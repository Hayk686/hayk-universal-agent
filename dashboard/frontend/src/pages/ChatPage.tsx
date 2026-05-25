import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatLoadingIndicator } from "@/components/chat/ChatLoadingIndicator";
import { ChatAlerts } from "@/components/chat/ChatAlerts";
import { useChatEngine } from "@/hooks/useChatEngine";

export function ChatPage() {
  const chat = useChatEngine();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const showEmpty = chat.history.length === 0 && !chat.loading;

  return (
    <div className="chat-shell flex h-full min-h-0 w-full overflow-hidden bg-[var(--chat-bg)]" data-chat-page>
      <ChatSidebar
        sessions={chat.recentSessions}
        activeSessionId={chat.sessionId}
        loading={chat.loading}
        sessionsLoading={chat.recentSessionsLoading}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onNewChat={chat.newSession}
        onSelectSession={(id) => void chat.loadSessionTranscript(id)}
        onDeleteSession={(id) => void chat.deleteRecentSession(id)}
        onRefreshSessions={() => void chat.loadRecentSessions()}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="chat-header flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--chat-composer-border)]/70 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-lg text-[var(--chat-meta-fg)] hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text)] lg:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open conversations"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--chat-text)]">
                {chat.sessionId ? "Session chat" : "New conversation"}
              </p>
              <p className="truncate text-[11px] capitalize text-[var(--chat-meta-fg)]">
                {chat.chatMode} mode
              </p>
            </div>
          </div>
        </header>

        <div className="chat-thread hayk-scrollbar min-h-0 flex-1 overflow-y-auto">
          {showEmpty ? (
            <ChatEmptyState
              onSuggestionClick={(text) => {
                chat.setInput(text);
              }}
            />
          ) : (
            <div className="space-y-8 py-6 sm:py-8">
              {chat.history.map((m) => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  text={m.content}
                  mode={m.mode}
                  exitCode={m.exitCode}
                  durationMs={m.durationMs}
                />
              ))}

              {chat.loading && (
                <ChatLoadingIndicator
                  headline={chat.headline}
                  elapsedSec={chat.elapsedSec}
                  chatTimeoutSec={chat.chatTimeoutSec}
                  progressLines={chat.progressLines}
                  activeStep={chat.activeStep}
                />
              )}

              <ChatAlerts
                httpError={chat.httpError}
                cancelNote={chat.cancelNote}
                parseWarning={chat.parseWarning}
                sessionTimeoutHint={chat.sessionTimeoutHint}
                resumeError={chat.resumeError}
                resumeStatus={chat.resumeStatus}
              />

              <div ref={chat.historyEndRef} className="h-1" />
            </div>
          )}
        </div>

        <ChatComposer
          input={chat.input}
          onInputChange={chat.setInput}
          onSend={() => void chat.send()}
          onCancel={chat.cancelInFlight}
          loading={chat.loading}
          chatMode={chat.chatMode}
          onChatModeChange={chat.setChatMode}
        />
      </div>
      {chat.policyConfirmModal}
    </div>
  );
}
