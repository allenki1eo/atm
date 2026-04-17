"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Megaphone, Plus, Loader2, Send, Users, Building2, Briefcase, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface Announcement {
  id: string;
  subject: string;
  message: string;
  audience_type: "all" | "company" | "section" | "role";
  audience_id: string | null;
  send_sms: number;
  created_by: string;
  author_name: string | null;
  created_at: string;
  is_read: number;
}

interface Company { id: string; name: string }
interface Section { id: string; name: string; company_id: string }

const composeSchema = z.object({
  subject: z.string().min(3, "Kichwa kinahitajika"),
  message: z.string().min(5, "Ujumbe unahitajika"),
  audience_type: z.enum(["all", "company", "section", "role"]),
  audience_id: z.string().optional(),
  send_sms: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.audience_type !== "all" && !val.audience_id) {
    ctx.addIssue({ code: "custom", path: ["audience_id"], message: "Chagua mpokeaji" });
  }
});
type ComposeForm = z.infer<typeof composeSchema>;

const ROLE_OPTIONS = [
  { value: "employee", label: "Wafanyakazi" },
  { value: "supervisor", label: "Wasimamizi" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admins" },
];

function audienceLabel(a: Announcement, companies: Company[], sections: Section[]): string {
  if (a.audience_type === "all") return "Wote";
  if (a.audience_type === "role") {
    return ROLE_OPTIONS.find((r) => r.value === a.audience_id)?.label ?? a.audience_id ?? "—";
  }
  if (a.audience_type === "company") {
    return companies.find((c) => c.id === a.audience_id)?.name ?? "Kampuni";
  }
  if (a.audience_type === "section") {
    return sections.find((s) => s.id === a.audience_id)?.name ?? "Sehemu";
  }
  return "—";
}

function audienceIcon(type: Announcement["audience_type"]) {
  if (type === "all") return Globe;
  if (type === "company") return Building2;
  if (type === "section") return Briefcase;
  return Users;
}

export default function AnnouncementsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user as { role?: string })?.role;
  const canCompose = role === "hr" || role === "admin";

  const [composeOpen, setComposeOpen] = useState(false);

  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const res = await fetch("/api/announcements");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Announcement[]>;
    },
    enabled: !!session,
  });

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return res.json() as Promise<Company[]>;
    },
  });

  const { data: sections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const res = await fetch("/api/sections");
      if (!res.ok) return [];
      return res.json() as Promise<Section[]>;
    },
  });

  const form = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: { audience_type: "all", send_sms: false },
  });
  const audienceType = form.watch("audience_type");

  // Clear audience_id when audience_type changes
  useEffect(() => {
    form.setValue("audience_id", undefined);
  }, [audienceType, form]);

  const composeMut = useMutation({
    mutationFn: async (data: ComposeForm) => {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setComposeOpen(false);
      form.reset({ audience_type: "all", send_sms: false });
      toast({
        title: "Tangazo limetumwa",
        description: data.sms_queued > 0 ? `SMS ${data.sms_queued} zimetumwa` : undefined,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  const readMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/announcements/${id}/read`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }),
  });

  const rows = announcements ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Matangazo</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {canCompose
              ? "Tuma matangazo ya pamoja kwa wafanyakazi"
              : "Matangazo kutoka HR na Admin"}
          </p>
        </div>
        {canCompose && (
          <Button onClick={() => setComposeOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Tangazo Jipya
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Inapakia...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Hakuna matangazo bado
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const Icon = audienceIcon(a.audience_type);
            return (
              <Card
                key={a.id}
                className={!a.is_read ? "border-primary/60 bg-primary/5" : ""}
                onClick={() => !a.is_read && readMut.mutate(a.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {a.subject}
                        {!a.is_read && <Badge variant="info" className="text-xs">Mpya</Badge>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.author_name ?? "HR"} · {formatDate(a.created_at)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                      <Icon className="h-3 w-3" />
                      {audienceLabel(a, companies ?? [], sections ?? [])}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{a.message}</p>
                  {a.send_sms === 1 && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Send className="h-3 w-3" />
                      Imetumwa pia kupitia SMS
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) form.reset({ audience_type: "all", send_sms: false }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tangazo Jipya</DialogTitle>
            <DialogDescription>
              Tuma ujumbe kwa wafanyakazi. Chagua mpokeaji — wote, kampuni, sehemu, au jukumu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => composeMut.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Kichwa</Label>
              <Input placeholder="Mf. Likizo ya Mei Mosi" {...form.register("subject")} />
              {form.formState.errors.subject && (
                <p className="text-xs text-destructive">{form.formState.errors.subject.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Mpokeaji</Label>
              <Select
                value={form.watch("audience_type")}
                onValueChange={(v) => form.setValue("audience_type", v as ComposeForm["audience_type"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wafanyakazi Wote</SelectItem>
                  <SelectItem value="company">Kampuni Maalum</SelectItem>
                  <SelectItem value="section">Sehemu Maalum</SelectItem>
                  <SelectItem value="role">Kwa Jukumu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === "company" && (
              <div className="space-y-2">
                <Label>Chagua Kampuni</Label>
                <Select
                  value={form.watch("audience_id") ?? ""}
                  onValueChange={(v) => form.setValue("audience_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Chagua..." /></SelectTrigger>
                  <SelectContent>
                    {(companies ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.audience_id && (
                  <p className="text-xs text-destructive">{form.formState.errors.audience_id.message}</p>
                )}
              </div>
            )}

            {audienceType === "section" && (
              <div className="space-y-2">
                <Label>Chagua Sehemu</Label>
                <Select
                  value={form.watch("audience_id") ?? ""}
                  onValueChange={(v) => form.setValue("audience_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Chagua..." /></SelectTrigger>
                  <SelectContent>
                    {(sections ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.audience_id && (
                  <p className="text-xs text-destructive">{form.formState.errors.audience_id.message}</p>
                )}
              </div>
            )}

            {audienceType === "role" && (
              <div className="space-y-2">
                <Label>Chagua Jukumu</Label>
                <Select
                  value={form.watch("audience_id") ?? ""}
                  onValueChange={(v) => form.setValue("audience_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Chagua..." /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.audience_id && (
                  <p className="text-xs text-destructive">{form.formState.errors.audience_id.message}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Ujumbe</Label>
              <Textarea rows={5} placeholder="Andika ujumbe wako..." {...form.register("message")} />
              {form.formState.errors.message && (
                <p className="text-xs text-destructive">{form.formState.errors.message.message}</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("send_sms")} className="accent-primary" />
              Tuma pia kupitia SMS (kupitia Africa&apos;s Talking)
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>Ghairi</Button>
              <Button type="submit" disabled={composeMut.isPending}>
                {composeMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inatuma...</>
                ) : (<><Send className="h-4 w-4 mr-2" />Tuma</>)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
