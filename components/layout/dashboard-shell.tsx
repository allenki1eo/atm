"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  user: { name?: string | null; email?: string | null; role: string };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => !current);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 transition-[width] duration-200",
          sidebarCollapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />
      </aside>

      <div
        className={cn(
          "flex flex-1 flex-col min-w-0 overflow-hidden transition-[padding-left] duration-200",
          sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"
        )}
      >
        <MobileNav user={user} />

        <div className="hidden lg:flex h-12 items-center justify-between gap-2 border-b bg-background px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Onyesha sidebar" : "Ficha sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          <NotificationsBell role={user.role} />
        </div>

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
