import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { FilesPage } from "./pages/FilesPage";
import { AgentsMdPage } from "./pages/AgentsMdPage";
import { PlaybooksPage } from "./pages/PlaybooksPage";
import { PlaybookEditorPage } from "./pages/PlaybookEditorPage";
import { HermesPage } from "./pages/HermesPage";
import { ChatPage } from "./pages/ChatPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/agents" element={<AgentsMdPage />} />
            <Route path="/playbooks" element={<PlaybooksPage />} />
            <Route path="/playbooks/:name" element={<PlaybookEditorPage />} />
            <Route path="/hermes" element={<HermesPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
