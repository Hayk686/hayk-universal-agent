import { Outlet, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const DASHBOARD_PATHS = new Set(["/", "/chat"]);

export function Layout() {
  const location = useLocation();
  const isDashboard = DASHBOARD_PATHS.has(location.pathname);

  if (isDashboard) {
    return (
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground"
        data-app="hayk-dashboard-shell"
      >
        <Outlet />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col bg-background text-foreground"
      data-app="hayk-dashboard-shell"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-card/40 px-4 backdrop-blur-xl">
        <Button variant="ghost" size="sm" asChild className="rounded-lg">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <span className="text-sm font-medium text-muted-foreground">Hermes</span>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6" data-shell-main>
        <Outlet />
      </main>
    </div>
  );
}
