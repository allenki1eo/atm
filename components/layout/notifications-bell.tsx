"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Megaphone, MessageSquareWarning, Palmtree, DollarSign, ClipboardEdit } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface NotifItem {
  id: string;
  kind: "announcement" | "complaint" | "leave" | "advance" | "correction";
  title: string;
  detail: string;
  time: string;
  href: string;
}

interface BellProps {
  role: string;
}

const iconFor: Record<NotifItem["kind"], React.ElementType> = {
  announcement: Megaphone,
  complaint: MessageSquareWarning,
  leave: Palmtree,
  advance: DollarSign,
  correction: ClipboardEdit,
};

const STATUS_SW: Record<string, string> = {
  present: "Alikuwepo",
  absent: "Hakuwepo",
  late: "Alichelewa",
  half_day: "Nusu siku",
};

export function NotificationsBell({ role }: BellProps) {
  const isHrAdmin = role === "hr" || role === "admin";
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = useCallback(
    (notifId: string) => {
      setDismissed((prev) => new Set(prev).add(notifId));
      // For announcements, mark as read on the server immediately
      if (notifId.startsWith("a-")) {
        const realId = notifId.slice(2);
        fetch(`/api/announcements/${realId}/read`, { method: "POST" }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["bell", "announcements"] });
          queryClient.invalidateQueries({ queryKey: ["sidebar", "announcements-unread"] });
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
        });
      }
    },
    [queryClient]
  );

  const { data: announcements } = useQuery({
    queryKey: ["bell", "announcements"],
    queryFn: async () => {
      const res = await fetch("/api/announcements?unread=1");
      if (!res.ok) return [];
      return (await res.json()) as { id: string; subject: string; message: string; created_at: string }[];
    },
    refetchInterval: 60_000,
  });

  const { data: complaints } = useQuery({
    queryKey: ["bell", "complaints"],
    queryFn: async () => {
      const res = await fetch("/api/complaints");
      if (!res.ok) return [];
      return (await res.json()) as {
        id: string;
        subject: string;
        status: string;
        response: string | null;
        responded_at: string | null;
        created_at: string;
      }[];
    },
    refetchInterval: 60_000,
  });

  const { data: leaveData } = useQuery({
    queryKey: ["bell", "leave"],
    queryFn: async () => {
      const res = await fetch("/api/leave");
      if (!res.ok) return { requests: [] };
      return (await res.json()) as {
        requests: {
          id: string;
          status: string;
          reviewed_at: string | null;
          start_date: string;
          end_date: string;
          days: number;
          review_note: string | null;
        }[];
      };
    },
    refetchInterval: 60_000,
  });

  const { data: advanceRequests } = useQuery({
    queryKey: ["bell", "advance-requests"],
    queryFn: async () => {
      const res = await fetch(isHrAdmin ? "/api/advance-requests?status=pending" : "/api/advance-requests");
      if (!res.ok) return [];
      return (await res.json()) as {
        id: string;
        amount: number;
        status: string;
        reviewed_at: string | null;
        requested_at: string;
        employee_name?: string;
        review_note: string | null;
      }[];
    },
    refetchInterval: 60_000,
  });

  const canReviewCorrections = role === "supervisor" || isHrAdmin;

  const { data: corrections } = useQuery({
    queryKey: ["bell", "corrections"],
    queryFn: async () => {
      const res = await fetch(
        canReviewCorrections ? "/api/attendance-corrections?status=pending" : "/api/attendance-corrections"
      );
      if (!res.ok) return [];
      return (await res.json()) as {
        id: string;
        employee_name?: string;
        date: string;
        requested_status: string;
        status: "pending" | "approved" | "denied";
        created_at: string;
        reviewed_at: string | null;
      }[];
    },
    refetchInterval: 60_000,
  });

  const items = useMemo<NotifItem[]>(() => {
    const list: NotifItem[] = [];

    for (const a of announcements ?? []) {
      list.push({
        id: `a-${a.id}`,
        kind: "announcement",
        title: a.subject,
        detail: a.message.slice(0, 80),
        time: a.created_at,
        href: "/announcements",
      });
    }

    for (const c of complaints ?? []) {
      if (isHrAdmin) {
        if (["received", "in_review", "awaiting_employee", "open"].includes(c.status)) {
          list.push({
            id: `c-${c.id}`,
            kind: "complaint",
            title: `Lalamiko jipya: ${c.subject}`,
            detail: "Bonyeza kujibu",
            time: c.created_at,
            href: "/complaints",
          });
        }
      } else {
        if (
          ["closed", "resolved"].includes(c.status) &&
          c.response &&
          c.responded_at
        ) {
          list.push({
            id: `c-${c.id}`,
            kind: "complaint",
            title: `Jibu: ${c.subject}`,
            detail: c.response.slice(0, 80),
            time: c.responded_at,
            href: "/complaints",
          });
        }
      }
    }

    for (const lr of leaveData?.requests ?? []) {
      if (
        (lr.status === "approved" || lr.status === "denied") &&
        lr.reviewed_at
      ) {
        list.push({
          id: `l-${lr.id}`,
          kind: "leave",
          title: lr.status === "approved" ? "Likizo imeidhinishwa" : "Likizo imekataliwa",
          detail: `${lr.days} siku (${formatDate(lr.start_date)}${lr.review_note ? ` — ${lr.review_note}` : ""})`,
          time: lr.reviewed_at,
          href: "/leave",
        });
      }
    }

    for (const ar of advanceRequests ?? []) {
      if (isHrAdmin) {
        if (ar.status === "pending") {
          list.push({
            id: `ar-${ar.id}`,
            kind: "advance",
            title: `Ombi la mkopo${ar.employee_name ? `: ${ar.employee_name}` : ""}`,
            detail: `TZS ${ar.amount.toLocaleString()}`,
            time: ar.requested_at,
            href: "/advances",
          });
        }
      } else {
        if (
          (ar.status === "approved" || ar.status === "denied") &&
          ar.reviewed_at
        ) {
          list.push({
            id: `ar-${ar.id}`,
            kind: "advance",
            title: ar.status === "approved" ? "Mkopo umeidhinishwa" : "Mkopo umekataliwa",
            detail: `TZS ${ar.amount.toLocaleString()}${ar.review_note ? ` — ${ar.review_note}` : ""}`,
            time: ar.reviewed_at,
            href: "/me",
          });
        }
      }
    }

    for (const cr of corrections ?? []) {
      if (canReviewCorrections) {
        if (cr.status === "pending") {
          list.push({
            id: `cr-${cr.id}`,
            kind: "correction",
            title: `Marekebisho: ${cr.employee_name ?? ""}`.trim(),
            detail: `${formatDate(cr.date)} → ${STATUS_SW[cr.requested_status] ?? cr.requested_status}`,
            time: cr.created_at,
            href: "/attendance/corrections",
          });
        }
      } else {
        if (
          (cr.status === "approved" || cr.status === "denied") &&
          cr.reviewed_at
        ) {
          list.push({
            id: `cr-${cr.id}`,
            kind: "correction",
            title:
              cr.status === "approved"
                ? "Marekebisho yamekubaliwa"
                : "Marekebisho yamekataliwa",
            detail: `${formatDate(cr.date)} — ${STATUS_SW[cr.requested_status] ?? cr.requested_status}`,
            time: cr.reviewed_at,
            href: "/me",
          });
        }
      }
    }

    return list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [announcements, complaints, leaveData, advanceRequests, corrections, isHrAdmin, canReviewCorrections]);

  const visibleItems = items.filter((n) => !dismissed.has(n.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {visibleItems.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center"
            >
              {visibleItems.length > 9 ? "9+" : visibleItems.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto p-0">
        <div className="px-3 py-2 border-b bg-muted/30">
          <p className="text-sm font-semibold">Arifa</p>
          <p className="text-xs text-muted-foreground">
            {visibleItems.length === 0 ? "Hakuna arifa mpya" : `${visibleItems.length} arifa`}
          </p>
        </div>
        {visibleItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Hakuna arifa kwa sasa.
          </div>
        ) : (
          <ul>
            {visibleItems.slice(0, 20).map((n) => {
              const Icon = iconFor[n.kind];
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => dismiss(n.id)}
                    className="flex gap-3 px-3 py-2.5 hover:bg-accent border-b last:border-0"
                  >
                    <div className="rounded-md bg-primary/10 h-8 w-8 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.detail}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDate(n.time)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
