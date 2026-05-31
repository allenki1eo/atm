"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search, ChevronRight, Bell } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Link from "next/link";

const ROUTE_MAP: Record<string, [string, string]> = {
  "/": ["Dashboard", "Overview"],
  "/attendance/today": ["Attendance", "Today"],
  "/attendance/history": ["Attendance", "History"],
  "/attendance/bulk": ["Attendance", "Bulk Mark"],
  "/attendance/edit": ["Attendance", "Edit"],
  "/attendance/import": ["Attendance", "Import"],
  "/attendance/corrections": ["Attendance", "Corrections"],
  "/employees": ["Employees", "List"],
  "/former-employees": ["Employees", "Former Employees"],
  "/companies": ["Employees", "Companies & Sections"],
  "/holidays": ["Employees", "Holidays"],
  "/users": ["Employees", "System Users"],
  "/settings": ["Admin", "Settings"],
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
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 z-30 transition-[width] duration-200 ease-in-out",
          sidebarCollapsed ? "lg:w-[68px]" : "lg:w-[240px]"
        )}
      >
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Main area */}
      <div
        className={cn(
          "flex flex-1 flex-col min-w-0 overflow-hidden transition-[padding-left] duration-200 ease-in-out",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-[240px]"
        )}
      >
        <MobileNav user={user} />

        {/* Desktop top bar */}
        <header className="hidden lg:flex h-[52px] items-center justify-between border-b bg-background/95 backdrop-blur-sm px-6 gap-4 shrink-0 sticky top-0 z-20">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-muted-foreground/70 font-medium shrink-0">{crumbs[0]}</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
            <span className="font-semibold text-foreground truncate">{crumbs[1]}</span>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Search pill */}
            <button className="hidden md:flex items-center gap-2 rounded-full border bg-muted/40 hover:bg-muted/70 px-3.5 h-8 text-sm text-muted-foreground transition-colors select-none">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">Search...</span>
              <div className="flex items-center gap-0.5 ml-1 opacity-60">
                <kbd className="text-[10px] border rounded px-1 py-0.5 font-mono bg-background leading-none">⌘K</kbd>
              </div>
            </button>

            {/* Notification bell */}
            <div className="h-8 w-8 flex items-center justify-center">
              <NotificationsBell role={user.role} />
            </div>

            {/* Avatar — links to /me */}
            <Link href="/me">
              <Avatar className="h-7 w-7 ring-2 ring-border hover:ring-primary/50 transition-all cursor-pointer">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </header>

        <OfflineBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="container mx-auto max-w-7xl p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
