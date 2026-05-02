import { NavLink } from "react-router-dom";
import { cn } from "../lib/format";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/files", label: "Files" },
  { to: "/agents", label: "AGENTS.md" },
  { to: "/playbooks", label: "Playbooks" },
  { to: "/hermes", label: "Hermes" },
  { to: "/logs", label: "Logs" },
  { to: "/settings", label: "Settings" },
] as const;

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Hayk
        </div>
        <div className="font-semibold text-sm leading-tight">Universal Agent</div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={
              l.to === "/"
                ? true
                : l.to === "/playbooks"
                  ? false
                  : true
            }
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
