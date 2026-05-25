import { useCallback, useEffect, useState } from "react";
import { Archive, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatLocalTime, formatRelative } from "@/lib/format";
import type { ArtifactRecordResponse, MemorySummaryResponse } from "@/types/api-contract";
import { PanelShell } from "./PanelShell";

const PREVIEW_LEN = 280;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export function MemoryArtifactsPanel() {
  const [summary, setSummary] = useState<MemorySummaryResponse | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRecordResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactRecordResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mem, arts] = await Promise.all([api.getMemorySummary(), api.listArtifacts()]);
      setSummary(mem);
      setArtifacts(arts.artifacts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openArtifact = async (id: string) => {
    setSelectedId(id);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const detail = await api.getArtifact(id, true);
      setPreview(detail);
    } catch (e) {
      setPreview({
        id,
        runId: null,
        workflowId: null,
        path: "",
        kind: "output",
        createdAt: new Date().toISOString(),
        summary: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const activeContext = summary?.activeContext;

  return (
    <>
      <PanelShell
        title="Memory & Artifacts"
        description="Active context and indexed workspace artifacts"
        icon={Brain}
        loading={loading}
        error={error}
      >
        {!loading && !error ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border/40 bg-background/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Active context
                </p>
              </div>
              {activeContext?.title || activeContext?.summary ? (
                <>
                  {activeContext.title ? (
                    <p className="text-sm font-medium text-foreground">{activeContext.title}</p>
                  ) : null}
                  {activeContext.summary ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {truncate(activeContext.summary, PREVIEW_LEN)}
                    </p>
                  ) : null}
                  {activeContext.keyPoints.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {activeContext.keyPoints.slice(0, 4).map((pt) => (
                        <li key={pt} className="text-xs text-muted-foreground">
                          · {truncate(pt, 120)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : summary?.title || summary?.keyPoints.length ? (
                <>
                  {summary.title ? (
                    <p className="text-sm font-medium text-foreground">{summary.title}</p>
                  ) : null}
                  {summary.keyPoints.slice(0, 3).map((pt) => (
                    <p key={pt} className="mt-1 text-xs text-muted-foreground">
                      · {truncate(pt, 120)}
                    </p>
                  ))}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No active context indexed yet.</p>
              )}
              {summary ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {summary.entryCount} entr{summary.entryCount === 1 ? "y" : "ies"} · updated{" "}
                  {formatRelative(summary.generatedAt)}
                </p>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <Archive className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Artifacts ({artifacts.length})
                </p>
              </div>
              {artifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No artifacts indexed yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {artifacts.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded-lg border border-border/40 bg-background/25 px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/5"
                        onClick={() => void openArtifact(a.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {a.kind}
                            </Badge>
                            <span className="truncate text-xs font-medium text-foreground">
                              {a.path.split("/").pop() || a.path}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {a.summary || a.path}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatRelative(a.createdAt)}
                            {a.runId ? ` · run ${a.runId.slice(0, 8)}` : null}
                            {a.workflowId ? ` · wf ${a.workflowId.slice(0, 8)}` : null}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </PanelShell>

      <Dialog open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Artifact preview</DialogTitle>
            <DialogDescription>
              {preview?.path || selectedId || "Loading artifact…"}
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          ) : preview ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {preview.kind}
                </Badge>
                {preview.runId ? (
                  <Badge variant="outline">run: {preview.runId.slice(0, 12)}</Badge>
                ) : null}
                {preview.workflowId ? (
                  <Badge variant="outline">wf: {preview.workflowId.slice(0, 12)}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Created {formatLocalTime(preview.createdAt)}
              </p>
              {preview.summary ? (
                <p className="text-xs text-muted-foreground">{preview.summary}</p>
              ) : null}
              {preview.contentPreview ? (
                <pre className="max-h-64 overflow-auto rounded-lg border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {preview.contentPreview}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">No text preview available.</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
