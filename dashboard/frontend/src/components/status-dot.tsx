import { cn } from "@/lib/utils";

export function StatusDot({
  tone = "success",
  pulse = false,
  className,
}: {
  tone?: "success" | "warning" | "destructive" | "muted";
  pulse?: boolean;
  className?: string;
}) {
  const colorClass =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "destructive"
          ? "bg-destructive"
          : "bg-muted-foreground";
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            colorClass,
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", colorClass)} />
    </span>
  );
}
