import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, saveMarkdownFromResponse } from "@/lib/api";

export function PlaybookEditorPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const decoded = name ? decodeURIComponent(name) : "";

  useEffect(() => {
    if (!decoded) return;
    setLoading(true);
    (async () => {
      try {
        const t = await api.getPlaybook(decoded);
        setText(t);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [decoded]);

  async function save() {
    setMsg(null);
    setErr(null);
    try {
      const res = await api.savePlaybook(decoded, { content: text });
      const j = await saveMarkdownFromResponse(res);
      setMsg(j.backup ? `Saved. Backup: playbooks/${j.backup}` : "Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!decoded) return null;

  return (
    <PageShell
      title={decoded}
      description={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          onClick={() => navigate("/playbooks")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to playbooks
        </button>
      }
      actions={
        <Button type="button" size="sm" onClick={() => void save()} disabled={loading}>
          Save
        </Button>
      }
    >
      <div className="space-y-4 max-w-6xl">
        <SectionHeader
          icon={FileText}
          title={`GET /api/playbooks/${decoded}`}
          description="PUT with backup · live preview"
        />
        {loading && <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>}
        {err && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-lg p-3">
            {err}
          </div>
        )}
        {msg && (
          <div className="text-sm text-success border border-success/30 rounded-lg p-3 bg-success/5">
            {msg}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Source</CardTitle>
              <CardDescription>Playbook markdown</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <textarea
                className="w-full min-h-[min(70vh,32rem)] rounded-b-xl border-0 bg-transparent font-mono text-sm p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y disabled:opacity-50"
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                disabled={loading}
              />
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm font-medium">Preview</CardTitle>
              <CardDescription>Rendered markdown</CardDescription>
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
