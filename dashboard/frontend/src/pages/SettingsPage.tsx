import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  Lock,
  Monitor,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Terminal,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api, fetchStatus, type StatusOrigin } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";
import type { CommandRunResponse, StatusResponse } from "@/types/api-contract";

type SettingsSection = {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  rows: { label: string; value: string; hint?: string }[];
};

function SectionRow({
  section,
  open,
  onToggle,
  children,
}: {
  section: SettingsSection;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const Icon = section.icon;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <Card className="h-fit w-full self-start overflow-hidden rounded-[1rem] border-border/60 bg-card/65 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-accent/10"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/45 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{section.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{section.subtitle}</span>
        </span>
        <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <CardContent className="space-y-2 border-t border-border/55 bg-background/20 p-3">
          {section.rows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 rounded-xl px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.85fr)] sm:items-start"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                {row.hint && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {row.hint}
                  </p>
                )}
              </div>
              <p className="min-w-0 break-words font-mono text-xs leading-relaxed text-muted-foreground sm:text-right">
                {row.value}
              </p>
            </div>
          ))}
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [statusOrigin, setStatusOrigin] = useState<StatusOrigin | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [cmdOut, setCmdOut] = useState<Record<number, CommandRunResponse>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    assistant: true,
    advanced: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchStatus();
        setStatus(r.data);
        setStatusOrigin(r.origin);
      } catch {
        setStatus(null);
        setStatusOrigin(null);
      }

      try {
        const whitelist = await api.getCommandWhitelist();
        setCommands(whitelist.commands);
      } catch {
        setCommands([]);
      }
    })();
  }, []);

  async function run(idx: number, command: string) {
    try {
      const result = await api.runWhitelistedCommand(command);
      setCmdOut((prev) => ({ ...prev, [idx]: result }));
    } catch (e) {
      setCmdOut((prev) => ({
        ...prev,
        [idx]: {
          exitCode: -1,
          output: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  function sectionActions(id: string): ReactNode {
    if (id === "appearance") {
      return (
        <div className="flex flex-wrap gap-2 border-t border-border/55 px-2 pt-3">
          <Button
            type="button"
            size="sm"
            variant={theme === "dark" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
          >
            Dark
          </Button>
          <Button
            type="button"
            size="sm"
            variant={theme === "light" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
          >
            Light
          </Button>
        </div>
      );
    }

    if (id === "memory") {
      return (
        <div className="flex flex-wrap gap-2 border-t border-border/55 px-2 pt-3">
          <Button type="button" size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/chat">Open Chat</Link>
          </Button>
        </div>
      );
    }

    if (id === "workspace") {
      return (
        <div className="flex flex-wrap gap-2 border-t border-border/55 px-2 pt-3">
          <Button type="button" size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/files">Open Files</Link>
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/agents">Agent Rules</Link>
          </Button>
        </div>
      );
    }

    if (id === "privacy") {
      return (
        <div className="flex flex-wrap gap-2 border-t border-border/55 px-2 pt-3">
          <Button type="button" size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/agents">Review Rules</Link>
          </Button>
        </div>
      );
    }

    return null;
  }

  const sections: SettingsSection[] = [
    {
      id: "assistant",
      icon: Bot,
      title: "Assistant",
      subtitle: "Behavior, tone and default mode",
      rows: [
        {
          label: "Agent name",
          value: status?.agentName ?? "Hayk Agent",
          hint: "Shown across the dashboard shell.",
        },
        {
          label: "Default workflow",
          value: "Chat first",
          hint: "The main surface stays focused on conversation.",
        },
        {
          label: "Modes",
          value: "Fast / Web / Session",
          hint: "Preserved chat mode selection.",
        },
      ],
    },
    {
      id: "memory",
      icon: Database,
      title: "Sessions & Memory",
      subtitle: "Session retention and local memory",
      rows: [
        {
          label: "Recent chats",
          value: "Hermes sessions",
          hint: "Loaded, resumed and deleted from Chat.",
        },
        {
          label: "Local history",
          value: "Browser storage",
          hint: "Used for the visible conversation history.",
        },
      ],
    },
    {
      id: "privacy",
      icon: Lock,
      title: "Privacy",
      subtitle: "Data handling and local security",
      rows: [
        {
          label: "Backend origin",
          value: statusOrigin === "live" ? "Live local API" : "Preview / offline",
        },
        {
          label: "Secrets",
          value: "Hidden from UI",
          hint: "The dashboard does not render secret values.",
        },
      ],
    },
    {
      id: "appearance",
      icon: Eye,
      title: "Appearance",
      subtitle: "Theme, text size and display",
      rows: [
        {
          label: "Theme",
          value: "Light / Dark",
          hint: "Controlled from the shell toggle.",
        },
        {
          label: "Layout",
          value: "Responsive app shell",
          hint: "Desktop rail and mobile bottom navigation.",
        },
      ],
    },
    {
      id: "workspace",
      icon: Monitor,
      title: "Workspace",
      subtitle: "Paths, file handling and storage",
      rows: [
        {
          label: "Workspace path",
          value: status?.workspacePath ?? "Loading...",
        },
        {
          label: "Python environment",
          value: status?.venv.pythonPath ?? "Loading...",
          hint: status?.venv.existsAndExecutable ? "Executable" : "Needs attention",
        },
        {
          label: "Chat timeout",
          value: `${status?.chatTimeoutSeconds ?? 300}s`,
        },
      ],
    },
    {
      id: "advanced",
      icon: SlidersHorizontal,
      title: "Advanced",
      subtitle: "Technical options for power users",
      rows: [
        {
          label: "Command access",
          value: "Whitelisted",
        },
        {
          label: "Path access",
          value: "Workspace sandbox",
        },
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5" data-page-shell>
      <div className="flex items-center justify-between gap-4 px-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Settings</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SettingsIcon className="h-4 w-4" />
          <span>{statusOrigin === "live" ? "Local backend" : "Preview"}</span>
        </div>
      </div>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <SectionRow
            key={section.id}
            section={section}
            open={!!openSections[section.id]}
            onToggle={() =>
              setOpenSections((prev) => ({
                ...prev,
                [section.id]: !prev[section.id],
              }))
            }
          >
            {sectionActions(section.id)}
          </SectionRow>
        ))}
      </section>

      <Card
        className={cn(
          "overflow-hidden rounded-[1rem] border-border/60 bg-card/65 shadow-[var(--shadow-soft)] backdrop-blur-xl",
          !openSections.advanced && "hidden",
        )}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Terminal className="h-4 w-4 text-primary" />
            Command whitelist
          </div>

          {commands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commands are available.</p>
          ) : (
            <ul className="space-y-2">
              {commands.map((command, index) => (
                <li
                  key={command}
                  className="rounded-xl border border-border/60 bg-background/35 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <code className="break-all text-xs text-muted-foreground">{command}</code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => void run(index, command)}
                    >
                      Run
                    </Button>
                  </div>
                  {cmdOut[index] && (
                    <pre className="log-box mt-2 max-h-48 overflow-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-xs">
                      exit {cmdOut[index].exitCode}
                      {"\n"}
                      {cmdOut[index].output}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
