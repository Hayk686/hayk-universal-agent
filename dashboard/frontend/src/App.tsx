import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { Layout } from "./components/Layout";
import { Skeleton } from "@/components/ui/skeleton";

const HermesDashboardPage = lazy(() =>
  import("./pages/HermesDashboardPage").then((m) => ({ default: m.HermesDashboardPage })),
);
const WorkspacePage = lazy(() =>
  import("./pages/WorkspacePage").then((m) => ({ default: m.WorkspacePage })),
);
const ChatPage = lazy(() =>
  import("./pages/ChatPage").then((m) => ({ default: m.ChatPage })),
);
import { FilesPage } from "./pages/FilesPage";
import { AgentsMdPage } from "./pages/AgentsMdPage";
import { PlaybooksPage } from "./pages/PlaybooksPage";
import { PlaybookEditorPage } from "./pages/PlaybookEditorPage";
import { HermesPage } from "./pages/HermesPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";

function DashboardShellSkeleton() {
  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--chat-bg)]">
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[17.5rem] shrink-0 border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] lg:block" />
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <Skeleton className="mx-auto h-8 w-48 rounded-lg bg-[var(--chat-composer-border)]/40" />
          <Skeleton className="mx-auto h-32 w-full max-w-2xl rounded-2xl bg-[var(--chat-composer-border)]/30" />
          <Skeleton className="mx-auto mt-auto h-24 w-full max-w-2xl rounded-[1.35rem] bg-[var(--chat-composer-border)]/35" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <Suspense fallback={<DashboardShellSkeleton />}>
                  <HermesDashboardPage />
                </Suspense>
              }
            />
            <Route
              path="/workspace"
              element={
                <Suspense fallback={<DashboardShellSkeleton />}>
                  <WorkspacePage />
                </Suspense>
              }
            />
            <Route
              path="/chat"
              element={
                <Suspense fallback={<DashboardShellSkeleton />}>
                  <ChatPage />
                </Suspense>
              }
            />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/agents" element={<AgentsMdPage />} />
            <Route path="/playbooks" element={<PlaybooksPage />} />
            <Route path="/playbooks/:name" element={<PlaybookEditorPage />} />
            <Route path="/hermes" element={<HermesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
