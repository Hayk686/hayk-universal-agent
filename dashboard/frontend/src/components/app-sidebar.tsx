import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Settings as SettingsIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = { id: string; title: string; path: string; icon: LucideIcon; end?: boolean };

const main: NavItem[] = [
  { id: "chat", title: "Chat", path: "/chat", icon: MessageSquare, end: true },
  { id: "dashboard", title: "Status", path: "/", icon: LayoutDashboard, end: true },
  { id: "settings", title: "Settings", path: "/settings", icon: SettingsIcon, end: true },
];

const groups: { label: string; items: NavItem[] }[] = [
  { label: "Main", items: main },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (path: string, end?: boolean) =>
    end ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <Sidebar collapsible="icon" data-shell-sidebar className="border-r border-sidebar-border/70">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-[var(--shadow-soft)]">
            H
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold tracking-tight">Hayk Agent</span>
              <span className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Personal AI
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="pt-3">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-3">
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
                        className="h-10 rounded-lg"
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
    </Sidebar>
  );
}
