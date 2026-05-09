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
  { id: "chat", path: "/chat", label: "Chat", end: true },
  { id: "dashboard", path: "/", label: "Status", end: true },
  { id: "settings", path: "/settings", label: "Settings", end: true },
];
