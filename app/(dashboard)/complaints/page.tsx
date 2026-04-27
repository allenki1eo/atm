"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  MessageSquareWarning, Plus, Loader2, CheckCircle2, Clock, Send,
  ShieldCheck, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface Complaint {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_phone?: string;
  subject: string;
  message: string;
  status: "received" | "in_review" | "awaiting_employee" | "closed" | "open" | "resolved";
  response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
}

const submitSchema = z.object({
  subject: z.string().min(3, "Kichwa kinahitajika"),
  message: z.string().min(5, "Ujumbe unahitajika"),
});
type SubmitForm = z.infer<typeof submitSchema>;

const respondSchema = z.object({
  response: z.string().min(3, "Jibu linahitajika"),
  resolve: z.boolean().optional(),
});
type RespondForm = z.infer<typeof respondSchema>;

function daysSince(value: string) {
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

function complaintStage(complaint: Complaint) {
  if (complaint.status === "closed" || complaint.status === "resolved") return "Imefungwa";
  if (complaint.status === "awaiting_employee") return "Inasubiri jibu lako";
  if (complaint.status === "in_review") return "Inakaguliwa";
  const age = daysSince(complaint.created_at);
  if (age >= 3) return "Inakaguliwa";
  return "Imepokelewa";
}

function isComplaintOpen(status: Complaint["status"]) {
  return status === "received" || status === "in_review" || status === "awaiting_employee" || status === "open";
}

export default function ComplaintsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user as { role?: string })?.role ?? "employee";
  const isEmployee = role === "employee";
  const canRespond = role === "hr" || role === "admin";

  const [submitOpen, setSubmitOpen] = useState(false);
  const [respondTarget, setRespondTarget] = useState<Complaint | null>(null);

  const { data: complaints, isLoading } = useQuery({
    queryKey: ["complaints"],
    queryFn: async () => {
      const res = await fetch("/api/complaints");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Complaint[]>;
    },
    enabled: !!session,
  });

  const submitForm = useForm<SubmitForm>({ resolver: zodResolver(submitSchema) });
  const respondForm = useForm<RespondForm>({ resolver: zodResolver(respondSchema) });

  const submitMut = useMutation({
    mutationFn: async (data: SubmitForm) => {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setSubmitOpen(false);
      submitForm.reset();
      toast({ title: "Malalamiko yamewasilishwa kwa HR" });
    },
    onError: (err: Error) =>
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  const respondMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RespondForm }) => {
      const res = await fetch(`/api/complaints/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: data.response,
          status: data.resolve ? "closed" : "awaiting_employee",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setRespondTarget(null);
      respondForm.reset();
      toast({ title: "Jibu limetumwa" });
    },
    onError: (err: Error) =>
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  const rows = complaints ?? [];
  const openCount = rows.filter((r) => isComplaintOpen(r.status)).length;
  const resolvedCount = rows.filter((r) => !isComplaintOpen(r.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">
              {isEmployee ? "Malalamiko Yangu" : "Malalamiko ya Wafanyakazi"}
            </h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {isEmployee
              ? "Wasilisha malalamiko au ujumbe kwa HR"
              : "Kagua na jibu malalamiko yaliyotumwa na wafanyakazi"}
          </p>
        </div>
        {isEmployee && (
          <Button onClick={() => setSubmitOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Wasilisha Malalamiko
          </Button>
        )}
      </div>

      {isEmployee && (
        <Card className="border-green-200 bg-green-50/60">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-green-950">
                Visible to HR/Admin only
              </p>
              <p className="text-xs text-green-800">
                Supervisors cannot view complaint cases from the API or the menu.
                New cases should be acknowledged within 3 working days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 max-w-md">
        <Card>
          <CardContent className="p-3">
            <p className="text-xl font-bold text-amber-600">{openCount}</p>
            <p className="text-xs text-muted-foreground">Inasubiri jibu</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xl font-bold text-green-600">{resolvedCount}</p>
            <p className="text-xs text-muted-foreground">Imejibiwa</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Inapakia...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {isEmployee ? "Hujawasilisha malalamiko yoyote" : "Hakuna malalamiko"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Card key={c.id} className={isComplaintOpen(c.status) ? "border-amber-200" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{c.subject}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {!isEmployee && <>Kutoka: <strong>{c.employee_name}</strong> · </>}
                      {formatDate(c.created_at)}
                    </p>
                  </div>
                  <Badge variant={isComplaintOpen(c.status) ? "warning" : "success"} className="flex items-center gap-1">
                    {isComplaintOpen(c.status) ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {complaintStage(c)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {complaintStage(c)}
                  </Badge>
                  {isComplaintOpen(c.status) && (
                    <span>
                      SLA: {Math.max(0, 3 - daysSince(c.created_at))} working day
                      {Math.max(0, 3 - daysSince(c.created_at)) === 1 ? "" : "s"} before follow-up
                    </span>
                  )}
                  {isEmployee && <span>Visible to HR/Admin only</span>}
                </div>
                <div className="text-sm whitespace-pre-wrap rounded-lg border bg-muted/30 p-3">
                  {c.message}
                </div>
                {c.response && (
                  <div className="rounded-lg border-l-4 border-green-400 bg-green-50/60 p-3">
                    <p className="text-xs text-green-800 font-medium mb-1">
                      Jibu la HR {c.responded_at && `· ${formatDate(c.responded_at)}`}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{c.response}</p>
                  </div>
                )}
                {canRespond && isComplaintOpen(c.status) && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => { respondForm.reset(); setRespondTarget(c); }}>
                      <Send className="h-3 w-3 mr-1" />
                      Jibu
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Submit dialog */}
      <Dialog open={submitOpen} onOpenChange={(o) => { setSubmitOpen(o); if (!o) submitForm.reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wasilisha Malalamiko</DialogTitle>
            <DialogDescription>
              Ujumbe wako utaonekana kwa HR/Admin tu. Tutathibitisha kupokea
              na kuanza ukaguzi ndani ya siku 3 za kazi.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submitForm.handleSubmit((d) => submitMut.mutate(d))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Kichwa</Label>
              <Input placeholder="Mf. Siku za kazi hazijahesabiwa" {...submitForm.register("subject")} />
              {submitForm.formState.errors.subject && (
                <p className="text-xs text-destructive">{submitForm.formState.errors.subject.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ujumbe</Label>
              <Textarea
                rows={5}
                placeholder="Eleza tatizo lako kwa undani..."
                {...submitForm.register("message")}
              />
              {submitForm.formState.errors.message && (
                <p className="text-xs text-destructive">{submitForm.formState.errors.message.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubmitOpen(false)}>Ghairi</Button>
              <Button type="submit" disabled={submitMut.isPending}>
                {submitMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inatuma...</>
                ) : "Wasilisha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Respond dialog */}
      <Dialog open={!!respondTarget} onOpenChange={(o) => { if (!o) { setRespondTarget(null); respondForm.reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jibu Malalamiko</DialogTitle>
            <DialogDescription>
              {respondTarget?.employee_name} — {respondTarget?.subject}
            </DialogDescription>
          </DialogHeader>
          {respondTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
              {respondTarget.message}
            </div>
          )}
          <form
            onSubmit={respondForm.handleSubmit((d) =>
              respondTarget && respondMut.mutate({ id: respondTarget.id, data: d })
            )}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Jibu</Label>
              <Textarea rows={4} {...respondForm.register("response")} />
              {respondForm.formState.errors.response && (
                <p className="text-xs text-destructive">{respondForm.formState.errors.response.message}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...respondForm.register("resolve")} className="accent-primary" />
              Weka kama imesuluhishwa
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRespondTarget(null)}>Ghairi</Button>
              <Button type="submit" disabled={respondMut.isPending}>
                {respondMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inatuma...</>
                ) : "Tuma Jibu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
