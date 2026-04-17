"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  present: "Alikuwepo",
  absent: "Hakuwepo",
  late: "Alichelewa",
  half_day: "Nusu siku",
};

interface Correction {
  id: string;
  employee_id: string;
  employee_name: string;
  section_name: string | null;
  date: string;
  original_status: string | null;
  requested_status: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

export default function CorrectionsPage() {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<{ id: string; action: "approved" | "denied" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: pending, isLoading: loadingPending } = useQuery({
    queryKey: ["attendance-corrections", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/attendance-corrections?status=pending");
      if (!res.ok) throw new Error("Imeshindwa");
      return (await res.json()) as Correction[];
    },
    refetchInterval: 30_000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["attendance-corrections", "history"],
    queryFn: async () => {
      const res = await fetch("/api/attendance-corrections");
      if (!res.ok) throw new Error("Imeshindwa");
      const all = (await res.json()) as Correction[];
      return all.filter((c) => c.status !== "pending").slice(0, 50);
    },
  });

  const review = useMutation({
    mutationFn: async ({
      id,
      status,
      review_note,
    }: {
      id: string;
      status: "approved" | "denied";
      review_note?: string;
    }) => {
      const res = await fetch(`/api/attendance-corrections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_note: review_note || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-corrections"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setReviewing(null);
      setReviewNote("");
      toast({
        title: vars.status === "approved" ? "Imekubaliwa" : "Imekataliwa",
        description:
          vars.status === "approved"
            ? "Mahudhurio yamerekebishwa."
            : "Ombi limekataliwa. Mfanyakazi ametaarifiwa.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Hitilafu", description: e.message, variant: "destructive" });
    },
  });

  const renderRow = (c: Correction, actions = true) => (
    <div
      key={c.id}
      className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-lg border p-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{c.employee_name}</span>
          {c.section_name && (
            <Badge variant="secondary" className="text-xs">
              {c.section_name}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDate(c.date)}
          </span>
        </div>
        <p className="text-sm">
          <span className="text-muted-foreground">
            {c.original_status
              ? STATUS_LABELS[c.original_status] ?? c.original_status
              : "Hakuna rekodi"}
          </span>
          <span className="mx-2">→</span>
          <span className="font-medium">
            {STATUS_LABELS[c.requested_status] ?? c.requested_status}
          </span>
        </p>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
          <span className="font-medium text-foreground">Sababu:</span> {c.reason}
        </p>
        {c.review_note && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Kumbukumbu ya mkaguzi:</span>{" "}
            {c.review_note}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Limetumwa: {formatDate(c.created_at)}
          {c.reviewed_at && ` · Limepitwa: ${formatDate(c.reviewed_at)}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {c.status === "pending" && actions ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => {
                setReviewNote("");
                setReviewing({ id: c.id, action: "approved" });
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Idhinisha
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-red-700 border-red-300 hover:bg-red-50"
              onClick={() => {
                setReviewNote("");
                setReviewing({ id: c.id, action: "denied" });
              }}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Kataa
            </Button>
          </>
        ) : (
          <Badge
            variant={c.status === "approved" ? "success" : c.status === "denied" ? "destructive" : "secondary"}
            className="text-xs"
          >
            {c.status === "approved" ? "Imekubaliwa" : c.status === "denied" ? "Imekataliwa" : "Inasubiri"}
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Marekebisho ya Mahudhurio</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Maombi ya wafanyakazi ya kurekebisha mahudhurio yaliyo na makosa
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Yanayosubiri
            {pending && pending.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Historia</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maombi Yanayosubiri</CardTitle>
              <CardDescription>
                Pitia kila ombi kabla ya kipindi cha mshahara kufungwa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : !pending?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Hakuna ombi linalosubiri.
                </p>
              ) : (
                <div className="space-y-3">{pending.map((c) => renderRow(c))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historia ya Marekebisho</CardTitle>
              <CardDescription>Maombi 50 ya mwisho yaliyopitiwa</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : !history?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Hakuna historia bado.
                </p>
              ) : (
                <div className="space-y-3">
                  {history.map((c) => renderRow(c, false))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewing?.action === "approved" ? "Idhinisha marekebisho" : "Kataa ombi"}
            </DialogTitle>
            <DialogDescription>
              {reviewing?.action === "approved"
                ? "Mahudhurio yatawekwa kwa hali iliyoombwa na mfanyakazi atapokea SMS."
                : "Ombi halitarekebisha rekodi. Mfanyakazi atapokea SMS."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ujumbe wa kumbukumbu (hiari)</label>
            <Textarea
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={
                reviewing?.action === "approved"
                  ? "Mfano: Nimeangalia kitabu cha usajili"
                  : "Mfano: Hakuna ushahidi wa kuwepo"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>
              Ghairi
            </Button>
            <Button
              variant={reviewing?.action === "approved" ? "default" : "destructive"}
              disabled={review.isPending}
              onClick={() =>
                reviewing &&
                review.mutate({
                  id: reviewing.id,
                  status: reviewing.action,
                  review_note: reviewNote.trim(),
                })
              }
            >
              {review.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Inafanya...
                </>
              ) : reviewing?.action === "approved" ? (
                "Idhinisha"
              ) : (
                "Kataa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
