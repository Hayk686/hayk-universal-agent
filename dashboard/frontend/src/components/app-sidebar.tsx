import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  FileEdit,
  BookOpen,
  Cpu,
  MessageSquare,
  ScrollText,
  Settings as SettingsIcon,
  Bot,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { SourceModeBadge } from "@/components/source-mode-badge";

type NavItem = { id: string; title: string; path: string; icon: LucideIcon; end?: boolean };

const overview: NavItem[] = [
  { id: "dashboard", title: "Dashboard", path: "/", icon: LayoutDashboard, end: true },
];

const workspace: NavItem[] = [
  { id: "files", title: "Files", path: "/files", icon: FolderOpen, end: true },
  { id: "agents", title: "AGENTS.md", path: "/agents", icon: FileEdit, end: true },
  { id: "playbooks", title: "Playbooks", path: "/playbooks", icon: BookOpen, end: false },
];

const runtime: NavItem[] = [
  { id: "hermes", title: "Hermes", path: "/hermes", icon: Cpu, end: true },
  { id: "chat", title: "Agent Chat", path: "/chat", icon: MessageSquare, end: true },
  { id: "logs", title: "Logs", path: "/logs", icon: ScrollText, end: true },
  { id: "settings", title: "Settings", path: "/settings", icon: SettingsIcon, end: true },
];

const groups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: overview },
  { label: "Workspace", items: workspace },
  { label: "Runtime", items: runtime },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (path: string, end?: boolean) =>
    end ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <Sidebar collapsible="icon" data-shell-sidebar className="border-r border-sidebar-border/80">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-gradient-to-br from-primary/35 to-primary/5 text-primary shadow-[var(--shadow-glow-primary)]">
            <Bot className="h-4 w-4" />
            <Sparkles className="absolute -right-0.5 -top-0.5 h-3 w-3 text-primary/85" aria-hidden />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold tracking-tight">Hayk</span>
              <span className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Universal Agent
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/90">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu data-nav-group={group.label}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path, item.end ?? true);
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="rounded-lg"
                      >
                        <NavLink to={item.path} end={item.end ?? true} data-nav-item={item.id}>
                          <Icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/80">
        {collapsed ? (
          <div className="flex justify-center py-1.5">
            <SourceModeBadge />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Mode
            </span>
            <SourceModeBadge />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
