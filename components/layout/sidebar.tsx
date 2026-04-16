"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  DollarSign,
  UserCircle,
  LogOut,
  ChevronRight,
  Shield,
  Building2,
  Palmtree,
  Upload,
  UserCog,
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
  badge?: string;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashibodi", icon: LayoutDashboard, roles: ["supervisor", "hr", "admin"] },
  { href: "/attendance/today", label: "Mahudhurio ya Leo", icon: ClipboardList, roles: ["supervisor", "hr", "admin"] },
  { href: "/attendance/history", label: "Historia ya Mahudhurio", icon: Calendar, roles: ["supervisor", "hr", "admin"] },
  { href: "/attendance/import", label: "Ingiza Mahudhurio", icon: Upload, roles: ["admin"] },
  { href: "/employees", label: "Wafanyakazi", icon: Users, roles: ["hr", "admin"] },
  { href: "/companies", label: "Makampuni & Sehemu", icon: Building2, roles: ["admin"] },
  { href: "/users", label: "Watumiaji wa Mfumo", icon: UserCog, roles: ["admin"] },
  { href: "/leave", label: "Likizo", icon: Palmtree, roles: ["supervisor", "hr", "admin", "employee"] },
  { href: "/advances", label: "Mikopo", icon: DollarSign, roles: ["hr", "admin"] },
  { href: "/payroll/periods", label: "Vipindi vya Mshahara", icon: DollarSign, roles: ["hr", "admin"] },
  { href: "/payroll/casual", label: "Mshahara wa Mkataba", icon: DollarSign, roles: ["hr", "admin"] },
  { href: "/me", label: "Dashibodi Yangu", icon: UserCircle, roles: ["supervisor", "hr", "admin", "employee"] },
];

interface SidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const filteredNavItems = navItems.filter((item) => item.roles.includes(user.role));

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

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
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge className="text-xs" variant="secondary">
                      {item.badge}
                    </Badge>
                  )}
                  {isActive && <ChevronRight className="h-3 w-3 opacity-50" />}
                </Link>
              </li>
            );
          })}
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
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
