"use client";

import { useState } from "react";
import { Menu, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";

interface MobileNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    role: string;
  };
}

export function MobileNav({ user }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex h-[60px] items-center justify-between border-b bg-card px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/30">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-foreground">TrustTrack</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationsBell role={user.role} />
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-72 transform transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) {
            setOpen(false);
          }
        }}
      >
        <div className="absolute right-2 top-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Sidebar user={user} />
      </div>
    </>
  );
}
