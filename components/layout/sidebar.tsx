"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Calendar, CalendarDays, ClipboardList, ClipboardEdit,
  DollarSign, UserCircle, LogOut, ChevronDown, Shield, Building2, Palmtree,
  Upload, UserCog, Megaphone, MessageSquareWarning, Clock,
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
      { href: "/attendance/today",       label: "Leo",             icon: ClipboardList,  roles: ["supervisor", "hr", "admin"] },
      { href: "/attendance/history",     label: "Historia",        icon: Calendar,       roles: ["supervisor", "hr", "admin"] },
      { href: "/attendance/edit",        label: "Hariri",          icon: CalendarDays,   roles: ["admin"] },
      { href: "/attendance/import",      label: "Ingiza",          icon: Upload,         roles: ["admin"] },
      { href: "/attendance/corrections", label: "Marekebisho",     icon: ClipboardEdit,  roles: ["supervisor", "hr", "admin"], badgeKey: "corrections" },
    ],
  },
  {
    id: "employees",
    label: "Wafanyakazi",
    icon: Users,
    items: [
      { href: "/employees", label: "Wafanyakazi",        icon: Users,      roles: ["hr", "admin"] },
      { href: "/companies",  label: "Makampuni & Sehemu", icon: Building2,  roles: ["admin"] },
      { href: "/holidays",   label: "Sikukuu",            icon: CalendarDays, roles: ["hr", "admin"] },
      { href: "/users",      label: "Watumiaji wa Mfumo", icon: UserCog,    roles: ["admin"] },
    ],
  },
  {
    id: "payroll",
    label: "Mishahara",
    icon: DollarSign,
    items: [
      { href: "/payroll/periods", label: "Vipindi vya Mshahara",  icon: DollarSign, roles: ["hr", "admin"] },
      { href: "/payroll/casual",  label: "Mshahara wa Mkataba",   icon: DollarSign, roles: ["hr", "admin"] },
      { href: "/overtime",        label: "Overtime / Ziada",      icon: Clock,      roles: ["hr", "admin"] },
      { href: "/advances",        label: "Salary Advance",        icon: DollarSign, roles: ["hr", "admin"] },
    ],
  },
  {
    id: "communication",
    label: "Mawasiliano",
    icon: Megaphone,
    items: [
      { href: "/leave",         label: "Likizo",     icon: Palmtree,           roles: ["supervisor", "hr", "admin", "employee"] },
      { href: "/announcements", label: "Matangazo",  icon: Megaphone,          roles: ["supervisor", "hr", "admin", "employee"], badgeKey: "announcements" },
      { href: "/complaints",    label: "Malalamiko", icon: MessageSquareWarning, roles: ["hr", "admin", "employee"], badgeKey: "complaints" },
    ],
  },
];

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: string };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  // Initialise all groups open; user can collapse
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(navGroups.map((g) => g.id))
  );

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Badge queries
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
      if (user.role === "hr" || user.role === "admin") return rows.filter((r) => r.status === "open");
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return rows.filter((r) => {
        const resolved = r as { status: string; response: string | null; responded_at?: string };
        if (resolved.status !== "resolved" || !resolved.response || !resolved.responded_at) return false;
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
    if (key === "complaints")    return openComplaints?.length ?? 0;
    if (key === "corrections")   return pendingCorrections?.length ?? 0;
    return 0;
  };

  const isItemActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const groupBadgeCount = (group: NavGroup) =>
    group.items.reduce((sum, item) => sum + badgeFor(item.badgeKey), 0);

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => isItemActive(item.href));

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const renderItem = (item: NavItem) => {
    if (!item.roles.includes(user.role)) return null;
    const active = isItemActive(item.href);
    const count  = badgeFor(item.badgeKey);
    return (
      <li key={item.href}>
        <Link href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}>
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {count > 0 && <Badge className="text-xs" variant="destructive">{count}</Badge>}
        </Link>
      </li>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const visibleItems = group.items.filter((i) => i.roles.includes(user.role));
    if (visibleItems.length === 0) return null;

    const isOpen   = openGroups.has(group.id);
    const active   = isGroupActive(group);
    const badges   = groupBadgeCount(group);

    return (
      <li key={group.id}>
        {/* Group header button */}
        <button
          onClick={() => toggleGroup(group.id)}
          className={cn(
            "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
            active
              ? "text-sidebar-foreground bg-sidebar-accent/30"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
          )}>
          <group.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{group.label}</span>
          {!isOpen && badges > 0 && (
            <Badge className="text-xs" variant="destructive">{badges}</Badge>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-60", isOpen && "rotate-180")} />
        </button>

        {/* Children */}
        {isOpen && (
          <ul className="mt-0.5 ml-3 pl-3 border-l border-sidebar-border/50 space-y-0.5">
            {visibleItems.map((item) => {
              const itemActive = isItemActive(item.href);
              const count      = badgeFor(item.badgeKey);
              return (
                <li key={item.href}>
                  <Link href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      itemActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                    )}>
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && <Badge className="text-xs" variant="destructive">{count}</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col bg-sidebar-background text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
          <Shield className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold text-sidebar-foreground">TrustTrack</p>
          <p className="text-xs text-sidebar-foreground/60">Attendance System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {/* Dashboard — standalone top */}
          {standaloneTop.roles.includes(user.role) && renderItem(standaloneTop)}

          {/* Grouped sections */}
          {navGroups.map(renderGroup)}

          {/* My Dashboard — standalone bottom */}
          {standaloneBottom.roles.includes(user.role) && renderItem(standaloneBottom)}
        </ul>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User info */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{user.role}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-4 w-4 mr-2" />Sign out
        </Button>
      </div>
    </div>
  );
}
