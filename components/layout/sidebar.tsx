"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Calendar, CalendarDays, ClipboardList, ClipboardEdit,
  DollarSign, UserCircle, LogOut, Shield, Building2, Palmtree,
  Upload, UserCog, Megaphone, MessageSquareWarning, Clock, PanelLeftOpen,
  PanelLeftClose, UserX, CalendarRange, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  href: "/me", label: "Akaunti Yangu", icon: UserCircle,
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

const roleColors: Record<string, string> = {
  admin:      "bg-violet-500/20 text-violet-300",
  hr:         "bg-blue-500/20 text-blue-300",
  supervisor: "bg-emerald-500/20 text-emerald-300",
  employee:   "bg-slate-500/20 text-slate-300",
};

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
            "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-150",
            collapsed ? "justify-center h-9 w-9 mx-auto" : "gap-2.5 px-3 py-2",
            active
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/55 hover:bg-white/6 hover:text-white/90"
          )}
        >
          {/* Active left-bar indicator */}
          {active && !collapsed && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
          )}

          <item.icon className={cn("shrink-0 transition-colors", collapsed ? "h-4.5 w-4.5" : "h-4 w-4", active ? "text-primary" : "")} />

          {!collapsed && (
            <>
              <span className="flex-1 leading-none">{item.label}</span>
              {count > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                  {count}
                </span>
              )}
            </>
          )}

          {/* Collapsed dot indicator */}
          {collapsed && count > 0 && (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
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
        <li key={group.id} className="mt-3">
          <div className="mx-auto mb-1.5 h-px w-6 bg-white/10 rounded" />
          <ul className="space-y-0.5 flex flex-col items-center">
            {visibleItems.map(renderItem)}
          </ul>
        </li>
      );
    }

    return (
      <li key={group.id} className="mt-5">
        <div className="flex items-center justify-between px-3 mb-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 select-none">
            {group.label}
          </p>
          {badges > 0 && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive/80 px-1 text-[10px] font-bold text-white">
              {badges}
            </span>
          )}
        </div>
        <ul className="space-y-0.5">
          {visibleItems.map(renderItem)}
        </ul>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "hsl(224 71% 9%)" }}>

      {/* ── Branding ──────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center border-b shrink-0",
        "border-white/8",
        collapsed ? "justify-center px-3 py-4 gap-0" : "gap-3 px-5 py-4"
      )}>
        {/* Logo mark */}
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/30">
          <Shield className="h-4 w-4 text-white" />
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-white/35 leading-none tracking-wide uppercase">
              Attendance
            </p>
            <p className="text-sm font-bold text-white leading-snug tracking-tight">
              TrustTrack
            </p>
          </div>
        )}

        {/* Collapse toggle */}
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? "Onyesha sidebar" : "Ficha sidebar"}
            className={cn(
              "hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/8 hover:text-white/70",
              collapsed && "mt-1 ml-0"
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        <ul className="space-y-0.5">
          {/* Dashboard standalone */}
          {standaloneTop.roles.includes(user.role) && (
            <>
              {!collapsed && (
                <li>
                  <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 select-none">
                    Menyu Kuu
                  </p>
                </li>
              )}
              {renderItem(standaloneTop)}
            </>
          )}

          {/* Groups */}
          {navGroups.map(renderGroup)}

          {/* My Account standalone */}
          {standaloneBottom.roles.includes(user.role) && (
            <li className="mt-5">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 select-none">
                  Akaunti
                </p>
              )}
              {renderItem(standaloneBottom)}
            </li>
          )}
        </ul>
      </nav>

      {/* ── User card ─────────────────────────────────────────────────────── */}
      <div className={cn(
        "shrink-0 border-t border-white/8",
        collapsed ? "px-2 py-3" : "px-3 py-3"
      )}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-white text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/35 hover:bg-white/8 hover:text-white/70 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="rounded-lg bg-white/5 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate leading-snug">
                  {user.name}
                </p>
                <span className={cn(
                  "inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize leading-none mt-0.5",
                  roleColors[user.role] ?? "bg-white/10 text-white/60"
                )}>
                  {user.role}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Sign out"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/35 hover:bg-white/10 hover:text-white/70 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
