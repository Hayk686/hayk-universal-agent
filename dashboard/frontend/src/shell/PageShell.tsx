import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

/**
 * Wrapper for every page — Lovable can replace inner markup but keep this shell.
 */
export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="space-y-6" data-page-shell>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-page-title>
          {title}
        </h1>
        {description ? (
          <p
            className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl"
            data-page-description
          >
            {description}
          </p>
        ) : null}
      </header>
      <div data-page-content>{children}</div>
    </div>
  );
}
