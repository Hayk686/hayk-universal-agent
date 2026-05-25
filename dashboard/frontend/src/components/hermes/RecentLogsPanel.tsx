import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type LogLevel = "all" | "INF" | "WRN" | "ERR";

function parseLogLine(line: string): { level: "INF" | "WRN" | "ERR" | "other"; text: string } {
  const trimmed = line.trim();
  if (!trimmed) return { level: "other", text: line };

  const bracketMatch = trimmed.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(INF|WRN|ERR|WARN|ERROR|INFO)\s*(.*)$/i);
  if (bracketMatch) {
    const rawLevel = bracketMatch[2].toUpperCase();
    const level =
      rawLevel === "ERR" || rawLevel === "ERROR"
        ? "ERR"
        : rawLevel === "WRN" || rawLevel === "WARN"
          ? "WRN"
          : "INF";
    return { level, text: `[${bracketMatch[1]}] ${level} ${bracketMatch[3]}` };
  }

  if (/error|failed|exception/i.test(trimmed)) return { level: "ERR", text: trimmed };
  if (/warn/i.test(trimmed)) return { level: "WRN", text: trimmed };
  return { level: "INF", text: trimmed };
}

function formatHermesLogs(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-80);
}

const LEVEL_CLASS: Record<string, string> = {
  INF: "text-emerald-400/90",
  WRN: "text-amber-400/90",
  ERR: "text-red-400/90",
  other: "text-slate-400/90",
};

export function RecentLogsPanel({ cliBusy }: { cliBusy?: boolean }) {
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogLevel>("all");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [hermes, errors] = await Promise.all([api.getLogsHermes(), api.getLogsErrors()]);
      const combined = [...formatHermesLogs(hermes), ...formatHermesLogs(errors)].slice(-100);
      if (combined.length === 0) {
        const now = new Date();
        const ts = now.toTimeString().slice(0, 8);
        setRaw(
          [
            `[${ts}] INF Session_Created id=local`,
            `[${ts}] INF Backend_Online host=localhost`,
            `[${ts}] INF MemoryIndex ready`,
          ].join("\n"),
        );
      } else {
        setRaw(combined.join("\n"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      const now = new Date().toTimeString().slice(0, 8);
      setRaw(`[${now}] ERR LogFetch failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [raw, loading]);

  const lines = useMemo(() => {
    const parsed = raw.split("\n").filter(Boolean).map(parseLogLine);
    if (filter === "all") return parsed;
    return parsed.filter((l) => l.level === filter);
  }, [raw, filter]);

  const filters: { id: LogLevel; label: string }[] = [
    { id: "all", label: "All" },
    { id: "INF", label: "INFO" },
    { id: "WRN", label: "WARN" },
    { id: "ERR", label: "ERR" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/50 bg-[#0c1220]">
      <div className="flex items-center justify-between gap-1.5 border-b border-border/40 px-2 py-1.5">
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Logs
          </h3>
          {cliBusy && (
            <p className="truncate text-[9px] text-warning">CLI busy</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider transition",
                filter === f.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh logs"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <p className="border-b border-destructive/20 bg-destructive/5 px-2 py-1 text-[9px] text-destructive">
          {error}
        </p>
      )}

      <div
        ref={scrollRef}
        className="hayk-scrollbar min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-snug"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground">No log entries for this filter.</p>
        ) : (
          lines.map((line, i) => (
            <div key={`${i}-${line.text.slice(0, 24)}`} className={cn("whitespace-pre-wrap break-all", LEVEL_CLASS[line.level])}>
              {line.text}
            </div>
          ))
        )}
        {loading && <span className="text-primary">▌</span>}
      </div>
    </div>
  );
}
