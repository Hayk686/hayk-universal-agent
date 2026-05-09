import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { SourceModeBadge } from "@/components/source-mode-badge";

type PageShellProps = {
  title: string;
  description?: ReactNode;
  /** Extra controls next to the Live/Mock badge (e.g. Save). */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Standard page wrapper — Lovable-style header + Live/Mock badge on every screen.
 */
export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-5" data-page-shell>
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SourceModeBadge />
            {actions}
          </div>
        }
      />
      <div className="min-w-0" data-page-content>
        {children}
      </div>
    </div>
  );
}
