import { HermesHeader } from "@/components/hermes/HermesHeader";
import { SystemOverviewPanel } from "@/components/hermes/SystemOverviewPanel";
import { ConversationPanel } from "@/components/hermes/ConversationPanel";
import { ActiveComponentsPanel } from "@/components/hermes/ActiveComponentsPanel";
import { RecentLogsPanel } from "@/components/hermes/RecentLogsPanel";
import { useChatEngine } from "@/hooks/useChatEngine";
import { fetchStatus } from "@/lib/api";
import { useEffect, useState } from "react";

export function HermesDashboardPage() {
  const chat = useChatEngine();
  const [backendOnline, setBackendOnline] = useState(true);

  useEffect(() => {
    let active = true;
    async function check() {
      const status = await fetchStatus();
      if (active) setBackendOnline(status.origin === "live");
    }
    void check();
    const id = window.setInterval(() => void check(), 30_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const systemStatus = chat.agentHealthy && backendOnline ? "active" : backendOnline ? "degraded" : "offline";
  const cliStatus = chat.loading ? "busy" : backendOnline ? "idle" : "offline";

  return (
    <div className="hermes-dashboard flex h-full min-h-0 flex-col" data-hermes-dashboard>
      <HermesHeader
        systemStatus={systemStatus}
        backendStatus={backendOnline ? "online" : "offline"}
        cliStatus={cliStatus}
        onNewSession={chat.newSession}
        newSessionDisabled={chat.loading}
      />

      <div className="hermes-dashboard-grid min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        <SystemOverviewPanel metrics={chat.metrics} chartData={chat.chartData} />
        <ConversationPanel chat={chat} />
        <aside className="hermes-panel hermes-panel-right flex min-h-0 flex-col gap-3 overflow-hidden">
          <ActiveComponentsPanel />
          <RecentLogsPanel cliBusy={chat.loading} />
        </aside>
      </div>
    </div>
  );
}
