"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, Plus, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface Holiday {
  id: string;
  date: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
}

const holidaySchema = z.object({
  date: z.string().min(1, "Tarehe inahitajika"),
  name: z.string().min(2, "Jina la sikukuu linahitajika"),
  company_id: z.string().optional(),
});
type HolidayForm = z.infer<typeof holidaySchema>;

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const res = await fetch("/api/holidays");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as Holiday[];
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as Company[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<HolidayForm>({
    resolver: zodResolver(holidaySchema),
    defaultValues: { company_id: "__all__" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: HolidayForm) => {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: data.date,
          name: data.name,
          company_id: data.company_id === "__all__" ? null : data.company_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setDialogOpen(false);
      reset({ company_id: "__all__", date: "", name: "" });
      toast({ title: "Imehifadhiwa", description: "Sikukuu imehifadhiwa." });
    },
    onError: (e: Error) => {
      toast({ title: "Hitilafu", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast({ title: "Imefutwa", description: "Sikukuu imefutwa." });
    },
  });

  const today = new Date().toISOString().split("T")[0];
  const upcoming = (holidays ?? []).filter((h) => h.date >= today);
  const past = (holidays ?? []).filter((h) => h.date < today);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Sikukuu</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Sikukuu za kazi zinazotumika kwenye hesabu ya likizo na overtime
          </p>
        </div>
        <Button onClick={() => { reset({ company_id: "__all__", date: "", name: "" }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Ongeza Sikukuu
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sikukuu Zinazokuja</CardTitle>
          <CardDescription>{upcoming.length} sikukuu zimepangwa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarehe</TableHead>
                  <TableHead>Jina</TableHead>
                  <TableHead>Kampuni</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1, 2, 3, 4].map((j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : upcoming.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Hakuna sikukuu zilizopangwa. Bonyeza &ldquo;Ongeza Sikukuu&rdquo;.
                    </TableCell>
                  </TableRow>
                ) : (
                  upcoming.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{formatDate(h.date)}</TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {h.company_name ? (
                          <Badge variant="secondary">{h.company_name}</Badge>
                        ) : (
                          <Badge variant="outline">Zote</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:bg-red-50"
                          onClick={() => {
                            if (confirm(`Futa "${h.name}"?`)) deleteMutation.mutate(h.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Zilizopita</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableBody>
                  {past.map((h) => (
                    <TableRow key={h.id} className="opacity-60">
                      <TableCell className="font-medium">{formatDate(h.date)}</TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {h.company_name ?? "Zote"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:bg-red-50"
                          onClick={() => {
                            if (confirm(`Futa "${h.name}"?`)) deleteMutation.mutate(h.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ongeza Sikukuu</DialogTitle>
            <DialogDescription>
              Sikukuu hazihesabiwi kwenye siku za likizo wala kwenye hesabu ya siku za kazi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Tarehe</Label>
              <Input type="date" {...register("date")} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Jina</Label>
              <Input placeholder="Mfano: Siku ya Uhuru" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Kampuni</Label>
              <Select
                value={watch("company_id") ?? "__all__"}
                onValueChange={(v) => setValue("company_id", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Zote (sikukuu ya kitaifa)</SelectItem>
                  {(companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Ghairi
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                ) : "Hifadhi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
