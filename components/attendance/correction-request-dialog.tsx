"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareWarning } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

const STATUS_OPTIONS = [
  { value: "present", label: "Alikuwepo" },
  { value: "absent", label: "Hakuwepo" },
  { value: "late", label: "Alichelewa" },
  { value: "half_day", label: "Nusu siku" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  currentStatus: string | null;
}

export function CorrectionRequestDialog({ open, onOpenChange, date, currentStatus }: Props) {
  const queryClient = useQueryClient();
  const [requestedStatus, setRequestedStatus] = useState("");
  const [reason, setReason] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setRequestedStatus("");
      setReason("");
    }
    onOpenChange(nextOpen);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attendance-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, requested_status: requestedStatus, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-corrections", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-corrections"] });
      onOpenChange(false);
      toast({
        title: "Ombi limetumwa",
        description: "Msimamizi atapitia ombi lako.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Hitilafu", description: e.message, variant: "destructive" });
    },
  });

  const readableDate = new Date(date + "T12:00:00").toLocaleDateString("sw-TZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const submit = () => {
    if (!requestedStatus) {
      toast({ title: "Chagua hali", description: "Chagua hali unayoomba.", variant: "destructive" });
      return;
    }
    if (reason.trim().length < 5) {
      toast({
        title: "Eleza sababu",
        description: "Tafadhali andika sababu kwa maneno matano au zaidi.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-4 w-4 text-amber-600" />
            Omba Marekebisho
          </DialogTitle>
          <DialogDescription>
            Eleza makosa kwenye mahudhurio ya <strong>{readableDate}</strong>. Msimamizi atapitia na kukubali au kukataa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">Hali iliyopo sasa:</p>
            <p className="font-medium">
              {currentStatus
                ? STATUS_OPTIONS.find((o) => o.value === currentStatus)?.label ?? currentStatus
                : "Hakuna rekodi"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Hali sahihi</Label>
            <Select value={requestedStatus} onValueChange={setRequestedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Chagua hali sahihi" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.filter((o) => o.value !== currentStatus).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sababu</Label>
            <Textarea
              placeholder="Mfano: Nilichapisha kadi lakini haikuhesabiwa kwa sababu ya mfumo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Toa maelezo yatakayomsaidia msimamizi kufanya uamuzi.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Ghairi
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Inatuma...
              </>
            ) : (
              "Tuma Ombi"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
