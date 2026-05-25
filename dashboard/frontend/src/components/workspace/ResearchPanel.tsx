import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Search, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePolicyConfirmation } from "@/hooks/usePolicyConfirmation";
import { api } from "@/lib/api";
import type { ResearchResultResponse } from "@/types/api-contract";
import { PanelShell } from "./PanelShell";

const TIER_TONE: Record<string, string> = {
  primary: "border-success/40 bg-success/10 text-success",
  secondary: "border-warning/40 bg-warning/10 text-warning",
  unknown: "border-border/50 bg-muted/30 text-muted-foreground",
};

export function ResearchPanel() {
  const { requestWithConfirmation, policyConfirmModal } = usePolicyConfirmation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResultResponse | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await requestWithConfirmation((token) =>
        api.researchQuery(
          { query: q, ...(token ? { policyConfirmationToken: token } : {}) },
        ),
      );
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {policyConfirmModal}
      <PanelShell
        title="Research"
        description="Gated web research with structured citations"
        icon={Search}
        loading={false}
        error={null}
      >
        <div className="space-y-4">
          <form className="flex gap-2" onSubmit={(e) => void handleSearch(e)}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Research query…"
              className="h-9 rounded-lg border-border/60 bg-background/50"
              disabled={loading}
            />
            <Button
              type="submit"
              size="sm"
              className="h-9 shrink-0 gap-1 rounded-lg px-3"
              disabled={!query.trim() || loading}
            >
              <Search className="h-3.5 w-3.5" />
              {loading ? "Searching…" : "Search"}
            </Button>
          </form>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {result.fallbackUsed ? (
                  <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
                    <ShieldAlert className="h-3 w-3" />
                    Fallback used
                  </Badge>
                ) : null}
                <span className="text-[10px] text-muted-foreground">
                  Query {result.queryId.slice(0, 12)}
                </span>
              </div>

              {result.warnings.length > 0 ? (
                <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Warnings
                  </p>
                  <ul className="space-y-0.5">
                    {result.warnings.map((w) => (
                      <li key={w} className="text-xs text-muted-foreground">
                        · {w}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.summary ? (
                <div className="rounded-lg border border-border/40 bg-background/30 p-3">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Summary
                  </p>
                  <p className="text-xs leading-relaxed text-foreground">{result.summary}</p>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Citations ({result.citations.length})
                </p>
                {result.citations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No citations returned.</p>
                ) : (
                  <ul className="space-y-2">
                    {result.citations.map((c) => (
                      <li
                        key={c.url}
                        className="rounded-lg border border-border/40 bg-background/25 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                              {c.title || c.url}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            {c.snippet ? (
                              <p className="mt-1 text-xs text-muted-foreground">{c.snippet}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${TIER_TONE[c.sourceTier] ?? TIER_TONE.unknown}`}
                            >
                              {c.sourceTier}
                            </span>
                            {c.verified ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-success">
                                <CheckCircle2 className="h-3 w-3" />
                                Verified
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {result.gatedSites.length > 0 ? (
                <div className="text-[10px] text-muted-foreground">
                  Gated: {result.gatedSites.map((g) => `${g.domain} (${g.reason})`).join(", ")}
                </div>
              ) : null}
            </div>
          ) : !loading && !error ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Run a research query to see citations and summary.
            </p>
          ) : null}
        </div>
      </PanelShell>
    </>
  );
}
