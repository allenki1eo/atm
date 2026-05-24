"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Inbox, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROUTE_MAP: Record<string, [string, string]> = {
  "/": ["Dashboard", "Overview"],
  "/attendance/today": ["Attendance", "Today"],
  "/attendance/history": ["Attendance", "History"],
  "/attendance/edit": ["Attendance", "Edit"],
  "/attendance/import": ["Attendance", "Import"],
  "/attendance/corrections": ["Attendance", "Corrections"],
  "/employees": ["Employees", "List"],
  "/former-employees": ["Employees", "Former Employees"],
  "/companies": ["Employees", "Companies & Sections"],
  "/holidays": ["Employees", "Holidays"],
  "/users": ["Employees", "System Users"],
  "/payroll/periods": ["Payroll", "Periods"],
  "/payroll/casual": ["Payroll", "Casual"],
  "/overtime": ["Payroll", "Overtime"],
  "/advances": ["Payroll", "Advances"],
  "/leave": ["Communication", "Leave Requests"],
  "/announcements": ["Communication", "Announcements"],
  "/complaints": ["Communication", "Complaints"],
  "/me": ["My Account", "My Dashboard"],
};

interface DashboardShellProps {
  user: { name?: string | null; email?: string | null; role: string };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  const crumbs = ROUTE_MAP[pathname] ?? ["Dashboard", "Overview"];
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 z-30 transition-[width] duration-200",
          sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"
        )}
      >
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Main content */}
      <div
        className={cn(
          "flex flex-1 flex-col min-w-0 overflow-hidden transition-[padding-left] duration-200",
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64"
        )}
      >
        <MobileNav user={user} />

        {/* Desktop header */}
        <header className="hidden lg:flex h-14 items-center justify-between border-b bg-background px-6 gap-4 shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{crumbs[0]}</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="font-medium text-foreground">{crumbs[1]}</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Search bar */}
            <div className="hidden md:flex items-center gap-2 rounded-lg border bg-muted/40 px-3 h-9 text-sm text-muted-foreground cursor-pointer hover:bg-muted/60 transition-colors select-none">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span>Search...</span>
              <div className="flex items-center gap-0.5 ml-1">
                <kbd className="text-[11px] border rounded px-1 py-0.5 font-mono bg-background leading-none shadow-sm">
                  ⌘
                </kbd>
                <kbd className="text-[11px] border rounded px-1 py-0.5 font-mono bg-background leading-none shadow-sm">
                  K
                </kbd>
              </div>
            </div>

            {/* Notifications */}
            <NotificationsBell role={user.role} />

            {/* Inbox */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground"
            >
              <Inbox className="h-4 w-4" />
            </Button>

            {/* User avatar */}
            <Avatar className="h-8 w-8 ring-2 ring-border cursor-pointer">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        <OfflineBanner />

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
          <div className="container mx-auto max-w-7xl p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
