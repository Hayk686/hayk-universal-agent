import { NavLink, Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, MessageSquare, Settings as SettingsIcon } from "lucide-react";

const mobileNav = [
  { label: "Chat", path: "/chat", icon: MessageSquare },
  { label: "Status", path: "/", icon: LayoutDashboard },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

export function Layout() {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const isChatPage = location.pathname === "/chat";
  const mainClassName = isChatPage
    ? "flex-1 min-h-0 overflow-hidden p-3 pb-[5.5rem] sm:p-6 sm:pb-6"
    : "flex-1 min-h-0 overflow-auto p-3 pb-28 sm:p-6 sm:pb-6";

  return (
    <SidebarProvider>
      <div
        className="flex min-h-[100dvh] w-full bg-background text-foreground"
        data-app="hayk-dashboard-shell"
      >
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/55 bg-background/82 px-4 backdrop-blur-xl sm:h-20 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="shrink-0" />
              <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-[var(--shadow-soft)] sm:flex">
                H
              </div>
              <div className="min-w-0">
                <span className="block truncate text-base font-semibold tracking-tight text-foreground sm:text-2xl">
                  Hayk Agent
                </span>
                <span className="hidden truncate text-xs text-muted-foreground sm:block">
                  Personal AI for thoughtful work, built to stay local.
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" type="button" className="rounded-full" onClick={toggle} data-shell-theme-toggle>
                {theme === "dark" ? "Light" : "Dark"}
              </Button>
            </div>
          </header>
          <main className={mainClassName} data-shell-main>
            <Outlet />
          </main>
          <nav className="fixed inset-x-3 bottom-3 z-30 rounded-3xl border border-border/60 bg-card/90 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur-xl md:hidden">
            <div className="grid grid-cols-3 gap-1">
              {mobileNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      [
                        "flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      ].join(" ")
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
