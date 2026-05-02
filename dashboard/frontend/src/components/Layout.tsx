import { Outlet } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const { theme, toggle } = useTheme();
  return (
    <div
      className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      data-app="hayk-dashboard-shell"
    >
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-end px-4 gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
            Theme: {theme}
          </span>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            data-shell-theme-toggle
          >
            Toggle dark / light
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto" data-shell-main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
