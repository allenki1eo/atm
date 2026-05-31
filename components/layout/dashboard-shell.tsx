"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Link from "next/link";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/attendance/today": "Mahudhurio ya Leo",
  "/attendance/history": "Historia ya Mahudhurio",
  "/attendance/bulk": "Weka Mahudhurio ya Wingi",
  "/attendance/edit": "Hariri Mahudhurio",
  "/attendance/import": "Ingiza Mahudhurio",
  "/attendance/corrections": "Marekebisho",
  "/employees": "Wafanyakazi",
  "/former-employees": "Wafanyakazi wa Zamani",
  "/companies": "Makampuni & Sehemu",
  "/holidays": "Sikukuu",
  "/users": "Watumiaji wa Mfumo",
  "/settings": "Mipangilio",
  "/payroll/periods": "Vipindi vya Mshahara",
  "/payroll/casual": "Mshahara wa Mkataba",
  "/overtime": "Overtime / Ziada",
  "/advances": "Salary Advance",
  "/leave": "Maombi ya Likizo",
  "/announcements": "Matangazo",
  "/complaints": "Malalamiko",
  "/me": "Akaunti Yangu",
};

interface DashboardShellProps {
  user: { name?: string | null; email?: string | null; role: string };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  const pageTitle = ROUTE_TITLES[pathname] ?? "Dashboard";
  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 z-30 transition-[width] duration-200 ease-in-out",
        sidebarCollapsed ? "lg:w-[68px]" : "lg:w-[248px]"
      )}>
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        />
      </aside>

      {/* Main */}
      <div className={cn(
        "flex flex-1 flex-col min-w-0 overflow-hidden transition-[padding-left] duration-200 ease-in-out",
        sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-[248px]"
      )}>
        <MobileNav user={user} />

        {/* Top bar */}
        <header className="hidden lg:flex h-[60px] items-center justify-between bg-background/80 backdrop-blur-md border-b border-border/60 px-6 gap-4 shrink-0 sticky top-0 z-20">
          {/* Page title */}
          <h2 className="text-lg font-bold text-foreground tracking-tight">{pageTitle}</h2>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="hidden md:flex items-center gap-2.5 h-9 px-3.5 rounded-xl border bg-card text-sm text-muted-foreground cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors select-none">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[13px]">Tafuta...</span>
              <kbd className="ml-2 text-[10px] border rounded px-1.5 py-0.5 bg-muted font-mono opacity-60">⌘K</kbd>
            </div>

            {/* Notifications */}
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-card hover:border-primary/40 transition-colors">
              <NotificationsBell role={user.role} />
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-border mx-1" />

            {/* Avatar → /me */}
            <Link href="/me" className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-accent/40 transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-right leading-tight">
                <p className="text-[13px] font-semibold text-foreground leading-none">{user.name}</p>
                <p className="text-[11px] text-muted-foreground capitalize">{user.role}</p>
              </div>
            </Link>
          </div>
        </header>

        <OfflineBanner />

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
