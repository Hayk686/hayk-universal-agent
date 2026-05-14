import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { SectionHeader } from "@/components/section-header";
import { TerminalOutput } from "@/components/terminal-output";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function LogsPage() {
  const [hermes, setHermes] = useState<string | null>(null);
  const [errors, setErrors] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<"hermes" | "errors" | null>(null);

  async function loadHermes() {
    setLoading("hermes");
    setErr(null);
    try {
      setHermes(await api.getLogsHermes());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setHermes(`// Load failed: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  async function loadErrors() {
    setLoading("errors");
    setErr(null);
    try {
      setErrors(await api.getLogsErrors());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setErrors(`// Load failed: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    void loadHermes();
    void loadErrors();
  }, []);

  return (
    <PageShell
      title="Logs"
      description="GET /api/logs/hermes (since 1h) and GET /api/logs/errors — last 300 lines each."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading === "hermes"}
            onClick={() => void loadHermes()}
          >
            Refresh Hermes
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading === "errors"}
            onClick={() => void loadErrors()}
          >
            Refresh errors
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-6xl">
        <SectionHeader
          icon={ScrollText}
          title="Server log capture"
          description="Tail-style views backed by the API"
        />
        {err && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-lg p-3">
            {err}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Hermes (since 1h)
          </h3>
          <TerminalOutput
            title="hermes-log"
            content={hermes ?? ""}
            loading={hermes === null || loading === "hermes"}
            status={hermes?.startsWith("// Load failed") ? "error" : "idle"}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Hermes errors
          </h3>
          <TerminalOutput
            title="hermes-errors"
            content={errors ?? ""}
            loading={errors === null || loading === "errors"}
            status={errors?.startsWith("// Load failed") ? "error" : "idle"}
          />
        </div>
      </div>
    </PageShell>
  );
}
