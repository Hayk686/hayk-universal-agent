/**
 * Canonical nav — keep paths stable when importing a Lovable UI.
 * `id` is stable for tests and CSS hooks.
 */
export type NavRoute = {
  id: string;
  path: string;
  label: string;
  end?: boolean;
};

export const NAV_ROUTES: NavRoute[] = [
  { id: "dashboard", path: "/", label: "Dashboard", end: true },
  { id: "files", path: "/files", label: "Files", end: true },
  { id: "agents", path: "/agents", label: "AGENTS.md", end: true },
  { id: "playbooks", path: "/playbooks", label: "Playbooks", end: false },
  { id: "hermes", path: "/hermes", label: "Hermes", end: true },
  { id: "chat", path: "/chat", label: "Agent Chat", end: true },
  { id: "logs", path: "/logs", label: "Logs", end: true },
  { id: "settings", path: "/settings", label: "Settings", end: true },
];
