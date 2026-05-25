import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquarePlus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";

export type ChatSessionItem = {
  sessionId: string;
  title: string;
  preview: string;
  lastActive: string;
};

export type ChatSidebarProps = {
  sessions: ChatSessionItem[];
  activeSessionId: string | null;
  loading?: boolean;
  sessionsLoading?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRefreshSessions: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function ChatSidebar({
  sessions,
  activeSessionId,
  loading,
  sessionsLoading,
  collapsed,
  onToggleCollapse,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRefreshSessions,
  mobileOpen,
  onMobileClose,
}: ChatSidebarProps) {
  const { theme, toggle } = useTheme();

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-[var(--chat-sidebar-fg)]">
              Hayk
            </p>
            <p className="truncate text-[11px] text-[var(--chat-sidebar-muted)]">Personal AI</p>
          </div>
        )}
        {onToggleCollapse && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="hidden h-8 w-8 shrink-0 rounded-lg text-[var(--chat-sidebar-muted)] hover:bg-[var(--chat-hover)] hover:text-[var(--chat-sidebar-fg)] lg:inline-flex"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <div className="px-3 pb-2">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 w-full justify-start gap-2 rounded-xl border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-item-bg)] text-[var(--chat-sidebar-fg)] shadow-none hover:bg-[var(--chat-hover)]",
            collapsed && "justify-center px-0",
          )}
          onClick={onNewChat}
          disabled={loading}
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">New chat</span>}
        </Button>
      </div>

      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
          <div className="mb-1 flex items-center justify-between px-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--chat-sidebar-muted)]">
              Recent
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--chat-sidebar-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-sidebar-fg)] disabled:opacity-50"
              onClick={onRefreshSessions}
              disabled={loading || sessionsLoading}
            >
              <RefreshCw className={cn("h-3 w-3", sessionsLoading && "animate-spin")} />
              Refresh
            </button>
          </div>

          <div className="hayk-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-[var(--chat-sidebar-muted)]">
                No saved sessions yet. Start a conversation in Session mode.
              </p>
            ) : (
              sessions.map((item) => {
                const active = activeSessionId === item.sessionId;
                return (
                  <div
                    key={item.sessionId}
                    className={cn(
                      "group flex items-center gap-1 rounded-xl px-1 transition",
                      active && "bg-[var(--chat-sidebar-active)]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--chat-hover)]"
                      onClick={() => {
                        onSelectSession(item.sessionId);
                        onMobileClose?.();
                      }}
                      disabled={loading}
                    >
                      <p className="truncate text-[13px] font-medium text-[var(--chat-sidebar-fg)]">
                        {item.title || item.preview || "Untitled chat"}
                      </p>
                      <p className="truncate text-[11px] text-[var(--chat-sidebar-muted)]">
                        {item.lastActive}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="mr-1 shrink-0 rounded-lg p-1.5 text-[var(--chat-sidebar-muted)] opacity-0 transition hover:bg-[var(--chat-destructive-bg)] hover:text-[var(--chat-destructive-fg)] group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                      onClick={() => onDeleteSession(item.sessionId)}
                      disabled={loading}
                      aria-label={`Delete ${item.title || item.sessionId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="mt-auto space-y-1 border-t border-[var(--chat-sidebar-border)] p-2">
        <Link
          to="/"
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-2 text-[13px] text-[var(--chat-sidebar-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-sidebar-fg)]",
            collapsed && "justify-center px-0",
          )}
          onClick={onMobileClose}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Dashboard</span>}
        </Link>
        <Link
          to="/settings"
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-2 text-[13px] text-[var(--chat-sidebar-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-sidebar-fg)]",
            collapsed && "justify-center px-0",
          )}
          onClick={onMobileClose}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-[var(--chat-sidebar-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-sidebar-fg)]",
            collapsed && "justify-center px-0",
          )}
          onClick={toggle}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          "chat-sidebar hidden h-full shrink-0 flex-col border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] lg:flex",
          collapsed ? "w-[4.5rem]" : "w-[17.5rem]",
        )}
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-label="Close sidebar"
            onClick={onMobileClose}
          />
          <aside className="chat-sidebar absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
