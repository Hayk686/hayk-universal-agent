import { Outlet } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { SourceModeBadge } from "@/components/source-mode-badge";

export function Layout() {
  const { theme, toggle } = useTheme();
  return (
    <SidebarProvider>
      <div
        className="flex min-h-[100dvh] w-full bg-background text-foreground"
        data-app="hayk-dashboard-shell"
      >
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="shrink-0" />
              <Separator orientation="vertical" className="hidden h-6 sm:block" />
              <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
                <span className="truncate font-semibold tracking-tight">Hayk Universal Agent</span>
                <span className="truncate text-muted-foreground">/ Raspberry Pi · Hermes</span>
              </div>
              <span className="truncate text-sm font-semibold tracking-tight sm:hidden">Hayk</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SourceModeBadge />
              <Button variant="outline" size="sm" type="button" onClick={toggle} data-shell-theme-toggle>
                {theme === "dark" ? "Light" : "Dark"}
              </Button>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-6" data-shell-main>
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
