import { useEffect, useState } from "react";
import { FileEdit } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, saveMarkdownFromResponse } from "@/lib/api";

export function AgentsMdPage() {
  const [text, setText] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.getAgentsMd();
        setText(t);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSavedMsg(null);
    setErr(null);
    try {
      const res = await api.saveAgentsMd({ content: text });
      const j = await saveMarkdownFromResponse(res);
      setSavedMsg(
        j.backup
          ? `Saved. Backup: ${j.backup}`
          : "Saved (new file, no previous backup).",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading)
    return (
      <PageShell title="AGENTS.md" description="Loading from GET /api/agents-md.">
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </PageShell>
    );

  return (
    <PageShell
      title="AGENTS.md"
      description="GET /api/agents-md · PUT /api/agents-md with timestamped backup when the file already exists."
      actions={
        <Button type="button" size="sm" onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className="space-y-4 max-w-6xl">
        <SectionHeader
          icon={FileEdit}
          title="Markdown in workspace root"
          description="Edit on the left, rendered preview on the right"
        />
        {err && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-lg p-3">
            {err}
          </div>
        )}
        {savedMsg && (
          <div className="text-sm text-success border border-success/30 rounded-lg p-3 bg-success/5">
            {savedMsg}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Source</CardTitle>
              <CardDescription>Raw markdown</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <textarea
                className="w-full min-h-[min(70vh,32rem)] rounded-b-xl border-0 bg-transparent font-mono text-sm p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm font-medium">Preview</CardTitle>
              <CardDescription>Hub-style lightweight renderer</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[min(70vh,32rem)] overflow-auto p-4">
              <MarkdownPreview source={text} />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
