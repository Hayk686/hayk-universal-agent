import { useEffect, useRef, useState } from "react";
import { Copy, Terminal as TerminalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TerminalOutput({
  title = "console",
  content,
  status,
  loading,
  className,
}: {
  title?: string;
  content: string;
  status?: "success" | "error" | "idle";
  loading?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [content, loading]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const dotColor =
    status === "success"
      ? "bg-success"
      : status === "error"
        ? "bg-destructive"
        : "bg-muted-foreground";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-[oklch(0.14_0.02_250)] shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-card/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
            <span className="h-2.5 w-2.5 rounded-full bg-muted/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted/40" />
          </div>
          <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(content).then(() => setCopied(true));
          }}
        >
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </span>
        </Button>
      </div>
      <pre
        ref={ref}
        className="m-0 max-h-[480px] min-h-[260px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground/90"
      >
        {loading ? `${content || ""}\n▌` : content || "$ idle\nNo output yet."}
      </pre>
    </div>
  );
}
