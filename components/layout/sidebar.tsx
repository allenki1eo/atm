"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Calendar, CalendarDays, ClipboardList, ClipboardEdit,
  DollarSign, UserCircle, LogOut, Shield, Building2, Palmtree,
  Upload, UserCog, Megaphone, MessageSquareWarning, Clock, PanelLeftOpen,
  PanelLeftClose, UserX, Settings, CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  badgeKey?: "announcements" | "complaints" | "corrections";
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const standaloneTop: NavItem = {
  href: "/", label: "Dashibodi", icon: LayoutDashboard,
  roles: ["supervisor", "hr", "admin"],
};

const standaloneBottom: NavItem = {
  href: "/me", label: "Dashibodi Yangu", icon: UserCircle,
  roles: ["supervisor", "hr", "admin", "employee"],
};

const navGroups: NavGroup[] = [
  {
    id: "attendance",
    label: "Mahudhurio",
    icon: ClipboardList,
    items: [
      { href: "/attendance/today",       label: "Leo",           icon: ClipboardList,  roles: ["supervisor", "hr", "admin"] },
      { href: "/attendance/history",     label: "Historia",      icon: Calendar,       roles: ["supervisor", "hr", "admin"] },
      { href: "/attendance/bulk",        label: "Weka Wingi",    icon: CalendarRange,  roles: ["admin"] },
      { href: "/attendance/edit",        label: "Hariri",        icon: CalendarDays,   roles: ["admin"] },
      { href: "/attendance/import",      label: "Ingiza",        icon: Upload,         roles: ["admin"] },
      { href: "/attendance/corrections", label: "Marekebisho",   icon: ClipboardEdit,  roles: ["supervisor", "hr", "admin"], badgeKey: "corrections" },
    ],
  },
  {
    id: "employees",
    label: "Wafanyakazi",
    icon: Users,
    items: [
      { href: "/employees",        label: "Wafanyakazi",           icon: Users,        roles: ["hr", "admin"] },
      { href: "/former-employees", label: "Wafanyakazi wa Zamani", icon: UserX,        roles: ["hr", "admin"] },
      { href: "/companies",        label: "Makampuni & Sehemu",    icon: Building2,    roles: ["admin"] },
      { href: "/holidays",         label: "Sikukuu",               icon: CalendarDays, roles: ["hr", "admin"] },
      { href: "/users",            label: "Watumiaji wa Mfumo",    icon: UserCog,      roles: ["admin"] },
      { href: "/settings",         label: "Mipangilio",            icon: Settings,     roles: ["admin"] },
    ],
  },
  {
    id: "payroll",
    label: "Mishahara",
    icon: DollarSign,
    items: [
      { href: "/payroll/periods", label: "Vipindi vya Mshahara", icon: DollarSign, roles: ["hr", "admin"] },
      { href: "/payroll/casual",  label: "Mshahara wa Mkataba",  icon: DollarSign, roles: ["hr", "admin"] },
      { href: "/overtime",        label: "Overtime / Ziada",     icon: Clock,      roles: ["hr", "admin"] },
      { href: "/advances",        label: "Salary Advance",       icon: DollarSign, roles: ["hr", "admin"] },
    ],
  },
  {
    id: "communication",
    label: "Mawasiliano",
    icon: Megaphone,
    items: [
      { href: "/leave",         label: "Likizo",     icon: Palmtree,             roles: ["supervisor", "hr", "admin", "employee"] },
      { href: "/announcements", label: "Matangazo",  icon: Megaphone,            roles: ["supervisor", "hr", "admin", "employee"], badgeKey: "announcements" },
      { href: "/complaints",    label: "Malalamiko", icon: MessageSquareWarning, roles: ["hr", "admin", "employee"], badgeKey: "complaints" },
    ],
  },
];

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: string };
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ user, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();

  const { data: unreadAnnouncements } = useQuery({
    queryKey: ["sidebar", "announcements-unread"],
    queryFn: async () => {
      const res = await fetch("/api/announcements?unread=1");
      if (!res.ok) return [];
      return (await res.json()) as unknown[];
    },
    refetchInterval: 60_000,
  });

  const { data: openComplaints } = useQuery({
    queryKey: ["sidebar", "complaints-open"],
    queryFn: async () => {
      const res = await fetch("/api/complaints");
      if (!res.ok) return [];
      const rows = (await res.json()) as { status: string; response: string | null }[];
      const activeStatuses = ["received", "in_review", "awaiting_employee", "open"];
      if (user.role === "hr" || user.role === "admin") {
        return rows.filter((r) => activeStatuses.includes(r.status));
      }
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return rows.filter((r) => {
        const resolved = r as { status: string; response: string | null; responded_at?: string };
        if (!["closed", "resolved"].includes(resolved.status) || !resolved.response || !resolved.responded_at) return false;
        return new Date(resolved.responded_at).getTime() > sevenDaysAgo;
      });
    },
    refetchInterval: 60_000,
    enabled: user.role === "hr" || user.role === "admin" || user.role === "employee",
  });

  const { data: pendingCorrections } = useQuery({
    queryKey: ["sidebar", "corrections-pending"],
    queryFn: async () => {
      const res = await fetch("/api/attendance-corrections?status=pending");
      if (!res.ok) return [];
      return (await res.json()) as unknown[];
    },
    refetchInterval: 60_000,
    enabled: user.role === "supervisor" || user.role === "hr" || user.role === "admin",
  });

  const badgeFor = (key?: "announcements" | "complaints" | "corrections") => {
    if (key === "announcements") return unreadAnnouncements?.length ?? 0;
    if (key === "complaints") return openComplaints?.length ?? 0;
    if (key === "corrections") return pendingCorrections?.length ?? 0;
    return 0;
  };

  const isItemActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const groupBadgeCount = (group: NavGroup) =>
    group.items.reduce((sum, item) => sum + badgeFor(item.badgeKey), 0);

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const renderItem = (item: NavItem) => {
    if (!item.roles.includes(user.role)) return null;
    const active = isItemActive(item.href);
    const count = badgeFor(item.badgeKey);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={cn(
            "relative flex items-center rounded-md py-2 text-sm font-medium transition-colors",
            collapsed ? "justify-center px-2" : "gap-3 px-3",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="flex-1">{item.label}</span>}
          {count > 0 && (
            collapsed
              ? <span className="absolute ml-5 mt-[-1rem] h-2 w-2 rounded-full bg-destructive" />
              : <Badge className="text-xs" variant="destructive">{count}</Badge>
          )}
        </Link>
      </li>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const visibleItems = group.items.filter((i) => i.roles.includes(user.role));
    if (visibleItems.length === 0) return null;

    const badges = groupBadgeCount(group);

    if (collapsed) {
      return (
        <li key={group.id} className="mt-2">
          <ul className="space-y-0.5">
            {visibleItems.map(renderItem)}
          </ul>
        </li>
      );
    }

    return (
      <li key={group.id} className="mt-5">
        {/* Static section label */}
        <div className="flex items-center justify-between px-3 mb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            {group.label}
          </p>
          {badges > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1 min-w-[1rem] flex items-center justify-center">
              {badges}
            </Badge>
          )}
        </div>
        <ul className="space-y-0.5">
          {visibleItems.map(renderItem)}
        </ul>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col bg-sidebar-background text-sidebar-foreground">
      {/* Logo / branding */}
      <div
        className={cn(
          "relative flex items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-3 py-4" : "gap-3 px-6 py-5"
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
          <Shield className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-xs text-sidebar-foreground/50 leading-none mb-0.5">
              System
            </p>
            <p className="text-sm font-bold text-sidebar-foreground leading-none">
              TrustTrack
            </p>
          </div>
        )}
        {onToggleCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "hidden lg:inline-flex text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
              collapsed && "absolute left-14 top-4 h-8 w-8"
            )}
            onClick={onToggleCollapsed}
            title={collapsed ? "Onyesha sidebar" : "Ficha sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        <ul className="space-y-0.5">
          {/* Dashboard — standalone top */}
          {standaloneTop.roles.includes(user.role) && (
            <>
              {!collapsed && (
                <li>
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                    Main Menu
                  </p>
                </li>
              )}
              {renderItem(standaloneTop)}
            </>
          )}

          {/* Grouped sections */}
          {navGroups.map(renderGroup)}

          {/* My Dashboard — standalone bottom */}
          {standaloneBottom.roles.includes(user.role) && (
            <li className="mt-5">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  My Account
                </p>
              )}
              {renderItem(standaloneBottom)}
            </li>
          )}
        </ul>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User info */}
      <div className={cn("p-4", collapsed && "px-2")}>
        <div className={cn("flex items-center mb-3", collapsed ? "justify-center" : "gap-3")}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{user.role}</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
            collapsed ? "justify-center px-2" : "justify-start"
          )}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
          {!collapsed && "Sign out"}
        </Button>
      </div>
    </div>
  );
}
