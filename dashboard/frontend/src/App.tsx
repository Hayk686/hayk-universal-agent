import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { Layout } from "./components/Layout";
import { Skeleton } from "@/components/ui/skeleton";

const HermesDashboardPage = lazy(() =>
  import("./pages/HermesDashboardPage").then((m) => ({ default: m.HermesDashboardPage })),
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
    <div className="flex h-[100dvh] flex-col gap-3 bg-background p-4">
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[22%_1fr_28%]">
        <Skeleton className="hidden rounded-xl lg:block" />
        <Skeleton className="rounded-xl" />
        <Skeleton className="hidden rounded-xl lg:block" />
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
              path="/chat"
              element={
                <Suspense fallback={<DashboardShellSkeleton />}>
                  <HermesDashboardPage />
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
