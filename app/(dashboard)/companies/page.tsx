"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Users, Loader2, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  address: string | null;
  cotwu_rate: number;
}

interface Section {
  id: string;
  company_id: string;
  name: string;
}

interface SupervisorUser {
  id: string;
  name: string;
  role: string;
}

interface SupervisorSection {
  supervisor_id: string;
  section_id: string;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2, "Jina linahitajika"),
  address: z.string().optional(),
  cotwu_rate: z.number().min(0).max(100),
});
type CompanyForm = z.infer<typeof companySchema>;

const sectionSchema = z.object({
  name: z.string().min(2, "Jina linahitajika"),
  company_id: z.string().min(1, "Kampuni inahitajika"),
});
type SectionForm = z.infer<typeof sectionSchema>;

// ─── Main component ──────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "admin";

  // Expanded company cards
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  // Company dialog state
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deleteCompanyTarget, setDeleteCompanyTarget] = useState<Company | null>(null);

  // Section dialog state
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<Section | null>(null);
  const [sectionCompanyContext, setSectionCompanyContext] = useState<string>("");

  // Supervisor assign dialog
  const [supervisorDialogOpen, setSupervisorDialogOpen] = useState(false);
  const [supervisorSectionTarget, setSupervisorSectionTarget] = useState<Section | null>(null);
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json() as Promise<Company[]>;
    },
  });

  const { data: sections, isLoading: loadingSections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const res = await fetch("/api/sections");
      if (!res.ok) throw new Error("Failed to fetch sections");
      return res.json() as Promise<Section[]>;
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json() as Promise<SupervisorUser[]>;
    },
    enabled: isAdmin,
  });

  // Fetch supervisor_sections mapping
  const { data: supervisorSections } = useQuery({
    queryKey: ["supervisor_sections"],
    queryFn: async () => {
      // We use the sections endpoint with a known section and parse supervisor info
      // The supervisor_sections data is embedded in sections when we fetch users
      // For now we derive from sections + users via a direct endpoint approach
      // Actually: GET /api/sections returns sections without supervisor_ids,
      // so we need to get the mapping. Let's fetch from users endpoint indirectly.
      // The sections PUT accepts supervisor_ids but we need to read them.
      // We'll fetch each section's supervisors by checking supervisor_sections
      // via the users API which gives us all users with their sections.
      return [] as SupervisorSection[];
    },
    enabled: false,
  });

  const supervisors = (allUsers ?? []).filter(
    (u) => u.role === "supervisor" || u.role === "admin" || u.role === "hr"
  );

  // ── Company form ─────────────────────────────────────────────────────────────

  const {
    register: registerCompany,
    handleSubmit: handleCompanySubmit,
    setValue: setCompanyValue,
    watch: watchCompany,
    reset: resetCompany,
    formState: { errors: companyErrors },
  } = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: { cotwu_rate: 2 },
  });

  // ── Section form ─────────────────────────────────────────────────────────────

  const {
    register: registerSection,
    handleSubmit: handleSectionSubmit,
    setValue: setSectionValue,
    watch: watchSection,
    reset: resetSection,
    formState: { errors: sectionErrors },
  } = useForm<SectionForm>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {},
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createCompanyMutation = useMutation({
    mutationFn: async (data: CompanyForm) => {
      const res = await fetch("/api/companies", {
        method: editingCompany ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCompany ? { ...data, id: editingCompany.id } : data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setCompanyDialogOpen(false);
      setEditingCompany(null);
      resetCompany({ cotwu_rate: 2 });
      toast({ title: editingCompany ? "Kampuni imesasishwa" : "Kampuni imeongezwa" });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/companies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setDeleteCompanyTarget(null);
      toast({ title: "Kampuni imefutwa" });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: async (data: SectionForm) => {
      const res = await fetch("/api/sections", {
        method: editingSection ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingSection ? { ...data, id: editingSection.id } : data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] });
      setSectionDialogOpen(false);
      setEditingSection(null);
      resetSection();
      toast({ title: editingSection ? "Sehemu imesasishwa" : "Sehemu imeongezwa" });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/sections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] });
      setDeleteSectionTarget(null);
      toast({ title: "Sehemu imefutwa" });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const assignSupervisorsMutation = useMutation({
    mutationFn: async ({ sectionId, supervisorIds }: { sectionId: string; supervisorIds: string[] }) => {
      const res = await fetch("/api/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sectionId, supervisor_ids: supervisorIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor_sections"] });
      setSupervisorDialogOpen(false);
      setSupervisorSectionTarget(null);
      setSelectedSupervisorIds([]);
      toast({ title: "Wasimamizi wamepewa sehemu" });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const toggleCompanyExpand = (id: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateCompany = () => {
    setEditingCompany(null);
    resetCompany({ cotwu_rate: 2 });
    setCompanyDialogOpen(true);
  };

  const openEditCompany = (company: Company) => {
    setEditingCompany(company);
    resetCompany({
      name: company.name,
      address: company.address ?? "",
      cotwu_rate: company.cotwu_rate,
    });
    setCompanyDialogOpen(true);
  };

  const openCreateSection = (companyId: string) => {
    setEditingSection(null);
    setSectionCompanyContext(companyId);
    resetSection({ company_id: companyId });
    setSectionDialogOpen(true);
  };

  const openEditSection = (section: Section) => {
    setEditingSection(section);
    resetSection({ name: section.name, company_id: section.company_id });
    setSectionDialogOpen(true);
  };

  const openAssignSupervisors = (section: Section) => {
    setSupervisorSectionTarget(section);
    // Pre-select currently assigned supervisors — we don't have this info yet
    // (the API doesn't return supervisor_ids on sections), so start empty
    setSelectedSupervisorIds([]);
    setSupervisorDialogOpen(true);
  };

  const toggleSupervisor = (id: string) => {
    setSelectedSupervisorIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const onCompanySubmit = (data: CompanyForm) => {
    createCompanyMutation.mutate(data);
  };

  const onSectionSubmit = (data: SectionForm) => {
    createSectionMutation.mutate(data);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const sectionsForCompany = (companyId: string) =>
    (sections ?? []).filter((s) => s.company_id === companyId);

  const cotwuRate = watchCompany("cotwu_rate");

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Ukurasa huu ni kwa wasimamizi wakuu (admin) peke yao.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Makampuni na Sehemu</h1>
          </div>
          <p className="text-muted-foreground mt-1">Dhibiti makampuni na sehemu zao</p>
        </div>
        <Button onClick={openCreateCompany} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Ongeza Kampuni
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{companies?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Makampuni</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{sections?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Sehemu</p>
          </CardContent>
        </Card>
      </div>

      {/* Company cards */}
      {loadingCompanies ? (
        <p className="text-center text-muted-foreground py-12">Inapakia...</p>
      ) : (companies ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Hakuna makampuni. Ongeza kampuni mpya.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(companies ?? []).map((company) => {
            const companySections = sectionsForCompany(company.id);
            const isExpanded = expandedCompanies.has(company.id);

            return (
              <Card key={company.id} className="overflow-hidden">
                {/* Company header row */}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                      onClick={() => toggleCompanyExpand(company.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{company.name}</p>
                        {company.address && (
                          <p className="text-xs text-muted-foreground truncate">{company.address}</p>
                        )}
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Badge variant="info" className="text-xs">
                        <Layers className="h-3 w-3 mr-1" />
                        {companySections.length}
                      </Badge>
                      <Badge variant="secondary" className="text-xs hidden sm:flex">
                        COTWU {company.cotwu_rate}%
                      </Badge>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCompany(company)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteCompanyTarget(company)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Sections list */}
                {isExpanded && (
                  <CardContent className="pt-0 pb-4">
                    <div className="border-t pt-4 space-y-2">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-muted-foreground">
                          Sehemu ({companySections.length})
                        </p>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCreateSection(company.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Ongeza Sehemu
                          </Button>
                        )}
                      </div>

                      {loadingSections ? (
                        <p className="text-xs text-muted-foreground py-2">Inapakia...</p>
                      ) : companySections.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          Hakuna sehemu. Ongeza sehemu mpya.
                        </p>
                      ) : (
                        companySections.map((section) => (
                          <div
                            key={section.id}
                            className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{section.name}</span>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => openAssignSupervisors(section)}
                                >
                                  <Users className="h-3 w-3 mr-1" />
                                  Wasimamizi
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditSection(section)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteSectionTarget(section)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create/Edit Company Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={companyDialogOpen}
        onOpenChange={(open) => {
          setCompanyDialogOpen(open);
          if (!open) setEditingCompany(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Hariri Kampuni" : "Ongeza Kampuni Mpya"}</DialogTitle>
            <DialogDescription>
              {editingCompany ? "Sasisha taarifa za kampuni" : "Jaza taarifa za kampuni mpya"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCompanySubmit(onCompanySubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Jina la Kampuni</Label>
              <Input placeholder="East African Spirit Ltd" {...registerCompany("name")} />
              {companyErrors.name && (
                <p className="text-xs text-destructive">{companyErrors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Anwani (hiari)</Label>
              <Input placeholder="Dar es Salaam, Tanzania" {...registerCompany("address")} />
            </div>

            <div className="space-y-2">
              <Label>Kiwango cha COTWU (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="2"
                {...registerCompany("cotwu_rate", { valueAsNumber: true })}
              />
              {companyErrors.cotwu_rate && (
                <p className="text-xs text-destructive">{companyErrors.cotwu_rate.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Kiwango cha makato ya COTWU: {cotwuRate ?? 2}%
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompanyDialogOpen(false)}
              >
                Ghairi
              </Button>
              <Button type="submit" disabled={createCompanyMutation.isPending}>
                {createCompanyMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                ) : editingCompany ? "Hifadhi Mabadiliko" : "Ongeza Kampuni"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Company Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={!!deleteCompanyTarget}
        onOpenChange={(open) => { if (!open) setDeleteCompanyTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Futa Kampuni</DialogTitle>
            <DialogDescription>
              Una uhakika unataka kufuta <strong>{deleteCompanyTarget?.name}</strong>?
              Sehemu zote zinazohusiana pia zitafutwa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCompanyTarget(null)}>
              Ghairi
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCompanyMutation.isPending}
              onClick={() => deleteCompanyTarget && deleteCompanyMutation.mutate(deleteCompanyTarget.id)}
            >
              {deleteCompanyMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafuta...</>
              ) : "Ndio, Futa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Section Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={sectionDialogOpen}
        onOpenChange={(open) => {
          setSectionDialogOpen(open);
          if (!open) setEditingSection(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSection ? "Hariri Sehemu" : "Ongeza Sehemu Mpya"}</DialogTitle>
            <DialogDescription>
              {editingSection ? "Sasisha taarifa za sehemu" : "Jaza taarifa za sehemu mpya"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSectionSubmit(onSectionSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Jina la Sehemu</Label>
              <Input placeholder="Sehemu A" {...registerSection("name")} />
              {sectionErrors.name && (
                <p className="text-xs text-destructive">{sectionErrors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Kampuni</Label>
              <Select
                value={watchSection("company_id") ?? ""}
                onValueChange={(v) => setSectionValue("company_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua kampuni..." />
                </SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sectionErrors.company_id && (
                <p className="text-xs text-destructive">{sectionErrors.company_id.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSectionDialogOpen(false)}
              >
                Ghairi
              </Button>
              <Button type="submit" disabled={createSectionMutation.isPending}>
                {createSectionMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                ) : editingSection ? "Hifadhi Mabadiliko" : "Ongeza Sehemu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Section Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={!!deleteSectionTarget}
        onOpenChange={(open) => { if (!open) setDeleteSectionTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Futa Sehemu</DialogTitle>
            <DialogDescription>
              Una uhakika unataka kufuta sehemu <strong>{deleteSectionTarget?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSectionTarget(null)}>
              Ghairi
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSectionMutation.isPending}
              onClick={() => deleteSectionTarget && deleteSectionMutation.mutate(deleteSectionTarget.id)}
            >
              {deleteSectionMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafuta...</>
              ) : "Ndio, Futa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Supervisors Dialog ──────────────────────────────────────────── */}
      <Dialog
        open={supervisorDialogOpen}
        onOpenChange={(open) => {
          setSupervisorDialogOpen(open);
          if (!open) {
            setSupervisorSectionTarget(null);
            setSelectedSupervisorIds([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Weka Wasimamizi
            </DialogTitle>
            <DialogDescription>
              Chagua wasimamizi kwa sehemu{" "}
              <strong>{supervisorSectionTarget?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {supervisors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Hakuna wasimamizi waliopo
              </p>
            ) : (
              supervisors.map((sup) => (
                <label
                  key={sup.id}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedSupervisorIds.includes(sup.id)}
                    onChange={() => toggleSupervisor(sup.id)}
                    className="rounded"
                  />
                  <div>
                    <p className="text-sm font-medium">{sup.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{sup.role}</p>
                  </div>
                </label>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSupervisorDialogOpen(false)}
            >
              Ghairi
            </Button>
            <Button
              disabled={assignSupervisorsMutation.isPending}
              onClick={() =>
                supervisorSectionTarget &&
                assignSupervisorsMutation.mutate({
                  sectionId: supervisorSectionTarget.id,
                  supervisorIds: selectedSupervisorIds,
                })
              }
            >
              {assignSupervisorsMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
              ) : "Hifadhi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
