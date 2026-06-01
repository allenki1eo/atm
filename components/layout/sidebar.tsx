"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Calendar, CalendarDays, ClipboardList, ClipboardEdit,
  DollarSign, UserCircle, LogOut, Shield, Building2, Palmtree,
  Upload, UserCog, Megaphone, MessageSquareWarning, Clock, PanelLeftOpen,
  PanelLeftClose, UserX, CalendarRange, Bell, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

const standaloneSettings: NavItem = {
  href: "/settings", label: "Mipangilio", icon: Settings,
  roles: ["supervisor", "hr", "admin", "employee"],
};

const navGroups: NavGroup[] = [
  {
    id: "attendance",
    label: "Mahudhurio",
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

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const totalBadges = (unreadAnnouncements?.length ?? 0) + (openComplaints?.length ?? 0) + (pendingCorrections?.length ?? 0);

  const renderItem = (item: NavItem) => {
    if (!item.roles.includes(user.role)) return null;
    const active = isActive(item.href);
    const count = badgeFor(item.badgeKey);

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={cn(
            "flex items-center rounded-xl text-sm font-medium transition-all duration-150 group",
            collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2.5",
            active
              ? "bg-primary/10 text-primary font-semibold"
              : "text-sidebar-foreground/60 hover:bg-muted/60 hover:text-sidebar-foreground"
          )}
        >
          <span className={cn(
            "flex items-center justify-center rounded-lg shrink-0 transition-colors",
            collapsed ? "h-5 w-5" : "h-5 w-5",
            active ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
          )}>
            <item.icon className="h-[18px] w-[18px]" />
          </span>

          {!collapsed && (
            <>
              <span className="flex-1 leading-none">{item.label}</span>
              {count > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                  {count}
                </span>
              )}
            </>
          )}

          {collapsed && count > 0 && (
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-primary border-2 border-white" />
          )}
        </Link>
      </li>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const visibleItems = group.items.filter((i) => i.roles.includes(user.role));
    if (visibleItems.length === 0) return null;

    return (
      <li key={group.id} className="mt-5">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70 select-none">
            {group.label}
          </p>
        )}
        {collapsed && <div className="mx-auto mb-1 h-px w-5 bg-border" />}
        <ul className="space-y-0.5">
          {visibleItems.map(renderItem)}
        </ul>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col bg-sidebar-background border-r border-sidebar-border">

      {/* ── Branding ──────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border shrink-0",
        collapsed ? "justify-center px-3 py-4" : "px-5 py-4 gap-3"
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/30">
          <Shield className="h-[18px] w-[18px] text-white" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider leading-none mb-0.5">
              Platform
            </p>
            <p className="text-sm font-bold text-sidebar-foreground leading-none tracking-tight">
              TrustTrack
            </p>
          </div>
        )}
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? "Onyesha" : "Ficha"}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-1.5" : "px-3")}>
        <ul className="space-y-0.5">
          {standaloneTop.roles.includes(user.role) && (
            <>
              {!collapsed && (
                <li>
                  <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70 select-none">
                    Menyu Kuu
                  </p>
                </li>
              )}
              {renderItem(standaloneTop)}
            </>
          )}

          {navGroups.map(renderGroup)}

          {(standaloneSettings.roles.includes(user.role) || standaloneBottom.roles.includes(user.role)) && (
            <li className="mt-5">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70 select-none">
                  Akaunti
                </p>
              )}
              {collapsed && <div className="mx-auto mb-1 h-px w-5 bg-border" />}
              <ul className="space-y-0.5">
                {renderItem(standaloneSettings)}
                {renderItem(standaloneBottom)}
              </ul>
            </li>
          )}
        </ul>
      </nav>

      {/* ── User footer ───────────────────────────────────────────────────── */}
      <div className={cn("shrink-0 border-t border-sidebar-border", collapsed ? "px-1.5 py-3" : "px-3 py-3")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate leading-snug">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
            {totalBadges > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shrink-0">
                {totalBadges > 9 ? "9+" : totalBadges}
              </span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
