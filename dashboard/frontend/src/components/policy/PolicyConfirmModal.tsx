import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PolicyChallenge } from "@/lib/policy/errors";
import type { PolicyDecisionResponse } from "@/types/api-contract";

const RISK_LABELS: Record<PolicyDecisionResponse["risk"], string> = {
  read: "Read",
  write: "Write",
  exec: "Execute",
  network: "Network",
  browser: "Browser",
  payment: "Payment",
};

const RISK_STYLES: Record<PolicyDecisionResponse["risk"], string> = {
  read: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  write: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  exec: "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-200",
  network: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  browser: "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  payment: "border-destructive/30 bg-destructive/10 text-destructive",
};

type PolicyConfirmModalProps = {
  open: boolean;
  challenge: PolicyChallenge | null;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PolicyConfirmModal({
  open,
  challenge,
  confirming,
  onConfirm,
  onCancel,
}: PolicyConfirmModalProps) {
  const risk = challenge?.decision.risk ?? "exec";
  const actionLabel = challenge?.action?.trim() || "this action";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !confirming) onCancel();
      }}
    >
      <DialogContent
        className="border-[var(--chat-composer-border)] bg-[var(--chat-bg)] text-[var(--chat-text)] sm:max-w-lg"
        onPointerDownOutside={(e) => {
          if (confirming) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (confirming) e.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-left text-[var(--chat-text)]">
                Confirm action
              </DialogTitle>
              <DialogDescription className="text-left text-[var(--chat-meta-fg)]">
                Hayk Policy Gate requires your approval before continuing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-[var(--chat-composer-border)]/70 bg-[var(--chat-sidebar-bg)]/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--chat-meta-fg)]">
              Risk
            </span>
            <span
              className={cn(
                "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                RISK_STYLES[risk],
              )}
            >
              {RISK_LABELS[risk]}
            </span>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--chat-meta-fg)]">
              Action
            </p>
            <p className="mt-1 font-mono text-sm text-[var(--chat-text)]">{actionLabel}</p>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--chat-meta-fg)]">
              Reason
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--chat-text)]">
              {challenge?.decision.reason ?? "This action needs explicit confirmation."}
            </p>
          </div>

          {challenge?.confirmError ? (
            <p className="text-sm text-destructive">{challenge.confirmError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={confirming} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={confirming} onClick={onConfirm}>
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              "Confirm & continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
